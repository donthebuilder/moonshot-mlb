-- BUCKETS: FIVE POSITIONS (2026-10-21, Donovan's PropFinder screenshots: "Defense vs PG / SG / SF / PF / C").
-- buckets_box.pos is ESPN's G / F / C from the box score. pos5 is the player's slot on his club's ESPN depth chart
-- (PG / SG / SF / PF / C; a man listed at two slots takes the one he ranks highest in) read the night the game is graded
-- (app/api/buckets/tick, lib/nba/depth.js). ESPN keeps no old depth charts, so 2025-26 rows stay null: five positions
-- start with 2026-27. A deep-bench man the chart doesn't list stays null too, and is counted only in the G / F / C table.
--
-- buckets_defpos5 = buckets_defpos by pos5, over the games where the attacking club had 5+ men tagged (a game the tick
-- graded before this shipped, or a club whose chart failed to read, is left out rather than counted as 0).
--
-- Additive and idempotent: a nullable column and a new function. RLS unchanged.
-- PROBE: select season, count(*) filter (where pos5 is not null) tagged, count(*) from public.buckets_box group by season;
--        select count(*) from public.buckets_defpos5(2027);

alter table public.buckets_box add column if not exists pos5 text;   -- PG / SG / SF / PF / C, null = not on his club's chart

create or replace function public.buckets_defpos5(p_season integer)
returns table (def text, pos text, win text, gp integer, pts numeric, reb numeric, ast numeric, tpm numeric, stl numeric, blk numeric)
language sql stable as $$
  with tagged as (
    select game_id, team from public.buckets_box
    where season = p_season and season_type = 2 and pos5 is not null
    group by game_id, team having count(*) >= 5
  ), g as (
    select b.opp as def, b.game_id, b.pos5 as pos, sum(b.pts) pts, sum(b.reb) reb, sum(b.ast) ast, sum(b.tpm) tpm, sum(b.stl) stl, sum(b.blk) blk
    from public.buckets_box b join tagged t on t.game_id = b.game_id and t.team = b.team
    where b.season = p_season and b.season_type = 2 and b.pos5 in ('PG', 'SG', 'SF', 'PF', 'C')
    group by b.opp, b.game_id, b.pos5
  ), games as (
    select def, game_id, row_number() over (partition by def order by game_date desc, game_id desc) rn
    from (select distinct b.opp as def, b.game_id, b.game_date from public.buckets_box b join tagged t on t.game_id = b.game_id and t.team = b.team
          where b.season = p_season and b.season_type = 2) x
  ), w(win, n) as (values ('L5', 5), ('L10', 10), ('Season', 1000000)),
  p(pos) as (values ('PG'), ('SG'), ('SF'), ('PF'), ('C'))
  select gm.def, p.pos, w.win, count(*)::int,
    round(sum(coalesce(g.pts, 0))::numeric / count(*), 1), round(sum(coalesce(g.reb, 0))::numeric / count(*), 1),
    round(sum(coalesce(g.ast, 0))::numeric / count(*), 1), round(sum(coalesce(g.tpm, 0))::numeric / count(*), 1),
    round(sum(coalesce(g.stl, 0))::numeric / count(*), 1), round(sum(coalesce(g.blk, 0))::numeric / count(*), 1)
  from games gm cross join w cross join p
  left join g on g.def = gm.def and g.game_id = gm.game_id and g.pos = p.pos
  where gm.rn <= w.n
  group by gm.def, p.pos, w.win
$$;

revoke execute on function public.buckets_defpos5(integer) from public, anon, authenticated;
grant execute on function public.buckets_defpos5(integer) to service_role;
