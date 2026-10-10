-- THE CARD AND THE TWO-MAN (2026-10-10, Donovan: "3 straights, 1 two-man, frozen at lock; graded both-or-nothing").
--
-- One table, public.card_calls, holds every product of a Card, one row each:
--   lane 'bot'      product 'straight'  slot 1..3  one leg, flat 1 unit      the top three CALLED players by score
--   lane 'bot'      product 'two_man'   slot 1     two legs, flat 0.5 unit   the two highest-scored CALLED players from DIFFERENT games
--   lane 'donovan'  product 'two_man'   slot 1     two legs + a short note   Donovan's own two-man (his lane, his record, never the bot's)
-- A row is one card (sport, card_date): NHL / MLB one per night, NFL one per game window (the game day).
-- The selection is a FIXED RULE (lib/card/core.js); nobody edits the list after the lock.
--
-- GUARDS IN THE DATABASE (lib/card/store.js holds them too; the trigger is the backstop):
--   * INSERT is refused at or after start_at (the earliest leg's start), by the database clock. locked_at is stamped by the database.
--   * a bot row is inserted at the lock and never changes but for its result (written ONCE: result, leg_results, graded_at).
--   * Donovan's row may be inserted and changed only BEFORE locks_at (and before start_at); after that it is frozen like the bot's.
--   * a graded row is never regraded; nothing is graded before its start; a locked row is never deleted.
--   * a new model is a new model_version, with new rows.
-- RLS: anyone may read a bot row; Donovan's row is readable only from locks_at on (his pre-lock entry is not public); NBA is hidden
-- (BUCKETS) like the other tables. Only the service role writes.
-- Also appends the card post kinds to homer_feed_posts_kind_check (card_<sport> = the X pregame post, card_result_<sport> = the free
-- result, card_members_<sport> = the #members card; the '_members_' kinds are already left out of the public read by 202610091200).
--
-- RUN THIS BEFORE THE CODE THAT NEEDS IT SHIPS. Idempotent: safe to run twice.

create table if not exists public.card_calls (
  id            bigint      generated always as identity primary key,
  sport         text        not null check (sport in ('mlb','nfl','nhl','nba')),
  card_date     date        not null,                     -- the game's own date (NFL: the day of the game window)
  slate_key     text        not null,                     -- the night (YYYY-MM-DD) or the football week (YYYY-wNN)
  lane          text        not null check (lane in ('bot','donovan')),
  product       text        not null check (product in ('straight','two_man')),
  slot          integer     not null check (slot between 1 and 3),
  model_version text        not null,
  rule          text        not null,                     -- the id of the fixed selection rule (lib/card/core.js CARD_RULE)
  stake         numeric     not null check (stake > 0),   -- flat units: 1 for a straight, 0.5 for a two-man
  legs          jsonb       not null,                     -- [{ player_id, name, team, opp, game_id, game_date, start_at, score, rate, ... }]
  leg_count     integer     not null check (leg_count in (1,2)),
  note          text        check (note is null or char_length(note) <= 600),   -- Donovan's lane only
  start_at      timestamptz not null,                     -- the earliest leg's start
  locks_at      timestamptz not null,                     -- the scheduled lock moment (an hour before the card's first game)
  locked_at     timestamptz not null default now(),
  result        text        check (result in ('hit','miss','void')),
  leg_results   jsonb,
  graded_at     timestamptz,
  unique (sport, card_date, lane, product, slot, model_version),
  check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) = leg_count),
  check ((product = 'straight' and leg_count = 1) or (product = 'two_man' and leg_count = 2 and slot = 1)),
  check (lane = 'bot' or product = 'two_man'),
  check (note is null or lane = 'donovan'),
  check (locks_at <= start_at),
  check ((result is null) = (graded_at is null))
);
create index if not exists card_calls_card_idx on public.card_calls (sport, card_date, lane, product, slot);
create index if not exists card_calls_open_idx on public.card_calls (sport, start_at) where result is null;

create or replace function public.card_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if now() >= new.start_at then
      raise exception 'card_calls: % % starts at % -- nothing is locked at or after the start', new.sport, new.card_date, new.start_at;
    end if;
    if new.lane = 'donovan' and now() >= new.locks_at then
      raise exception 'card_calls: the lock for % % was at % -- Donovan''s entry is closed', new.sport, new.card_date, new.locks_at;
    end if;
    if new.result is not null or new.leg_results is not null or new.graded_at is not null then
      raise exception 'card_calls: a card row is inserted ungraded';
    end if;
    new.locked_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.lane = 'donovan' and old.result is null and now() < old.locks_at and now() < old.start_at then
      return old;        -- his own entry may be withdrawn while it is still open
    end if;
    raise exception 'card_calls: a locked card row is never deleted';
  end if;

  -- UPDATE
  if old.lane = 'donovan' and old.result is null and now() < old.locks_at and now() < old.start_at then
    -- his entry is still open: players, times and note may change; the key never does, and it cannot be graded yet
    if (new.sport, new.card_date, new.lane, new.product, new.slot, new.model_version, new.stake)
       is distinct from (old.sport, old.card_date, old.lane, old.product, old.slot, old.model_version, old.stake) then
      raise exception 'card_calls: the key of a card row is never rewritten';
    end if;
    if now() >= new.start_at then
      raise exception 'card_calls: % % starts at % -- nothing is saved at or after the start', new.sport, new.card_date, new.start_at;
    end if;
    if new.result is not null or new.leg_results is not null or new.graded_at is not null then
      raise exception 'card_calls: a card row is not graded before its lock';
    end if;
    new.locked_at := now();
    return new;
  end if;

  -- locked: the lock columns are fixed, the result is written once
  if (new.sport, new.card_date, new.slate_key, new.lane, new.product, new.slot, new.model_version, new.rule, new.stake,
      new.legs, new.leg_count, new.note, new.start_at, new.locks_at, new.locked_at)
     is distinct from
     (old.sport, old.card_date, old.slate_key, old.lane, old.product, old.slot, old.model_version, old.rule, old.stake,
      old.legs, old.leg_count, old.note, old.start_at, old.locks_at, old.locked_at) then
    raise exception 'card_calls: a locked card is never rewritten (new model = new model_version)';
  end if;
  if old.result is not null then
    raise exception 'card_calls: a graded card row is never regraded';
  end if;
  if new.result is not null and now() < old.start_at then
    raise exception 'card_calls: nothing is graded before the start';
  end if;
  return new;
end $$;

drop trigger if exists card_calls_guard on public.card_calls;
create trigger card_calls_guard before insert or update or delete on public.card_calls
  for each row execute function public.card_calls_guard();

alter table public.card_calls enable row level security;
drop policy if exists card_calls_read on public.card_calls;
create policy card_calls_read on public.card_calls for select to anon, authenticated
  using (sport <> 'nba' and (lane = 'bot' or now() >= locks_at));

-- the post kinds: card_<sport> (X, before the first game), card_result_<sport> (free, after the grade), card_members_<sport> (#members only)
do $$
declare d text; k text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  foreach k in array array[
    'card_mlb','card_nfl','card_nhl',
    'card_result_mlb','card_result_nfl','card_result_nhl',
    'card_members_mlb','card_members_nfl','card_members_nhl'
  ] loop
    if position(('''' || k || '''') in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or kind = ' || quote_literal(k) || ')';
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
    end if;
  end loop;
end $$;

-- PROBES (run after, one at a time; each as its own run). They use Donovan's lane because only his open entry may be deleted:
--   select count(*) from public.card_calls;                                                   -- expect 0 (table exists)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect ... OR (kind = 'card_nhl'::text) ... OR (kind = 'card_members_nhl'::text)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan', 'two_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect ERROR (start in the past)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '2999-01-01', '2999-01-01', 'donovan', 'two_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, '2999-01-01T00:00:00Z', '2998-12-31T23:00:00Z');   -- expect INSERT 0 1
--   update public.card_calls set note = 'edited before the lock' where model_version = 'probe';                      -- expect UPDATE 1 (his entry is open)
--   update public.card_calls set stake = 2 where model_version = 'probe';                                            -- expect ERROR (the key of a card row is never rewritten)
--   update public.card_calls set result = 'hit', graded_at = now() where model_version = 'probe';                    -- expect ERROR (not graded before its lock)
--   delete from public.card_calls where model_version = 'probe';                                                     -- expect DELETE 1 (an open entry may be withdrawn)
