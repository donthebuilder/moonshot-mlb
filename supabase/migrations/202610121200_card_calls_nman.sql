-- DONOVAN'S N-MAN: A 3-TO-6-MAN TICKET OF HIS OWN (2026-10-12, Donovan: "i want to be able to do up a 6 man with a card too").
--
-- A new product on the same table, public.card_calls:
--   lane 'donovan' | 'donovan_late'   product 'n_man'   slot 1   leg_count 2..6   stake 0.5 by default (his form may set 0.25 to 1)   all legs must land
-- It is the Two-Man's bigger sibling and follows the Two-Man's rules in every way (supabase/migrations/202610121100_card_calls_late.sql):
--   * ON TIME (before the card's lock and before any leg's game starts): the verified entry, in lane 'donovan', frozen at the lock, public from the lock;
--   * AFTER THE LOCK but before any leg's game starts: still verified, and it LOCKS AT SAVE (locks_at := now()), then it is frozen like every locked row;
--   * once a leg's game has started: the LATE lane ('donovan_late'), never the record, never posted, never public (the restrictive read policy already holds it);
--   * a locked row is never rewritten, regraded or deleted; its result is written once. The bot never has an n_man row (the lane check below says so).
-- Graded ALL-OR-NOTHING by the app (lib/card/core.js productResult): every leg hit = hit; any leg void (did not play) = void, the stake comes back; else miss.
--
-- WHAT THIS CHANGES (and nothing else):
--   1. card_calls_product_ck   product may be 'n_man'
--   2. card_calls_shape_ck     + (product = 'n_man' and leg_count between 2 and 6 and slot = 1)   (the straight / two_man / double / long_shot shapes are unchanged)
--   3. card_calls_lane_ck      an n_man row is never the bot's; the bot's other products and his two_man / double are exactly as before
--   4. card_calls_guard()      the same function as 202610121100_card_calls_late.sql with ONE change: LOCK AT SAVE applies to product 'n_man' as well as 'two_man'
-- The check `jsonb_array_length(legs) = leg_count`, the unique key (sport, card_date, lane, product, slot, model_version), the read policies and the post kinds
-- (his N-man posts through the same card_don_<sport> kinds) are untouched. Rows already in the table are never changed.
-- RUN BEFORE THE CODE THAT NEEDS IT. Until it is run the app refuses an n_man save with a clear message and stores nothing; his 2-leg Two-Man works as always.
-- Idempotent: safe to run twice. No role switching.

-- 1-3. the three constraints, replaced by name only when they do not mention n_man yet
do $$
declare d text;
begin
  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_product_ck';
  if d is not null and d not like '%n_man%' then
    alter table public.card_calls drop constraint card_calls_product_ck;
    d := null;
  end if;
  if d is null then
    alter table public.card_calls add constraint card_calls_product_ck check (product in ('straight','two_man','double','long_shot','n_man'));
  end if;

  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_shape_ck';
  if d is not null and d not like '%n_man%' then
    alter table public.card_calls drop constraint card_calls_shape_ck;
    d := null;
  end if;
  if d is null then
    alter table public.card_calls add constraint card_calls_shape_ck check (
         (product = 'straight'  and leg_count = 1)
      or (product = 'two_man'   and leg_count = 2 and slot = 1)
      or (product = 'double'    and leg_count = 2 and slot = 1)
      or (product = 'long_shot' and leg_count = 1 and slot = 1)
      or (product = 'n_man'     and leg_count between 2 and 6 and slot = 1));
  end if;

  select pg_get_constraintdef(oid) into d from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_lane_ck';
  if d is not null and d not like '%n_man%' then
    alter table public.card_calls drop constraint card_calls_lane_ck;
    d := null;
  end if;
  if d is null then
    alter table public.card_calls add constraint card_calls_lane_ck check (
         (lane = 'bot' and product <> 'n_man')
      or (lane <> 'bot' and product in ('two_man','double','n_man')));
  end if;
end $$;

