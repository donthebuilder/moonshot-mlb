# lamp-pts-v1 / lamp-ast-v1 — SHADOW points and assists boards (definition)

Written 2026-10-01 (LAMP v2 markets 2 and 3 of 3, after lamp-sog-v1). The
code (`lib/nhl/ptsModel.js`, `lib/nhl/astModel.js`) is this document and
nothing more. A change to any line below is a new `model_version`; rows
already written keep theirs.

**SHADOW:** both are written to the record and graded, and **nothing on the
site shows them** — not in `lib/nhl/boardRead.js` `BOARD_MARKETS`, so
`/api/lamp/board?market=PTS` is refused. They exist to be measured. No claim
of accuracy is made.

| | lamp-pts-v1 | lamp-ast-v1 |
|---|---|---|
| **TARGET** | 1+ points (boxscore `points`) | 1+ assists (boxscore `assists`) |
| **POPULATION** | The goal board's candidates exactly (same lineup and split-squad rules, goalies never scored). | same |
| **LEG 1** | `ptsPg` — points/GP over the last ~82 NHL games, pooled from this and last season's club-stats lines with lamp-goal-v1's `pooledLegs()` weight. | `astPg` — assists/GP, same pooling. |
| **LEG 2** | `toi` — average ice time (lamp-goal-v1's rule: this season at 5+ GP, else last). More minutes = more time on the ice when his team scores. | same; kept as its own leg because defencemen earn assists on minutes, not shots. |
| **LEG 3** | `oppGaPg` — the opponent's goals against per game (`standings/now`, already on every candidate's `context`). A point needs his team to score. Shared by teammates, so it only moves one side of a game against the other. Null early in a season (0 GP) → the leg drops out of the mean. | same |
| **Not used** | Power-play points: the club-stats feed carries PP *goals* only, and no new call is added for one leg. | same (no PP assists) |
| **MIN GAMES** | 10 pooled games; fewer = NOT ON THE BOARD, reason printed. | same |
| **SCORE** | Mean of the present legs' percentile ranks in the NIGHT's scored pool, 0-100. | same |
| **RANK** | Within the game by score; ties by `ptsPg`, then name. | ties by `astPg` |
| **CALLED** | Top 3 per game; ON THE BOARD 4th+; NOT ON THE BOARD unscored. | same |
| **LOCK** | `app/api/lamp/tick`, same snapshot and `locked_at` as the goal board; clock re-read before each write, nothing at or after puck drop. `lamp_prop_log`, market `PTS`. | market `AST` |
| **GRADE** | Same step as SOG, off the same boxscore: `value` = points, `hit` = value >= 1, not dressed = VOID. Scoring columns never touched. | `value` = assists |
| **PRICE** | `odds_lines` stat `pts` (over 0.5) at lock — join for ROI later. | stat `ast` |

No migration: `lamp_prop_log`'s market check already allows `PTS` and `AST`
(`202609280100_lamp_prop_log.sql`). Offline checks:
`node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-pts-ast.mjs`.

**Evaluate** after ~2 weeks of regular-season nights (no tuning before ~30):
called hit rate vs the dressed base rate, by market:

```sql
select market, model_version,
  count(*) filter (where dressed)                                   as dressed,
  round(avg(hit::int) filter (where dressed), 3)                    as base_rate,
  count(*) filter (where status = 'called' and dressed)             as called_n,
  round(avg(hit::int) filter (where status = 'called' and dressed), 3) as called_rate,
  round(avg(hit::int) filter (where rank_in_game between 4 and 8 and dressed), 3) as r4_8_rate,
  round(avg(hit::int) filter (where status = 'board' and rank_in_game > 8 and dressed), 3) as r9plus_rate
from lamp_prop_log
where market in ('PTS', 'AST') and game_type = 2 and graded_at is not null
group by 1, 2;
```
