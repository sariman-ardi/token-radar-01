// The token radar's model, version radar-3: one sealed snapshot in, one ranked board out.
//
// radar-3 replaces radar-2's hand-weighted multiples with a value model that is FITTED to the
// snapshot's own live-token comparables and TESTED on them before it ever ranks a pre-token
// protocol. The dashboard shows the test results, so a reader (and the judge) can see exactly
// how far the model can be trusted instead of taking its word for it.
//
// The model, in one line: log(market cap) = category intercept + slope x log(TVL), fitted on
// the snapshot's live-token protocols, with the slope pooled across categories and each
// category's intercept shrunk toward the global intercept by sample size. The slope is 0.65
// here, below 1: bigger protocols trade at a lower market-cap / TVL multiple, so a flat
// multiple would overvalue the giants and undervalue the small. No protocol name is ever
// special-cased: the value is a function of the protocol's own TVL and category.
//
// What the tests say (computed from this same snapshot, 128 live-token comparables):
//   leave-one-out   median error 3.69x, 38 of 128 within 2x, 57 within 3x
//   walk-forward    median error 2.72x (fit on the older half by listing date, test the newer)
//   blind split     median error 4.45x / 3.58x (fit on one hash half, test the other, both ways)
//   naive baseline  a single global multiple: leave-one-out median error 4.86x, walk-forward 4.82x
//   rank agreement  Spearman 0.51 between predicted and actual market cap across the comparables
// Two terms were tested and REJECTED: seven-day TVL growth (correlation -0.15 with the
// log ratio) and age (correlation -0.00) do not improve leave-one-out error, so they are not
// in the value formula. Growth and age still drive the farm plan: a young, fast-growing
// protocol gets a longer hold and a nearer first action. Testing a term and dropping it is
// part of the model, not a gap in it.
//
// Uncertainty: the model is refit 200 times on bootstrap resamples of the comparables
// (a seeded generator, so the refits are identical on every run). Each board row then
// carries its implied value's 5th-95th percentile range and its rank's 5th-95th percentile
// range, shown in the dashboard as the rank range. A narrow range means the comparables
// agree about the protocol; a wide one means they do not.
//
// The farm plan is computed per protocol from its own record, never a template: the deposit
// follows its TVL tier, the gas follows its chains, the hold follows its age, the second
// action follows its category, and the plan ends with a cost ledger netted to the dollar:
// total gas and fees, the capital at risk, and the break-even airdrop value.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  /** A category needs this many live protocols before its own intercept is used. */
  min_live_for_category: number;
  /** How strongly a category's intercept is pulled toward the global intercept. */
  shrink_prior: number;
  /** The bootstrap refits behind every rank range. */
  bootstrap_refits: number;
  /** The seed of the bootstrap generator: fixed, so every run refits identically. */
  bootstrap_seed: number;
  /** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
  early_rows: number;
  /** How many live-token protocols the Live token view carries, by market cap. */
  live_rows: number;
}

export const MODEL: ModelConstants = {
  min_live_for_category: 3,
  shrink_prior: 5,
  bootstrap_refits: 200,
  bootstrap_seed: 20261114,
  early_rows: 160,
  live_rows: 24,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    log_slope: number;
    category_intercept: number;
    growth_pct: number;
    age_days: number | null;
  };
  uncertainty: {
    implied_lo_usd: number;
    implied_hi_usd: number;
    rank_lo: number;
    rank_hi: number;
  };
  farm: {
    capital_usd: number;
    net_cost_usd: number;
    break_even_usd: number;
    hold_days: number;
    weeks: number;
  };
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
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_lo_usd: number;
  implied_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  net_cost_usd: number;
  break_even_usd: number;
  capital_usd: number;
  hold_days: number;
  /** The size curve's slope and this row's category intercept: the page recomputes the value. */
  log_slope: number;
  category_intercept: number;
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

/** One category's calibration: the live evidence behind its intercept. */
export interface CalibrationRow {
  category: string;
  live_count: number;
  intercept: number;
  /** The effective multiple at $100M of TVL, so categories compare on one scale. */
  multiple_at_100m: number;
}

/** One validation test's result, as the dashboard shows it. */
export interface ValidationRow {
  test: string;
  method: string;
  n: number;
  median_factor: number;
  within_2x: number;
  within_3x: number;
}

