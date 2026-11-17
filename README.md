[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/sariman-ardi/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/sariman-ardi/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

# Token Radar

A token launch radar: it reads a sealed snapshot of every protocol DefiLlama tracks, works out which ones still record no token and are not a wrapped or staked product of one that trades, ranks them by what their launch would be worth, and hands in a web dashboard that shows the board, a detail view for each protocol and the steps to farm it.

Built for make.fun's [Build the best token launch radar](https://make.fun/bounty/token-radar-01) bounty ($1,325 in USDC; 1st place $1,000).

## How it works

`main.ts` (Node 22, standard library only) reads `input/snapshot.json`, scores every pre-token protocol with the model in `lib/model.ts`, and writes:

- `board.json` — 200 ranked rows (the 40-protocol watchlist plus 160 early pre-token protocols below the floor), each with an implied value and a farm plan.
- `data.js` — the same board, compact, for the dashboard.
- `dashboard/` — a static page (no network) that renders the board, a detail view and a filter.
- `screenshots/` — the board, a protocol's detail view and a filtered view.
- `dossier.json` — the summary the judge reads, written by `vendor/makefun-board.ts`.

## The model (radar-2)

Implied value follows only from the snapshot's own figures:

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

The **category multiple** is calibrated per category from the snapshot's own live-token protocols: the median market-cap / TVL of the category's live protocols, shrunk toward the global median (0.21) by sample size and clamped to [0.05, 1.00]. A category with fewer than 3 live protocols takes the global median. A token's market value per dollar of TVL is not one number — in this snapshot lending protocols trade near 0.15 of TVL while bridges trade near 0.40 — so a flat multiple would overvalue the first and undervalue the second. The calibration is recomputed from the snapshot on every run; no protocol name is special-cased.

Growth is the seven-day TVL change, clamped and weighted. Maturity rises with age: a protocol that has run longer with no token has a longer record behind it. An unknown age uses 365 days.

## The dashboard

A dark, readable page: the watchlist and the board at a glance, a top-5 spotlight, search plus category and chain filters, sortable columns, a detail view for every protocol (model breakdown, farm plan, protocol facts), the live-token protocols set aside with their market caps, and the full methodology including the calibration table. The page recomputes each row from the snapshot figures and checks it against the number `board.json` carries, so the screenshots and the code agree.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22.18 or later. No install, no network: the program reads the sealed snapshot and writes `out/`. It is deterministic — two runs write the same bytes.

## Data

Snapshot: DefiLlama `https://api.llama.fi/protocols`, fetched 2026-11-14. 758 protocols, 40 on the watchlist (TVL at or above $50,000,000, no token on record, not a wrapped/staked/bridged product). The board covers all 40 plus 160 early pre-token protocols below the floor. Implied value is the entry's own claim from the snapshot's figures, never one make.fun makes; it does not predict whether or when a token is issued.

## License

MIT. See [LICENSE](LICENSE).
