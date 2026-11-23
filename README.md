# btc-race-24h-20261123-0511 — Dip-Buy cbBTC Bot

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/spy26/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/spy26/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain bars from the Orca Whirlpool, with $1,000 of paper money.

## Strategy

Dip-buy, full size, with three exits:

- **Buy** all cash when the latest close is at least **110 bps below the
  highest close of the last 60 bars**. Minute-to-minute noise is ~8 bps, so
  a 110 bps pullback is a real dip, not noise.
- **Sell** everything at **+300 bps above the entry close** (take-profit).
- **Stop-loss** at **−150 bps below the entry close** — and then the bot
  stands down for the rest of the window. A stop means the dip kept falling;
  re-buying the same falling market only compounds the loss (verified in the
  sweep: stop-loss with re-entry lost up to −$83 on a falling window, vs
  −$21 with one strike and done).
- **Time-stop** after **270 bars held**: recycle the capital into the next
  dip instead of sitting through a flat drift.

No trade is ever forced: if no 110 bps dip appears, the bot holds cash.
All decisions are integer (BigInt) math on bar closes only — no clock, no
randomness, no network — so two runs on the same data produce identical
orders.

## Dev-window result (grade-local, kit harness)

- **Net PnL +$32.81** (return +3.28%), 4 trades, max drawdown 0.95%,
  fees $1.64 — dev gate passed (>$0), guardrails met.
- Deterministic: two independent `grade-local` runs gave identical
  `action_log_sha256 190f9428cb3c5f098f6bd0e766dbb11d7599c18d56ee2a2227ad3aeeeb9e0cfa`.
- Cross-window robustness (same parameters, Python simulator): +$32.81 on
  this dev window, +$10.26 on the 17 Nov window (flat, +49 bps), −$21.34 on
  the 15 Nov window (falling, −400 bps) — worst case capped by the
  one-strike stop-loss, vs −$44.01 for buy-and-hold on that falling window.

## Files

- `main.ts` — the bot (Node 22, TypeScript, standard library only)
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's bars-replay/v1
  SDK shim
- `LICENSE` — MIT
