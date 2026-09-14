-- FRANCHISE: a week with games already played is not 'scheduled' (2026-09-14).
--
-- Found the moment Week 1 was scored for real: Sunday night, 15 of 16 games
-- final, Monday night still to come, and every matchup read SCHEDULED --
-- because 'live' had meant "a game is on this second". The Matchup hero
-- prints '—' for a scheduled game, so 141.84 to 96.68 showed as two dashes.
--
-- Same function, same sums, same grants; only the status CASE changes:
--   final      every regular-season game of the week is final
--   live       at least one game has started (live OR final), not all final
--   scheduled  nothing has kicked off
-- Rows already stored pick the new status up on the next refresh.

create or replace function public.refresh_fantasy_matchup_scores(p_league_id uuid,p_season smallint,p_week smallint)
returns integer language plpgsql security definer set search_path=public as $$
declare v_scoring text; v_count integer;
begin
  if coalesce(auth.role(),'')<>'service_role' and not public.is_fantasy_commissioner(p_league_id) then raise exception 'Commissioner or scoring service access required'; end if;
  select scoring into v_scoring from public.fantasy_leagues where id=p_league_id;
  update public.fantasy_matchups m set
    -- A stat row whose game is preseason no longer counts. left join, because
    -- a row with a null game_id predates the feed and is assumed regular.
    home_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week left join public.nfl_week_games sg on sg.game_id=s.game_id where l.team_id=m.home_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR') and coalesce(sg.season_type,2)=2),0),
    away_score=coalesce((select sum(public.fantasy_points_for_stats(s.stats,v_scoring)) from public.fantasy_lineup_slots l join public.nfl_player_week_stats s on s.player_id=l.player_id and s.season=l.season and s.week=l.week left join public.nfl_week_games sg on sg.game_id=s.game_id where l.team_id=m.away_team_id and l.season=p_season and l.week=p_week and l.slot not in ('BENCH','IR') and coalesce(sg.season_type,2)=2),0),
    -- 'live' means THE WEEK IS IN PROGRESS: at least one game has started
    -- (live or final) and not every game is final. It used to mean "a game is
    -- on right now", so a Sunday night with fifteen finals and Monday still to
    -- come read SCHEDULED and the Matchup hero printed dashes over real scores.
    status=case
      when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2)
       and not exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2 and g.status<>'final') then 'final'
      when exists(select 1 from public.nfl_week_games g where g.season=p_season and g.week=p_week and g.season_type=2 and g.status in ('live','final')) then 'live'
      else 'scheduled' end
    where m.league_id=p_league_id and m.season=p_season and m.week=p_week;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
