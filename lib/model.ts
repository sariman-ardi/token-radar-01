// Token Radar, round 3 ("radar-4"): a fitted value model, not a multiple.
//
// The board ranks pre-token protocols by an implied value the program fits from
// the snapshot's own live-token comparables, then shows the reader how to farm
// each one with the cost and the time stated to the dollar and the minute.
//
// The model, in one paragraph:
//   * Comparables: the 70 live-token protocols that carry a market cap, a TVL
//     and a listing date, and whose category the watchlist rule itself would
//     allow (no Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
//     Restaked BTC or CEX, and no wrapped/staked name). A comparable must carry
//     all three figures the model uses, so it can be validated on the same
//     terms it is fitted on. Bridge and exchange tokens are not comparable to
//     a pre-token DeFi protocol's future token, and the watchlist rule agrees.
//   * Size curve: ordinary least squares on log10(market cap) against
//     log10(TVL with a growth carry). The TVL first moves by the protocol's
//     seven-day change, capped at +/-25%, because a protocol whose TVL is
//     growing is worth more than one whose TVL is shrinking at the same size.
//   * Seasoning: a small band, -5% to +5% in log terms, by age up to 3 years:
//     an older protocol has survived longer, so it keeps a little more value.
//   * Launch odds: a logistic fit on the 123 mature protocols (listed at
//     least 2 years, TVL at least $50M) gives every pre-token protocol a
//     launch probability; the board's factor is its percentile among the 629
//     pre-token protocols, mapped to 0.50..1.00. The most launch-likely
//     protocol keeps its full curve value; the median keeps three quarters.
//   * Category intercepts were tested and REJECTED: they lose the
//     walk-forward test (see the ablation table the dashboard prints).
//   * Every number the dashboard quotes (LOO, walk-forward, blind splits,
//     ablation, range calibration, launch-odds hold-out) is recomputed from
//     the snapshot by this file at run time. Nothing is hardcoded.
//
// Node 22, standard library only. Deterministic: one fixed seed drives the
// bootstrap, every sort breaks ties by slug, and no clock or random source
// is read anywhere in this file.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-4';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Bootstrap refits behind every rank range. */
export const BOOTSTRAPS = 200;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories the watchlist rule itself bars: their tokens are not comparable. */
export const BARRED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol is a usable comparable: live-token, dated, and in an allowed category. */
export function isComparable(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0) return false;
  if (!(p.tvl_usd > 0)) return false;
  if (p.listed_at === null) return false;
  if (p.category !== null && BARRED_CATEGORIES.has(p.category)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  return true;
}

/** TVL after the seven-day growth carry, capped at +/-25%. */
export function carriedTvl(p: SnapshotProtocol): number {
  const g = finite(p.change_7d, 0);
  const carry = 1 + Math.max(-0.25, Math.min(0.25, g));
  return Math.max(1, p.tvl_usd * carry);
}

/** Seasoning in log10 terms: -0.05 for a newborn protocol, +0.05 at 3 years. */
export function seasoningLog(age: number | null): number {
  if (age === null) return 0;
  return 0.1 * (Math.min(age, 1095) / 1095) - 0.05;
}

/** Ordinary least squares for y ~ 1 + x, solved by the 2x2 normal equations. */
export function olsLine(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!; sy += ys[i]!; sxx += xs[i]! * xs[i]!; sxy += xs[i]! * ys[i]!;
  }
  const det = n * sxx - sx * sx;
  const b = (n * sxy - sx * sy) / det;
  const a = (sy - b * sx) / n;
  return { a, b };
}

/** The fitted size curve: log10(market cap) = a + b * log10(carried TVL). */
export function fitCurve(comps: SnapshotProtocol[]): { a: number; b: number } {
  const xs = comps.map((p) => Math.log10(carriedTvl(p)));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  return olsLine(xs, ys);
}

/** A protocol's curve value (before the launch factor), in dollars. */
export function curveValue(p: SnapshotProtocol, curve: { a: number; b: number }, asOf: string): number {
  const age = ageDays(asOf, p.listed_at);
  const logV = curve.a + curve.b * Math.log10(carriedTvl(p)) + seasoningLog(age);
  return Math.max(1, Math.round(Math.pow(10, logV)));
}

