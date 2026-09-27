-- 202609280300_hist_mlb_post.sql -- POSTSEASON HISTORY (HISTORY WATCH 2 step 4)
--
-- hist_mlb holds regular seasons only, so from Tue 09-29 (Wild Card) every
-- season rung is out of reach. This is the postseason twin: SABR Lahman
-- BattingPost (1884-2025), one row per player-season-TEAM with every round
-- summed (rounds lists them, e.g. 'ALWC,ALDS'). The 2026 postseason itself is
-- read live from MLB StatsAPI at claim time, never stored here.
-- Claims it answers (lib/history/mlbPost.js):
--   * a club's postseason homer drought ("first Tigers postseason HR since ...")
--   * one HR from the club's single-postseason HR record
--   * one HR from the club's career postseason HR record
-- Credit wherever a claim shows: "Data: SABR Lahman Baseball Database".
--
-- SERVICE ROLE ONLY: RLS on, no policies, no anon/authenticated grants
-- (same as hist_mlb). Idempotent: safe to run twice.

create table if not exists public.hist_mlb_post (
  season      smallint not null,
  source_id   text     not null,          -- Lahman playerID
  team        text     not null,          -- Lahman teamID
  franchise   text,                       -- Lahman franchID (lineage: MON->WSN, FLA->MIA ...)
  name        text     not null,
  rounds      text,                       -- comma-separated Lahman rounds, in order played
  g smallint, ab smallint, h smallint, d2b smallint, hr smallint, rbi smallint, sb smallint, tb smallint,
  built_at    timestamptz not null default now(),
  primary key (season, source_id, team)
);
create index if not exists hist_mlb_post_fr_idx on public.hist_mlb_post (franchise, season);

alter table public.hist_mlb_post enable row level security;
revoke all on public.hist_mlb_post from anon, authenticated;
