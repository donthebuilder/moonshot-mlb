-- MOMENT POSTS (2026-10-12, Donovan: "yes post these when they happen" / "yes post season card when it's postseason"): the post kinds of the special cards.
--
-- homer_feed_posts is keyed (day, kind) and kind is checked, so every event needs its own claim row. The kind CARRIES the event, the way call_<game_pk> does:
--   moment_<sport>_<playerId>_<gameId>_<rung>        a special card for one thing that happened (sport = mlb | nfl | nhl); lowercase letters and digits between the underscores
--   moment_<sport>_<playerId>_<gameId>_<rung>_upd    the one update when an NHL goal behind that card was overturned
--   postseason_mlb_<gamePk>_<playerId>               a postseason big-night card (one per player per game)
-- plus the four bare family names (moment_mlb, moment_nfl, moment_nhl, postseason_mlb), which are the names lib/dash/xSchedule.js KIND_TAGS tags.
-- Until this is run the code skips silently: the claim is refused (Postgres 23514), the log says "kind not allowed yet (run <this file>)", and nothing is sent.
-- THE POSTS ARE ALSO OFF in code until MOMENT_POSTS_ON is turned on, so run this first, probe it, then flip the switch.
--
-- Idempotent: reads the live constraint, skips every alternative that is already in it, and adds the rest NOT VALID (new rows are checked, old rows are not
-- re-scanned: a stray old row made the full re-check fail with 23514 on 2026-10-10). A constraint left NOT VALID by an earlier migration is read back without
-- the suffix before it is extended. RUN IT BEFORE THE CODE THAT NEEDS IT. Safe to run twice.

do $$
declare d text; r record;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  d := regexp_replace(d, ' NOT VALID$', '');
  for r in
    select probe, expr from (values
      ('''moment_mlb''',  'kind = ''moment_mlb'''),
      ('''moment_nfl''',  'kind = ''moment_nfl'''),
      ('''moment_nhl''',  'kind = ''moment_nhl'''),
      ('''postseason_mlb''', 'kind = ''postseason_mlb'''),
      ('''^moment_(mlb|nfl|nhl)_[a-z0-9_]+$''', 'kind ~ ''^moment_(mlb|nfl|nhl)_[a-z0-9_]+$'''),
      ('''^postseason_mlb_[a-z0-9_]+$''', 'kind ~ ''^postseason_mlb_[a-z0-9_]+$''')
    ) as t(probe, expr)
  loop
    if position(r.probe in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or ' || r.expr || ') not valid';
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
      d := regexp_replace(d, ' NOT VALID$', '');
    end if;
  end loop;
end $$;

-- PROBES (run after, each as its own run):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect ... OR (kind = 'moment_mlb'::text) OR (kind = 'moment_nfl'::text) OR (kind = 'moment_nhl'::text) OR (kind = 'postseason_mlb'::text)
--     --        OR (kind ~ '^moment_(mlb|nfl|nhl)_[a-z0-9_]+$'::text) OR (kind ~ '^postseason_mlb_[a-z0-9_]+$'::text) ... NOT VALID
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'moment_nhl_8478402_2025020123_ht3', '{}');   -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'moment_nhl_8478402_2025020123_ht3_upd', '{}'); -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'postseason_mlb_813000_660271', '{}');           -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'moment_nba_1_2_x', '{}');                       -- expect ERROR 23514 (BUCKETS has no moment posts)
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind in ('moment_nhl_8478402_2025020123_ht3', 'moment_nhl_8478402_2025020123_ht3_upd', 'postseason_mlb_813000_660271');   -- expect DELETE 3
