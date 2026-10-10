-- BUCKETS stays invisible to the public key until it opens (2026-10-09).
--
-- Two public-read policies let basketball rows through the anon key:
--   * top_totals_calls_read   using (true)   -> NBA calls readable by anyone
--   * homer_feed_posts_read_public           -> writeup_nba_* write-ups and nba_* posts readable by anyone
-- Now: NBA rows in top_totals_calls are not readable by anon/authenticated, and the feed's public read also
-- leaves out every basketball kind (writeup_nba_<id> and the nba_ prefixed kinds), the same way the members
-- kinds are left out. MLB / NFL / NHL rows are untouched. service_role bypasses RLS: the ticks, /admin and the
-- site's own /api/totals (service key first, behind the BUCKETS gate for NBA) keep working.
--
-- WHEN BUCKETS GOES PUBLIC (run in the SQL editor):
--   drop policy top_totals_calls_read on public.top_totals_calls;
--   create policy top_totals_calls_read on public.top_totals_calls for select to anon, authenticated using (true);
--   and re-run 202610091200_homer_feed_members_rls.sql (restores the members-only exclusion for the feed).
--
-- Idempotent. PROBES at the bottom.

alter table public.top_totals_calls enable row level security;
drop policy if exists top_totals_calls_read on public.top_totals_calls;
create policy top_totals_calls_read on public.top_totals_calls
  for select to anon, authenticated
  using (sport <> 'nba');

alter table public.homer_feed_posts enable row level security;
drop policy if exists homer_feed_posts_read_public on public.homer_feed_posts;
create policy homer_feed_posts_read_public on public.homer_feed_posts
  for select to anon, authenticated
  using (
    kind not like '%\_members\_%'
    and kind not like 'writeup\_nba\_%'
    and kind not like 'nba\_%'
  );

-- PROBES (run after, each as its own run):
--   select policyname, roles, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('top_totals_calls','homer_feed_posts');
--   begin; set local role anon;
--     select (select count(*) from public.top_totals_calls where sport = 'nba') as nba_calls_readable,                                  -- must be 0
--            (select count(*) from public.homer_feed_posts where kind like 'writeup\_nba\_%' or kind like 'nba\_%') as nba_feed_readable,  -- must be 0
--            (select count(*) from public.homer_feed_posts where kind not like '%\_members\_%' and kind not like 'writeup\_nba\_%' and kind not like 'nba\_%') as public_feed_readable;  -- must be > 0
--   rollback;
