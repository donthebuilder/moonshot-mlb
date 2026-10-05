-- BATCH-GAME-WRITEUP (2026-10-04). Two things the write-ups need before the
-- code that uses them ships:
--
-- 1. homer_feed_posts may hold one row per game write-up, kind
--    'writeup_<sport>_<game id>' (claimSlot's once-only key; x_post_id 'dry'
--    while WRITEUPS_AUTOPOST is off). The kind whitelist is APPENDED to, not
--    retyped: the live definition is read and the write-up pattern OR'd onto
--    it, so no kind added by an earlier widen (or one run by hand) can be lost.
--    Idempotent: a second run sees 'writeup_' already there and does nothing.
-- 2. the write-ups' switch, in the fact engine's dash_flags table (created here
--    too if that part of the 10-03 queue never ran). Off: dry runs only.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  if position('writeup_' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind ~ ''^writeup_(mlb|nfl|nhl)_[0-9]+$'')';
  end if;
end $$;

create table if not exists public.dash_flags (
  key         text        primary key,
  value       text        not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.dash_flags enable row level security;
-- Off until the TNF dry run (Thu 10-08) is read and clean.
insert into public.dash_flags (key, value, updated_by) values ('writeups_autopost', 'off', '202610050000_writeups.sql')
  on conflict (key) do nothing;

-- PROBES (run after):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect the old list ... OR (kind ~ '^writeup_(mlb|nfl|nhl)_[0-9]+$'::text)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'writeup_nfl_0', '{}');   -- expect OK
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind = 'writeup_nfl_0';                -- expect DELETE 1
--   select key, value from public.dash_flags where key in ('writeups_autopost', 'facts_autopost');           -- expect writeups_autopost = off
