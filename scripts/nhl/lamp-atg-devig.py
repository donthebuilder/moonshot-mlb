#!/usr/bin/env python3
"""
LAMP — NHL ATG Devig Tool
DASH Network · scripts/nhl/lamp-atg-devig.py

Run from the moonshot-push root:
    python3 scripts/nhl/lamp-atg-devig.py [--min-ev 0.05] [--output results.json]

What it does:
  1. Pulls tonight's NHL ATG props from SGO (/v2/events, leagueID=NHL)
  2. Uses SGO's pre-computed fairOdds as the no-vig line (no Pinnacle key needed)
  3. Computes EV at each available book vs that fair line
  4. Fetches Kalshi KXNHLGOAL order book depth to flag "trusted" sharp money
  5. Ranks and outputs flagged picks + full JSON

Price rule: NHL ATG is exempt from the card price floor (lib/card/rules.js).
Flagged = EV >= 5% at best available book. Kalshi trusted = $500+ each side.

Reads SGO_API_KEY from env or .env.local in the working directory.
"""

import argparse
import json
import os
import re
import requests
from datetime import date, timezone, datetime

# ── Config ─────────────────────────────────────────────────────────────────────
SGO_BASE               = "https://api.sportsgameodds.com/v2"
KALSHI_BASE            = "https://api.elections.kalshi.com/trade-api/v2"
KALSHI_SERIES          = "KXNHLGOAL"
KALSHI_DEPTH_THRESHOLD = 500    # $ each side to mark depth as "trusted"
EV_MIN                 = 0.05   # default 5% minimum EV to flag green
ATG_KEY_PREFIX         = "firstToScore-"
ATG_KEY_SUFFIX_YES     = "-game-yn-yes"
ATG_KEY_SUFFIX_NO      = "-game-yn-no"
SHARP_BOOKS            = ["pinnacle", "circa"]


# ── Helpers ────────────────────────────────────────────────────────────────────
def load_key() -> str:
    key = os.environ.get("SGO_API_KEY", "")
    if not key:
        for candidate in [".env.local", ".env"]:
            if os.path.exists(candidate):
                with open(candidate) as f:
                    for line in f:
                        if line.strip().startswith("SGO_API_KEY="):
                            key = line.strip()[len("SGO_API_KEY="):].strip().strip('"').strip("'")
                            break
            if key:
                break
    if not key:
        raise RuntimeError(
            "SGO_API_KEY not found.\n"
            "Set it in your environment or in .env.local in the moonshot-push directory."
        )
    return key


def to_prob(american_str: str) -> float:
    a = int(american_str)
    if a > 0:
        return 100 / (a + 100)
    return abs(a) / (abs(a) + 100)


def ev(fair_p: float, american_str: str) -> float:
    """Expected value as a decimal (0.08 = 8%)."""
    a = int(american_str)
    payout = a / 100 if a >= 0 else 100 / abs(a)
    return fair_p * payout - (1 - fair_p)


def fmt(american_str: str) -> str:
    a = int(american_str)
    return f"+{a}" if a >= 0 else str(a)


def player_name_from_id(player_id: str) -> str:
    """DYLAN_LARKIN_1_NHL -> Dylan Larkin"""
    s = re.sub(r'_\d+_NHL$', '', player_id)
    return s.replace('_', ' ').title()


def kalshi_date_str() -> str:
    """Returns e.g. '26OCT22' — Kalshi uses UTC date in tickers."""
    now_utc = datetime.now(timezone.utc)
    return now_utc.strftime("%y%b%d").upper()


