# Token Radar — radar-3

[![make.fun](https://make.fun/bounty/token-radar-01/badge.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun](https://make.fun/bounty/token-radar-01/badge-entries.svg)](https://make.fun/bounty/token-radar-01)
[![make.fun](https://make.fun/bounty/token-radar-01/badge-prize.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for the [make.fun bounty](https://make.fun/bounty/token-radar-01): 200
pre-token protocols ranked by implied value, each with a farm plan costed to the dollar.

## The model (radar-3)

`log(market cap) = intercept[category] + slope × log(TVL)`, fitted on the snapshot's own
live-token comparables (128 of them), with the slope pooled across categories and each
category's intercept shrunk toward the global intercept by sample size. No protocol name
is ever special-cased.

The model is tested before it ranks anything, and the dashboard shows the results:

| Test | Median error |
| --- | --- |
| Leave-one-out (128 comparables) | 3.69x |
| Walk-forward (fit older, test newer) | 2.72x |
| Blind split, both directions | 4.45x / 3.58x |
| Naive baseline (one global multiple) | 4.86x / 4.82x |

Seven-day growth and age were tested as value terms and dropped: neither improves
leave-one-out error (correlations −0.15 and −0.00 with the log ratio). They still drive
the farm plan's hold time. Every row carries a rank range from 200 bootstrap refits.

## Farm plans

Each protocol's plan is computed from its own record: the deposit follows its TVL tier,
the gas follows its chains, the hold follows its age, the second action follows its
category — and the plan ends with a ledger netted to the dollar (gas + fees, capital at
risk, break-even airdrop value).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

Node 22, standard library only. Reads `/input/snapshot.json` by default, writes
`board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` to `/output`.
Two runs write the same bytes.

## License

MIT — see [LICENSE](LICENSE).
