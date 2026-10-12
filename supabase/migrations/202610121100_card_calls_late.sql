-- DONOVAN'S TWO-MAN, ALWAYS OPEN: THE LATE LANE (2026-10-12, Donovan: "i want to be able to submit mine whenever").
--
-- An entry saved AFTER its card's lock or after one of its players' games has started cannot be a pregame call, so it is stored in its OWN lane,
-- 'donovan_late', and never in 'donovan' (the verified lane). Same table, same columns, a different `lane` value:
--   * the unique key includes `lane`, so a late entry can NEVER overwrite a locked on-time entry (they are different rows);
--   * every reader that means "the Card" / "the record" reads lane 'bot' or lane 'donovan' by name, so a late row is in no count, post or ledger;
--   * the restrictive read policy below keeps anon/authenticated away from it, whichever version of card_calls_read is installed.
-- A late row can be graded (the tick grades every open row) and shown on /admin/two-man only, labelled LATE, as his own reference.
--
-- GUARD CHANGES (everything else in card_calls_guard is copied unchanged from 202610101100_card_map.sql):
--   * INSERT of a 'donovan_late' row is allowed at any time (it is the point of the lane), ungraded; locked_at is the database clock = when it was really saved.
--   * a late row can be changed or withdrawn for 15 minutes after it was saved (a typo window), and only while ungraded; after that it is frozen
--     like every other row, and its result is written once, by the grader.
--   * LOCK AT SAVE: a 'donovan' two_man insert after the card's lock but before the earliest leg's start is accepted and locks at that moment
--     (locks_at := now()); it is then frozen (the update path refuses, as for any locked row). At or after the start the insert is still refused (those go LATE).
--   * lane 'bot' and the rest of lane 'donovan' (his Double, every update, every delete) behave EXACTLY as before: nothing pregame is written at or after the start for the verified record.
-- RUN BEFORE THE CODE THAT NEEDS IT. Until it is run the app refuses a late save with a clear message (the lane check constraint rejects the row).
-- It also adds the three post kinds card_don_mlb / card_don_nfl / card_don_nhl to homer_feed_posts_kind_check (NOT VALID) for his own post.
-- Idempotent: safe to run twice. No role switching.

-- 1. the lane may be 'donovan_late': replace the two constraints that name the lanes (found by definition, not by a guessed name)
do $$
declare c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.card_calls'::regclass and contype = 'c'
       and conname not in ('card_calls_lane_name_ck', 'card_calls_note_lane_ck')
  loop
    if (c.def like '%lane = ANY%' and c.def like '%donovan%' and c.def not like '%donovan_late%')
       or (c.def like '%note IS NULL%' and c.def like '%lane%' and c.def not like '%donovan_late%') then
      execute format('alter table public.card_calls drop constraint %I', c.conname);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_lane_name_ck') then
    alter table public.card_calls add constraint card_calls_lane_name_ck check (lane in ('bot','donovan','donovan_late'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_note_lane_ck') then
    alter table public.card_calls add constraint card_calls_note_lane_ck check (note is null or lane in ('donovan','donovan_late'));
  end if;
end $$;

-- 2. the guard trigger: the same function as before plus the 'donovan_late' branches (marked LATE below)
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
      -- LOCK AT SAVE: his Two-Man saved after the card's lock but BEFORE the start (the check above already refused any start in the past) is
      -- verified and locks at this very moment (locks_at = now(), never earlier, never after the start). His Double keeps the old refusal.
      if new.product = 'two_man' then
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

-- 3. NOBODY BUT THE SERVICE ROLE READS A LATE ROW. A RESTRICTIVE policy is AND-ed with every permissive card_calls_read policy, so this holds
--    whether 202610121000 (members first) has been run or not. service_role bypasses RLS (the /admin page reads it there).
alter table public.card_calls enable row level security;
drop policy if exists card_calls_no_late on public.card_calls;
create policy card_calls_no_late on public.card_calls as restrictive for select to anon, authenticated
  using (lane <> 'donovan_late');

-- 4. HIS OWN POST KINDS (card_don_<sport>): his verified Two-Man gets its own once-a-day post, claimed independently of the card post (lib/card/post.js
--    postDonovan), so an entry saved after the card post went out still posts. Appended to homer_feed_posts_kind_check the way 202610101100 did it:
--    NOT VALID, so only new rows are checked and a stray old row cannot fail the re-check (23514 on 2026-10-10). A constraint left NOT VALID by that
--    migration is read back without the suffix before it is extended. Idempotent: a kind already in the check is skipped.
do $$
declare d text; k text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  d := regexp_replace(d, ' NOT VALID$', '');
  foreach k in array array['card_don_mlb','card_don_nfl','card_don_nhl'] loop
    if position(('''' || k || '''') in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or kind = ' || quote_literal(k) || ') not valid';
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
      d := regexp_replace(d, ' NOT VALID$', '');
    end if;
  end loop;
end $$;

-- PROBES (run after, each as its own run):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.card_calls'::regclass and conname in ('card_calls_lane_name_ck','card_calls_note_lane_ck');
--     -- expect both, the lane list including 'donovan_late'
--   select policyname, permissive, cmd from pg_policies where schemaname = 'public' and tablename = 'card_calls';
--     -- expect card_calls_read (PERMISSIVE) and card_calls_no_late (RESTRICTIVE)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, note, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan_late', 'two_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, 'probe', '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect INSERT 0 1 (a late row, start in the past)
--   select qual from pg_policies where schemaname = 'public' and tablename = 'card_calls' and policyname = 'card_calls_no_late';   -- expect (lane <> 'donovan_late'::text): anon and authenticated cannot read a late row
--   delete from public.card_calls where model_version = 'probe' and lane = 'donovan_late';                                           -- expect DELETE 1 (inside the 15-minute typo window)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('mlb', '1970-01-01', '1970-01-01', 'donovan', 'two_man', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, '1970-01-01T00:00:00Z', '1970-01-01T00:00:00Z');   -- expect ERROR (the verified lane still refuses a past start)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';   -- expect ... OR (kind = 'card_don_mlb'::text) OR (kind = 'card_don_nfl'::text) OR (kind = 'card_don_nhl'::text)
--   select position('LOCK AT SAVE' in pg_get_functiondef('public.card_calls_guard'::regproc)) > 0 as lock_at_save_installed;   -- expect true (the lock-at-save branch is installed; it is not probed with a row because a locked row can never be deleted)
