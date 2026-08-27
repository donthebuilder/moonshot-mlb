alter table public.fantasy_teams add column if not exists waiver_priority integer;

with ranked as (
  select id, row_number() over (partition by league_id order by created_at,id) as priority
  from public.fantasy_teams where waiver_priority is null
)
update public.fantasy_teams t set waiver_priority=ranked.priority
from ranked where ranked.id=t.id;

alter table public.fantasy_teams alter column waiver_priority set default 1;
alter table public.fantasy_teams alter column waiver_priority set not null;

create table if not exists public.fantasy_player_availability (
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  waiver_until timestamptz not null,
  reason text not null default 'dropped' check (reason in ('dropped','commissioner')),
  updated_at timestamptz not null default now(),
  primary key (league_id,player_id)
);

create table if not exists public.fantasy_waiver_claims (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id) on delete cascade,
  drop_player_id uuid references public.nfl_players(id),
  priority_at_claim integer not null,
  process_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending','awarded','rejected','cancelled')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique nulls not distinct (team_id,player_id,status)
);

create table if not exists public.fantasy_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('waiver','free_agent','drop','trade','commissioner')),
  added_player_id uuid references public.nfl_players(id),
  dropped_player_id uuid references public.nfl_players(id),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fantasy_waiver_pending_idx on public.fantasy_waiver_claims(league_id,process_after,status);
create index if not exists fantasy_transactions_league_idx on public.fantasy_transactions(league_id,created_at desc);

alter table public.fantasy_player_availability enable row level security;
alter table public.fantasy_waiver_claims enable row level security;
alter table public.fantasy_transactions enable row level security;

create policy "members read player availability" on public.fantasy_player_availability
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read league waiver claims" on public.fantasy_waiver_claims
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read transactions" on public.fantasy_transactions
for select to authenticated using (public.is_fantasy_league_member(league_id));

create or replace function public.add_fantasy_free_agent(
  p_league_id uuid, p_player_id uuid, p_drop_player_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_team uuid; v_entry uuid; v_count integer; v_league public.fantasy_leagues%rowtype;
begin
  select * into v_league from public.fantasy_leagues where id=p_league_id;
  select id into v_team from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid() for update;
  if v_team is null then raise exception 'Team ownership required'; end if;
  if v_league.status<>'active' then raise exception 'Free agency opens after the draft'; end if;
  if not exists(select 1 from public.nfl_players where id=p_player_id and active) then raise exception 'Player unavailable'; end if;
  if exists(select 1 from public.fantasy_roster_entries where league_id=p_league_id and player_id=p_player_id and released_at is null)
    then raise exception 'That player is already rostered'; end if;
  if exists(select 1 from public.fantasy_player_availability where league_id=p_league_id and player_id=p_player_id and waiver_until>now())
    then raise exception 'That player must clear waivers first'; end if;
  select count(*) into v_count from public.fantasy_roster_entries where team_id=v_team and released_at is null;
  if v_count>=15 and p_drop_player_id is null then raise exception 'Choose a player to drop from your full roster'; end if;
  if p_drop_player_id is not null then
    if exists(select 1 from public.fantasy_lineup_slots where team_id=v_team and player_id=p_drop_player_id and locked_at is not null)
      then raise exception 'A locked player cannot be dropped'; end if;
    update public.fantasy_roster_entries set released_at=now() where team_id=v_team and player_id=p_drop_player_id and released_at is null;
    if not found then raise exception 'Drop player is not on your roster'; end if;
    delete from public.fantasy_lineup_slots where team_id=v_team and player_id=p_drop_player_id and locked_at is null;
    insert into public.fantasy_player_availability(league_id,player_id,waiver_until)
      values(p_league_id,p_drop_player_id,now()+interval '24 hours')
      on conflict(league_id,player_id) do update set waiver_until=excluded.waiver_until,updated_at=now();
  end if;
  insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
    values(p_league_id,v_team,p_player_id,'free_agent') returning id into v_entry;
  delete from public.fantasy_player_availability where league_id=p_league_id and player_id=p_player_id;
  insert into public.fantasy_transactions(league_id,team_id,transaction_type,added_player_id,dropped_player_id)
    values(p_league_id,v_team,'free_agent',p_player_id,p_drop_player_id);
  return v_entry;
end;
$$;

create or replace function public.submit_fantasy_waiver_claim(
  p_league_id uuid, p_player_id uuid, p_drop_player_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_team public.fantasy_teams%rowtype; v_until timestamptz; v_claim uuid;
begin
  select * into v_team from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid();
  if v_team.id is null then raise exception 'Team ownership required'; end if;
  select waiver_until into v_until from public.fantasy_player_availability
    where league_id=p_league_id and player_id=p_player_id;
  if v_until is null or v_until<=now() then raise exception 'That player is a free agent and can be added now'; end if;
  if exists(select 1 from public.fantasy_roster_entries where league_id=p_league_id and player_id=p_player_id and released_at is null)
    then raise exception 'That player is already rostered'; end if;
  if p_drop_player_id is not null and not exists(select 1 from public.fantasy_roster_entries where team_id=v_team.id and player_id=p_drop_player_id and released_at is null)
    then raise exception 'Drop player is not on your roster'; end if;
  insert into public.fantasy_waiver_claims(league_id,team_id,player_id,drop_player_id,priority_at_claim,process_after)
    values(p_league_id,v_team.id,p_player_id,p_drop_player_id,v_team.waiver_priority,v_until)
    returning id into v_claim;
  return v_claim;
exception when unique_violation then raise exception 'You already have a pending claim for that player';
end;
$$;

create or replace function public.cancel_fantasy_waiver_claim(p_claim_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.fantasy_waiver_claims c set status='cancelled',processed_at=now()
    where c.id=p_claim_id and c.status='pending' and exists(
      select 1 from public.fantasy_teams t where t.id=c.team_id and t.owner_id=auth.uid());
  if not found then raise exception 'Pending claim not found'; end if;
end;
$$;

create or replace function public.process_fantasy_waivers(p_league_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare v_claim public.fantasy_waiver_claims%rowtype; v_count integer; v_awarded integer:=0; v_max_priority integer;
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
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

revoke all on function public.add_fantasy_free_agent(uuid,uuid,uuid) from public;
revoke all on function public.submit_fantasy_waiver_claim(uuid,uuid,uuid) from public;
revoke all on function public.cancel_fantasy_waiver_claim(uuid) from public;
revoke all on function public.process_fantasy_waivers(uuid) from public;
grant execute on function public.add_fantasy_free_agent(uuid,uuid,uuid) to authenticated;
grant execute on function public.submit_fantasy_waiver_claim(uuid,uuid,uuid) to authenticated;
grant execute on function public.cancel_fantasy_waiver_claim(uuid) to authenticated;
grant execute on function public.process_fantasy_waivers(uuid) to authenticated;