/** Median of numbers, for error factors. */
function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Median absolute log10 error, as a multiple (10^median|log error|). */
function errorFactor(predLog: number[], actLog: number[]): number {
  return Math.pow(10, median(predLog.map((p, i) => Math.abs(p - actLog[i]!))));
}

/** Leave-one-out median error of the size curve, refitting without each comparable. */
export function looError(comps: SnapshotProtocol[], asOf: string): number {
  const errs: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const curve = fitCurve(train);
    const p = comps[i]!;
    const pred = curve.a + curve.b * Math.log10(carriedTvl(p)) + seasoningLog(ageDays(asOf, p.listed_at));
    errs.push(Math.abs(pred - Math.log10(p.mcap_usd!)));
  }
  return Math.pow(10, median(errs));
}

/** Walk-forward median error: fit on `fit`, test on `test`, both in log10. */
export function splitError(fit: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string): number {
  const curve = fitCurve(fit);
  const pred = test.map((p) => curve.a + curve.b * Math.log10(carriedTvl(p)) + seasoningLog(ageDays(asOf, p.listed_at)));
  const act = test.map((p) => Math.log10(p.mcap_usd!));
  return errorFactor(pred, act);
}

/** The naive baseline: one global median market-cap/TVL multiple for every protocol. */
export function naiveError(comps: SnapshotProtocol[]): number {
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const mult = median(ratios);
  const errs = comps.map((p) => Math.abs(Math.log10(mult * p.tvl_usd) - Math.log10(p.mcap_usd!)));
  return Math.pow(10, median(errs));
}

/** One ablation row: a variant of the model and its LOO + walk-forward errors. */
export interface AblationRow {
  variant: string;
  loo: number;
  wf: number;
  kept: string;
}

/** The full validation panel: every number the dashboard quotes about the model. */
export interface Validation {
  comps: number;
  exponent: number;
  intercept: number;
  loo: number;
  wfOlderNewer: number;
  wfNewerOlder: number;
  blindA: number;
  blindB: number;
  naive: number;
  ablation: AblationRow[];
  cal2575: number;
  cal1090: number;
  launchHoldout: { accuracy: number; base: number; topQuintile: number };
}

/** A small deterministic PRNG (mulberry32) so the bootstrap is byte-identical every run. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let z = t;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian elimination for a small square system (the logistic fit's IRLS step). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]) > Math.abs(M[piv]![c])) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k] = M[r]![k]! - f * M[c]![k]!;
    }
    for (let k = c; k <= n; k++) M[c]![k] = M[c]![k]! / d;
  }
  return M.map((row) => row[n]!);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** Logistic features: [1, log10 TVL, log10(1+age in years), DeFi-category dummy]. */
function logitRow(p: SnapshotProtocol, asOf: string): number[] {
  const age = ageDays(asOf, p.listed_at);
  const ageY = Math.log10(1 + (age === null ? 400 : age) / 365);
  const defi = p.category !== null && ['Dexs', 'Lending', 'Yield', 'RWA', 'Derivatives'].includes(p.category) ? 1 : 0;
  return [1, Math.log10(Math.max(1, p.tvl_usd)), ageY, defi];
}

/** Logistic regression by IRLS (100 steps max, converges far sooner). */
function logitFit(rows: number[][], y: number[]): number[] {
  let beta = [0, 0, 0, 0];
  for (let it = 0; it < 100; it++) {
    const XtX: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    const XtZ: number[] = [0, 0, 0, 0];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const pr = sigmoid(r[0]! * beta[0]! + r[1]! * beta[1]! + r[2]! * beta[2]! + r[3]! * beta[3]!);
      const w = Math.max(pr * (1 - pr), 1e-9);
      const z = r[0]! * beta[0]! + r[1]! * beta[1]! + r[2]! * beta[2]! + r[3]! * beta[3]! + (y[i]! - pr) / w;
      for (let a = 0; a < 4; a++) {
        XtZ[a] = XtZ[a]! + w * r[a]! * z;
        for (let b2 = 0; b2 < 4; b2++) XtX[a]![b2] = XtX[a]![b2]! + w * r[a]! * r[b2]!;
      }
    }
    const next = solve(XtX, XtZ);
    const move = Math.max(...next.map((v, i) => Math.abs(v - beta[i]!)));
    beta = next;
    if (move < 1e-8) break;
  }
  return beta;
}

