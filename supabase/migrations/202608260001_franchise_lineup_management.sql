create or replace function public.set_fantasy_lineup_slot(
  p_league_id uuid,
  p_season smallint,
  p_week smallint,
  p_slot text,
  p_slot_index smallint,
  p_player_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
begin
  select id into v_team from public.fantasy_teams
    where league_id=p_league_id and owner_id=auth.uid();
  if v_team is null then raise exception 'Team ownership required'; end if;
  if p_week not between 1 and 22 or p_season not between 2025 and 2100
    then raise exception 'Invalid fantasy week'; end if;
  if p_slot not in ('QB','RB','WR','TE','FLEX','K','DEF','BENCH','IR')
    then raise exception 'Invalid lineup slot'; end if;
  if exists (select 1 from public.fantasy_lineup_slots where team_id=v_team and season=p_season
    and week=p_week and slot=p_slot and slot_index=p_slot_index and locked_at is not null)
    then raise exception 'That lineup slot is locked'; end if;

  if p_player_id is null then
    delete from public.fantasy_lineup_slots where team_id=v_team and season=p_season
      and week=p_week and slot=p_slot and slot_index=p_slot_index and locked_at is null;
    return;
  end if;
  if not exists (select 1 from public.fantasy_roster_entries where league_id=p_league_id
    and team_id=v_team and player_id=p_player_id and released_at is null)
    then raise exception 'That player is not on your roster'; end if;
  if exists (select 1 from public.fantasy_lineup_slots where team_id=v_team and season=p_season
    and week=p_week and player_id=p_player_id and locked_at is not null)
    then raise exception 'That player is already locked'; end if;
  select * into v_player from public.nfl_players where id=p_player_id;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if p_slot='QB' and v_player.position<>'QB' then raise exception 'Only a quarterback fits QB'; end if;
  if p_slot='RB' and v_player.position<>'RB' then raise exception 'Only a running back fits RB'; end if;
  if p_slot='WR' and v_player.position<>'WR' then raise exception 'Only a wide receiver fits WR'; end if;
  if p_slot='TE' and v_player.position<>'TE' then raise exception 'Only a tight end fits TE'; end if;
  if p_slot='FLEX' and v_player.position not in ('RB','WR','TE') then raise exception 'FLEX accepts RB, WR, or TE'; end if;
  if p_slot='K' and (v_player.position<>'K' or not v_league.has_kicker) then raise exception 'Kicker is unavailable'; end if;
  if p_slot='DEF' and (v_player.position<>'DEF' or not v_league.has_defense) then raise exception 'Defense is unavailable'; end if;
  if p_slot='IR' and v_player.injury_status is null then raise exception 'Only an injured player can enter IR'; end if;

  delete from public.fantasy_lineup_slots where team_id=v_team and season=p_season and week=p_week
    and ((slot=p_slot and slot_index=p_slot_index) or player_id=p_player_id) and locked_at is null;
  insert into public.fantasy_lineup_slots (league_id,team_id,player_id,season,week,slot,slot_index)
    values (p_league_id,v_team,p_player_id,p_season,p_week,p_slot,p_slot_index);
end;
$$;

create or replace function public.lock_fantasy_player_lineup(
  p_player_id uuid, p_season smallint, p_week smallint, p_locked_at timestamptz
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if current_user not in ('postgres','service_role','supabase_admin')
    then raise exception 'Scoring service access required'; end if;
  update public.fantasy_lineup_slots set locked_at=p_locked_at
    where player_id=p_player_id and season=p_season and week=p_week and locked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.set_fantasy_lineup_slot(uuid,smallint,smallint,text,smallint,uuid) from public;
revoke all on function public.lock_fantasy_player_lineup(uuid,smallint,smallint,timestamptz) from public;
grant execute on function public.set_fantasy_lineup_slot(uuid,smallint,smallint,text,smallint,uuid) to authenticated;
