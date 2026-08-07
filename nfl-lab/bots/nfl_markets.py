#!/usr/bin/env python3
"""nfl_markets.py — the seven markets, their bars, and outcome extraction.

Scope locked 2026-08-07: TDs, receiving yards, receptions, rushing yards,
rushing attempts, passing yards, kicking points. NO defensive props.

COLUMN ALIASES ARE PROVISIONAL until fetch_nflverse.py has printed real
headers (sandbox couldn't download the CSVs — the names below follow the
nflfastR/nflreadr data dictionary, with fallbacks where naming has
historically drifted, e.g. rushing attempts appearing as `carries`).
resolve() fails LOUDLY on a missing stat rather than scoring a zero —
a market that can't see its column must not grade.
"""
from __future__ import annotations

# stat key -> ordered column-name candidates (first match in the CSV wins)
COLS = {
    "rush_td":    ["rushing_tds", "rush_touchdowns", "rushing_touchdowns"],
    "rec_td":     ["receiving_tds", "rec_touchdowns", "receiving_touchdowns"],
    "rec_yards":  ["receiving_yards", "rec_yards"],
    "receptions": ["receptions", "rec"],
    "rush_yards": ["rushing_yards", "rush_yards"],
    "rush_att":   ["carries", "rushing_attempts", "rush_attempts", "attempts"],
    "pass_yards": ["passing_yards", "pass_yards"],
    "fg_made":    ["fg_made", "field_goals_made"],
    "pat_made":   ["pat_made", "extra_points_made", "xp_made"],
}


def resolve(header: list[str]) -> dict:
    """Map stat keys to the actual CSV columns; raise on anything missing."""
    out, missing = {}, []
    for key, cands in COLS.items():
        hit = next((c for c in cands if c in header), None)
        if hit is None:
            missing.append(f"{key} (tried {', '.join(cands)})")
        else:
            out[key] = hit
    if missing:
        raise KeyError(
            "nfl_markets: columns missing from the CSV — verify before scoring:\n  "
            + "\n  ".join(missing)
        )
    return out


def g(row, cols, key) -> float:
    try:
        return float(row.get(cols[key]) or 0)
    except (TypeError, ValueError):
        return 0.0


# Market definitions. `lines` are the site's selectable thresholds; `bar` is
# the default one a pick grades against (mirrors the MLB category-bar idea:
# every pick graded on ITS OWN outcome, stated upfront).
MARKETS = {
    "TD": {
        "label": "Anytime TD",
        "lines": [1],
        "bar": 1,
        "value": lambda r, c: g(r, c, "rush_td") + g(r, c, "rec_td"),
    },
    "REC_YDS": {
        "label": "Receiving yards",
        "lines": [25, 40, 60],
        "bar": 40,
        "value": lambda r, c: g(r, c, "rec_yards"),
    },
    "REC": {
        "label": "Receptions",
        "lines": [3, 5, 7],
        "bar": 4,
        "value": lambda r, c: g(r, c, "receptions"),
    },
    "RUSH_YDS": {
        "label": "Rushing yards",
        "lines": [40, 60, 80],
        "bar": 50,
        "value": lambda r, c: g(r, c, "rush_yards"),
    },
    "RUSH_ATT": {
        "label": "Rushing attempts",
        "lines": [10, 15],
        "bar": 12,
        "value": lambda r, c: g(r, c, "rush_att"),
    },
    "PASS_YDS": {
        "label": "Passing yards",
        "lines": [200, 250, 300],
        "bar": 225,
        "value": lambda r, c: g(r, c, "pass_yards"),
    },
    "KICK_PTS": {
        "label": "Kicking points",
        "lines": [6, 9],
        "bar": 6,
        "value": lambda r, c: g(r, c, "fg_made") * 3 + g(r, c, "pat_made"),
    },
}


def grade(market: str, row: dict, cols: dict, line: float | None = None) -> bool:
    m = MARKETS[market]
    return m["value"](row, cols) >= (line if line is not None else m["bar"])