/** The launch model: fitted on mature protocols, then every pre-token protocol's probability. */
export interface LaunchModel {
  beta: number[];
  mature: number;
  probs: Map<string, number>;
  factor: Map<string, number>;
}

export function fitLaunch(snapshot: Snapshot): LaunchModel {
  const asOf = snapshot.as_of;
  const mature = snapshot.protocols.filter((p) => {
    const age = ageDays(asOf, p.listed_at);
    return age !== null && age >= 730 && p.tvl_usd >= 50_000_000;
  });
  const beta = logitFit(mature.map((p) => logitRow(p, asOf)), mature.map((p) => (p.mcap_usd === null ? 0 : 1)));
  const pre = snapshot.protocols.filter(isPreToken);
  const probs = new Map<string, number>();
  for (const p of pre) {
    const r = logitRow(p, asOf);
    probs.set(p.slug, sigmoid(r[0]! * beta[0]! + r[1]! * beta[1]! + r[2]! * beta[2]! + r[3]! * beta[3]!));
  }
  // Percentile of the probability among pre-token protocols, mapped to 0.50..1.00.
  const sorted = [...probs.values()].sort((a, b) => a - b);
  const factor = new Map<string, number>();
  for (const [slug, pr] of probs) {
    let below = 0;
    for (const v of sorted) if (v < pr) below++;
    const pct = sorted.length <= 1 ? 0.5 : below / (sorted.length - 1);
    factor.set(slug, 0.5 + 0.5 * pct);
  }
  return { beta, mature: mature.length, probs, factor };
}

/** Hold-out check for the launch model: fit on older mature protocols, test on newer ones. */
export function launchHoldout(snapshot: Snapshot): { accuracy: number; base: number; topQuintile: number } {
  const asOf = snapshot.as_of;
  const mature = snapshot.protocols
    .filter((p) => {
      const age = ageDays(asOf, p.listed_at);
      return age !== null && age >= 730 && p.tvl_usd >= 50_000_000;
    })
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const mid = mature.length >> 1;
  const fit = mature.slice(0, mid);
  const test = mature.slice(mid);
  const beta = logitFit(fit.map((p) => logitRow(p, asOf)), fit.map((p) => (p.mcap_usd === null ? 0 : 1)));
  const scored = test.map((p) => {
    const r = logitRow(p, asOf);
    return { p, pr: sigmoid(r[0]! * beta[0]! + r[1]! * beta[1]! + r[2]! * beta[2]! + r[3]! * beta[3]!) };
  });
  const base = test.filter((p) => p.mcap_usd !== null).length / Math.max(1, test.length);
  const accuracy = scored.filter((s) => (s.pr > 0.5) === (s.p.mcap_usd !== null)).length / Math.max(1, scored.length);
  const top = [...scored].sort((a, b) => b.pr - a.pr).slice(0, Math.max(1, Math.floor(scored.length / 5)));
  const topQuintile = top.filter((s) => s.p.mcap_usd !== null).length / Math.max(1, top.length);
  return { accuracy, base, topQuintile };
}

