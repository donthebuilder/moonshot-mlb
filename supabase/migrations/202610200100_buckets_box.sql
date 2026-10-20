-- BUCKETS' BOX SCORES, ONE ROW PER PLAYER PER GAME (2026-10-19, Donovan: "defense vs position" + "his position vs
-- this opponent"). What each defense gave up to guards / forwards / centers needs every player's line, by game;
-- nothing stored that before (buckets_log holds only graded calls). Written once at grade time by the tick
-- (app/api/buckets/tick, beside buckets_shots) and backfilled for 2025-26 by scripts/backfill-nba-box.mjs.
-- Read by lib/nba/defPos.js through /api/buckets/defpos and /api/buckets/posvs (service key, behind the BUCKETS gate).
-- pos is ESPN's own G / F / C (ESPN does not split PG / SG / SF / PF). ~27k rows a season.
--
-- Additive and idempotent. RLS on with no anon policy: BUCKETS is hidden; service_role reads it.
-- PROBE: select season, count(*), count(distinct game_id) from public.buckets_box group by season;

create table if not exists public.buckets_box (
  game_id      text        not null,
  player_id    text        not null,
  game_date    date        not null,
  season       integer     not null,             -- ESPN's year the season ends (2026 = 2025-26)
  season_type  smallint    not null,             -- 2 regular, 3 playoffs
  team         text        not null,
  opp          text        not null,
  home         boolean     not null,
  team_won     boolean,
  name         text        not null,
  pos          text,                              -- G / F / C
  starter      boolean     not null default false,
  min          real,
  pts          smallint,
  reb          smallint,
  ast          smallint,
  tpm          smallint,
  stl          smallint,
  blk          smallint,
  primary key (game_id, player_id)
);
create index if not exists buckets_box_opp_idx on public.buckets_box (season, opp, pos);
create index if not exists buckets_box_player_idx on public.buckets_box (player_id, season);

alter table public.buckets_box enable row level security;

-- THE SUMS IN POSTGRES, NOT IN THE PAGE (2026-10-19): the org is at its egress limit (Supabase usage page, grace to
-- 10-24), so the routes never pull raw rows. buckets_defpos answers ~270 small rows (30 defenses x G/F/C x L5/L10/Season,
-- per-game averages; a game with nobody at a position counts as 0 there), buckets_posvs a few hundred (starters at a
-- position against one club, each with his own average in his OTHER games of that season). Regular season only.
-- Not callable with the public key (BUCKETS is hidden); the routes use the service key.
create or replace function public.buckets_defpos(p_season integer)
returns table (def text, pos text, win text, gp integer, pts numeric, reb numeric, ast numeric, tpm numeric, stl numeric, blk numeric)
language sql stable as $$
  with g as (
    select opp as def, game_id, pos, sum(pts) pts, sum(reb) reb, sum(ast) ast, sum(tpm) tpm, sum(stl) stl, sum(blk) blk
    from public.buckets_box where season = p_season and season_type = 2 and pos in ('G', 'F', 'C')
    group by opp, game_id, pos
  ), games as (
    select def, game_id, row_number() over (partition by def order by game_date desc, game_id desc) rn
    from (select distinct opp as def, game_id, game_date from public.buckets_box where season = p_season and season_type = 2) x
  ), w(win, n) as (values ('L5', 5), ('L10', 10), ('Season', 1000000)),
  p(pos) as (values ('G'), ('F'), ('C'))
  select gm.def, p.pos, w.win, count(*)::int,
    round(sum(coalesce(g.pts, 0))::numeric / count(*), 1), round(sum(coalesce(g.reb, 0))::numeric / count(*), 1),
    round(sum(coalesce(g.ast, 0))::numeric / count(*), 1), round(sum(coalesce(g.tpm, 0))::numeric / count(*), 1),
    round(sum(coalesce(g.stl, 0))::numeric / count(*), 1), round(sum(coalesce(g.blk, 0))::numeric / count(*), 1)
  from games gm cross join w cross join p
  left join g on g.def = gm.def and g.game_id = gm.game_id and g.pos = p.pos
  where gm.rn <= w.n
  group by gm.def, p.pos, w.win
$$;

create or replace function public.buckets_posvs(p_season integer, p_opp text, p_pos text)
returns table (game_id text, game_date date, player_id text, name text, team text, home boolean, team_won boolean, min real,
  pts smallint, reb smallint, ast smallint, tpm smallint, gp integer, avg_pts numeric, avg_reb numeric, avg_ast numeric, avg_tpm numeric)
language sql stable as $$
  select b.game_id, b.game_date, b.player_id, b.name, b.team, b.home, b.team_won, b.min, b.pts, b.reb, b.ast, b.tpm,
    o.gp, o.pts, o.reb, o.ast, o.tpm
  from public.buckets_box b
  cross join lateral (
    select count(*)::int gp, round(avg(x.pts)::numeric, 1) pts, round(avg(x.reb)::numeric, 1) reb, round(avg(x.ast)::numeric, 1) ast, round(avg(x.tpm)::numeric, 1) tpm
    from public.buckets_box x where x.player_id = b.player_id and x.season = p_season and x.season_type = 2 and x.game_id <> b.game_id
  ) o
  where b.season = p_season and b.season_type = 2 and b.opp = p_opp and b.pos = p_pos and b.starter
  order by b.game_date desc, b.name
$$;

revoke execute on function public.buckets_defpos(integer) from public, anon, authenticated;
revoke execute on function public.buckets_posvs(integer, text, text) from public, anon, authenticated;
grant execute on function public.buckets_defpos(integer) to service_role;
grant execute on function public.buckets_posvs(integer, text, text) to service_role;
