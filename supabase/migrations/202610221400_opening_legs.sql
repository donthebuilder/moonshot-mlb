-- BUCKETS FIRST BASKET v2, ITS LEGS (2026-10-22, plan claude/BATCH-FIRSTS-PLAN-2026-10-22.txt step 5; backtest
-- claude/FIRST-BASKET-BACKTEST-2026-10-22.txt). One call before tip sums the openings tables in Postgres (a few dozen rows
-- leave the database, never the raw rows -- egress):
--   players  each man on the clubs asked: games on file, his first-3-minute shots, his clubs' first-3-minute shots in those
--            same games, how often he took the game's first shot, and his first baskets
--   teams    each club asked: tips with a winner on file, tips won
--   split    league-wide: games where the club that won the tip also scored first, of games with both on file
-- Only finished games are in these tables, so everything here was known before tonight's tip.
--
-- Additive and idempotent: one new function. RLS unchanged (service_role reads through the tick).
-- PROBE: select jsonb_array_length(public.opening_legs('nba', array[2026, 2027], array['SA','NO'])->'teams') = 2 as ok;

create or replace function public.opening_legs(p_sport text, p_seasons integer[], p_teams text[])
returns jsonb language sql stable as $$
  with g as (
    select * from public.opening_games where sport = p_sport and season = any(p_seasons) and season_type in (2, 3)
  ), team_w1 as (
    select p.game_id, p.team, sum(coalesce(p.win1_att, 0)) att
    from public.opening_players p join g on g.game_id = p.game_id
    where p.sport = p_sport and p.team = any(p_teams)
    group by p.game_id, p.team
  ), mine as (
    select p.player_id, p.team, p.game_id, g.game_date, coalesce(p.win1_att, 0) att, coalesce(t.att, 0) club_att,
           (p.first_att_order = 1) first_shot, (g.first_score_player = p.player_id) first_fg
    from public.opening_players p join g on g.game_id = p.game_id
    join team_w1 t on t.game_id = p.game_id and t.team = p.team
    where p.sport = p_sport and p.team = any(p_teams)
  ), players as (
    select player_id, (array_agg(team order by game_date desc))[1] team, count(*) gp, sum(att) w1_att, sum(club_att) club_w1_att,
           count(*) filter (where first_shot) first_shots, count(*) filter (where first_fg) first_fg
    from mine group by player_id
  ), teams as (
    select t.team, count(*) filter (where g.jump_win_team is not null) tips, count(*) filter (where g.jump_win_team = t.team) tips_won
    from g cross join lateral (values (g.home), (g.away)) t(team)
    where t.team = any(p_teams)
    group by t.team
  )
  select jsonb_build_object(
    'players', coalesce((select jsonb_agg(to_jsonb(players)) from players), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(to_jsonb(teams)) from teams), '[]'::jsonb),
    'split', (select jsonb_build_object('n', count(*), 'w', count(*) filter (where jump_win_team = first_score_team))
              from g where jump_win_team is not null and first_score_team is not null)
  )
$$;