# ── SGO ────────────────────────────────────────────────────────────────────────
def fetch_sgo_atg(api_key: str, target_date: str) -> list:
    """
    Fetch all NHL ATG yes/no markets for target_date from SGO.
    Returns list of processed player rows.
    """
    headers = {"x-api-key": api_key}
    r = requests.get(
        f"{SGO_BASE}/events",
        headers=headers,
        params={"leagueID": "NHL", "date": target_date, "oddsAvailable": "true"},
        timeout=20,
    )
    r.raise_for_status()
    events = r.json().get("data", [])

    rows = []
    for event in events:
        teams  = event.get("teams", {})
        home   = teams.get("home", {}).get("names", {}).get("short", "?")
        away   = teams.get("away", {}).get("names", {}).get("short", "?")
        game   = f"{away}@{home}"
        odds   = event.get("odds", {})

        yes_keys = [k for k in odds
                    if k.startswith(ATG_KEY_PREFIX) and k.endswith(ATG_KEY_SUFFIX_YES)]

        for yes_key in yes_keys:
            yes_odd  = odds.get(yes_key, {})

            if yes_odd.get("ended"):
                continue
            if not yes_odd.get("bookOddsAvailable") and not yes_odd.get("fairOddsAvailable"):
                continue

            sgo_fair = yes_odd.get("fairOdds")
            if not sgo_fair:
                continue

            fair_p    = to_prob(sgo_fair)
            player_id = yes_odd.get("playerID", "")
            player    = player_name_from_id(player_id)

            by_book = yes_odd.get("byBookmaker", {})
            book_prices = {}
            for book, bdata in by_book.items():
                if bdata.get("available") is False:
                    continue
                price = bdata.get("odds")
                if price:
                    book_prices[book.lower()] = price

            if not book_prices:
                continue

            best_ev_val  = None
            best_book    = None
            best_price   = None
            ev_by_book   = {}

            for book, price in book_prices.items():
                try:
                    e = ev(fair_p, price)
                    ev_by_book[book] = round(e * 100, 2)
                    if best_ev_val is None or e > best_ev_val:
                        best_ev_val = e
                        best_book   = book
                        best_price  = price
                except Exception:
                    pass

            # Sharp book cross-check
            sharp_prices = {b: book_prices[b] for b in SHARP_BOOKS if b in book_prices}
            sharp_note   = ""
            if sharp_prices:
                sharp_probs = [to_prob(p) for p in sharp_prices.values()]
                avg_sharp   = sum(sharp_probs) / len(sharp_probs)
                spread      = abs(avg_sharp - fair_p) * 100
                if spread < 1.5:
                    sharp_note = "sharp-agree"
                elif spread < 3:
                    sharp_note = "slight-gap"
                else:
                    sharp_note = f"gap-{spread:.1f}pct"

            rows.append({
                "game":          game,
                "player":        player,
                "player_id":     player_id,
                "fair_pct":      round(fair_p * 100, 1),
                "sgo_fair_odds": sgo_fair,
                "book_prices":   book_prices,
                "ev_by_book":    ev_by_book,
                "best_ev_pct":   round(best_ev_val * 100, 1) if best_ev_val is not None else None,
                "best_book":     best_book,
                "best_price":    best_price,
                "sharp_note":    sharp_note,
                "kalshi_ticker":   None,
                "kalshi_yes_vol":  0.0,
                "kalshi_no_vol":   0.0,
                "kalshi_trusted":  False,
                "kalshi_implied":  None,
            })

    return rows


# ── Kalshi ─────────────────────────────────────────────────────────────────────
def fetch_kalshi_markets() -> list:
    """Fetch all open KXNHLGOAL 1-goal (ATG) markets for today."""
    try:
        r = requests.get(
            f"{KALSHI_BASE}/markets",
            params={"series_ticker": KALSHI_SERIES, "status": "open", "limit": 200},
            timeout=15,
        )
        r.raise_for_status()
        markets = r.json().get("markets", [])
        date_slug = kalshi_date_str()
        return [m for m in markets
                if date_slug in m.get("ticker", "") and m.get("ticker", "").endswith("-1")]
    except Exception as e:
        print(f"  [Kalshi] Market fetch failed: {e}")
        return []


def fetch_kalshi_depth(ticker: str) -> dict:
    """Fetch orderbook_fp depth for a single Kalshi market."""
    try:
        r = requests.get(
            f"{KALSHI_BASE}/markets/{ticker}/orderbook",
            timeout=10,
        )
        r.raise_for_status()
        book        = r.json().get("orderbook_fp", {})
        yes_entries = book.get("yes_dollars", [])
        no_entries  = book.get("no_dollars",  [])
        yes_vol     = sum(float(e[1]) for e in yes_entries if len(e) >= 2)
        no_vol      = sum(float(e[1]) for e in no_entries  if len(e) >= 2)
        yes_prices  = [float(e[0]) for e in yes_entries if len(e) >= 2]
        best_yes    = max(yes_prices) if yes_prices else None
        return {
            "yes_volume":     round(yes_vol, 2),
            "no_volume":      round(no_vol, 2),
            "trusted":        yes_vol >= KALSHI_DEPTH_THRESHOLD and no_vol >= KALSHI_DEPTH_THRESHOLD,
            "kalshi_implied": round(best_yes * 100, 1) if best_yes else None,
        }
    except Exception:
        return {"yes_volume": 0, "no_volume": 0, "trusted": False, "kalshi_implied": None}


