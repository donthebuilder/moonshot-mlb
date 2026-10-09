-- discord_sends: one row per Discord hook attempt (2026-10-09, Discord audit logging proposal).
--
-- Written best-effort by lib/dash/discordSends.js from postToDiscord. Stores the env
-- KEY NAME (e.g. DISCORD_MLB_WEBHOOKS), the hook's position in the list, the post
-- kind, sport and HTTP status. NEVER a URL, id or token.
-- RLS on with NO policies: only service_role (which bypasses RLS) can read or write.
-- The site works with or without this table (the insert degrades silently).
--
-- Donovan runs this in the Supabase SQL editor, then the PROBE at the bottom. Idempotent.

create table if not exists public.discord_sends (
  id           bigint generated always as identity primary key,
  sent_at      timestamptz not null default now(),
  kind         text,
  sport        text,
  channel_key  text,          -- env key NAME, never the URL
  hook_index   int,
  ok           boolean not null,
  http_status  int,
  error        text
);
alter table public.discord_sends enable row level security;
revoke all on public.discord_sends from anon, authenticated;
create index if not exists discord_sends_sent_at_idx on public.discord_sends (sent_at desc);

-- ---------------------------------------------------------------------------
-- PROBE. Expected: table exists, rls_on = true, zero policies, anon cannot read.
select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'discord_sends') as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'discord_sends';
-- Anon must be refused (expect "permission denied for table discord_sends"):
--   set role anon; select count(*) from public.discord_sends;   then, separately:  reset role;
-- After the first live night:
--   select channel_key, ok, http_status, count(*) from public.discord_sends
--    where sent_at > now() - interval '1 day' group by 1,2,3 order by 1;
