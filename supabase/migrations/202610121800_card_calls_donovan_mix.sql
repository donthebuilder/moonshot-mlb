-- HIS LANE: ANY MIX OF UP TO 3 ENTRIES A DAY PER SPORT (2026-10-12, Donovan: "give me 3 post max, ranging from straight to 6man").
--
-- Until now his lane (lane 'donovan', and its LATE twin 'donovan_late') could hold only a Two-Man, an N-man in slot 1 and the Double. This lets it also hold:
--   * STRAIGHTS     product 'straight', leg_count 1, slot 1..3  (a separate lane from the bot's straights, so the key (sport, card_date, lane, product, slot, model_version)
--                   can never meet a bot row; the bot's straights stay slots 1..3 under lane 'bot')
--   * N-MEN         product 'n_man', leg_count 2..6, slot 1..3  (was slot 1 only)
-- Two-Man and Double are unchanged (slot 1). Nothing here caps the number of entries a day: the cap of 3 POSTS a day and sport is enforced in code at save and at post
-- time (lib/card/post.js DON_MAX_POSTS); a 4th entry is saved and shown on the site and is not posted.
--
-- WHAT IT CHANGES (and nothing else; no row is touched):
--   1. card_calls_lane_ck    lane 'bot' (any product but n_man) OR a donovan lane with product in (straight, two_man, double, n_man)
--   2. card_calls_shape_ck   adds slot 1..3 for n_man (straight already allowed any slot 1..3 by the column's own check)
--   3. card_calls_guard()    copied from 202610121200_card_calls_nman.sql; the one change: a LOCK AT SAVE (saved after the card's lock but before the start) covers
--                            product 'straight' as it covers 'two_man' and 'n_man'. LATE rules (15-minute typo window, never public) and every other rule are unchanged.
-- The public read policy already reads lane 'donovan' from its lock for any product; the LATE lane is still never readable with the public key.
--
-- Each constraint is found by NAME and left alone when its comment says it is already the widened one (the comment is the marker, so a second run changes nothing);
-- no 'set role'; the widened checks are strictly weaker than the old ones, so every existing row satisfies them (no NOT VALID needed).
-- Until this is run the code degrades safely: saving a straight or a 2nd N-man answers "run the update" and stores NOTHING; his Two-Man and his first N-man behave as today.
-- RUN IT BEFORE THE CODE THAT NEEDS IT. Idempotent: safe to run twice.

do $$
declare c record;
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_lane_ck')
     or coalesce((select obj_description(oid, 'pg_constraint') from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_lane_ck'), '') <> 'donovan-mix-v1' then
    alter table public.card_calls drop constraint if exists card_calls_lane_ck;
    alter table public.card_calls add constraint card_calls_lane_ck check (
         (lane = 'bot' and product <> 'n_man')
      or (lane <> 'bot' and product in ('straight','two_man','double','n_man')));
    comment on constraint card_calls_lane_ck on public.card_calls is 'donovan-mix-v1';
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_shape_ck')
     or coalesce((select obj_description(oid, 'pg_constraint') from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_shape_ck'), '') <> 'donovan-mix-v1' then
    alter table public.card_calls drop constraint if exists card_calls_shape_ck;
    alter table public.card_calls add constraint card_calls_shape_ck check (
         (product = 'straight'  and leg_count = 1)
      or (product = 'two_man'   and leg_count = 2 and slot = 1)
      or (product = 'double'    and leg_count = 2 and slot = 1)
      or (product = 'long_shot' and leg_count = 1 and slot = 1)
      or (product = 'n_man'     and leg_count between 2 and 6 and slot between 1 and 3));
    comment on constraint card_calls_shape_ck on public.card_calls is 'donovan-mix-v1';
  end if;
end $$;

-- 3. the guard trigger (copied from 202610121200_card_calls_nman.sql; the one change is marked (product in ('two_man', 'n_man', 'straight')))
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
      -- LOCK AT SAVE: his Two-Man, his N-men and his straights saved after the card's lock but BEFORE the start (the check above already refused any start in the past) are
      -- verified and lock at this very moment (locks_at = now(), never earlier, never after the start). His Double keeps the old refusal.
      if new.product in ('two_man', 'n_man', 'straight') then
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

-- PROBES (run after, each as its own run; they use a far-future day and are rolled back by the BEGIN / ROLLBACK, nothing is left behind):
--   select conname, obj_description(oid, 'pg_constraint') from pg_constraint where conrelid = 'public.card_calls'::regclass and conname in ('card_calls_lane_ck','card_calls_shape_ck');
--     -- expect both rows, comment donovan-mix-v1
--   begin;
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, note, start_at, locks_at)
--     values ('mlb', '2099-01-01', '2099-01-01', 'donovan', 'straight', 2, 'probe', 'probe', 1, '[{"player_id":"a"}]', 1, 'probe', '2099-01-01T20:00:00Z', '2099-01-01T19:00:00Z');   -- expect INSERT 0 1
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, note, start_at, locks_at)
--     values ('mlb', '2099-01-01', '2099-01-01', 'donovan', 'n_man', 3, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"}]', 2, 'probe', '2099-01-01T20:00:00Z', '2099-01-01T19:00:00Z');   -- expect INSERT 0 1 (a 2-leg N-man in slot 3)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '2099-01-01', '2099-01-01', 'bot', 'n_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"a"},{"player_id":"b"}]', 2, '2099-01-01T20:00:00Z', '2099-01-01T19:00:00Z');   -- expect ERROR (card_calls_lane_ck: the bot never has an n_man)
--   rollback;
--   (a 4th slot, slot 4, is refused by the column's own check; 7 legs by the shape check; both unchanged)
