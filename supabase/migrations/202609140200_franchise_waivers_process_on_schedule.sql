-- FRANCHISE: waivers clear on the clock, not when the commissioner remembers (2026-09-14).
--
-- process_fantasy_waivers() is gated on is_fantasy_commissioner() and the only
-- thing that ever called it was the "Process cleared claims" button on the
-- Wire. A claim whose 24 hours were up sat pending until Donovan opened that
-- page -- in Week 2, when everyone starts working the wire, that is every
-- claim in the league waiting on one man's afternoon.
--
-- Split, not rewritten: the loop body below is the SAME code as the original,
-- copied verbatim minus the commissioner check, so the two paths cannot drift.
-- The commissioner function now delegates to it. A third entry point walks
-- every active league for the scoring cron, which runs as the service role
-- (auth.uid() is null there, so the commissioner gate could never pass).
-- Neither new function is granted to authenticated -- only the service role
-- reaches them.

create or replace function public.process_fantasy_waivers_unchecked(p_league_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_claim public.fantasy_waiver_claims%rowtype; v_count integer; v_awarded integer:=0; v_max_priority integer;
begin
  for v_claim in select c.* from public.fantasy_waiver_claims c join public.fantasy_teams t on t.id=c.team_id
    where c.league_id=p_league_id and c.status='pending' and c.process_after<=now()
    order by c.process_after,t.waiver_priority,c.created_at for update of c loop
    if exists(select 1 from public.fantasy_roster_entries where league_id=p_league_id and player_id=v_claim.player_id and released_at is null) then
      update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id;
      continue;
    end if;
    select count(*) into v_count from public.fantasy_roster_entries where team_id=v_claim.team_id and released_at is null;
    if v_count>=15 and v_claim.drop_player_id is null then
      update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id;
      continue;
    end if;
    if v_claim.drop_player_id is not null then
      if exists(select 1 from public.fantasy_lineup_slots where team_id=v_claim.team_id and player_id=v_claim.drop_player_id and locked_at is not null) then
        update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id; continue;
      end if;
      update public.fantasy_roster_entries set released_at=now() where team_id=v_claim.team_id and player_id=v_claim.drop_player_id and released_at is null;
      if not found then update public.fantasy_waiver_claims set status='rejected',processed_at=now() where id=v_claim.id; continue; end if;
      delete from public.fantasy_lineup_slots where team_id=v_claim.team_id and player_id=v_claim.drop_player_id and locked_at is null;
      insert into public.fantasy_player_availability(league_id,player_id,waiver_until)
        values(p_league_id,v_claim.drop_player_id,now()+interval '24 hours')
        on conflict(league_id,player_id) do update set waiver_until=excluded.waiver_until,updated_at=now();
    end if;
    insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
      values(p_league_id,v_claim.team_id,v_claim.player_id,'waiver');
    update public.fantasy_waiver_claims set status='awarded',processed_at=now() where id=v_claim.id;
    update public.fantasy_waiver_claims set status='rejected',processed_at=now()
      where league_id=p_league_id and player_id=v_claim.player_id and status='pending' and id<>v_claim.id;
    delete from public.fantasy_player_availability where league_id=p_league_id and player_id=v_claim.player_id;
    select coalesce(max(waiver_priority),0)+1 into v_max_priority from public.fantasy_teams where league_id=p_league_id;
    update public.fantasy_teams set waiver_priority=v_max_priority where id=v_claim.team_id;
    insert into public.fantasy_transactions(league_id,team_id,transaction_type,added_player_id,dropped_player_id)
      values(p_league_id,v_claim.team_id,'waiver',v_claim.player_id,v_claim.drop_player_id);
    v_awarded:=v_awarded+1;
  end loop;
  return v_awarded;
end;
$$;

create or replace function public.process_fantasy_waivers(p_league_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  return public.process_fantasy_waivers_unchecked(p_league_id);
end;
$$;

create or replace function public.process_all_fantasy_waivers()
returns integer language plpgsql security definer set search_path=public as $$
declare v_league uuid; v_total integer:=0;
begin
  for v_league in
    select distinct c.league_id from public.fantasy_waiver_claims c
      join public.fantasy_leagues l on l.id=c.league_id and l.status='active'
      where c.status='pending' and c.process_after<=now()
  loop
    v_total := v_total + public.process_fantasy_waivers_unchecked(v_league);
  end loop;
  return v_total;
end;
$$;

revoke all on function public.process_fantasy_waivers_unchecked(uuid) from public;
revoke all on function public.process_all_fantasy_waivers() from public;
revoke all on function public.process_fantasy_waivers_unchecked(uuid) from authenticated;
revoke all on function public.process_all_fantasy_waivers() from authenticated;
