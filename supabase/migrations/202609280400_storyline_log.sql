-- 202609280400_storyline_log.sql -- STORYLINES, FROZEN AND GRADED
-- (BATCH-STORYLINES-PAGE step 3)
--
-- Every story the Storylines page shows is written ONCE at the product's own
-- lock -- MLB first pitch, NFL kickoff, NHL puck drop -- and never rewritten
-- (insert ... on conflict do nothing; nothing is written after the start).
-- After the game the row is graded: outcome = did it come true, by the rule
-- written per type in lib/stories/grade.js. A type with no outcome of its own
-- (birthday, numerology, fun facts ...) is graded PRODUCTIVE at two bars:
--   outcome        the base bar  (MLB 1+ hit · NFL a TD or 10+ scrimmage yds · NHL 1+ point)
--   outcome_strong the strong bar (MLB 2+ hits · NFL a TD or 50+ yds · NHL 2+ points or a goal)
-- (the final bars live in lib/stories/grade.js's header; `bar` records which
-- rule graded the row.)
--
-- storyline_base_nights: the same bars for EVERYONE on that night's slate, so
-- "productive" is read beside the base rate instead of crediting a birthday
-- story for what every starter does anyway. Derived at grade time; safe to
-- recompute.
--
-- SERVICE ROLE ONLY (the page reads through an API route). RLS on, no
-- policies, anon/authenticated revoked. Idempotent: safe to run twice.

create table if not exists public.storyline_log (
  sport          text        not null check (sport in ('mlb', 'nfl', 'nhl')),
  day            date        not null,              -- the game's own date
  game_id        text        not null,
  player_id      text        not null,
  type           text        not null,              -- 'b2b', 'revenge', 'milestone', 'history', ...
  name           text,
  team           text,
  opp            text,
  text           text        not null,              -- the sentence as shown at the lock
  numbers        jsonb,                              -- the counted numbers behind it
  rarity         real,                               -- 0-1, how unusual
  source         text,                               -- the fields / table it came from
  board_status   text,                               -- CALLED / ON THE BOARD / NOT ON THE BOARD at the lock
  board_score    real,
  frozen_at      timestamptz not null default now(),
  bar            text,                               -- which rule graded it ('hr', 'td', 'goal', 'milestone', 'productive', ...)
  outcome        text        check (outcome in ('hit', 'miss', 'void')),
  outcome_strong text        check (outcome_strong in ('hit', 'miss', 'void')),
  graded_at      timestamptz,
  primary key (sport, game_id, player_id, type)
);
create index if not exists storyline_log_day_idx on public.storyline_log (sport, day);
create index if not exists storyline_log_ungraded_idx on public.storyline_log (sport, day) where graded_at is null;

create table if not exists public.storyline_base_nights (
  sport       text    not null check (sport in ('mlb', 'nfl', 'nhl')),
  day         date    not null,
  bar         text    not null,                      -- 'productive', 'productive_strong', 'hr', 'td', 'goal', ...
  players     integer not null,                      -- everyone on the slate who played
  hits        integer not null,
  graded_at   timestamptz not null default now(),
  primary key (sport, day, bar)
);

alter table public.storyline_log enable row level security;
alter table public.storyline_base_nights enable row level security;
revoke all on table public.storyline_log from anon, authenticated;
revoke all on table public.storyline_base_nights from anon, authenticated;
