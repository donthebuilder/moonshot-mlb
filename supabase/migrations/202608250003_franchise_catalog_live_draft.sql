create or replace function public.sync_nfl_player_catalog(p_catalog jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.fantasy_league_memberships
    where user_id = auth.uid() and role = 'commissioner'
  ) then raise exception 'Commissioner access required'; end if;
  if jsonb_typeof(p_catalog) <> 'array' or jsonb_array_length(p_catalog) > 2000
    then raise exception 'Invalid player catalog';
  end if;

  for v_item in select value from jsonb_array_elements(p_catalog) loop
    if coalesce(v_item->>'position', '') in ('QB','RB','WR','TE','K','DEF')
      and coalesce(v_item->>'sourcePlayerId', '') <> ''
      and coalesce(v_item->>'name', '') <> '' then
      insert into public.nfl_players (
        source, source_player_id, season, name, position, team, active,
        injury_status, source_payload, updated_at
      ) values (
        coalesce(v_item->>'source', 'dash'), v_item->>'sourcePlayerId',
        (v_item->>'season')::smallint, left(v_item->>'name', 100),
        v_item->>'position', nullif(v_item->>'team', ''),
        coalesce((v_item->>'active')::boolean, true),
        nullif(v_item->>'injuryStatus', ''), coalesce(v_item->'analytics', '{}'::jsonb), now()
      ) on conflict (source, source_player_id, season) do update set
        name = excluded.name, position = excluded.position, team = excluded.team,
        active = excluded.active, injury_status = excluded.injury_status,
        source_payload = excluded.source_payload, updated_at = now();
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.start_fantasy_draft(p_league_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found then raise exception 'Prepare the draft order first'; end if;
  if not exists (select 1 from public.fantasy_draft_picks where draft_id = v_draft.id)
    then raise exception 'The draft board is empty';
  end if;
  update public.fantasy_drafts set status = 'live', current_overall_pick = 1,
    started_at = coalesce(started_at, now()),
    pick_deadline = now() + make_interval(secs => timer_seconds)
  where id = v_draft.id;
  update public.fantasy_leagues set status = 'drafting' where id = p_league_id;
  return v_draft.id;
end;
$$;

create or replace function public.make_fantasy_draft_pick(p_league_id uuid, p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_owner uuid;
  v_next integer;
  v_last integer;
begin
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found or v_draft.status <> 'live' then raise exception 'The draft is not live'; end if;
  select * into v_pick from public.fantasy_draft_picks
    where draft_id = v_draft.id and overall_pick = v_draft.current_overall_pick for update;
  select owner_id into v_owner from public.fantasy_teams where id = v_pick.team_id;
  if auth.uid() <> v_owner and not public.is_fantasy_commissioner(p_league_id)
    then raise exception 'It is not your turn';
  end if;
  if not exists (select 1 from public.nfl_players where id = p_player_id and active)
    then raise exception 'That player is unavailable';
  end if;

  update public.fantasy_draft_picks set player_id = p_player_id,
    assignment_type = case when auth.uid() = v_owner then 'live' else 'manual' end,
    picked_at = now() where id = v_pick.id;
  insert into public.fantasy_roster_entries (league_id, team_id, player_id, acquired_via)
    values (p_league_id, v_pick.team_id, p_player_id,
      case when auth.uid() = v_owner then 'draft' else 'commissioner' end);

  select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id = v_draft.id;
  v_next := v_draft.current_overall_pick + 1;
  while v_next <= v_last and exists (
    select 1 from public.fantasy_draft_picks where draft_id = v_draft.id
      and overall_pick = v_next and player_id is not null
  ) loop v_next := v_next + 1; end loop;

  if v_next > v_last then
    update public.fantasy_drafts set status = 'complete', completed_at = now(), pick_deadline = null
      where id = v_draft.id;
    update public.fantasy_leagues set status = 'active' where id = p_league_id;
  else
    update public.fantasy_drafts set current_overall_pick = v_next,
      pick_deadline = now() + make_interval(secs => timer_seconds) where id = v_draft.id;
  end if;
  return v_pick.overall_pick;
exception when unique_violation then
  raise exception 'That player has already been drafted';
end;
$$;

revoke all on function public.sync_nfl_player_catalog(jsonb) from public;
revoke all on function public.start_fantasy_draft(uuid) from public;
revoke all on function public.make_fantasy_draft_pick(uuid,uuid) from public;
grant execute on function public.sync_nfl_player_catalog(jsonb) to authenticated;
grant execute on function public.start_fantasy_draft(uuid) to authenticated;
grant execute on function public.make_fantasy_draft_pick(uuid,uuid) to authenticated;
