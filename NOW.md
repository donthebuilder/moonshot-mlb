
## BATCH-NFL-FIELD · 2026-09-30 · plan: given in chat (claude/PLAN-nfl-the-field-2026-09-30.md never reached disk)
Goal: TUDDY "The Field" in the player modal — a player's targets by exact
depth and lane over the defence he plays next, red-zone touch strip under it.
Reference: claude/proto/proto-nfl-the-field.html (real data, C.Olave vs ATL).
Two commits: (1) bots/nfl/nfl_field.py publishes per-player + per-team event
files and red-zone touches; (2) FieldChart + RedZoneField.js's strip on the
shared chart core, mounted in NflPlayerModal (+ the Players file) and the
Matchups defence detail (TEAM mode). Visual bar: must beat the prototype
side by side at 1280 and 390. Acceptance numbers are in the plan §4.
Check-in after commit 2. Do not push.
