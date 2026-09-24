-- ═══════════════════════════════════════════════════════════════════════════
-- FRANCHISE: the commissioner can make an add/drop for another team
-- (2026-09-23)
--
-- Donovan asked for a move on 3zzz's roster. Nothing could do it: every
-- add/drop function resolves "your team" from auth.uid(), so a commissioner
-- had no path to another manager's roster short of hand-writing rows -- the
-- same "incident, not a workflow" 202609071000 describes for draft picks.
--
-- commissioner_roster_move(league, team, add, drop) is that path, with the
-- same rules a manager's own add follows: the added man must be active and
-- unrostered, the dropped man must be on that roster and not locked THIS
-- week (fantasy_player_locked_now, 202609231800 -- run that first), the
-- dropped man goes to 24-hour waivers, and the roster stays at or under 15.
-- A commissioner may add a man who is on waivers (it is their league to
-- run); everything else is identical.
--
-- PUBLIC BY DESIGN. It writes a 'commissioner' transaction AND a league feed
-- post naming both players and the team -- the same answer 202609062000 gave
-- for self-approved trades: the protection is that everyone can see it.
--
-- The _unchecked body carries no permission test so it can be run once from
-- the SQL editor (where auth.uid() is null); it is revoked from every client
-- role. The checked wrapper is what the app would call.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.commissioner_roster_move_unchecked(
  p_league_id uuid, p_team_id uuid, p_add_player_id uuid, p_drop_player_id uuid, p_author uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_team public.fantasy_teams%rowtype;
  v_count integer;
  v_entry uuid;
  v_add text; v_drop text;
  v_author_team uuid;
begin
  select * into v_team from public.fantasy_teams where id = p_team_id and league_id = p_league_id for update;
  if v_team.id is null then raise exception 'That team is not in this league'; end if;
  if p_add_player_id is null and p_drop_player_id is null then raise exception 'Choose a player to add or drop'; end if;

  if p_add_player_id is not null then
    select name into v_add from public.nfl_players where id = p_add_player_id and active;
    if v_add is null then raise exception 'Player unavailable'; end if;
    if exists (select 1 from public.fantasy_roster_entries where league_id = p_league_id and player_id = p_add_player_id and released_at is null)
      then raise exception '% is already rostered', v_add; end if;
  end if;

  if p_drop_player_id is not null then
    select p.name into v_drop from public.fantasy_roster_entries r join public.nfl_players p on p.id = r.player_id
      where r.team_id = p_team_id and r.player_id = p_drop_player_id and r.released_at is null;
    if v_drop is null then raise exception 'The player to drop is not on that roster'; end if;
    if public.fantasy_player_locked_now(p_team_id, p_drop_player_id) then raise exception '% is locked this week and cannot be dropped', v_drop; end if;
  end if;

  select count(*) into v_count from public.fantasy_roster_entries where team_id = p_team_id and released_at is null;
  if p_add_player_id is not null and p_drop_player_id is null and v_count >= 15
    then raise exception 'That roster is full — choose a player to drop'; end if;

  if p_drop_player_id is not null then
    update public.fantasy_roster_entries set released_at = now()
      where team_id = p_team_id and player_id = p_drop_player_id and released_at is null;
    delete from public.fantasy_lineup_slots where team_id = p_team_id and player_id = p_drop_player_id and locked_at is null;
    insert into public.fantasy_player_availability(league_id, player_id, waiver_until)
      values (p_league_id, p_drop_player_id, now() + interval '24 hours')
      on conflict (league_id, player_id) do update set waiver_until = excluded.waiver_until, updated_at = now();
  end if;

  if p_add_player_id is not null then
    insert into public.fantasy_roster_entries(league_id, team_id, player_id, acquired_via)
      values (p_league_id, p_team_id, p_add_player_id, 'commissioner') returning id into v_entry;
    delete from public.fantasy_player_availability where league_id = p_league_id and player_id = p_add_player_id;
    update public.fantasy_waiver_claims set status = 'rejected', processed_at = now()
      where league_id = p_league_id and player_id = p_add_player_id and status = 'pending';
  end if;

  insert into public.fantasy_transactions(league_id, team_id, transaction_type, added_player_id, dropped_player_id, details)
    values (p_league_id, p_team_id, 'commissioner', p_add_player_id, p_drop_player_id, jsonb_build_object('by', p_author));

  select id into v_author_team from public.fantasy_teams where league_id = p_league_id and owner_id = p_author;
  if p_author is not null then
    insert into public.fantasy_feed_posts(league_id, author_id, team_id, body)
      values (p_league_id, p_author, coalesce(v_author_team, p_team_id), left(
        'Commissioner move for ' || v_team.name || ': '
        || concat_ws(', ', case when v_add is not null then 'added ' || v_add end,
                          case when v_drop is not null then 'dropped ' || v_drop || ' (on waivers 24h)' end)
        || '.', 500));
  end if;
  return v_entry;
end;
$$;
revoke all on function public.commissioner_roster_move_unchecked(uuid, uuid, uuid, uuid, uuid) from public;
revoke execute on function public.commissioner_roster_move_unchecked(uuid, uuid, uuid, uuid, uuid) from authenticated, anon;

create or replace function public.commissioner_roster_move(
  p_league_id uuid, p_team_id uuid, p_add_player_id uuid, p_drop_player_id uuid
) returns uuid language plpgsql security definer set search_path = public as $$
begin
  if not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner access required'; end if;
  return public.commissioner_roster_move_unchecked(p_league_id, p_team_id, p_add_player_id, p_drop_player_id, auth.uid());
end;
$$;
revoke all on function public.commissioner_roster_move(uuid, uuid, uuid, uuid) from public;
grant execute on function public.commissioner_roster_move(uuid, uuid, uuid, uuid) to authenticated;