def match_kalshi(player_id: str, kalshi_markets: list) -> dict:
    """Match a SGO player_id to a Kalshi market by last name."""
    parts = player_id.replace("_NHL", "").replace("_1", "").split("_")
    last  = parts[-1].upper() if parts else ""
    for m in kalshi_markets:
        if last in m.get("ticker", "").upper():
            return m
    return None


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="LAMP NHL ATG Devig — DASH Network")
    parser.add_argument("--min-ev", type=float, default=EV_MIN)
    parser.add_argument("--output", default="lamp_atg_results.json")
    parser.add_argument("--date",   default=str(date.today()))
    args = parser.parse_args()

    print("=" * 65)
    print("LAMP — NHL ATG Devig  ·  DASH Network")
    print(f"Date: {args.date}  |  Min EV: {int(args.min_ev * 100)}%")
    print("=" * 65)

    api_key = load_key()
    print("✓ SGO key loaded")

    print("\nFetching SGO NHL ATG props...")
    rows = fetch_sgo_atg(api_key, args.date)
    print(f"  {len(rows)} players with available ATG lines")

    if not rows:
        print("\nNo ATG props found. Lines may not be up yet.")
        return

    print("\nFetching Kalshi order book depth...")
    kalshi_markets = fetch_kalshi_markets()
    print(f"  {len(kalshi_markets)} Kalshi ATG (1-goal) markets found")

    kalshi_depth_cache = {}
    for mkt in kalshi_markets:
        ticker = mkt["ticker"]
        kalshi_depth_cache[ticker] = fetch_kalshi_depth(ticker)

    trusted_count = sum(1 for d in kalshi_depth_cache.values() if d["trusted"])
    print(f"  Trusted (${KALSHI_DEPTH_THRESHOLD}+ each side): {trusted_count} markets")

    for row in rows:
        mkt = match_kalshi(row["player_id"], kalshi_markets)
        if mkt:
            ticker = mkt["ticker"]
            depth  = kalshi_depth_cache.get(ticker, {})
            row["kalshi_ticker"]  = ticker
            row["kalshi_yes_vol"] = depth.get("yes_volume", 0)
            row["kalshi_no_vol"]  = depth.get("no_volume", 0)
            row["kalshi_trusted"] = depth.get("trusted", False)
            row["kalshi_implied"] = depth.get("kalshi_implied")

    rows.sort(key=lambda r: r["best_ev_pct"] or -999, reverse=True)
    flagged = [r for r in rows if (r["best_ev_pct"] or 0) >= args.min_ev * 100]

    print()
    print(f"{'PLAYER':<24} {'GAME':<10} {'FAIR':>5} {'EV':>7} {'BOOK':<12} {'PRICE':>7} {'KALSHI':>10} {'SHARP'}")
    print("─" * 92)

    def print_row(r, flag=False):
        marker     = "🟢" if flag else "  "
        kalshi_str = ("✓ TRUSTED" if r["kalshi_trusted"]
                      else f"${r['kalshi_yes_vol']:.0f}" if r["kalshi_yes_vol"] > 0
                      else "—")
        ev_str     = f"{r['best_ev_pct']:+.1f}%" if r["best_ev_pct"] is not None else "n/a"
        print(
            f"{marker} {r['player']:<22} {r['game']:<10} {r['fair_pct']:>4.1f}%"
            f" {ev_str:>7} {(r['best_book'] or ''):12} {fmt(r['best_price']) if r['best_price'] else '':>7}"
            f" {kalshi_str:>10}  {r['sharp_note']}"
        )
        prices_line = "  " + " · ".join(
            f"{b}: {fmt(p)}" for b, p in sorted(r["book_prices"].items())
        )
        print(prices_line)
        print()

    if flagged:
        print(f"\n🟢 FLAGGED — +EV ≥ {int(args.min_ev * 100)}%  ({len(flagged)} picks)\n")
        for r in flagged:
            print_row(r, flag=True)

    rest = [r for r in rows if r not in flagged]
    if rest:
        print(f"📋 BELOW THRESHOLD ({len(rest)} players)\n")
        for r in rest:
            print_row(r)

    print("─" * 92)
    print(f"\nFlagged: {len(flagged)}  |  Tracked: {len(rows)}  |  Kalshi trusted: {trusted_count}")

    payload = {
        "date":    args.date,
        "min_ev":  args.min_ev,
        "flagged": len(flagged),
        "tracked": len(rows),
        "results": rows,
    }
    with open(args.output, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Results → {args.output}\n")


if __name__ == "__main__":
    main()
