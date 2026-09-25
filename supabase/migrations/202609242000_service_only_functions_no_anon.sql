-- 2026-09-24 audit, SEC-3 + SEC-9: service-only functions were callable by
-- anon.
--
-- Probed live before this migration, with the PUBLIC anon key and no user:
--   rpc/lock_fantasy_player_lineup   -> 200   (locks every slot in every league)
--   rpc/process_all_fantasy_waivers  -> 200   (ran the waiver pass, every league)
--   rpc/dash_push_seen_prune         -> 204   (pruned the push dedupe table)
--
-- Two causes. (1) lock_fantasy_player_lineup's guard tests `current_user`,
-- which inside a SECURITY DEFINER function is the OWNER (postgres) -- so the
-- check has never once fired. Every other service-only function here tests
-- auth.role(), which is the caller's JWT role; this one now does too.
-- (2) `revoke ... from public` is not enough on Supabase: the schema's default
-- privileges grant EXECUTE on every new function to anon, authenticated and
-- service_role directly, and a grant to a role survives a revoke from public.
-- 202609130001 documented exactly this for the sync_nfl_* pair. Same fix,
-- applied to every function that only the service key should reach.
--
-- Nothing the site calls as a user is touched: the cron routes and the
-- scoring service hold the service key, which is what these grants keep.

create or replace function public.lock_fantasy_player_lineup(
  p_player_id uuid, p_season smallint, p_week smallint, p_locked_at timestamptz
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    then raise exception 'Scoring service access required'; end if;
  update public.fantasy_lineup_slots set locked_at = p_locked_at
    where player_id = p_player_id and season = p_season and week = p_week and locked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.lock_fantasy_player_lineup(uuid,smallint,smallint,timestamptz) from public, anon, authenticated;
grant execute on function public.lock_fantasy_player_lineup(uuid,smallint,smallint,timestamptz) to service_role;

-- Idempotent, and tolerant of a database that has not run a later migration
-- yet (09-24: advance_all_fantasy_playoffs did not exist on prod because the
-- playoffs migration had not been run). Skips what is not there, says so.
do $$
declare
  f text;
  done text := '';
  missing text := '';
begin
  foreach f in array array[
    'public.process_all_fantasy_waivers()',
    'public.process_fantasy_waivers_unchecked(uuid)',
    'public.refresh_all_fantasy_matchup_scores(smallint,smallint)',
    'public.advance_all_fantasy_playoffs(smallint)',
    'public.advance_fantasy_playoffs_unchecked(uuid,smallint)',
    'public.dash_push_log_prune()',
    'public.dash_push_seen_prune()',
    'public.sync_nfl_player_catalog(jsonb)',
    'public.sync_nfl_week_feed(jsonb,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
      done := done || f || '  ';
    else
      missing := missing || f || '  ';
    end if;
  end loop;
  raise notice 'revoked from anon/authenticated: %', done;
  raise notice 'not on this database (skipped): %', missing;
end $$;

-- Verify (anon key, no user): each existing function must now answer 42501.
