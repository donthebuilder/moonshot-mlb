create table if not exists public.fantasy_trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.fantasy_leagues(id) on delete cascade,
  proposer_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  recipient_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled','vetoed','completed')),
  note text not null default '' check (char_length(note)<=280),
  commissioner_note text not null default '' check (char_length(commissioner_note)<=280),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  reviewed_at timestamptz,
  check (proposer_team_id<>recipient_team_id)
);

create table if not exists public.fantasy_trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.fantasy_trades(id) on delete cascade,
  from_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  to_team_id uuid not null references public.fantasy_teams(id) on delete cascade,
  player_id uuid not null references public.nfl_players(id),
  unique (trade_id,player_id),
  check (from_team_id<>to_team_id)
);

create index if not exists fantasy_trades_league_idx on public.fantasy_trades(league_id,created_at desc);
create index if not exists fantasy_trade_items_trade_idx on public.fantasy_trade_items(trade_id);

alter table public.fantasy_trades enable row level security;
alter table public.fantasy_trade_items enable row level security;

create policy "members read trades" on public.fantasy_trades
for select to authenticated using (public.is_fantasy_league_member(league_id));
create policy "members read trade items" on public.fantasy_trade_items
for select to authenticated using (exists(
  select 1 from public.fantasy_trades tr where tr.id=trade_id and public.is_fantasy_league_member(tr.league_id)
));

