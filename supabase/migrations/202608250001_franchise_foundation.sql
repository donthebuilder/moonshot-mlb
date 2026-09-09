create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.fantasy_leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  commissioner_id uuid not null references auth.users(id),
  invite_code text not null unique default upper(encode(gen_random_bytes(4), 'hex')),
  team_count smallint not null default 10 check (team_count in (8,10,12,14)),
  scoring text not null default 'ppr' check (scoring in ('ppr','half_ppr','standard')),
  has_kicker boolean not null default true,
  has_defense boolean not null default true,
  ir_slots smallint not null default 1 check (ir_slots between 0 and 3),
  draft_timer_seconds smallint not null default 60 check (draft_timer_seconds in (30,60,90,120)),
  draft_order_method text not null default 'random' check (draft_order_method in ('random','manual')),
  status text not null default 'setup' check (status in ('setup','drafting','active','complete')),
  created_at timestamptz not null default now()
);

create table if not exists public.fantasy_league_memberships (
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('commissioner','member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.fantasy_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  draft_position smallint,
  created_at timestamptz not null default now(),
  unique (league_id, owner_id)
);

create index if not exists fantasy_memberships_user_idx on public.fantasy_league_memberships(user_id);
create index if not exists fantasy_teams_league_idx on public.fantasy_teams(league_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_fantasy_league_member(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fantasy_league_memberships
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_fantasy_commissioner(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.fantasy_leagues
    where id = p_league_id and commissioner_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.fantasy_leagues enable row level security;
alter table public.fantasy_league_memberships enable row level security;
alter table public.fantasy_teams enable row level security;

create policy "authenticated users can read profiles" on public.profiles
for select to authenticated using (true);
create policy "users update their profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "members read their leagues" on public.fantasy_leagues
for select to authenticated using (public.is_fantasy_league_member(id));
create policy "commissioners update their leagues" on public.fantasy_leagues
for update to authenticated using (commissioner_id = auth.uid()) with check (commissioner_id = auth.uid());
create policy "members read memberships" on public.fantasy_league_memberships
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read teams" on public.fantasy_teams
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "owners update teams" on public.fantasy_teams
for update to authenticated using (owner_id = auth.uid() or public.is_fantasy_commissioner(league_id))
with check (owner_id = auth.uid() or public.is_fantasy_commissioner(league_id));

create or replace function public.create_fantasy_league(
  p_name text,
  p_team_name text,
  p_settings jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league uuid;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if char_length(trim(p_name)) not between 1 and 60 then raise exception 'League name is required'; end if;
  if char_length(trim(p_team_name)) not between 1 and 40 then raise exception 'Team name is required'; end if;

  insert into public.fantasy_leagues (
    name, commissioner_id, team_count, scoring, has_kicker, has_defense,
    ir_slots, draft_timer_seconds, draft_order_method
  ) values (
    trim(p_name), v_user,
    coalesce((p_settings->>'team_count')::smallint, 10),
    coalesce(p_settings->>'scoring', 'ppr'),
    coalesce((p_settings->>'has_kicker')::boolean, true),
    coalesce((p_settings->>'has_defense')::boolean, true),
    coalesce((p_settings->>'ir_slots')::smallint, 1),
    coalesce((p_settings->>'draft_timer_seconds')::smallint, 60),
    coalesce(p_settings->>'draft_order_method', 'random')
  ) returning id into v_league;

  insert into public.fantasy_league_memberships (league_id, user_id, role)
  values (v_league, v_user, 'commissioner');
  insert into public.fantasy_teams (league_id, owner_id, name)
  values (v_league, v_user, trim(p_team_name));
  return v_league;
end;
$$;

create or replace function public.join_fantasy_league(p_invite_code text, p_team_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_league public.fantasy_leagues%rowtype;
  v_joined int;
begin
  if v_user is null then raise exception 'Sign in first'; end if;
  if char_length(trim(p_team_name)) not between 1 and 40 then raise exception 'Team name is required'; end if;

  select * into v_league from public.fantasy_leagues
  where invite_code = upper(trim(p_invite_code)) and status = 'setup'
  for update;
  if not found then raise exception 'That invite code is invalid or the league has started'; end if;
  if exists (select 1 from public.fantasy_league_memberships where league_id = v_league.id and user_id = v_user)
    then raise exception 'You already belong to this league';
  end if;
  select count(*) into v_joined from public.fantasy_teams where league_id = v_league.id;
  if v_joined >= v_league.team_count then raise exception 'That league is full'; end if;

  insert into public.fantasy_league_memberships (league_id, user_id) values (v_league.id, v_user);
  insert into public.fantasy_teams (league_id, owner_id, name) values (v_league.id, v_user, trim(p_team_name));
  return v_league.id;
end;
$$;

revoke all on function public.create_fantasy_league(text,text,jsonb) from public;
revoke all on function public.join_fantasy_league(text,text) from public;
grant execute on function public.create_fantasy_league(text,text,jsonb) to authenticated;
grant execute on function public.join_fantasy_league(text,text) to authenticated;
