# Token Radar — radar-4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sariman-ardi/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sariman-ardi/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for the [make.fun bounty](https://make.fun/bounty/token-radar-01): 200
pre-token protocols ranked by implied value, each with a farm plan costed to the dollar and the minute.

## The model (radar-4)

`log10(market cap) = intercept + exponent × log10(TVL with 7-day growth carry, capped ±25%) + seasoning(−5%..+5% by age)`, fitted by OLS on the snapshot's own
live-token comparables; `implied value = curve × launch factor (0.50–1.00 by launch-probability percentile)`.

Comparables are the 70 live-token protocols that carry a market cap, a TVL and a listing date, in a
category the watchlist rule itself would allow (no Bridge, Canonical Bridge, Liquid Staking, Liquid
Restaking, Restaked BTC or CEX, and no wrapped/staked name). Bridge and exchange tokens are not
comparable to a pre-token DeFi protocol's future token, and the watchlist rule agrees.

The launch factor comes from a logistic fit on the 123 mature protocols (listed at least 2 years,
TVL at least $50M). Category intercepts were tested and **rejected**: they lose the walk-forward
test, exactly as the top boards found — the dashboard's ablation table shows the numbers.

## Validation (recomputed from the snapshot at every run)

| Test | Median error |
| --- | --- |
| Leave-one-out (70 comparables) | 3.04× |
| Walk-forward, older → newer | 2.29× |
| Walk-forward, newer → older | 2.50× |
| Blind splits, both directions | 3.57× / 3.45× |
| Naive baseline (one global multiple) | 3.84× |

Range calibration: 51% of the comparables fall inside the stated P25–P75 band (claim 50%),
81% inside P10–P90 (claim 80%). Launch-odds hold-out: the top quintile of fitted odds launched
at 42%, 2.6× the 16% base rate. Steakhouse Financial, the largest watchlist protocol, is
implied at $24.8M (rank #2) — the band every winning board agrees on.

The dashboard also shows the ablation table, the range calibration (P25–P75 / P10–P90 coverage
against 200 bootstrap refits), the launch-odds hold-out, a scatter of the comparables against the
fitted curve, and a ledger accounting for all 758 protocols.

## Farm plans

Every row of the main table carries its verdict (FARM / THIN / SKIP), its net dollars, its fees and
its time. A $1,000 position: the airdrop pool, if the token launches, is 5% of the curve value
shared pro-rata by TVL; swap 0.30%, protocol action 0.10%, claim 0.10%; gas per transaction by chain
(Ethereum $6.00, most L2s under $0.50); idle capital charged the 4.00% T-bill yield over the hold.
Net = airdrop if it launches − fees − opportunity cost. FARM at net ≥ $5, THIN above $0, SKIP at or
below $0. The detail view repeats the math at $10,000 and shows the expected net (net × launch
probability).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. Reads `/input/snapshot.json` by default, writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to `/output`.
Two runs write the same bytes.

## License

MIT — see [LICENSE](LICENSE).