create or replace function public.propose_fantasy_trade(
  p_league_id uuid,
  p_recipient_team_id uuid,
  p_offered_player_ids uuid[],
  p_requested_player_ids uuid[],
  p_note text default ''
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_proposer uuid; v_trade uuid; v_player uuid;
begin
  select id into v_proposer from public.fantasy_teams where league_id=p_league_id and owner_id=auth.uid();
  if v_proposer is null then raise exception 'Team ownership required'; end if;
  if p_recipient_team_id=v_proposer or not exists(select 1 from public.fantasy_teams where id=p_recipient_team_id and league_id=p_league_id)
    then raise exception 'Choose another team in this league'; end if;
  if coalesce(array_length(p_offered_player_ids,1),0) not between 1 and 5
    or coalesce(array_length(p_requested_player_ids,1),0) not between 1 and 5
    then raise exception 'Choose 1 to 5 players on each side'; end if;
  if (select count(distinct id) from unnest(p_offered_player_ids) id)<>array_length(p_offered_player_ids,1)
    or (select count(distinct id) from unnest(p_requested_player_ids) id)<>array_length(p_requested_player_ids,1)
    then raise exception 'A player can only appear once'; end if;
  if exists(select 1 from unnest(p_offered_player_ids) id where not exists(
    select 1 from public.fantasy_roster_entries r where r.team_id=v_proposer and r.player_id=id and r.released_at is null))
    then raise exception 'An offered player is no longer on your roster'; end if;
  if exists(select 1 from unnest(p_requested_player_ids) id where not exists(
    select 1 from public.fantasy_roster_entries r where r.team_id=p_recipient_team_id and r.player_id=id and r.released_at is null))
    then raise exception 'A requested player is no longer on that roster'; end if;
  insert into public.fantasy_trades(league_id,proposer_team_id,recipient_team_id,note)
    values(p_league_id,v_proposer,p_recipient_team_id,left(trim(coalesce(p_note,'')),280)) returning id into v_trade;
  foreach v_player in array p_offered_player_ids loop
    insert into public.fantasy_trade_items(trade_id,from_team_id,to_team_id,player_id)
      values(v_trade,v_proposer,p_recipient_team_id,v_player);
  end loop;
  foreach v_player in array p_requested_player_ids loop
    insert into public.fantasy_trade_items(trade_id,from_team_id,to_team_id,player_id)
      values(v_trade,p_recipient_team_id,v_proposer,v_player);
  end loop;
  return v_trade;
end;
$$;

create or replace function public.respond_fantasy_trade(p_trade_id uuid,p_response text)
returns void language plpgsql security definer set search_path=public as $$
declare v_trade public.fantasy_trades%rowtype;
begin
  select * into v_trade from public.fantasy_trades where id=p_trade_id for update;
  if not found or not exists(select 1 from public.fantasy_teams where id=v_trade.recipient_team_id and owner_id=auth.uid())
    then raise exception 'Recipient access required'; end if;
  if v_trade.status<>'pending' then raise exception 'This offer can no longer be answered'; end if;
  if p_response not in ('accepted','rejected') then raise exception 'Invalid trade response'; end if;
  update public.fantasy_trades set status=p_response,responded_at=now() where id=p_trade_id;
end;
$$;

create or replace function public.cancel_fantasy_trade(p_trade_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_trade public.fantasy_trades%rowtype;
begin
  select * into v_trade from public.fantasy_trades where id=p_trade_id for update;
  if not found or not exists(select 1 from public.fantasy_teams where id=v_trade.proposer_team_id and owner_id=auth.uid())
    then raise exception 'Proposer access required'; end if;
  if v_trade.status<>'pending' then raise exception 'Only pending offers can be cancelled'; end if;
  update public.fantasy_trades set status='cancelled',responded_at=now() where id=p_trade_id;
end;
$$;

create or replace function public.review_fantasy_trade(p_trade_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare v_trade public.fantasy_trades%rowtype; v_item public.fantasy_trade_items%rowtype;
begin
  select * into v_trade from public.fantasy_trades where id=p_trade_id for update;
  if not found or not public.is_fantasy_commissioner(v_trade.league_id) then raise exception 'Commissioner access required'; end if;
  if v_trade.status<>'accepted' then raise exception 'Only accepted trades can be reviewed'; end if;
  if p_decision not in ('approve','veto') then raise exception 'Invalid review decision'; end if;
  if p_decision='veto' then
    update public.fantasy_trades set status='vetoed',commissioner_note=left(trim(coalesce(p_note,'')),280),
      reviewed_by=auth.uid(),reviewed_at=now() where id=p_trade_id;
    return;
  end if;
  for v_item in select * from public.fantasy_trade_items where trade_id=p_trade_id for update loop
    if not exists(select 1 from public.fantasy_roster_entries where team_id=v_item.from_team_id and player_id=v_item.player_id and released_at is null)
      then raise exception 'A traded player is no longer on the expected roster'; end if;
    if exists(select 1 from public.fantasy_lineup_slots where team_id=v_item.from_team_id and player_id=v_item.player_id and locked_at is not null)
      then raise exception 'A locked player cannot be traded'; end if;
  end loop;
  for v_item in select * from public.fantasy_trade_items where trade_id=p_trade_id loop
    update public.fantasy_roster_entries set released_at=now() where team_id=v_item.from_team_id and player_id=v_item.player_id and released_at is null;
    delete from public.fantasy_lineup_slots where team_id=v_item.from_team_id and player_id=v_item.player_id and locked_at is null;
    insert into public.fantasy_roster_entries(league_id,team_id,player_id,acquired_via)
      values(v_trade.league_id,v_item.to_team_id,v_item.player_id,'trade');
  end loop;
  insert into public.fantasy_transactions(league_id,team_id,transaction_type,details)
    values(v_trade.league_id,v_trade.proposer_team_id,'trade',jsonb_build_object('trade_id',p_trade_id)),
      (v_trade.league_id,v_trade.recipient_team_id,'trade',jsonb_build_object('trade_id',p_trade_id));
  update public.fantasy_trades set status='completed',commissioner_note=left(trim(coalesce(p_note,'')),280),
    reviewed_by=auth.uid(),reviewed_at=now() where id=p_trade_id;
end;
$$;

revoke all on function public.propose_fantasy_trade(uuid,uuid,uuid[],uuid[],text) from public;
revoke all on function public.respond_fantasy_trade(uuid,text) from public;
revoke all on function public.cancel_fantasy_trade(uuid) from public;
revoke all on function public.review_fantasy_trade(uuid,text,text) from public;
grant execute on function public.propose_fantasy_trade(uuid,uuid,uuid[],uuid[],text) to authenticated;
grant execute on function public.respond_fantasy_trade(uuid,text) to authenticated;
grant execute on function public.cancel_fantasy_trade(uuid) to authenticated;
grant execute on function public.review_fantasy_trade(uuid,text,text) to authenticated;
