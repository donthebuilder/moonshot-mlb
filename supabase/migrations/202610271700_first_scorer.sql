-- 2026-10-27 (Donovan: "you have access to Supabase and SQL so do that"). Applied by Claude through the Supabase connector, same day.
-- 1) lamp_prop_log may hold market 'FIRST' (LAMP's first-goal model, lamp-first-v1; shadow lock + grade like PTS / AST / GOAL).
alter table public.lamp_prop_log drop constraint if exists lamp_prop_log_market_check;
alter table public.lamp_prop_log add constraint lamp_prop_log_market_check check (market = any (array['SOG'::text, 'PTS'::text, 'AST'::text, 'GOAL'::text, 'FIRST'::text]));
-- 2) first_scorer_log: who a model ranks to score FIRST in a game (TUDDY's first TD; any sport without its own log). Service role only.
create table if not exists public.first_scorer_log (
  sport text not null, game_id text not null, player_id text not null, model_version text not null,
  game_date date not null, season integer not null, start_utc timestamptz not null,
  team text not null, opp text not null, home boolean not null, name text not null, pos text,
  legs jsonb, score numeric, rank_in_game smallint, night_rank smallint, status text not null,
  locked_at timestamptz not null default now(), scored_first boolean, graded_at timestamptz,
  primary key (sport, game_id, player_id, model_version)
);
create index if not exists first_scorer_log_day on public.first_scorer_log (sport, game_date);
alter table public.first_scorer_log enable row level security;
