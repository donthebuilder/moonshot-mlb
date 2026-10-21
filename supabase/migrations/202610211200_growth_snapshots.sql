-- GROWTH (2026-10-21, lib/growth/snapshot.js): one row a week for /admin. week = that week's Monday (Phoenix); data = the snapshot (followers, views,
-- engagement, profile clicks, every post type's 14 days, accounts, push devices, members, Discord). Service role only (RLS on, no policies). Idempotent.
-- Run in the Supabase SQL editor, then the PROBE. Until it runs, the weekly read logs 'read-failed' and /admin says no snapshot yet.
create table if not exists public.growth_snapshots (
  week      date primary key,
  taken_at  timestamptz not null default now(),
  data      jsonb not null
);
alter table public.growth_snapshots enable row level security;

-- PROBE:
--   select to_regclass('public.growth_snapshots') is not null as has_growth_snapshots;   -- true
