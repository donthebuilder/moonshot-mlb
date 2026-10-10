-- THE CARD MAP (2026-10-10, Donovan's approved map): plays per slate, volume markets, the Double, the Long Shot of the day, THE DAY.
-- ADDITIVE and IDEMPOTENT on top of 202610101000_card_calls.sql (run that first). Locked rows are never rewritten: nothing here touches a row.
--
-- What it adds to public.card_calls:
--   products     'double'    a cross-sport ticket (sport = 'all'), two legs from two sports, 0.5 unit, graded both-or-nothing
--                'long_shot' the Long Shot of the day, one leg, graded at the stored median price
--   result       'push'      a volume pick (shots on goal, receiving yards, hits ...) that landed exactly on the stored line: no result, stake returned
--   sport        'all'       the Double belongs to no single sport
--   columns      market (text, null = the anytime market), window_games (integer: the games in the window when the card locked)
-- The new rules the code uses are plain strings in the existing `rule` column: 'straight-slots-v2', 'two-man-same-game-v1', 'double-plus-money-v1',
-- 'donovan-double-v1', 'long-shot-v1' (a same-game Two-Man is a different rule, so its record is shown separately).
-- The model_version for the new Card is 'card-v2' (a new model is a new model_version; card-v1 rows are left exactly as they are).
-- The guard trigger keeps every rule of the first migration (insert only before the start; a locked row never changes but for its result,
-- written once; Donovan's row changes only before ITS lock) and also freezes the two new columns.
-- Appends the new post kinds to homer_feed_posts_kind_check:
--   card_ls_<sport>         the Long Shot of the day (X + the sport's free channel), before the first game
--   card_ls_result_<sport>  its result the next day, wins AND misses
--   card_double_result      the Double's result (free; the ticket itself is #members only)
--   card_today              the one free X line naming the lead straight
--   card_members_day, card_members_day_2, _3, _4   THE DAY in #members (the first post, then follow-ups when later windows lock)
-- ('card_members_*' contains "_members_", so the public read of homer_feed_posts already leaves them out: 202610091200.)
--
-- RUN IT BEFORE THE CODE THAT NEEDS IT SHIPS. Safe to run twice.

alter table public.card_calls add column if not exists market text;
alter table public.card_calls add column if not exists window_games integer;

-- the check constraints this map widens: drop the first migration's (unnamed) ones by what they say, add named replacements
do $$
declare c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.card_calls'::regclass and contype = 'c'
       and conname not like 'card_calls\_%\_ck'
  loop
    if c.def like '%sport = ANY%'
       or c.def like '%product = ANY%'
       or c.def like '%result = ANY%'
       or (c.def like '%leg_count%' and c.def like '%product%' and c.def like '%straight%')
       or (c.def like '%lane = ''bot''%' and c.def like '%product = ''two_man''%' and c.def not like '%leg_count%') then
      execute format('alter table public.card_calls drop constraint %I', c.conname);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_sport_ck') then
    alter table public.card_calls add constraint card_calls_sport_ck check (sport in ('mlb','nfl','nhl','nba','all'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_product_ck') then
    alter table public.card_calls add constraint card_calls_product_ck check (product in ('straight','two_man','double','long_shot'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_result_ck') then
    alter table public.card_calls add constraint card_calls_result_ck check (result in ('hit','miss','void','push'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_shape_ck') then
    alter table public.card_calls add constraint card_calls_shape_ck check (
         (product = 'straight'  and leg_count = 1)
      or (product = 'two_man'   and leg_count = 2 and slot = 1)
      or (product = 'double'    and leg_count = 2 and slot = 1)
      or (product = 'long_shot' and leg_count = 1 and slot = 1));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_lane_ck') then
    alter table public.card_calls add constraint card_calls_lane_ck check (lane = 'bot' or product in ('two_man','double'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.card_calls'::regclass and conname = 'card_calls_all_ck') then
    alter table public.card_calls add constraint card_calls_all_ck check ((sport = 'all') = (product = 'double'));
  end if;
end $$;

-- read access: the bot's rows are public (each was fixed before its game) EXCEPT the Double, whose ticket is for members: the public reads it only once graded.
-- Donovan's rows (his Two-Man and his Double) are public from their lock on, as before.
drop policy if exists card_calls_read on public.card_calls;
create policy card_calls_read on public.card_calls for select to anon, authenticated
  using (sport <> 'nba' and ((lane = 'bot' and (product <> 'double' or result is not null)) or (lane = 'donovan' and now() >= locks_at)));

-- the guard: the first migration's rules, plus the two new columns are frozen with the rest of the lock
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

-- the post kinds
do $$
declare d text; k text;
begin
  select pg_get_constraintdef(oid) into d
    from pg_constraint where conname = 'homer_feed_posts_kind_check';
  if d is null then
    raise exception 'homer_feed_posts_kind_check not found -- stop and look before adding one';
  end if;
  foreach k in array array[
    'card_ls_mlb','card_ls_nfl','card_ls_nhl',
    'card_ls_result_mlb','card_ls_result_nfl','card_ls_result_nhl',
    'card_double_result','card_today',
    'card_members_day','card_members_day_2','card_members_day_3','card_members_day_4'
  ] loop
    if position(('''' || k || '''') in d) = 0 then
      execute 'alter table public.homer_feed_posts drop constraint homer_feed_posts_kind_check';
      execute 'alter table public.homer_feed_posts add constraint homer_feed_posts_kind_check check (('
        || regexp_replace(d, '^CHECK ', '')
        || ') or kind = ' || quote_literal(k) || ') not valid';   -- NOT VALID: new rows are checked, old rows are not re-scanned (a stray old row made the full re-check fail with 23514 on 2026-10-10)
      select pg_get_constraintdef(oid) into d from pg_constraint where conname = 'homer_feed_posts_kind_check';
      d := regexp_replace(d, ' NOT VALID$', '');
    end if;
  end loop;
end $$;

-- PROBES (run after, one at a time; each as its own run):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.card_calls'::regclass and contype = 'c' order by conname;
--     -- expect card_calls_sport_ck (with 'all'), card_calls_product_ck (with 'double','long_shot'), card_calls_result_ck (with 'push'),
--     --        card_calls_shape_ck, card_calls_lane_ck, card_calls_all_ck, and NO unnamed sport/product/result/shape/lane check left
--   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'card_calls' and column_name in ('market','window_games');   -- expect 2 rows
--   select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.card_calls'::regclass;
--     -- expect card_calls_read with ... (product <> 'double'::text) OR (result IS NOT NULL) ... (lane = 'donovan'::text) AND (now() >= locks_at)
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'homer_feed_posts_kind_check';
--     -- expect ... OR (kind = 'card_ls_nhl'::text) ... OR (kind = 'card_members_day'::text) ... OR (kind = 'card_today'::text)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('all', '2999-01-01', '2999-01-01', 'donovan', 'double', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, '2999-01-01T00:00:00Z', '2998-12-31T23:00:00Z');   -- expect INSERT 0 1
--   update public.card_calls set market = 'x' where model_version = 'probe';                      -- expect UPDATE 1 (his Double entry is open; the key is not market)
--   update public.card_calls set result = 'push', graded_at = now() where model_version = 'probe';   -- expect ERROR (not graded before its lock)
--   delete from public.card_calls where model_version = 'probe';                                   -- expect DELETE 1 (an open entry may be withdrawn)
--   insert into public.card_calls (sport, card_date, slate_key, lane, product, slot, model_version, rule, stake, legs, leg_count, start_at, locks_at)
--     values ('nhl', '2999-01-01', '2999-01-01', 'bot', 'double', 1, 'probe', 'probe', 0.5, '[{"player_id":"x"},{"player_id":"y"}]', 2, '2999-01-01T00:00:00Z', '2998-12-31T23:00:00Z');   -- expect ERROR (a double is sport 'all')
