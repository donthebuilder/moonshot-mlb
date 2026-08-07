#!/usr/bin/env python3
"""fetch_nflverse.py — pull the NFL lab's raw data from nflverse releases.

Release tags + URL pattern verified live 2026-08-08 against
https://github.com/nflverse/nflverse-data/releases (stats_player,
schedules, weekly_rosters, players, teams, stats_team all present and
auto-updating). Column names inside the CSVs are NOT yet verified — this
script prints each file's header row on download so they can be checked
against bots/nfl_markets.py before anything is scored. Same rule as the
MLB side: verify fields in the live payload before building on them.

Usage:
    python bots/fetch_nflverse.py --season 2025          # backtest season
    python bots/fetch_nflverse.py --season 2026          # live season
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    raise SystemExit(1)

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def pull(tag: str, filename: str, dest_name: str | None = None) -> Path | None:
    url = f"{BASE}/{tag}/{filename}"
    dest = DATA / (dest_name or filename)
    DATA.mkdir(parents=True, exist_ok=True)
    try:
        r = requests.get(url, timeout=120, allow_redirects=True)
    except Exception as exc:
        print(f"  ✗ {filename}: {exc}", file=sys.stderr)
        return None
    if r.status_code != 200 or not r.content:
        print(f"  ✗ {filename}: HTTP {r.status_code}", file=sys.stderr)
        return None
    dest.write_bytes(r.content)
    header = r.content.split(b"\n", 1)[0].decode("utf-8", "replace")
    print(f"  ✓ {dest.name} ({len(r.content) / 1e6:.1f} MB)")
    print(f"    header: {header[:400]}")
    return dest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--season", type=int, required=True)
    args = ap.parse_args()
    y = args.season

    print(f"nflverse pull — season {y}")
    ok = 0
    # Per-season player summary stats. Tag verified; reg/post naming per the
    # release's own asset list (post confirmed; reg is the sibling — if the
    # reg file 404s, the printed error IS the verification failing, stop.)
    ok += pull("stats_player", f"stats_player_reg_{y}.csv") is not None
    ok += pull("stats_player", f"stats_player_post_{y}.csv") is not None
    # Schedules: one file, all seasons — filter by season column downstream.
    ok += pull("schedules", "games.csv") is not None
    # Weekly rosters for the season (who's actually on a roster that week).
    ok += pull("weekly_rosters", f"roster_weekly_{y}.csv") is not None
    # ID/position mapping + team meta.
    ok += pull("players", "players.csv") is not None
    ok += pull("teams", "teams_colors_logos.csv") is not None
    # Team-level summary (opponent defense rates come from here).
    ok += pull("stats_team", f"stats_team_reg_{y}.csv") is not None

    print(f"\n{ok}/7 files landed in {DATA}")
    print("NEXT: check every printed header against bots/nfl_markets.py "
          "COLS aliases before scoring anything.")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