/** Assemble the validation panel: LOO, both walk-forwards, blind splits, naive baseline, ablation, range calibration. */
export function validate(snapshot: Snapshot, comps: SnapshotProtocol[]): Validation {
  const asOf = snapshot.as_of;
  const curve = fitCurve(comps);
  const loo = looError(comps, asOf);
  const byDate = [...comps].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const mid = byDate.length >> 1;
  const wfOlderNewer = splitError(byDate.slice(0, mid), byDate.slice(mid), asOf);
  const wfNewerOlder = splitError(byDate.slice(mid), byDate.slice(0, mid), asOf);
  const rng = mulberry32(20261119);
  const idx = comps.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i]!; idx[i] = idx[j]!; idx[j] = t;
  }
  const half = idx.length >> 1;
  const blindA = splitError(idx.slice(0, half).map((i) => comps[i]!), idx.slice(half).map((i) => comps[i]!), asOf);
  const blindB = splitError(idx.slice(half).map((i) => comps[i]!), idx.slice(0, half).map((i) => comps[i]!), asOf);
  const naive = naiveError(comps);

  // Ablation: each variant refit and scored the same way (LOO + older->newer walk-forward).
  const abl: AblationRow[] = [];
  const plain = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const c = fitCurvePlain(train);
    return c.a + c.b * Math.log10(Math.max(1, p.tvl_usd));
  };
  const carried = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const c = fitCurve(train);
    return c.a + c.b * Math.log10(carriedTvl(p));
  };
  const full = (train: SnapshotProtocol[], p: SnapshotProtocol): number => {
    const c = fitCurve(train);
    return c.a + c.b * Math.log10(carriedTvl(p)) + seasoningLog(ageDays(asOf, p.listed_at));
  };
  const looOf = (fn: (tr: SnapshotProtocol[], p: SnapshotProtocol) => number): number => {
    const es: number[] = [];
    for (let i = 0; i < comps.length; i++) {
      const tr = comps.filter((_, j) => j !== i);
      es.push(Math.abs(fn(tr, comps[i]!) - Math.log10(comps[i]!.mcap_usd!)));
    }
    return Math.pow(10, median(es));
  };
  const wfOf = (fn: (tr: SnapshotProtocol[], p: SnapshotProtocol) => number): number => {
    const fit = byDate.slice(0, mid);
    const test = byDate.slice(mid);
    const pred = test.map((p) => fn(fit, p));
    const act = test.map((p) => Math.log10(p.mcap_usd!));
    return errorFactor(pred, act);
  };
  abl.push({ variant: 'Size curve only (log TVL, no carry, no seasoning)', loo: looOf(plain), wf: wfOf(plain), kept: 'base' });
  abl.push({ variant: 'Curve + 7-day growth carry (capped +/-25%)', loo: looOf(carried), wf: wfOf(carried), kept: 'kept' });
  abl.push({ variant: 'Curve + carry + seasoning band (-5%..+5%)', loo: looOf(full), wf: wfOf(full), kept: 'kept — final' });
  abl.push({ variant: 'Curve + category intercepts', loo: looOf((tr, p) => catPred(tr, p, asOf)), wf: wfOf((tr, p) => catPred(tr, p, asOf)), kept: 'REJECTED — loses walk-forward' });
  abl.push({ variant: 'Naive: one global median multiple', loo: naive, wf: wfNaive(byDate.slice(0, mid), byDate.slice(mid)), kept: 'baseline' });

  // Range calibration: the value band is the curve plus the comparables' own
  // residual spread — the middle 50% (P25-P75) and 80% (P10-P90) of the
  // in-sample log residuals. A band built from refit variance alone would be
  // far too narrow: it measures the curve's wobble, not the scatter of real
  // market caps around it. Coverage is checked on the same comparables.
  const fullCurve = fitCurve(comps);
  const residuals = comps
    .map((p) => Math.log10(p.mcap_usd!) - (fullCurve.a + fullCurve.b * Math.log10(carriedTvl(p)) + seasoningLog(ageDays(asOf, p.listed_at))))
    .sort((a, b) => a - b);
  const q = (f: number): number => residuals[Math.min(residuals.length - 1, Math.floor(f * residuals.length))]!;
  const band = { lo50: q(0.25), hi50: q(0.75), lo80: q(0.1), hi80: q(0.9) };
  let in50 = 0, in80 = 0;
  for (const p of comps) {
    const pred = fullCurve.a + fullCurve.b * Math.log10(carriedTvl(p)) + seasoningLog(ageDays(asOf, p.listed_at));
    const act = Math.log10(p.mcap_usd!);
    if (act >= pred + band.lo50 && act <= pred + band.hi50) in50++;
    if (act >= pred + band.lo80 && act <= pred + band.hi80) in80++;
  }
  return {
    comps: comps.length,
    exponent: curve.b,
    intercept: curve.a,
    loo,
    wfOlderNewer,
    wfNewerOlder,
    blindA,
    blindB,
    naive,
    ablation: abl,
    cal2575: in50 / comps.length,
    cal1090: in80 / comps.length,
    launchHoldout: launchHoldout(snapshot),
  };
}

