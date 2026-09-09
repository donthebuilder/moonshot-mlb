-- FRANCHISE — a commissioner reviewing their own trade says so, in the feed.
-- ⚠ RUN THIS AFTER THE DRAFT. It is not part of APPLY-BEFORE-DRAFT.sql and
--   nothing about a draft touches it.
--
-- WHY NOT A HARD BLOCK, WHICH IS WHAT WAS ASKED FOR.
--
-- review_fantasy_trade checks only `is_fantasy_commissioner`, so a commissioner
-- who is party to a trade approves their own deal. The obvious fix is to forbid
-- it. It does not work here, and it is worth writing down why rather than
-- shipping something that looks like governance and is not:
--
--   · role is per-membership, so a league CAN have two commissioners -- but in
--     practice, and in both of Donovan's leagues, there is exactly one.
--   · With one commissioner, forbidding self-review means every trade that
--     commissioner is part of reaches `accepted` and stops there forever. No
--     one else can approve it. The block would not prevent a bad trade; it
--     would prevent the commissioner from trading at all, and it would do it
--     silently, from a screen with no explanation on it.
--   · So the block is either a no-op (two commissioners, the rare case) or it
--     strands deals (one commissioner, the real case). Neither is governance.
--
-- What actually protects a league here is not permission, it is publicity. A
-- self-approved trade now announces itself in the league feed, where every
-- owner reads it, with both sides named. The commissioner can still do it --
-- they must be able to -- and everyone finds out without having to go looking.
-- The UI already labels the button "your own deal" for the person pressing it;
-- this is the half the other nine owners see.
--
-- Nothing else in the function changes. Body copied from 202608260004 with one
-- insert added on the approve path.

create or replace function public.review_fantasy_trade(p_trade_id uuid,p_decision text,p_note text default '')
returns void language plpgsql security definer set search_path=public as $$
declare
  v_trade public.fantasy_trades%rowtype;
  v_item public.fantasy_trade_items%rowtype;
  v_reviewer_team uuid;
  v_proposer text;
  v_recipient text;
begin
  select * into v_trade from public.fantasy_trades where id=p_trade_id for update;
  if not found or not public.is_fantasy_commissioner(v_trade.league_id) then raise exception 'Commissioner access required'; end if;
  if v_trade.status<>'accepted' then raise exception 'Only accepted trades can be reviewed'; end if;
  if p_decision not in ('approve','veto') then raise exception 'Invalid review decision'; end if;

  -- Is the person reviewing also in the deal?
  select id into v_reviewer_team from public.fantasy_teams
    where league_id=v_trade.league_id and owner_id=auth.uid();

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

  -- THE PART THAT IS NEW. Approved a deal you are in? The league is told.
  if v_reviewer_team is not null
     and v_reviewer_team in (v_trade.proposer_team_id, v_trade.recipient_team_id) then
    select name into v_proposer from public.fantasy_teams where id=v_trade.proposer_team_id;
    select name into v_recipient from public.fantasy_teams where id=v_trade.recipient_team_id;
    insert into public.fantasy_feed_posts(league_id,author_id,team_id,body)
      values(v_trade.league_id, auth.uid(), v_reviewer_team,
        left('Commissioner approved a trade they are part of: ' || coalesce(v_proposer,'a team')
             || ' and ' || coalesce(v_recipient,'a team') || '.', 500));
  end if;
end;
$$;

revoke all on function public.review_fantasy_trade(uuid,text,text) from public;
grant execute on function public.review_fantasy_trade(uuid,text,text) to authenticated;
