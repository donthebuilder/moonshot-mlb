-- THE CARD: FREE VIEW AT THE DATABASE (2026-10-10, Donovan: the free site and logged-in users do not show the plays until members access ships).
-- The site reads card_calls with the service role (RLS does not apply), and lib/card/freeView.js decides what the page shows. This closes the other
-- door: anyone holding the public anon key could still select every bot straight and Two-Man straight from the table before its game.
-- After this the anon / authenticated roles read: a bot row only once graded, the Long Shot of the day (it is posted free), and the Inside Line
-- (the admin's own pair) from its lock on. The lead straight, free on the posts and the site, is served by the route, not by this policy.
-- Safe to run before or after the code ships: the code never relies on anon reads of this table.
drop policy if exists card_calls_read on public.card_calls;
create policy card_calls_read on public.card_calls for select to anon, authenticated
  using (sport <> 'nba' and ((lane = 'bot' and (result is not null or product = 'long_shot')) or (lane = 'donovan' and now() >= locks_at)));

-- PROBE (run after; each should return the stated rows):
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.card_calls'::regclass and polname = 'card_calls_read';
--     -- expect: ... (lane = 'bot'::text) AND ((result IS NOT NULL) OR (product = 'long_shot'::text)) ... (lane = 'donovan'::text) AND (now() >= locks_at)
--   set role anon; select count(*) from public.card_calls where lane = 'bot' and result is null and product in ('straight','two_man');   -- expect 0
--   reset role;
