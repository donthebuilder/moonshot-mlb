-- 2026-09-14 — notification audit follow-through.
--
-- Two small tables the push sender (app/api/dash/push/tick) can live without
-- but is better with. Both are service-role only: RLS on, no policies, exactly
-- like dash_push_seen. Neither is the user's data.
--
--   dash_push_log    what actually reached each device: one row per event per
--                    device with the outcome (sent | bundled | dropped | failed).
--                    dash_push_seen cannot say this -- it is global and pruned
--                    at two days. This is what a "recent alerts" view reads.
--   dash_board_day   tonight's published board, trimmed to ~60 rows of
--                    id/name/score/role, written once by the run that fetches
--                    the four-megabyte file before first pitch and read by
--                    every later sweep. Lets the slate homer say "#4 on
--                    tonight's board" after first pitch, and lets dropout stay
--                    quiet for a man scratched already covers.
--
-- Safe to deploy the code before running this: a missing table is logged once
-- per tick and everything else continues as before.

create table if not exists public.dash_push_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  endpoint_hash text not null,
  event_key text not null,
  category text,
  sport text,
  priority smallint,
  lane text,
  title text,
  body text,
  outcome text not null check (outcome in ('sent', 'bundled', 'dropped', 'failed')),
  at timestamptz not null default now()
);
create index if not exists dash_push_log_user_at on public.dash_push_log (user_id, at desc);
create index if not exists dash_push_log_at on public.dash_push_log (at);
alter table public.dash_push_log enable row level security;

-- Fourteen days is enough to tune a default off evidence and not enough to
-- become a second archive. Called by the cron on each run.
create or replace function public.dash_push_log_prune()
returns void language sql security definer set search_path = public as $$
  delete from public.dash_push_log where at < now() - interval '14 days';
$$;

create table if not exists public.dash_board_day (
  day text primary key,
  rows jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.dash_board_day enable row level security;
