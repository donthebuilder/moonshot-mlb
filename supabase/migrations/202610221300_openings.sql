-- THE OPENINGS (2026-10-22, Donovan: "team tip win rate, who gets the first shots ... how many shots they take per game in
-- the first 3 minutes ... usage in that first 3 minutes ... points ... first baskets for their team and/or in the game, and
-- the first field goal attempts" + "the first six minutes should be cool to help with first quarter tickets" + "this all
-- needs to be a part of the model"). Plan: claude/BATCH-FIRSTS-PLAN-2026-10-22.txt.
--
-- One shape for every sport. BUCKETS fills it first (ESPN's free play-by-play, written once a game at grade time, plus a one-off
-- backfill marked source='backfill'); LAMP, TUDDY and MOONSHOT reuse it with their own windows:
--   sport  win1_s  win2_s  period 1        the jump               the attempt     the first score
--   nba    180     360     Q1 (12 min)     tip (team that got it)  FGA             first made FG
--   nhl    300     600     P1 (20 min)     opening faceoff         shot on goal    first goal
--   nfl    -       -       Q1              who received            target / carry  first TD
--   mlb    -       -       1st inning      -                       PA              first hit / first HR
-- Rows are never rewritten once a game is final (a re-grade upserts the same numbers). Small: ~1,300 games and ~13,000
-- player rows an NBA season.
--
-- Additive and idempotent. RLS on, service_role only (the site reads through its own API routes).
-- PROBE (every value must be true):
--   select to_regclass('public.opening_games') is not null as games_table,
--          to_regclass('public.opening_players') is not null as players_table,
--          (select relrowsecurity from pg_class where oid = 'public.opening_games'::regclass) as games_rls,
--          (select relrowsecurity from pg_class where oid = 'public.opening_players'::regclass) as players_rls;

create table if not exists public.opening_games (
  sport               text        not null,              -- nba | nhl | nfl | mlb
  game_id             text        not null,
  game_date           date        not null,              -- the game's own date
  season              integer,
  season_type         smallint,                          -- 1 pre, 2 regular, 3 post (ESPN's numbers)
  home                text        not null,
  away                text        not null,
  win1_s              smallint,                          -- the first window, seconds from the start (nba 180)
  win2_s              smallint,                          -- the second window (nba 360)
  jump_win_team       text,                              -- the club that got the opening possession (nba tip, nhl faceoff, nfl receive)
  jump_players        text[],                            -- the two men in the jump / faceoff
  first_att_team      text,
  first_att_player    text,
  first_att_clock_s   smallint,                          -- seconds into the game
  first_score_team    text,
  first_score_player  text,
  first_score_clock_s smallint,
  first_score_pts     smallint,                          -- nba 2 or 3
  win1_home_pts       smallint, win1_away_pts smallint,
  win2_home_pts       smallint, win2_away_pts smallint,
  p1_home_pts         smallint, p1_away_pts   smallint,  -- the whole first period / quarter / inning
  source              text        not null default 'tick', -- tick | backfill
  written_at          timestamptz not null default now(),
  primary key (sport, game_id)
);

create table if not exists public.opening_players (
  sport            text        not null,
  game_id          text        not null,
  game_date        date        not null,
  season           integer,
  season_type      smallint,
  player_id        text        not null,
  name             text,
  team             text        not null,
  pos              text,
  starter          boolean,
  first_att_order  smallint,                              -- 1 = he took the game's first attempt, 2 = second ... (in win2), else null
  -- each window: attempts, makes, points, threes tried, free throws tried, turnovers (usage = att + 0.44 fta + tov over his club's)
  win1_att smallint, win1_made smallint, win1_pts smallint, win1_3pa smallint, win1_fta smallint, win1_tov smallint,
  win2_att smallint, win2_made smallint, win2_pts smallint, win2_3pa smallint, win2_fta smallint, win2_tov smallint,
  p1_att   smallint, p1_made   smallint, p1_pts   smallint, p1_3pa   smallint, p1_fta   smallint, p1_tov   smallint,
  p1_reb   smallint, p1_ast    smallint,                    -- first-quarter rebounds and assists (1Q props)
  source           text        not null default 'tick',
  written_at       timestamptz not null default now(),
  primary key (sport, game_id, player_id)
);

create index if not exists opening_games_team_idx    on public.opening_games (sport, season, home, away);
create index if not exists opening_players_player_idx on public.opening_players (sport, player_id, game_date desc);
create index if not exists opening_players_team_idx   on public.opening_players (sport, season, team);

alter table public.opening_games   enable row level security;
alter table public.opening_players enable row level security;
