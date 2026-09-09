-- SIM CONVERGENCE — does the game simulator know anything hr_score doesn't?
--
-- 2026-09-03. `components/GameSimPanel.js` shows, per hitter, the simulator's
-- homer probability beside his `hr_score`. They are built from genuinely
-- different mechanisms — nine innings of simulated plate appearances against a
-- weighted blend of signals — so where they agree is worth more than either
-- alone. That is the claim the panel makes.
--
-- Nothing was checking it. The two numbers were shown side by side and then
-- thrown away, so after a month of looking at them nobody would be able to say
-- which one had been right. This table is the receipt.
--
-- WHY A REAL TABLE AND NOT dash_user_state. That store is key/value, own-row,
-- and about a PERSON. This is about a NIGHT, it is the same for everybody, and
-- the whole point is to query across it later ("bucket by sim probability,
-- show the actual homer rate in each bucket"). A blob keyed by user could not
-- answer that question, which is the only question it exists for.
--
-- THE HOUSE RULE THIS SERVES. No score earns weight before its outcome column
-- is graded and trustworthy — the rule the doubles model was killed by on
-- 2026-09-03. The simulator is under exactly the same rule, and this is how it
-- gets its graded nights instead of an opinion.

create table if not exists public.sim_convergence (
  day           date        not null,
  player_id     text        not null,
  name          text,
  team          text,
  game_pk       text,
  -- The simulator's probability that this man homers, 0-1, over the run whose
  -- size is recorded beside it. Stored as the probability rather than a rank
  -- so it can be bucketed absolutely — a rank tells you the order and not
  -- whether the number was ever calibrated.
  sim_hr_prob   numeric(6,5) not null check (sim_hr_prob >= 0 and sim_hr_prob <= 1),
  sim_runs      integer     not null default 0,
  -- The other read, as published that night. Nullable: a man can be on the
  -- board without a score, and recording him with a zero would be a claim.
  hr_score      numeric(7,3),
  -- Filled by the grader on a later run, from graded_results_<day>.json.
  -- NULL means not yet graded, never "did not homer" — the difference matters
  -- for every rate this table will ever be asked for.
  actual_hr     integer,
  graded_at     timestamptz,
  created_at    timestamptz not null default now(),
  primary key (day, player_id)
);

-- The two queries this exists to answer: "grade yesterday" and "bucket the
-- season". Both lead with the day.
create index if not exists sim_convergence_ungraded_idx
  on public.sim_convergence (day)
  where actual_hr is null;

alter table public.sim_convergence enable row level security;

-- No policies, deliberately. Nothing in the browser reads or writes this —
-- only the cron route does, with the service-role key, which bypasses RLS.
-- An empty policy set is therefore the correct and tightest configuration,
-- and it is stated here so a future reader does not "fix" it by adding one.

comment on table public.sim_convergence is
  'Nightly record of the game simulator''s HR probability beside hr_score, graded against the real outcome. Written only by /api/dash/sim-log.';