-- 4. the guard trigger: copied from 202610121100_card_calls_late.sql; the one change is marked (product in ('two_man', 'n_man'))
create or replace function public.card_calls_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- LATE: allowed at any time, ungraded; locked_at = the real save time
    if new.lane = 'donovan_late' then
      if new.result is not null or new.leg_results is not null or new.graded_at is not null then
        raise exception 'card_calls: a card row is inserted ungraded';
      end if;
      new.locked_at := now();
      return new;
    end if;
    if now() >= new.start_at then
      raise exception 'card_calls: % % starts at % -- nothing is locked at or after the start', new.sport, new.card_date, new.start_at;
    end if;
    if new.lane = 'donovan' and now() >= new.locks_at then
      -- LOCK AT SAVE: his Two-Man and his N-man saved after the card's lock but BEFORE the start (the check above already refused any start in the past) are
      -- verified and lock at this very moment (locks_at = now(), never earlier, never after the start). His Double keeps the old refusal.
      if new.product in ('two_man', 'n_man') then
        new.locks_at := now();
      else
        raise exception 'card_calls: the lock for % % was at % -- Donovan''s entry is closed', new.sport, new.card_date, new.locks_at;
      end if;
    end if;
    if new.result is not null or new.leg_results is not null or new.graded_at is not null then
      raise exception 'card_calls: a card row is inserted ungraded';
    end if;
    new.locked_at := now();
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- LATE: withdrawn only inside the 15-minute typo window and only while ungraded
    if old.lane = 'donovan_late' and old.result is null and now() < old.locked_at + interval '15 minutes' then
      return old;
    end if;
    if old.lane = 'donovan' and old.result is null and now() < old.locks_at and now() < old.start_at then
      return old;        -- his own entry may be withdrawn while it is still open
    end if;
    raise exception 'card_calls: a locked card row is never deleted';
  end if;

  -- UPDATE
  -- LATE: inside the typo window, ungraded, players / note / times may change (the key and locked_at never do)
  if old.lane = 'donovan_late' and old.result is null and now() < old.locked_at + interval '15 minutes'
     and new.result is null and new.leg_results is null and new.graded_at is null then
    if (new.sport, new.card_date, new.lane, new.product, new.slot, new.model_version, new.stake)
       is distinct from (old.sport, old.card_date, old.lane, old.product, old.slot, old.model_version, old.stake) then
      raise exception 'card_calls: the key of a card row is never rewritten';
    end if;
    new.locked_at := old.locked_at;
    return new;
  end if;

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
      new.legs, new.leg_count, new.note, new.start_at, new.locks_at, new.locked_at, new.market, new.window_games)
     is distinct from
     (old.sport, old.card_date, old.slate_key, old.lane, old.product, old.slot, old.model_version, old.rule, old.stake,
      old.legs, old.leg_count, old.note, old.start_at, old.locks_at, old.locked_at, old.market, old.window_games) then
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

-- PROBES (run after, each as its own run):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.card_calls'::regclass and conname in ('card_calls_product_ck','card_calls_shape_ck','card_calls_lane_ck') order by conname;
--     -- expect three rows; each definition mentions 'n_man'
--   select position('product in (''two_man'', ''n_man'')' in pg_get_functiondef('public.card_calls_guard'::regproc)) > 0 as n_man_lock_at_save_installed;   -- expect true
--   select position('LOCK AT SAVE' in pg_get_functiondef('public.card_calls_guard'::regproc)) > 0 as lock_at_save_still_installed;                      -- expect true
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, note, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan_late', 'n_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"},{"player_id":"c"},{"player_id":"d"},{"player_id":"e"},{"player_id":"f"}]', 6, 'probe', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect INSERT 0 1 (a six-man in the late lane)
--   delete from public.card_calls where model_version = 'probe' and lane = 'donovan_late' and product = 'n_man';                                          -- expect DELETE 1 (inside the 15-minute typo window)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'bot', 'n_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"},{"player_id":"c"}]', 3, '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z');   -- expect ERROR (card_calls_lane_ck: the bot never has an n_man)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan', 'n_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"},{"player_id":"c"},{"player_id":"d"},{"player_id":"e"},{"player_id":"f"},{"player_id":"g"}]', 7, '2099-01-01T00:00:00Z', '2099-01-01T00:00:00Z');   -- expect ERROR (card_calls_shape_ck: seven legs)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan', 'n_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"},{"player_id":"c"}]', 3, '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect ERROR (the verified lane still refuses a past start)
--   select count(*) from public.card_calls where model_version = 'probe';   -- expect 0 (the probes leave nothing behind)