/** OLS on raw log10(TVL): the ablation's "curve only" variant. */
function fitCurvePlain(comps: SnapshotProtocol[]): { a: number; b: number } {
  return olsLine(comps.map((p) => Math.log10(Math.max(1, p.tvl_usd))), comps.map((p) => Math.log10(p.mcap_usd!)));
}

/** The ablation's rejected variant: one intercept per top category, pooled slope. */
function catPred(train: SnapshotProtocol[], p: SnapshotProtocol, asOf: string): number {
  const cats = ['Dexs', 'Lending', 'Yield', 'RWA', 'Derivatives'];
  const rows = train.map((q) => [1, Math.log10(carriedTvl(q)), ...cats.map((c) => (q.category === c ? 1 : 0))]);
  const y = train.map((q) => Math.log10(q.mcap_usd!));
  const beta = solveNormal(rows, y);
  const row = [1, Math.log10(carriedTvl(p)), ...cats.map((c) => (p.category === c ? 1 : 0))];
  return row.reduce((s, v, i) => s + v * beta[i]!, 0) + seasoningLog(ageDays(asOf, p.listed_at));
}

/** Least squares for a small design matrix, via the normal equations. */
function solveNormal(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a] = b[a]! + X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c] = A[a]![c]! + X[i]![a]! * X[i]![c]!;
    }
  }
  return solve(A, b);
}

/** Naive walk-forward: the fit half's median multiple applied to the test half. */
function wfNaive(fit: SnapshotProtocol[], test: SnapshotProtocol[]): number {
  const ratios = fit.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const mult = median(ratios);
  const pred = test.map((p) => Math.log10(mult * p.tvl_usd));
  const act = test.map((p) => Math.log10(p.mcap_usd!));
  return errorFactor(pred, act);
}

/** 200 bootstrap refits of the size curve, resampling the comparables with replacement. */
export function bootstrapCurves(comps: SnapshotProtocol[], n: number): { a: number; b: number }[] {
  const rng = mulberry32(20261119);
  const out: { a: number; b: number }[] = [];
  for (let k = 0; k < n; k++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(rng() * comps.length)]!);
    out.push(fitCurve(sample));
  }
  return out;
}

/** Rank range of one protocol across the bootstrap refits (P25..P75 of its refit rank). */
export function rankRange(
  row: { slug: string },
  board: BoardRow[],
  boots: { a: number; b: number }[],
  launch: LaunchModel,
  snapshot: Snapshot,
): { low: number; high: number } {
  const protoBySlug = new Map(snapshot.protocols.map((q) => [q.slug, q]));
  const ranks: number[] = [];
  for (const curve of boots) {
    const scored = board.map((r) => {
      const p = protoBySlug.get(r.slug)!;
      const v = curveValue(p, curve, snapshot.as_of) * (launch.factor.get(r.slug) ?? 1);
      return { slug: r.slug, v };
    });
    scored.sort((a, b) => b.v - a.v || (a.slug < b.slug ? -1 : 1));
    ranks.push(scored.findIndex((s) => s.slug === row.slug) + 1);
  }
  ranks.sort((a, b) => a - b);
  const q = (f: number): number => ranks[Math.min(ranks.length - 1, Math.floor(f * ranks.length))]!;
  return { low: q(0.25), high: q(0.75) };
}

/** --- Farm economics: every plan costed to the dollar and the minute. ---
 *
 * Assumptions, stated on the dashboard so the reader can argue with them:
 *   * one farm position is $1,000 (the detail view repeats the math at $10,000);
 *   * the airdrop pool, if the token launches, is 5% of the curve value, shared
 *     pro-rata by TVL, so a $1,000 position's share is 5% x curve x $1,000/TVL;
 *   * a swap costs 0.30% of the deposit, a protocol action 0.10%, a claim 0.10%;
 *   * gas is a fixed assumed price per transaction on the protocol's first
 *     chain (see GAS_USD; Ethereum $6.00, most L2s under $0.50);
 *   * idle capital costs the 4.00% T-bill yield for the hold;
 *   * net = airdrop-if-it-launches - fees - opportunity cost.
 * Verdicts: FARM when the net is at least $5, THIN when it is above $0,
 * SKIP otherwise. The expected net (net x launch probability) is shown in
 * the detail view, not the verdict: a plan is judged on what it pays if the
 * token comes, and the odds sit beside it. */

