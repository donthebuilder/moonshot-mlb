-- homer_feed.reply_post_id -- the board-neighbours reply's own X id.
--
-- 2026-09-19, Donovan: "only one of the WHERE HE SAT AMONG TONIGHT'S HRR CALLS
-- or whatever did the reply to the homerun." Three of tonight's homers carried
-- a real role and should have replied; one did.
--
-- THE REAL DEFECT IS THAT NOBODY CAN TELL WHY. The reply was fire-and-forget:
-- posted inline at the end of each homer's own loop iteration, with no record
-- kept and no retry. So a reply lost to a deploy that had not finished, a
-- reply lost to an X rate limit, and a reply lost to the tick hitting Vercel's
-- 60-second ceiling mid-iteration all look identical from the outside --
-- nothing, silently.
--
-- One nullable column fixes all three:
--   null           never attempted, or attempted and failed -> next tick retries
--   an X post id   done, and queryable
--
-- It also moves the reply OUT of the alert's own iteration and into its own
-- pass (see app/api/dash/homers/tick/route.js), so a reply can never again eat
-- the seconds the next homer's ALERT needs. The alert is the product; the
-- reply is the context.
alter table public.homer_feed add column if not exists reply_post_id text;

-- Every homer that already posted before this column existed is marked
-- 'skipped' rather than left null: null now means "still owed a reply," and
-- backfilling replies onto last night's homers would be posting context under
-- alerts nobody is reading any more.
update public.homer_feed set reply_post_id = 'skipped'
  where reply_post_id is null and x_post_id is not null;
