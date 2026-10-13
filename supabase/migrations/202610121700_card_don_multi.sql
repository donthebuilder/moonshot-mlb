-- HIS LANE: UP TO 3 POSTS A DAY PER SPORT (2026-10-12, Donovan: "give me 3 post max, ranging from straight to 6man").
--
-- homer_feed_posts is keyed (day, kind) and kind is checked, so every one of his entries needs its own claim row. The kind CARRIES the entry, the way the moment
-- kinds carry their event:
--   card_don_<sport>_<key>     sport = mlb | nfl | nhl;   key = two_man | n_man | straight_<slot>   (lowercase letters, digits and underscores)
-- The old one-a-day kinds (card_don_mlb / card_don_nfl / card_don_nhl, from 202610121100_card_calls_late.sql) stay exactly as they are.
-- Until this is run the code keeps today's behaviour: one post a day and sport under the old kind, the extra entries skipped with a log line
-- ("card_don_<sport>_<key> skipped: the kind is not allowed yet (run supabase/migrations/202610121700_card_don_multi.sql)"), nothing sent for them.
-- The "3 a day" cap is enforced in code (lib/card/post.js DON_MAX_POSTS), not here.
--
-- Idempotent: reads the live constraint, skips the alternative if it is already in it, and adds it NOT VALID (new rows are checked, old rows are not re-scanned: a
-- stray old row made the full re-check fail with 23514 on 2026-10-10). A constraint left NOT VALID by an earlier migration is read back without the suffix before
-- it is extended. RUN IT BEFORE THE CODE THAT NEEDS IT. Safe to run twice. Touches nothing but the one check constraint.

do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  d := regexp_replace(d, ' NOT VALID$', '');
  if position('''^card_don_(mlb|nfl|nhl)_[a-z0-9_]+$''' in d) = 0 then
    execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
    execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
      || regexp_replace(d, '^CHECK ', '')
      || ') or kind ~ ''^card_don_(mlb|nfl|nhl)_[a-z0-9_]+$'') not valid';
  end if;
end $$;

-- PROBES (run after, each as its own run):
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect ... OR (kind ~ '^card_don_(mlb|nfl|nhl)_[a-z0-9_]+$'::text) ... NOT VALID   (and every earlier alternative still there)
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'card_don_nhl_two_man', '{}');    -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'card_don_nhl_n_man', '{}');      -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'card_don_nhl_straight_1', '{}');  -- expect INSERT 0 1
--   insert into public.homer_feed_posts (day, kind, payload) values ('1970-01-01', 'card_don_nba_two_man', '{}');     -- expect ERROR 23514 (BUCKETS has no entry posts)
--   delete from public.homer_feed_posts where day = '1970-01-01' and kind in ('card_don_nhl_two_man', 'card_don_nhl_n_man', 'card_don_nhl_straight_1');   -- expect DELETE 3
