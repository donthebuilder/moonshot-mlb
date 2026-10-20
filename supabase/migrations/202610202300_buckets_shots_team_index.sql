-- BUCKETS SHOTS BY CLUB (2026-10-20, found in the 10-20 3D/shot-map session: "buckets_shots has no team_id index (club reads seq-scan)").
-- /api/buckets/shots?team= and the club shot maps read buckets_shots by team_id, ordered by game_id, event_id. Without an index
-- every page of a club read scans the table. Additive, idempotent, no data change.
create index if not exists buckets_shots_team_game_event on public.buckets_shots (team_id, game_id, event_id);

-- PROBE (its own run):
--   select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'buckets_shots';   -- buckets_shots_team_game_event listed
