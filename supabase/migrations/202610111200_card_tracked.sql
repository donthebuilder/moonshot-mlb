-- THE CARD'S FLOORS: "TRACKED, NOT ON THE CARD" (2026-10-11, Donovan: "yes we want to track them but returns too").
--
-- A Card straight now needs a stored price of +120 or longer (goals excepted), a yards pick needs a 100+ line (passing 300+), and a Two-Man needs
-- its two prices multiplied to +500 or longer (lib/card/rules.js is the one config). A pick the pre-floor rule would have made that falls short
-- of a floor, or that has no stored price at all, is NOT dropped: it is stored here, graded by the same grader as the Card, and its units are
-- computed per ONE unit staked (a win = price/100 at plus money or 100/|price| at minus, a loss = -1).
--
-- A separate table, not a flag on card_calls: it can never reach the Card's rows, posts or record, and card_calls' own keys/triggers are untouched.
-- Same guards as card_calls (the code holds them too; the trigger is the backstop):
--   * INSERT is refused at or after start_at (the database clock). locked_at is stamped by the database.
--   * the lock columns never change after the insert; the result is written ONCE; nothing is graded before the start; a row is never deleted.
--   * a rule change is a new model_version / rule id with new rows; old rows are left as they were.
-- RLS: on. Nobody reads it with the public key until a row is GRADED (a tracked pick is not published before its game); the site reads it with
-- the service role. NBA is hidden like the other tables.
--
-- Nothing else reads or writes this table. The site degrades silently while it does not exist (the Card is unaffected).
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Idempotent: safe to run twice.

create table if not exists public.card_tracked (
  id            bigint      generated always as identity primary key,
  sport         text        not null check (sport in ('mlb','nfl','nhl')),
  card_date     date        not null,
  slate_key     text        not null,
  product       text        not null check (product in ('straight','two_man')),
  slot          integer     not null check (slot between 1 and 3),
  market        text,                                       -- the straight's market (anytime, rec_yds ...); null for a two-man
  model_version text        not null,
  rule          text        not null,                       -- tracked-straight-v1 / tracked-two-man-v1 (lib/card/rules.js TRACKED_RULE)
  stake         numeric     not null check (stake > 0),     -- 1: the return is per ONE unit staked
  legs          jsonb       not null,                       -- as card_calls: the frozen leg(s), with the stored price and line when there was one
  leg_count     integer     not null check (leg_count in (1,2)),
  reason_code   text        not null check (reason_code in ('line','no_price','price')),
  reason        text        not null check (char_length(reason) <= 300),
  start_at      timestamptz not null,
  locks_at      timestamptz not null,
  window_games  integer,
  locked_at     timestamptz not null default now(),
  result        text        check (result in ('hit','miss','void','push')),
  leg_results   jsonb,
  graded_at     timestamptz,
  unique (sport, card_date, product, slot, model_version),
  check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) = leg_count),
  check ((product = 'straight' and leg_count = 1) or (product = 'two_man' and leg_count = 2 and slot = 1)),
  check (locks_at <= start_at),
  check ((result is null) = (graded_at is null))
);
create index if not exists card_tracked_card_idx on public.card_tracked (sport, card_date, product, slot);
create index if not exists card_tracked_open_idx on public.card_tracked (sport, start_at) where result is null;

create or replace function public.card_tracked_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'card_tracked: % % starts at % -- nothing is stored at or after the start', new.sport, new.card_date, new.start_at;
    end if;
    if new.result is not null or new.leg_results is not null or new.graded_at is not null then
      raise exception 'card_tracked: a tracked row is inserted ungraded';
    end if;
    new.locked_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'card_tracked: a tracked row is never deleted';
  end if;

  -- UPDATE: the lock columns are fixed, the result is written once
  if (new.sport, new.card_date, new.slate_key, new.product, new.slot, new.market, new.model_version, new.rule, new.stake,
      new.legs, new.leg_count, new.reason_code, new.reason, new.start_at, new.locks_at, new.locked_at)
     is distinct from
     (old.sport, old.card_date, old.slate_key, old.product, old.slot, old.market, old.model_version, old.rule, old.stake,
      old.legs, old.leg_count, old.reason_code, old.reason, old.start_at, old.locks_at, old.locked_at) then
    raise exception 'card_tracked: a tracked row is never rewritten (new rule = new model_version)';
  end if;
  if old.result is not null then
    raise exception 'card_tracked: a graded tracked row is never regraded';
  end if;
  if new.result is not null and now() < old.start_at then
    raise exception 'card_tracked: nothing is graded before the start';
  end if;
  return new;
end $$;

drop trigger if exists card_tracked_guard on public.card_tracked;
create trigger card_tracked_guard before insert or update or delete on public.card_tracked
  for each row execute function public.card_tracked_guard();

alter table public.card_tracked enable row level security;
drop policy if exists card_tracked_read on public.card_tracked;
create policy card_tracked_read on public.card_tracked for select to anon, authenticated
  using (sport <> 'nba' and result is not null);
revoke all on table public.card_tracked from anon, authenticated;
grant select on table public.card_tracked to anon, authenticated;
grant all on table public.card_tracked to service_role;

-- PROBES (run after, each as its own run):
--   select relname, relrowsecurity as rls from pg_class where relname = 'card_tracked';                     -- expect 1 row, rls = true
--   select count(*) from public.card_tracked;                                                               -- expect 0 (table exists)
--   insert into public.card_tracked (sport, card_date, slate_key, product, slot, model_version, rule, stake, legs, leg_count, reason_code, reason, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'straight', 1, 'probe', 'probe', 1, '[{"player_id":"x"}]', 1, 'price', 'probe', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect ERROR (start in the past)