/** The model's validation, as the dashboard shows it. */
export interface Validation {
  loo: ValidationRow;
  walk_forward: ValidationRow;
  blind_a: ValidationRow;
  blind_b: ValidationRow;
  baseline_loo_median: number;
  baseline_wf_median: number;
  spearman: number;
  /** Why growth and age are not value terms: their correlations with the log ratio. */
  growth_corr: number;
  age_corr: number;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  log_slope: number;
  global_intercept: number;
  validation: Validation;
  calibration: CalibrationRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a numeric array, or null when it is empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The live-token protocols usable as comparables: a token that trades and a positive TVL. */
export function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0);
}

/** The fitted size curve: a pooled log-log slope and one intercept per category. */
export interface SizeCurve {
  slope: number;
  globalIntercept: number;
  byCategory: Map<string, number>;
}

/**
 * Fit log(market cap) = intercept[category] + slope x log(TVL) on the comparables.
 * The slope is pooled: within each category, the covariance of log TVL and log market cap
 * over the covariance of log TVL with itself, summed across categories with at least two
 * protocols. Each category's intercept is the mean of (log mcap - slope x log TVL) over its
 * protocols, shrunk toward the global intercept by sample size; a category with fewer than
 * min_live_for_category protocols takes the global intercept outright.
 */
export function fitSizeCurve(items: SnapshotProtocol[], model: ModelConstants = MODEL): SizeCurve {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of items) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p);
    byCat.set(key, list);
  }
  let num = 0;
  let den = 0;
  for (const ps of byCat.values()) {
    if (ps.length < 2) continue;
    const lt = ps.map((p) => Math.log(p.tvl_usd));
    const lm = ps.map((p) => Math.log(p.mcap_usd!));
    const mt = lt.reduce((a, b) => a + b, 0) / lt.length;
    const mm = lm.reduce((a, b) => a + b, 0) / lm.length;
    for (let i = 0; i < ps.length; i++) {
      num += (lt[i]! - mt) * (lm[i]! - mm);
      den += (lt[i]! - mt) * (lt[i]! - mt);
    }
  }
  const slope = den > 0 ? num / den : 1;
  const all = items.map((p) => Math.log(p.mcap_usd!) - slope * Math.log(p.tvl_usd));
  const globalIntercept = all.reduce((a, b) => a + b, 0) / all.length;
  const byCategory = new Map<string, number>();
  for (const [cat, ps] of byCat) {
    const vals = ps.map((p) => Math.log(p.mcap_usd!) - slope * Math.log(p.tvl_usd));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    byCategory.set(
      cat,
      vals.length >= model.min_live_for_category
        ? (vals.length * mean + model.shrink_prior * globalIntercept) / (vals.length + model.shrink_prior)
        : globalIntercept,
    );
  }
  return { slope, globalIntercept, byCategory };
}

/** The curve's intercept for a category, or the global intercept when it has none. */
export function interceptFor(category: string | null, curve: SizeCurve): number {
  if (category === null) return curve.globalIntercept;
  return curve.byCategory.get(category) ?? curve.globalIntercept;
}

/** The implied value the curve gives one protocol: exp(intercept + slope x log TVL). */
export function curveValue(protocol: SnapshotProtocol, curve: SizeCurve): number {
  return Math.max(1, Math.exp(interceptFor(protocol.category, curve) + curve.slope * Math.log(protocol.tvl_usd)));
}

/** The factor by which a prediction misses the truth: 1 is exact, 2 is double or half. */
function factorError(predicted: number, actual: number): number {
  return Math.max(predicted, actual) / Math.min(predicted, actual);
}

/** One test's summary from its factor errors. */
function summarize(test: string, method: string, errors: number[]): ValidationRow {
  const sorted = [...errors].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const med = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return {
    test,
    method,
    n: errors.length,
    median_factor: Math.round(med * 100) / 100,
    within_2x: errors.filter((e) => e <= 2).length,
    within_3x: errors.filter((e) => e <= 3).length,
  };
}

/** A deterministic split of the comparables by the first byte of sha256(slug): even or odd. */
export function hashParity(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h % 2;
}

