-- BUCKETS GOES PUBLIC (2026-10-20, Donovan: "open the nba side"; BUCKETS_PUBLIC=on in Vercel Production 04:10Z).
-- Undoes 202610092000_buckets_hidden_rls.sql exactly as its own header says: NBA rows in top_totals_calls are readable
-- by anyone again, and the homer feed's public read is back to "everything but members kinds"
-- (202610091200_homer_feed_members_rls.sql). service_role bypasses RLS as before. Idempotent.
-- If BUCKETS is ever closed again, re-run 202610092000_buckets_hidden_rls.sql.

alter table public.top_totals_calls enable row level security;
drop policy if exists top_totals_calls_read on public.top_totals_calls;
create policy top_totals_calls_read on public.top_totals_calls
  for select to anon, authenticated
  using (true);

alter table public.homer_feed_posts enable row level security;
drop policy if exists homer_feed_posts_read_all on public.homer_feed_posts;
drop policy if exists homer_feed_posts_read_public on public.homer_feed_posts;
create policy homer_feed_posts_read_public on public.homer_feed_posts
  for select to anon, authenticated
  using (kind not like '%\_members\_%');

-- PROBES (each as its own run):
--   select policyname, roles, cmd, qual from pg_policies where schemaname = 'public' and tablename in ('top_totals_calls','homer_feed_posts');
--     expect top_totals_calls_read qual = true; homer_feed_posts_read_public qual = (kind !~~ '%\_members\_%'::text)
--   begin; set local role anon;
--     select (select count(*) from public.homer_feed_posts where kind like '%\_members\_%') as members_readable;   -- must be 0
--   rollback;
