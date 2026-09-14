-- FRANCHISE scoring: two terms the feed now carries (2026-09-14).
--
-- nfl_fantasy_stats.json (bot, nfl_fantasy_stats.py) is the first real
-- per-player box-score feed FRANCHISE has had; until it, every player scored
-- 0 all week. It carries two stats this function did not read:
--
--   def_safeties       D/ST safety, +2. lib/fantasy/scoring.js already scores
--                      it; the SQL side did not, so the ACTUAL column and the
--                      projection disagreed by 2 on a safety.
--   return_touchdowns  a kick/punt return TD by the PLAYER, +6 -- standard
--                      scoring; the D/ST also gets its own def_touchdowns for
--                      the same play, as in every mainstream league.
--
-- Same function, same signature, same grants; only the sum changes. Rows
-- already stored are re-summed on the next refresh_all_fantasy_matchup_scores.
create or replace function public.fantasy_points_for_stats(p_stats jsonb,p_scoring text)
returns numeric language sql immutable set search_path=public as $$
  select round((
    coalesce((p_stats->>'passing_yards')::numeric,0)*0.04+
    coalesce((p_stats->>'passing_touchdowns')::numeric,0)*4-
    coalesce((p_stats->>'interceptions')::numeric,0)*2+
    coalesce((p_stats->>'rushing_yards')::numeric,0)*0.1+
    coalesce((p_stats->>'rushing_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'receiving_yards')::numeric,0)*0.1+
    coalesce((p_stats->>'receiving_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'receptions')::numeric,0)*(case p_scoring when 'ppr' then 1 when 'half_ppr' then 0.5 else 0 end)-
    coalesce((p_stats->>'fumbles_lost')::numeric,0)*2+
    coalesce((p_stats->>'two_point_conversions')::numeric,0)*2+
    coalesce((p_stats->>'return_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'field_goals_0_39')::numeric,0)*3+
    coalesce((p_stats->>'field_goals_40_49')::numeric,0)*4+
    coalesce((p_stats->>'field_goals_50_plus')::numeric,0)*5+
    coalesce((p_stats->>'extra_points')::numeric,0)+
    coalesce((p_stats->>'def_sacks')::numeric,0)+
    coalesce((p_stats->>'def_interceptions')::numeric,0)*2+
    coalesce((p_stats->>'def_fumble_recoveries')::numeric,0)*2+
    coalesce((p_stats->>'def_touchdowns')::numeric,0)*6+
    coalesce((p_stats->>'def_safeties')::numeric,0)*2+
    case when p_stats ? 'points_allowed' then case
      when (p_stats->>'points_allowed')::numeric=0 then 10
      when (p_stats->>'points_allowed')::numeric<=6 then 7
      when (p_stats->>'points_allowed')::numeric<=13 then 4
      when (p_stats->>'points_allowed')::numeric<=20 then 1
      when (p_stats->>'points_allowed')::numeric<=27 then 0
      when (p_stats->>'points_allowed')::numeric<=34 then -1 else -4 end else 0 end
  ),2);
$$;