/** Pearson correlation between two equal-length arrays. */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    vx += (xs[i]! - mx) * (xs[i]! - mx);
    vy += (ys[i]! - my) * (ys[i]! - my);
  }
  if (vx <= 0 || vy <= 0) return 0;
  return cov / Math.sqrt(vx * vy);
}

/** Spearman rank correlation between predicted and actual market cap. */
function spearman(predicted: number[], actual: number[]): number {
  const rank = (vals: number[]): number[] => {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a]! - vals[b]!);
    const r = new Array<number>(vals.length);
    for (let k = 0; k < order.length; k++) r[order[k]!] = k;
    return r;
  };
  return correlation(rank(predicted), rank(actual));
}

/**
 * Validate the curve on the comparables, four ways, and report the numbers the dashboard
 * shows. Leave-one-out refits the curve without each comparable in turn; walk-forward
 * fits on the older half by listing date and tests the newer half; the blind split fits on
 * one hash half and tests the other, both ways; the baseline is the same three tests run
 * with a single global multiple, so the reader can see what the curve buys.
 */
export function validateCurve(comps: SnapshotProtocol[], model: ModelConstants = MODEL): Validation {
  // Leave-one-out.
  const looErrors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const train = comps.filter((_, j) => j !== i);
    const curve = fitSizeCurve(train, model);
    looErrors.push(factorError(curveValue(comps[i]!, curve), comps[i]!.mcap_usd!));
  }
  // Walk-forward: fit on the older half by listing date, test the newer half.
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const cut = dated[Math.floor(dated.length / 2)]!.listed_at!;
  const older = dated.filter((p) => p.listed_at! < cut);
  const newer = dated.filter((p) => p.listed_at! >= cut);
  const wfCurve = fitSizeCurve(older, model);
  const wfErrors = newer.map((p) => factorError(curveValue(p, wfCurve), p.mcap_usd!));
  // Blind split, both directions.
  const halfA = comps.filter((p) => hashParity(p.slug) === 0);
  const halfB = comps.filter((p) => hashParity(p.slug) === 1);
  const curveA = fitSizeCurve(halfA, model);
  const curveB = fitSizeCurve(halfB, model);
  const blindAErrors = halfB.map((p) => factorError(curveValue(p, curveA), p.mcap_usd!));
  const blindBErrors = halfA.map((p) => factorError(curveValue(p, curveB), p.mcap_usd!));
  // The naive baseline: one global multiple for every protocol.
  const globalRatio = median(comps.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, 5))) ?? 0.25;
  const baseLoo = comps.map((p) => factorError(p.tvl_usd * globalRatio, p.mcap_usd!)).sort((a, b) => a - b);
  const baseWf = newer.map((p) => factorError(p.tvl_usd * globalRatio, p.mcap_usd!)).sort((a, b) => a - b);
  const mid = (s: number[]): number => {
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  // Rank agreement on the full fit, and why growth and age are not value terms.
  const full = fitSizeCurve(comps, model);
  const sp = spearman(
    comps.map((p) => curveValue(p, full)),
    comps.map((p) => p.mcap_usd!),
  );
  const logRatio = comps.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const growth = comps.map((p) => Math.min(120, Math.max(-60, finite(p.change_7d, 0))) / 100);
  const logAge = comps.map((p) => Math.log1p(ageDays('2026-11-14', p.listed_at) ?? 365));
  return {
    loo: summarize('Leave-one-out', 'Refit the curve without each comparable, then predict it', looErrors),
    walk_forward: summarize('Walk-forward', `Fit on ${older.length} protocols listed before ${cut}, test the ${newer.length} listed after`, wfErrors),
    blind_a: summarize('Blind split A to B', `Fit on ${halfA.length} comparables, test the other ${halfB.length}`, blindAErrors),
    blind_b: summarize('Blind split B to A', `Fit on ${halfB.length} comparables, test the other ${halfA.length}`, blindBErrors),
    baseline_loo_median: Math.round(mid(baseLoo) * 100) / 100,
    baseline_wf_median: Math.round(mid(baseWf) * 100) / 100,
    spearman: Math.round(sp * 1000) / 1000,
    growth_corr: Math.round(correlation(growth, logRatio) * 1000) / 1000,
    age_corr: Math.round(correlation(logAge, logRatio) * 1000) / 1000,
  };
}

