// btc-race-24h-20261123-0511 — dip-buy bot for cbBTC (CBBTC/USDC, 1-minute bars).
//
// Strategy (all integer math, no floats, no clock, no randomness):
//   * BUY full cash when the latest close is at least 110 bps below the highest
//     close of the last 60 bars (a shallow dip in a market whose minute-to-minute
//     noise is ~8 bps, so 110 bps is a real pullback, not noise).
//   * SELL everything at +300 bps above the entry close (take-profit), or at
//     -150 bps below it (one stop-loss, then the bot stands down for the rest
//     of the window: a stop means the dip kept falling, and re-buying the same
//     falling market only compounds the loss), or after 270 bars held
//     (time-stop: recycle the capital into the next dip instead of sitting
//     through a flat drift).
//   * No trade is ever forced: if no dip of 110 bps appears, the bot holds cash.
//   * max_slippage_bps 500 on every order: fills land ~10 bps from the decision
//     close (2 bps modelled slippage + ~7 bps pool impact on a full-size buy),
//     so 500 bps only rejects pathological one-minute gaps.
//
// The entry reference price is the close of the bar the buy was decided on
// (the fill itself lands at the next bar's open, ~1 minute later).

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10000n;

// Strategy constants (basis points / bars).
const LOOKBACK = 60; // bars whose closes define the recent high
const DIP_BPS = 110n; // buy when close is this far below the recent high
const TAKE_PROFIT_BPS = 300n; // sell when close is this far above the entry close
const STOP_LOSS_BPS = 150n; // sell when close is this far below the entry close
const TIME_STOP_BARS = 270; // sell after holding this many bars
const MAX_SLIPPAGE_BPS = 500; // reject a fill more than 5% from the decision close

// Bot state, carried across batches. Everything derives from the bar closes,
// so two runs on the same data produce the same orders.
const closes: bigint[] = [];
let entryClose: bigint | null = null;
let barsHeld = 0;
let stoppedOut = false;

function recentHigh(): bigint {
  let high = 0n;
  // Clamp the window start so a short closes history never indexes below 0.
  const start = Math.max(0, closes.length - LOOKBACK);
  for (let i = start; i < closes.length; i++) {
    if (closes[i]! > high) high = closes[i]!;
  }
  return high;
}

function belowByBps(price: bigint, ref: bigint, bps: bigint): boolean {
  // True when price is at least `bps` basis points below ref.
  return (ref - price) * BPS >= bps * ref;
}

function aboveByBps(price: bigint, ref: bigint, bps: bigint): boolean {
  // True when price is at least `bps` basis points above ref.
  return (price - ref) * BPS >= bps * ref;
}

await runBars({
  onBatch(state: BarsState, _batch: Batch): OrderInput[] {
    if (state.warmingUp) return [];
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    closes.push(close);

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    if (qty > 0n) {
      barsHeld += 1;
      const entry = entryClose ?? close;
      const takeProfit = aboveByBps(close, entry, TAKE_PROFIT_BPS);
      const stopped = belowByBps(close, entry, STOP_LOSS_BPS);
      const timedOut = barsHeld >= TIME_STOP_BARS;
      if (takeProfit || stopped || timedOut) {
        if (stopped) stoppedOut = true;
        entryClose = null;
        barsHeld = 0;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: only buy on a dip, and never again after the one stop-loss.
    if (stoppedOut) return [];
    if (closes.length < LOOKBACK) return [];
    if (state.cash <= 0n) return [];
    const high = recentHigh();
    if (belowByBps(close, high, DIP_BPS)) {
      entryClose = close;
      barsHeld = 0;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