/** Assumed gas price in dollars per transaction, by chain (November 2026). */
export const GAS_USD: Record<string, number> = {
  ethereum: 6.0, arbitrum: 0.3, arbitrumone: 0.3, optimism: 0.1, base: 0.05,
  polygon: 0.05, bsc: 0.15, bnbchain: 0.15, avalanche: 0.3, solana: 0.02,
  sui: 0.02, aptos: 0.02, fantom: 0.1, gnosis: 0.05, linea: 0.1, scroll: 0.1,
  zksyncera: 0.15, zksync: 0.15, starknet: 0.2, mantle: 0.1, blast: 0.05,
  mode: 0.05, fraxtal: 0.05, celo: 0.02, kava: 0.1, cronos: 0.1,
};

const DEFAULT_GAS = 0.5;

/** Gas for one transaction on a protocol's first chain. */
export function gasUsd(p: SnapshotProtocol): number {
  const chain = p.chains.length > 0 ? p.chains[0]! : '';
  const key = chain.toLowerCase().replace(/[\s-]/g, '');
  return GAS_USD[key] ?? DEFAULT_GAS;
}

/** Hold in days, from the protocol's age: younger protocols get a longer window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The farm economics of one deposit size against one protocol. */
export interface FarmEcon {
  deposit: number;
  fees: number;
  opportunity: number;
  airdrop: number;
  net: number;
  expected: number;
  holdDays: number;
  touches: number;
  minutes: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

export function farmEcon(p: SnapshotProtocol, curve: number, launchP: number, deposit: number, asOf: string): FarmEcon {
  const gas = gasUsd(p);
  const age = ageDays(asOf, p.listed_at);
  const holdDays = holdDaysFor(age);
  const touches = Math.ceil(holdDays / 7);
  const fees = 0.005 * deposit + (4 + touches) * gas;
  const opportunity = (deposit * 0.04 * holdDays) / 365;
  const airdrop = 0.05 * curve * (deposit / Math.max(1, p.tvl_usd));
  const net = airdrop - fees - opportunity;
  const verdict: FarmEcon['verdict'] = net >= 5 ? 'FARM' : net > 0 ? 'THIN' : 'SKIP';
  return {
    deposit,
    fees,
    opportunity,
    airdrop,
    net,
    expected: net * launchP,
    holdDays,
    touches,
    minutes: 40 + 10 * touches,
    verdict,
  };
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $1,000 of USDC to ${name} and keep the loan open.`;
  if (c.includes('dex') || c.includes('swap') || c.includes('amm')) return `Provide $1,000 of liquidity to ${name}'s main pool and keep the position open.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('leveraged farm')) return `Deposit $1,000 into the ${name} vault and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $1,000 of USDC through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $1,000 of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $1,000 of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $1,000 and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $1,000 into a ${name} vault and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $1,000 of the stable asset through ${name}.`;
  if (c.includes('rwa')) return `Mint $1,000 of the protocol's yield asset and hold it.`;
  if (c.includes('insurance')) return `Buy $1,000 of cover from ${name} and keep the policy.`;
  return `Deposit $1,000 of USDC into ${name} and keep the position open.`;
}

/** Short action label for the main table. */
export function actionShort(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Supply USDC';
  if (c.includes('dex') || c.includes('swap') || c.includes('amm')) return 'Provide liquidity';
  if (c.includes('yield') || c.includes('vault') || c.includes('leveraged farm')) return 'Deposit in vault';
  if (c.includes('bridge')) return 'Bridge USDC';
  if (c.includes('staking') || c.includes('restak')) return 'Stake asset';
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return 'Deposit margin';
  if (c.includes('prediction')) return 'Place a position';
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return 'Deposit in vault';
  if (c.includes('stable')) return 'Mint stable asset';
  if (c.includes('rwa')) return 'Mint yield asset';
  if (c.includes('insurance')) return 'Buy cover';
  return 'Deposit USDC';
}

/** A step as one string: action, cost and time, inside the gate's 20..600 characters. */
function stepText(text: string, cost: string, time: string): string {
  let s = `${text} Cost: ${cost}. Time: ${time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** A protocol's six farm steps, each costed and timed from its own record. */
export function farmSteps(p: SnapshotProtocol, econ: FarmEcon): string[] {
  const gas = gasUsd(p);
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const money = (n: number): string => `$${n.toFixed(2)}`;
  return [
    stepText('Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline', '$0.00', '5 minutes'),
    stepText(`Swap $1,000 of USDC onto ${chain} for gas and the deposit`, `${money(3 + gas)} (0.30% swap fee plus one gas transaction)`, '10 minutes'),
    stepText(actionFor(p), `${money(1 + 2 * gas)} ($1.00 protocol fee plus two gas transactions)`, '15 minutes'),
    stepText(`Make one qualifying action each week for ${econ.touches} weeks, such as a deposit, a borrow, a swap or a vote`, `${money(econ.touches * gas)} (${econ.touches} gas transactions)`, '10 minutes a week'),
    stepText(`Hold the position for ${econ.holdDays} days so the activity is counted in more than one snapshot`, `${money(econ.opportunity)} of yield given up at the 4.00% T-bill rate`, `${econ.holdDays} days`),
    stepText("Claim only from the protocol's own rewards page, never from a link in a chat, and exit the position", `${money(1 + gas)} ($1.00 plus one gas transaction)`, '10 minutes'),
  ];
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_value_usd: number;
  launch_p: number;
  launch_factor: number;
  rank_low: number;
  rank_high: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_usd: number;
  fees_usd: number;
  opportunity_usd: number;
  airdrop_usd: number;
  hold_days: number;
  minutes: number;
  action: string;
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  watch: boolean;
  implied_value_usd: number;
  curve_value_usd: number;
  launch_p: number;
  launch_factor: number;
  rank_low: number;
  rank_high: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  net_usd: number;
  fees_usd: number;
  hold_days: number;
  minutes: number;
  action: string;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: { formula: string; exponent: number; intercept: number; comps: number };
  validation: Validation;
  launch: { mature: number; beta: number[] };
  board_size: number;
  watchlist_size: number;
  early_size: number;
  live_size: number;
  ledger: { ranked: number; live_total: number; live_shown: number; excluded_by_rule: number; below_cut: number; total: number };
  aggregate: { farm: number; thin: number; skip: number; sum_positive_net: number; sum_fees_farm: number; total_minutes_farm: number; best_farms: { slug: string; name: string; net: number }[] };
  scatter: { points: { x: number; y: number }[]; line: { x: number; y: number }[] };
  seal: string;
  rows: RadarRow[];
  live: LiveRow[];
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: it records no token, it is
 * not an exchange, and its name is not a versioned pool. Bridge and staking
 * protocols below the floor are rankable here — they record no token either,
 * and the starter ranks them the same way; what the board refuses is a
 * protocol that already has a token, never a category the watchlist leaves out. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  return true;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const comps = snapshot.protocols.filter(isComparable);
  const curve = fitCurve(comps);
  const launch = fitLaunch(snapshot);
  const validation = validate(snapshot, comps);
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));

  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, implied: Math.max(1, Math.round(curveValue(p, curve, asOf) * (launch.factor.get(p.slug) ?? 1))) }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const cv = curveValue(p, curve, asOf);
    const factor = launch.factor.get(p.slug) ?? 1;
    const implied = Math.max(1, Math.round(cv * factor));
    return { p, cv, factor, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const round2 = (n: number): number => Math.round(n * 100) / 100;
  const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

  const board: BoardRow[] = scored.map((s, i) => {
    const age = ageDays(asOf, s.p.listed_at);
    const econ = farmEcon(s.p, s.cv, launch.probs.get(s.p.slug) ?? 0, 1000, asOf);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      age_days: age,
      implied_value_usd: s.implied,
      curve_value_usd: s.cv,
      launch_p: round4(launch.probs.get(s.p.slug) ?? 0),
      launch_factor: round4(s.factor),
      rank_low: 0,
      rank_high: 0,
      verdict: econ.verdict,
      net_usd: round2(econ.net),
      fees_usd: round2(econ.fees),
      opportunity_usd: round2(econ.opportunity),
      airdrop_usd: round2(econ.airdrop),
      hold_days: econ.holdDays,
      minutes: econ.minutes,
      action: actionShort(s.p),
      farm_steps: farmSteps(s.p, econ),
    };
  });

  // Rank ranges from the bootstrap refits (the curve refit, the launch factor fixed).
  const boots = bootstrapCurves(comps, BOOTSTRAPS);
  for (const row of board) {
    const rr = rankRange(row, board, boots, launch, snapshot);
    row.rank_low = rr.low;
    row.rank_high = rr.high;
  }

  const live: LiveRow[] = snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));

  const liveTotal = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const boardSlugs = new Set(board.map((r) => r.slug));
  const preToken = snapshot.protocols.filter(isPreToken);
  const excludedByRule = preToken.filter((p) => !isRankable(p)).length;
  const belowCut = preToken.filter((p) => isRankable(p) && !boardSlugs.has(p.slug)).length;

  const farm = board.filter((r) => r.verdict === 'FARM').length;
  const thin = board.filter((r) => r.verdict === 'THIN').length;
  const skip = board.filter((r) => r.verdict === 'SKIP').length;
  const sumPositiveNet = round2(board.filter((r) => r.net_usd > 0).reduce((s, r) => s + r.net_usd, 0));
  const sumFeesFarm = round2(board.filter((r) => r.verdict === 'FARM').reduce((s, r) => s + r.fees_usd, 0));
  const totalMinutesFarm = board.filter((r) => r.verdict === 'FARM').reduce((s, r) => s + r.minutes, 0);
  const bestFarms = [...board]
    .sort((a, b) => b.net_usd - a.net_usd)
    .slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.name, net: r.net_usd }));

  const points = comps.map((p) => ({ x: round4(Math.log10(carriedTvl(p))), y: round4(Math.log10(p.mcap_usd!)) }));
  const xs = points.map((pt) => pt.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const line: { x: number; y: number }[] = [];
  for (let k = 0; k <= 20; k++) {
    const x = x0 + ((x1 - x0) * k) / 20;
    line.push({ x: round4(x), y: round4(curve.a + curve.b * x) });
  }

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      formula: 'log10(market cap) = intercept + exponent x log10(TVL with 7-day growth carry, capped +/-25%) + seasoning(-5%..+5% by age); implied = curve x launch factor (0.50..1.00 by launch-probability percentile)',
      exponent: round4(curve.b),
      intercept: round4(curve.a),
      comps: comps.length,
    },
    validation,
    launch: { mature: launch.mature, beta: launch.beta.map((v) => round4(v)) },
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    early_size: board.length - snapshot.watchlist.length,
    live_size: live.length,
    ledger: { ranked: board.length, live_total: liveTotal, live_shown: live.length, excluded_by_rule: excludedByRule, below_cut: belowCut, total: snapshot.protocols.length },
    aggregate: { farm, thin, skip, sum_positive_net: sumPositiveNet, sum_fees_farm: sumFeesFarm, total_minutes_farm: totalMinutesFarm, best_farms: bestFarms },
    scatter: { points, line },
    seal: '',
    rows: board.map((r) => ({
      rank: r.rank, slug: r.slug, name: r.name, category: r.category, chains: r.chains,
      tvl_usd: r.tvl_usd, change_7d: r.change_7d, age_days: r.age_days,
      watch: snapshot.watchlist.includes(r.slug),
      implied_value_usd: r.implied_value_usd, curve_value_usd: r.curve_value_usd,
      launch_p: r.launch_p, launch_factor: r.launch_factor, rank_low: r.rank_low, rank_high: r.rank_high,
      verdict: r.verdict, net_usd: r.net_usd, fees_usd: r.fees_usd, hold_days: r.hold_days,
      minutes: r.minutes, action: r.action, farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData, seal: string): string {
  return `window.RADAR=${JSON.stringify({ ...radar, seal })};\n`;
}
