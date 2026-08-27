create table if not exists public.fantasy_draft_queue (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.fantasy_drafts(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  rank smallint not null default 1 check (rank between 1 and 500),
  created_at timestamptz not null default now(),
  unique (draft_id, team_id, player_id),
  unique (draft_id, team_id, rank)
);

alter table public.fantasy_draft_queue enable row level security;
create policy "owners manage their draft queue" on public.fantasy_draft_queue
for all to authenticated
using (exists (select 1 from public.fantasy_teams t where t.id = team_id and t.owner_id = auth.uid()))
with check (exists (select 1 from public.fantasy_teams t where t.id = team_id and t.owner_id = auth.uid()));
create policy "commissioners read queues" on public.fantasy_draft_queue
for select to authenticated using (exists (
  select 1 from public.fantasy_drafts d where d.id = draft_id and public.is_fantasy_commissioner(d.league_id)
));

create or replace function public.add_fantasy_draft_queue(p_league_id uuid, p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft uuid;
  v_team uuid;
  v_rank integer;
begin
  select id into v_draft from public.fantasy_drafts where league_id = p_league_id;
  select id into v_team from public.fantasy_teams where league_id = p_league_id and owner_id = auth.uid();
  if v_draft is null or v_team is null then raise exception 'Draft and team are required'; end if;
  if exists (select 1 from public.fantasy_draft_picks where draft_id = v_draft and player_id = p_player_id)
    then raise exception 'That player has already been drafted'; end if;
  select coalesce(max(rank),0)+1 into v_rank from public.fantasy_draft_queue where draft_id = v_draft and team_id = v_team;
  insert into public.fantasy_draft_queue (draft_id,team_id,player_id,rank)
    values (v_draft,v_team,p_player_id,v_rank) on conflict (draft_id,team_id,player_id) do nothing;
  return v_rank;
end;
$$;

create or replace function public.remove_fantasy_draft_queue(p_league_id uuid, p_player_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_draft uuid; v_team uuid;
begin
  select id into v_draft from public.fantasy_drafts where league_id = p_league_id;
  select id into v_team from public.fantasy_teams where league_id = p_league_id and owner_id = auth.uid();
  delete from public.fantasy_draft_queue where draft_id = v_draft and team_id = v_team and player_id = p_player_id;
end;
$$;

create or replace function public.run_expired_fantasy_auto_pick(p_league_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_player uuid;
  v_next integer;
  v_last integer;
begin
  if not public.is_fantasy_league_member(p_league_id) then raise exception 'League access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id = p_league_id for update;
  if not found or v_draft.status <> 'live' then raise exception 'The draft is not live'; end if;
  if v_draft.pick_deadline is null or v_draft.pick_deadline > now() then raise exception 'The pick timer has not expired'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id = v_draft.id
    and overall_pick = v_draft.current_overall_pick for update;
  select * into v_league from public.fantasy_leagues where id = p_league_id;

  select q.player_id into v_player from public.fantasy_draft_queue q
    join public.nfl_players p on p.id = q.player_id and p.active
    where q.draft_id = v_draft.id and q.team_id = v_pick.team_id
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not exists (select 1 from public.fantasy_draft_picks dp where dp.draft_id = v_draft.id and dp.player_id = p.id)
    order by q.rank limit 1;
  if v_player is null then
    select p.id into v_player from public.nfl_players p where p.active
      and (v_league.has_kicker or p.position <> 'K')
      and (v_league.has_defense or p.position <> 'DEF')
      and not exists (select 1 from public.fantasy_draft_picks dp where dp.draft_id = v_draft.id and dp.player_id = p.id)
    order by coalesce((select max(value::numeric) from jsonb_each_text(coalesce(p.source_payload->'scores','{}'::jsonb))),0) desc,
      p.name limit 1;
  end if;
  if v_player is null then raise exception 'No eligible players remain'; end if;

  update public.fantasy_draft_picks set player_id=v_player,assignment_type='auto',picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,v_player,'draft');
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=v_player;

  select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
  v_next := v_draft.current_overall_pick + 1;
  while v_next <= v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
    loop v_next := v_next + 1; end loop;
  if v_next > v_last then
    update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
    update public.fantasy_leagues set status='active' where id=p_league_id;
  else
    update public.fantasy_drafts set current_overall_pick=v_next,
      pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  end if;
  return v_player;
end;
$$;

create or replace function public.commissioner_assign_fantasy_pick(
  p_league_id uuid, p_overall_pick integer, p_player_id uuid
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_next integer;
  v_last integer;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  select * into v_pick from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=p_overall_pick for update;
  if not found or v_pick.player_id is not null then raise exception 'That draft slot is unavailable'; end if;
  select * into v_player from public.nfl_players where id=p_player_id and active;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if not found then raise exception 'Player unavailable'; end if;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  update public.fantasy_draft_picks set player_id=p_player_id,assignment_type='manual',picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,p_player_id,'commissioner');
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=p_player_id;
  if p_overall_pick = v_draft.current_overall_pick and v_draft.status = 'live' then
    select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
    v_next := p_overall_pick + 1;
    while v_next <= v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
      loop v_next := v_next + 1; end loop;
    if v_next > v_last then
      update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
      update public.fantasy_leagues set status='active' where id=p_league_id;
    else
      update public.fantasy_drafts set current_overall_pick=v_next,
        pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
    end if;
  end if;
  return p_overall_pick;
exception when unique_violation then raise exception 'That player has already been drafted';
end;
$$;

create or replace function public.make_fantasy_draft_pick(p_league_id uuid, p_player_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_draft public.fantasy_drafts%rowtype;
  v_pick public.fantasy_draft_picks%rowtype;
  v_player public.nfl_players%rowtype;
  v_league public.fantasy_leagues%rowtype;
  v_owner uuid;
  v_next integer;
  v_last integer;
begin
  select * into v_draft from public.fantasy_drafts where league_id=p_league_id for update;
  if not found or v_draft.status<>'live' then raise exception 'The draft is not live'; end if;
  select * into v_pick from public.fantasy_draft_picks where draft_id=v_draft.id
    and overall_pick=v_draft.current_overall_pick for update;
  select owner_id into v_owner from public.fantasy_teams where id=v_pick.team_id;
  if auth.uid()<>v_owner and not public.is_fantasy_commissioner(p_league_id) then raise exception 'It is not your turn'; end if;
  select * into v_player from public.nfl_players where id=p_player_id and active;
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  if v_player.id is null then raise exception 'That player is unavailable'; end if;
  if (v_player.position='K' and not v_league.has_kicker) or (v_player.position='DEF' and not v_league.has_defense)
    then raise exception 'That position is disabled in this league'; end if;
  update public.fantasy_draft_picks set player_id=p_player_id,
    assignment_type=case when auth.uid()=v_owner then 'live' else 'manual' end,picked_at=now() where id=v_pick.id;
  insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
    values (p_league_id,v_pick.team_id,p_player_id,case when auth.uid()=v_owner then 'draft' else 'commissioner' end);
  delete from public.fantasy_draft_queue where draft_id=v_draft.id and player_id=p_player_id;
  select max(overall_pick) into v_last from public.fantasy_draft_picks where draft_id=v_draft.id;
  v_next:=v_draft.current_overall_pick+1;
  while v_next<=v_last and exists (select 1 from public.fantasy_draft_picks where draft_id=v_draft.id and overall_pick=v_next and player_id is not null)
    loop v_next:=v_next+1; end loop;
  if v_next>v_last then
    update public.fantasy_drafts set status='complete',completed_at=now(),pick_deadline=null where id=v_draft.id;
    update public.fantasy_leagues set status='active' where id=p_league_id;
  else
    update public.fantasy_drafts set current_overall_pick=v_next,
      pick_deadline=now()+make_interval(secs=>timer_seconds) where id=v_draft.id;
  end if;
  return v_pick.overall_pick;
exception when unique_violation then raise exception 'That player has already been drafted';
end;
$$;

revoke all on function public.add_fantasy_draft_queue(uuid,uuid) from public;
revoke all on function public.remove_fantasy_draft_queue(uuid,uuid) from public;
revoke all on function public.run_expired_fantasy_auto_pick(uuid) from public;
revoke all on function public.commissioner_assign_fantasy_pick(uuid,integer,uuid) from public;
grant execute on function public.add_fantasy_draft_queue(uuid,uuid) to authenticated;
grant execute on function public.remove_fantasy_draft_queue(uuid,uuid) to authenticated;
grant execute on function public.run_expired_fantasy_auto_pick(uuid) to authenticated;
grant execute on function public.commissioner_assign_fantasy_pick(uuid,integer,uuid) to authenticated;