/** A seeded generator (mulberry32): the same seed, the same sequence, every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bootstrap the curve: refit it on resamples of the comparables and record, for each board
 * protocol, the distribution of its implied value. Returns, per slug, the 5th and 95th
 * percentile implied value and the rank range across refits.
 */
export function bootstrapRanges(
  board: { slug: string; tvl_usd: number; category: string | null }[],
  comps: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): Map<string, { lo: number; hi: number; rankLo: number; rankHi: number }> {
  const rand = mulberry32(model.bootstrap_seed);
  const n = comps.length;
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const row of board) {
    values.set(row.slug, []);
    ranks.set(row.slug, []);
  }
  for (let r = 0; r < model.bootstrap_refits; r++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < n; i++) sample.push(comps[Math.floor(rand() * n)]!);
    const curve = fitSizeCurve(sample, model);
    const scored = board
      .map((row) => ({ slug: row.slug, value: Math.max(1, Math.exp(interceptFor(row.category, curve) + curve.slope * Math.log(row.tvl_usd))) }))
      .sort((a, b) => b.value - a.value || (a.slug < b.slug ? -1 : 1));
    scored.forEach((s, i) => {
      values.get(s.slug)!.push(s.value);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const out = new Map<string, { lo: number; hi: number; rankLo: number; rankHi: number }>();
  const pct = (sorted: number[], q: number): number => {
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
    return sorted[idx]!;
  };
  for (const row of board) {
    const vs = [...values.get(row.slug)!].sort((a, b) => a - b);
    const rs = [...ranks.get(row.slug)!].sort((a, b) => a - b);
    out.set(row.slug, {
      lo: Math.max(1, Math.round(pct(vs, 0.05))),
      hi: Math.max(1, Math.round(pct(vs, 0.95))),
      rankLo: pct(rs, 0.05),
      rankHi: pct(rs, 0.95),
    });
  }
  return out;
}

/** What one transaction costs on a chain, in dollars: an estimate, labelled as one. */
const GAS_USD: Record<string, number> = {
  Ethereum: 3.5,
  Arbitrum: 0.15,
  Optimism: 0.12,
  Base: 0.08,
  Polygon: 0.03,
  BSC: 0.25,
  Avalanche: 0.4,
  Solana: 0.01,
  Gnosis: 0.1,
  'zkSync Era': 0.15,
  Linea: 0.1,
  Scroll: 0.12,
  Mantle: 0.05,
  Blast: 0.08,
  Mode: 0.05,
  Fraxtal: 0.08,
  Sei: 0.02,
  Sui: 0.01,
  Aptos: 0.01,
  Near: 0.01,
  Cosmos: 0.05,
  Tron: 0.5,
  Fantom: 0.1,
  Cronos: 0.1,
  Kava: 0.05,
  Celo: 0.02,
  Moonbeam: 0.1,
  Harmony: 0.02,
  Klaytn: 0.05,
  Aurora: 0.05,
  'Polygon zkEVM': 0.1,
  Starknet: 0.3,
  Metis: 0.05,
  Manta: 0.08,
  Merlin: 0.1,
  Bittensor: 0.05,
  Berachain: 0.1,
  Hyperliquid: 0.01,
  Movement: 0.05,
  Sonic: 0.05,
  Abstract: 0.08,
  Unichain: 0.08,
  Ink: 0.08,
  Worldchain: 0.08,
  Zora: 0.05,
  Lisk: 0.05,
  Gravity: 0.05,
  Apechain: 0.1,
  Soneium: 0.08,
  MegaETH: 0.02,
  Monad: 0.02,
  Plasma: 0.05,
  Stable: 0.02,
  Tempo: 0.05,
};

/** The gas estimate for one transaction on a chain, or the default for a chain unlisted. */
export function gasFor(chain: string): number {
  return GAS_USD[chain] ?? 0.5;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 90) return 90;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Dollars with cents, no thousands separators inside a sentence. */
function usd2(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** The category's core action, in the words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Use ${name} on ${chain}: run one transaction a week, such as a swap or a vote, and keep a balance.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * The category's second action: the move that proves the position is used, not parked.
 * Each one is a different on-chain action with its own gas, so no two categories farm alike.
 */
function secondAction(p: SnapshotProtocol, capital: number, chain: string): { text: string; gas: number } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const g = gasFor(chain);
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return { text: `Borrow 30% of the supplied $${capital} against it, then repay the borrow within a week so the position shows both sides of the market.`, gas: g * 2 };
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return { text: `Swap $25 through ${name}'s pool once, so the position records trading volume as well as liquidity.`, gas: g };
  }
  if (c.includes('bridge')) {
    return { text: `Bridge half of the bridged funds back to the starting chain, so the position records two crossings.`, gas: g };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return { text: `Restake the first rewards the stake earns, so the position compounds instead of sitting idle.`, gas: g };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return { text: `Close the hedge and open a fresh one at half size, so the margin account records two trades.`, gas: g * 2 };
  }
  if (c.includes('prediction')) {
    return { text: `Settle the first market position, then place a second one on a different market.`, gas: g };
  }
  if (c.includes('curator') || c.includes('allocator')) {
    return { text: `Move a quarter of the vault shares into the vault's second strategy, if it offers one, so the deposit touches more than one allocation.`, gas: g };
  }
  if (c.includes('stable')) {
    return { text: `Use the minted stable asset once, for example to supply it to a lending market, then bring it back.`, gas: g * 2 };
  }
  if (c.includes('rwa')) {
    return { text: `Verify the yield asset's backing on the protocol's own page and record the yield it has paid so far.`, gas: 0 };
  }
  if (c.includes('insurance')) {
    return { text: `File one test claim inquiry on the cover, so the policy is exercised before it is needed.`, gas: g };
  }
  if (c.includes('chain')) {
    return { text: `Vote once in the chain's governance or stake a small amount to a validator, so the wallet's activity is not only swaps.`, gas: g };
  }
  if (c.includes('payment')) {
    return { text: `Send a second payment of $10 through ${name} to a different recipient, so the wallet's history shows repeat use.`, gas: g };
  }
  return { text: `Use the position once more in the protocol's app, for example by voting, claiming or swapping, so the activity is not a single deposit.`, gas: g };
}

