-- THE CARD: MEMBERS FIRST (2026-10-12, Donovan: "members only, then after one leg cashes or is done then they can see the other").
--
-- Before this: the card_calls_read policy let anyone holding the public (anon) key read EVERY bot row the moment it was locked: the Two-Man and
-- straights #2-#3 too, straight from the Supabase REST API (the paid thing leaked past the site, X and the free Discord).
--
-- After this, for a Card (one sport, one card_date):
--   BEFORE any row of the Card has a result (hit / miss / push / void; a void is done):
--        anon + authenticated read ONLY  the LEAD straight (the free pick: highest board percentile, ties to the lower slot, then the earlier
--                                        start, then the player id: the same order as lib/card/core.js leadStraight),
--                                        the Long Shot of the day (public by design), Donovan's rows from their lock (unchanged),
--                                        the Double only once graded (unchanged).
--        The bot's Two-Man and the other straights are NOT readable with the public key. Members read them through the #members channel
--        (in-process, service role); the website reads with the service role and strips them in code (lib/card/reveal.js) until the same condition.
--   AFTER at least one row of the Card has a result: every row of that Card is readable (history / fact).
-- The condition is computed from the STORED graded results (result is not null), never from the clock.
--
-- NO TABLE, ROW OR CONSTRAINT IS CHANGED: this replaces one read policy and adds two read-only helper functions. Locked rows are untouched, so there is
-- nothing to re-check and no NOT VALID is needed. service_role (the ticks, the site's routes, /admin) bypasses RLS and keeps full access.
-- The helpers are SECURITY DEFINER (they read card_calls as its owner, so the policy does not recurse into itself), STABLE, search_path pinned,
-- and they return only a boolean / one row id, never a row. EXECUTE is granted to the two public roles because a policy expression runs as the caller.
--
-- The website works WITHOUT this migration (the route strips the held rows itself); this closes the direct-REST door.
-- RUN BEFORE OR AFTER THE CODE: either order is safe. Idempotent: safe to run twice.

create or replace function public.card_calls_revealed(p_sport text, p_card_date date)
returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.card_calls c
    where c.sport = p_sport and c.card_date = p_card_date
      and c.sport <> 'all' and c.product <> 'double'
      and c.result is not null
  );
$$;

create or replace function public.card_calls_free_id(p_sport text, p_card_date date)
returns bigint
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id from public.card_calls c
  where c.sport = p_sport and c.card_date = p_card_date and c.lane = 'bot' and c.product = 'straight'
  order by
    case when (c.legs->0->>'board_pct') ~ '^-?[0-9]+(\.[0-9]+)?$' then (c.legs->0->>'board_pct')::numeric end desc nulls last,
    c.slot asc,
    c.start_at asc,
    (c.legs->0->>'player_id') asc,
    c.id asc
  limit 1;
$$;

revoke all on function public.card_calls_revealed(text, date) from public;
revoke all on function public.card_calls_free_id(text, date) from public;
grant execute on function public.card_calls_revealed(text, date) to anon, authenticated, service_role;
grant execute on function public.card_calls_free_id(text, date) to anon, authenticated, service_role;

alter table public.card_calls enable row level security;
drop policy if exists card_calls_read on public.card_calls;
create policy card_calls_read on public.card_calls for select to anon, authenticated
  using (
    sport <> 'nba' and (
      (lane = 'donovan' and now() >= locks_at)
      or (lane = 'bot' and (
            product = 'long_shot'
            or (product = 'double' and result is not null)
            or (product in ('straight', 'two_man') and (
                  public.card_calls_revealed(sport, card_date)
                  or (product = 'straight' and id = public.card_calls_free_id(sport, card_date))
               ))
         ))
    )
  );

-- PROBES (run after, each as its own run):
--   select policyname, roles, cmd, qual from pg_policies where schemaname = 'public' and tablename = 'card_calls';   -- expect card_calls_read, qual mentions card_calls_revealed
--   select proname, prosecdef from pg_proc where proname in ('card_calls_revealed', 'card_calls_free_id');            -- expect 2 rows, prosecdef = true
--   set role anon;
--   select card_date, sport, product, slot from public.card_calls where card_date = (select max(card_date) from public.card_calls)
--     order by sport, product, slot;
--        -- on a day with NOTHING graded yet: only slot 1-or-lead straight per sport (+ long_shot rows, + Donovan's after his lock); NO bot two_man, NO other straight.
--        -- on a day with any graded row: every row of that Card.
--   reset role;
