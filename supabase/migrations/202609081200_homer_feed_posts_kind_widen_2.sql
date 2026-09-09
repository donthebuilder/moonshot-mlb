-- Widen homer_feed_posts_kind_check for the three new automated posts
-- (2026-09-08, Donovan: "wire those up for automated tweets ... add them to
-- the notifications for the discords that is link to called hr or homers").
--
-- Same constraint, same silent-no-op failure mode documented in
-- 202609070400_homer_feed_posts_kind_widen.sql: claimSlot()'s upsert only
-- ever reads back `data`, and a kind not in this list makes every claim
-- attempt for it fail postgres 23514 forever, invisibly, until this runs.
-- THIS MUST RUN BEFORE app/api/dash/homers/tick/route.js's new 'birthday',
-- 'backtoback' and 'funfacts' kinds ship, or those three posts will look
-- like they're working (the tick returns 200, no error in the response) and
-- never actually post anything -- exactly what happened to pairswatch,
-- longshot, numerology, monthly and weekly for their first several days.
alter table public.homer_feed_posts drop constraint if exists homer_feed_posts_kind_check;
alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check
  check (kind in (
    'pregame', 'recap', 'weekly', 'monthly', 'pairswatch', 'longshot', 'numerology',
    'hotcontact', 'dangercombos', 'hrleadersdow', 'hotcontact_mid', 'dangercombos_mid',
    'birthday', 'backtoback', 'funfacts'
  ));