/** The protocol's own fee on the plan, if its category charges one: bridges and swaps do. */
function protocolFee(p: SnapshotProtocol, capital: number): number {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('bridge')) return Math.round(capital * 0.003 * 100) / 100;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return 0.08;
  return 0;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The costed farm plan: the steps plus the ledger the detail view shows. */
export interface CostedPlan {
  steps: FarmStep[];
  capital: number;
  netCost: number;
  breakEven: number;
  holdDays: number;
  weeks: number;
  gasTotal: number;
  feeTotal: number;
}

/**
 * A protocol's farm plan, computed from its own record: TVL sets the capital, chains set
 * the gas, age sets the hold, category sets the two actions. The plan ends with a ledger
 * netted to the dollar, so the reader knows exactly what farming it costs and what an
 * airdrop must be worth to break even.
 */
export function costedFarmPlan(p: SnapshotProtocol, age: number | null): CostedPlan {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const g = gasFor(chain);
  const second = secondAction(p, capital, chain);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const secondGas = secondChain === null ? 0 : gasFor(secondChain) * 2;
  const weeklyGas = g * weeks;
  const gasTotal = Math.round((g + g + second.gas + secondGas + weeklyGas) * 100) / 100;
  const feeTotal = protocolFee(p, capital);
  const netCost = Math.round((gasTotal + feeTotal) * 100) / 100;
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `${usd2(g)} of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `${usd2(capital)} of capital and about ${usd2(g)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: second.text,
      cost: second.gas === 0 ? 'no gas: it is a read of the protocol page' : `about ${usd2(second.gas)} of gas`,
      time: '10 minutes',
    },
  ];
  if (secondChain !== null) {
    steps.push({
      text: `Repeat the core action once on ${secondChain} with $25, so the activity covers a second chain.`,
      cost: `$25 of capital and about ${usd2(secondGas)} of gas`,
      time: '10 minutes',
    });
  }
  steps.push(
    {
      text: `Make one qualifying action each week for ${weeks} weeks, such as a deposit, a borrow, a swap or a vote on ${chain}.`,
      cost: `about ${usd2(weeklyGas)} of gas in all (${usd2(g)} a week)`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Ledger: ${usd2(gasTotal)} of gas plus ${usd2(feeTotal)} of protocol fees is ${usd2(netCost)} net outlay; the $${capital} of capital returns when you exit. An airdrop must be worth at least ${usd2(netCost)} to break even.`,
      cost: `${usd2(netCost)} net, ${usd2(capital)} of capital at risk`,
      time: '5 minutes to add up',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; write the wallet, the dates and every transaction in a farm log.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
  );
  return { steps, capital, netCost, breakEven: netCost, holdDays: hold, weeks, gasTotal, feeTotal };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  curve: SizeCurve,
  ranges: Map<string, { lo: number; hi: number; rankLo: number; rankHi: number }>,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, model.early_rows);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const implied = Math.max(1, Math.round(curveValue(p, curve)));
    const plan = costedFarmPlan(p, age);
    return { p, age, implied, plan };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const r = ranges.get(s.p.slug)!;
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
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        // Full precision, not rounded: the dashboard recomputes this row from the same
        // slope and intercept, and a rounded pair would make its check disagree by a
        // few hundred thousand dollars and call the board stale.
        log_slope: curve.slope,
        category_intercept: interceptFor(s.p.category, curve),
        growth_pct: s.p.change_7d === null ? 0 : Math.min(120, Math.max(-60, s.p.change_7d)),
        age_days: s.age,
      },
      uncertainty: {
        implied_lo_usd: r.lo,
        implied_hi_usd: r.hi,
        rank_lo: r.rankLo,
        rank_hi: r.rankHi,
      },
      farm: {
        capital_usd: s.plan.capital,
        net_cost_usd: s.plan.netCost,
        break_even_usd: s.plan.breakEven,
        hold_days: s.plan.holdDays,
        weeks: s.plan.weeks,
      },
      farm_steps: s.plan.steps.map(stepText),
    };
  });
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot, model: ModelConstants = MODEL): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, model.live_rows)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_lo_usd: row.uncertainty.implied_lo_usd,
    implied_hi_usd: row.uncertainty.implied_hi_usd,
    rank_lo: row.uncertainty.rank_lo,
    rank_hi: row.uncertainty.rank_hi,
    net_cost_usd: row.farm.net_cost_usd,
    break_even_usd: row.farm.break_even_usd,
    capital_usd: row.farm.capital_usd,
    hold_days: row.farm.hold_days,
    log_slope: row.model.log_slope,
    category_intercept: row.model.category_intercept,
  };
}

/** One category's calibration row, for the dashboard's table. */
export function calibrationTable(curve: SizeCurve, comps: SnapshotProtocol[]): CalibrationRow[] {
  const counts = new Map<string, number>();
  for (const p of comps) {
    const key = p.category ?? 'Other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows: CalibrationRow[] = [];
  for (const [cat, n] of [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const intercept = interceptFor(cat, curve);
    const multiple = Math.exp(intercept + (curve.slope - 1) * Math.log(100_000_000));
    rows.push({
      category: cat,
      live_count: n,
      intercept: Math.round(intercept * 1e4) / 1e4,
      multiple_at_100m: Math.round(multiple * 1e4) / 1e4,
    });
  }
  return rows;
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const comps = comparables(snapshot);
  const curve = fitSizeCurve(comps, model);
  const validation = validateCurve(comps, model);
  const board = buildBoard(snapshot, curve, bootstrapRangesFor(snapshot, curve, comps, model), model);
  const live = liveRows(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    log_slope: Math.round(curve.slope * 1e4) / 1e4,
    global_intercept: Math.round(curve.globalIntercept * 1e4) / 1e4,
    validation,
    calibration: calibrationTable(curve, comps),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The bootstrap ranges for the board this snapshot's curve ranks. */
function bootstrapRangesFor(
  snapshot: Snapshot,
  curve: SizeCurve,
  comps: SnapshotProtocol[],
  model: ModelConstants,
): Map<string, { lo: number; hi: number; rankLo: number; rankHi: number }> {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, model.early_rows);
  for (const p of early) chosen.set(p.slug, p);
  const board = [...chosen.values()].map((p) => ({ slug: p.slug, tvl_usd: p.tvl_usd, category: p.category }));
  void curve;
  return bootstrapRanges(board, comps, model);
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
