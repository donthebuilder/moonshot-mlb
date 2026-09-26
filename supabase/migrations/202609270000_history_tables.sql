-- HISTORY TABLES (2026-09-26, .claude-notes/BATCH-MILESTONES-PLAN.md).
-- One row per player-season per team, plus a 'TOT' row for a player who
-- played for more than one team that season. Built once by
-- scripts/history/build-<sport>.mjs and refreshed for the current season;
-- read only by the server-side claim engine (lib/history/lastTime.js), never
-- by a page. Every "first X since Y" line on the site is a query on these.
--
-- Sources (credit shown wherever a claim appears):
--   hist_mlb  SABR Lahman Baseball Database 1871-2025 + MLB StatsAPI 2026
--   hist_nhl  NHL stats API skater/goalie summary + bios, 1917-18 on
--   hist_nfl  nflverse player_stats, 1999 on
--
-- SERVICE ROLE ONLY: RLS on, no policies, no anon/authenticated grants.
-- Idempotent: safe to run twice.

create table if not exists public.hist_mlb (
  season      smallint not null,
  source_id   text     not null,          -- Lahman playerID (e.g. lopezja01) or 'mlbam:<id>' for StatsAPI seasons
  team        text     not null,          -- Lahman teamID / StatsAPI abbrev; 'TOT' = all teams combined
  franchise   text,                       -- Lahman franchID (ATL, WSN, ANA...); null on TOT
  mlbam_id    integer,                    -- our player id where known
  name        text     not null,
  position    text,                       -- primary position that season (most games in the field; DH if none)
  age         smallint,                   -- age on June 30 of the season
  rookie      boolean,                    -- first MLB season
  g smallint, pa smallint, ab smallint, h smallint, d2b smallint, d3b smallint, hr smallint,
  rbi smallint, r smallint, sb smallint, bb smallint, tb smallint,
  p_w smallint, p_so smallint, p_sv smallint, p_ipouts integer, p_er smallint,
  built_at    timestamptz not null default now(),
  primary key (season, source_id, team)
);
create index if not exists hist_mlb_fr_idx  on public.hist_mlb (franchise, position, season);
create index if not exists hist_mlb_hr_idx  on public.hist_mlb (hr);
create index if not exists hist_mlb_id_idx  on public.hist_mlb (mlbam_id) where mlbam_id is not null;

create table if not exists public.hist_nhl (
  season      integer  not null,          -- 20252026
  player_id   integer  not null,          -- NHL id (ours)
  team        text     not null,          -- abbrev; 'TOT' when teamAbbrevs lists several
  franchise   text,                       -- lineage key (e.g. WPG for ATL->WPG); null on TOT
  name        text     not null,
  position    text,
  age         smallint,
  rookie      boolean,
  gp smallint, g smallint, a smallint, pts smallint, ppg smallint, shg smallint, gwg smallint, sog smallint, plus_minus smallint,
  gl_w smallint, gl_so smallint, gl_svpct real,
  built_at    timestamptz not null default now(),
  primary key (season, player_id, team)
);
create index if not exists hist_nhl_fr_idx on public.hist_nhl (franchise, position, season);

create table if not exists public.hist_nfl (
  season      smallint not null,
  player_id   text     not null,          -- gsis
  team        text     not null,
  franchise   text,
  name        text     not null,
  position    text,
  age         smallint,
  rookie      boolean,
  g smallint, rec_td smallint, rush_td smallint, pass_td smallint, total_td smallint,
  rec smallint, rec_yds smallint, rush_yds smallint, pass_yds smallint,
  built_at    timestamptz not null default now(),
  primary key (season, player_id, team)
);
create index if not exists hist_nfl_fr_idx on public.hist_nfl (franchise, position, season);

alter table public.hist_mlb enable row level security;
alter table public.hist_nhl enable row level security;
alter table public.hist_nfl enable row level security;
revoke all on table public.hist_mlb from anon, authenticated;
revoke all on table public.hist_nhl from anon, authenticated;
revoke all on table public.hist_nfl from anon, authenticated;
grant all on table public.hist_mlb to service_role;
grant all on table public.hist_nhl to service_role;
grant all on table public.hist_nfl to service_role;

-- CHECKLIST (shows under Run): three rows, all 'yes'.
select t as item, case when exists (select 1 from pg_class where relname = t and relrowsecurity) then 'yes' else 'NO' end as ok
from unnest(array['hist_mlb', 'hist_nhl', 'hist_nfl']) as t;
