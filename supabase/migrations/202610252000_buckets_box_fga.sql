-- BUCKETS' SHOT ATTEMPTS IN THE BOX (2026-10-25, Donovan via Doink's Hit Rater: "filter ... by their shot attempts"). buckets_box kept
-- points / makes but not attempts, so Trending could not ask "only his 15+ FGA games". FGA and 3PA come from the same ESPN box the
-- tick already reads (lib/nba/api reduceBox); this adds the two columns. RUN BEFORE the code that writes them ships (lib/nba/defPos
-- boxRows), then backfill 2025-26: node scripts/backfill-nba-box.mjs (re-reads the ESPN summaries; the upsert fills fga / tpa).
-- Additive and idempotent: two nullable columns. RLS unchanged (service role only).
-- PROBE: select count(*) filter (where fga is not null) with_fga, count(*) from public.buckets_box where season = 2026;
alter table public.buckets_box add column if not exists fga smallint;
alter table public.buckets_box add column if not exists tpa smallint;
