-- NUMEROLOGY, RECORDED AND GRADED (2026-09-27, BATCH-NUMEROLOGY steps 6 / 6b).
--
-- Numerology never feeds a score, a board or a rank. These tables exist so
-- we find out which lanes (if any) actually run hot, instead of arguing
-- about it: every lane that MATCHED a player pregame is written once,
-- frozen, and graded later from the results we already store (homer_feed /
-- graded files, nfl_td_feed, lamp_goal_log). The per-night denominator
-- (who was eligible for each lane) is what the base rate is computed from.
-- Lanes: lib/numerology/lanes.js (keys like gem_date, fib_next).
--
-- SERVICE ROLE ONLY (RLS on, no policies), like odds_snap / multi_games: the
-- site reads them through its own API routes. Idempotent: safe to run twice.

-- One row per sport x game date x player x lane x match, written pregame.
create table if not exists public.numerology_log (
  sport        text        not null check (sport in ('mlb', 'nfl', 'nhl')),
  day          date        not null,              -- the game's own date
  player_id    text        not null,
  lane         text        not null,              -- lanes.js key
  matched_to   text        not null,              -- 'date short 64', 'jersey 21', 'fibonacci' ...
  value        text,                              -- the matched value (a number or initials)
  name         text,
  team         text,
  text         text,                              -- the sentence the site prints
  written_at   timestamptz not null default now(),
  -- the grade (filled once, from the stored results)
  played       boolean,
  hit          boolean,                           -- homered / scored a TD / scored a goal
  graded_at    timestamptz,
  primary key (sport, day, player_id, lane, matched_to)
);
create index if not exists numerology_log_day_idx on public.numerology_log (sport, day);
create index if not exists numerology_log_lane_idx on public.numerology_log (sport, lane);

-- The denominator: per sport x night x lane, how many players could be
-- checked (had the fields), how many matched, and after grading how many of
-- each hit. The lane table's "base rate" is hits_eligible / eligible.
create table if not exists public.numerology_lane_nights (
  sport          text     not null check (sport in ('mlb', 'nfl', 'nhl')),
  day            date     not null,
  lane           text     not null,
  eligible       integer  not null check (eligible >= 0),
  matched        integer  not null check (matched >= 0),
  eligible_hits  integer,                         -- filled at grading
  matched_hits   integer,
  graded_at      timestamptz,
  primary key (sport, day, lane)
);

-- HOT NUMBERS (step 6b): per sport x night x number type x value, how many
-- of the night's homers / TDs / goals landed on it and how many would have by
-- chance (its share of everyone who played x the night's events). Replaces
-- the browser-only "yesterday's number" archive.
create table if not exists public.numerology_numbers (
  sport        text     not null check (sport in ('mlb', 'nfl', 'nhl')),
  day          date     not null,
  kind         text     not null,                 -- jersey, jersey_root, season_root, life_path, personal_day, gematria, first_letter
  value        text     not null,
  events       integer  not null check (events >= 0),     -- homers / TDs / goals on this value
  expected     numeric  not null check (expected >= 0),   -- by chance
  players      integer  not null check (players >= 0),    -- how many who played carried it
  updated_at   timestamptz not null default now(),
  primary key (sport, day, kind, value)
);
create index if not exists numerology_numbers_day_idx on public.numerology_numbers (sport, day desc);

alter table public.numerology_log enable row level security;
alter table public.numerology_lane_nights enable row level security;
alter table public.numerology_numbers enable row level security;
revoke all on table public.numerology_log from anon, authenticated;
revoke all on table public.numerology_lane_nights from anon, authenticated;
revoke all on table public.numerology_numbers from anon, authenticated;
grant all on table public.numerology_log to service_role;
grant all on table public.numerology_lane_nights to service_role;
grant all on table public.numerology_numbers to service_role;

-- Probe (three rows, all rls = true):
--   select relname, relrowsecurity as rls from pg_class
--   where relname in ('numerology_log', 'numerology_lane_nights', 'numerology_numbers');
