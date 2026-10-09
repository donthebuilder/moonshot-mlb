-- 2026-10-09 -- notifications pass: say WHY a push failed.
-- dash_push_log.outcome = 'failed' carried no reason, so 404/410 (expired device),
-- 413 (too big), 401/403 (keys) and 429/5xx could not be told apart. The tick now writes
-- the push service's status and one-word reason here. Safe to deploy the code first: until
-- this runs, the insert falls back to the old columns.
alter table public.dash_push_log add column if not exists detail text;
