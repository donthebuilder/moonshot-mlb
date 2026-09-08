-- Widen homer_feed_posts_kind_check for six more automated posts
-- (2026-09-08, Donovan: "buiidl them becasue i want them" -- the remaining
-- six of the eleven manual daily tweets, minus Revenge Game Watch, which has
-- no real data source behind it yet -- see claude/ project docs).
--
-- Same constraint, same silent-no-op failure mode as
-- 202609070400_homer_feed_posts_kind_widen.sql and
-- 202609081200_homer_feed_posts_kind_widen_2.sql. THIS MUST RUN BEFORE the
-- new kinds below ship, or every claim attempt for them fails Postgres 23514
-- forever, silently.
alter table public.homer_feed_posts drop constraint if exists homer_feed_posts_kind_check;
alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check
  check (kind in (
    'pregame', 'recap', 'weekly', 'monthly', 'pairswatch', 'longshot', 'numerology',
    'hotcontact', 'dangercombos', 'hrleadersdow', 'hotcontact_mid', 'dangercombos_mid',
    'birthday', 'backtoback', 'funfacts',
    'thefour', 'bestair', 'storylines', 'callofnight', 'matchuplines', 'streaks'
  ));
