-- NFL TD FEED — every touchdown, live, and whether the bot had him.
--
-- 2026-09-13. Donovan: "tuddy tweets should fire after every touchdown too."
-- The NFL sibling of homer_feed (202609050001_homer_feed.sql) — same shape,
-- same reasoning, adapted for the one real difference: MLB's board already
-- carries a stable player_id per row, so (day, player_id, hr_n) is a natural
-- key. ESPN's scoring-play feed carries no player id at all (see
-- lib/nfl/tdFeed.js's own header) — what IS stable, because ESPN's
-- scoringPlays array is append-only per game, is (day, game_id, td_n): the
-- Nth touchdown of any kind seen in that game so far, in the order ESPN
-- lists them. td_n is derived by the poster (count of touchdown-type plays
-- already claimed for that game_id, +1), not by ESPN.
--
-- THE PRIMARY KEY IS THE CLAIM, same as homer_feed: insert with
-- ON CONFLICT DO NOTHING, so two overlapping cron runs cannot both decide
-- the same touchdown is theirs to post.
--
-- td_n CORRECTION (2026-09-13, wiring the actual poster): NOT a running
-- count of rows already claimed in this table -- that needs an extra read
-- and can drift under a race. Recomputed FRESH every tick instead, straight
-- from the live snapshot: group that game's touchdown-type plays (ESPN's
-- own scoringPlays list, which is append-only per game) and number them by
-- POSITION, 1st/2nd/3rd seen so far. Same shape as homer_feed's own
-- homersFrom() -- rebuild the WHOLE current view every tick and let the
-- upsert's ON CONFLICT DO NOTHING decide what's actually new -- so two
-- overlapping runs still cannot double-claim the same score.
--
-- gsis_id IS NULLABLE. A scorer whose name didn't resolve to exactly one
-- nfl_roster.json row (see lib/nfl/tdFeed.js::matchRoster) still gets a
-- post — the live play text always stands on its own — just with no
-- season-log/picks-ladder/defense enrichment attached. NULL here means "no
-- confident match," never "resolution not attempted."

create table if not exists public.nfl_td_feed (
  day           date        not null,
  game_id       text        not null,
  td_n          smallint    not null default 1,
  team          text        not null,
  opponent      text,
  quarter       smallint,
  clock         text,
  away_score    smallint,
  home_score    smallint,
  text          text        not null,           -- ESPN's own scoring-play text, verbatim
  kind          text,                            -- 'pass' | 'rush' | 'interception return' | ... | null (unparsed)
  kind_word     text,                            -- 'PASS TD', 'RUSH TD', ... — what the card/tweet actually shows
  yards         smallint,                        -- parsed from `text`; null when parsePlayText() didn't match
  passer_name   text,                             -- parsed from `text` on a pass TD only, else null
  scorer_name   text,                             -- as ESPN wrote it (parsed from `text`), never fabricated
  gsis_id       text,                             -- nflverse id, only on a confident roster match — see note above
  position      text,
  -- Season-to-date (entering this game) and on-the-bot standing, both
  -- computed once when the touchdown is first seen — same "the post says
  -- what it said" rule as homer_feed.stats: a later data rebuild must never
  -- change what a month-old card claims.
  season_to_date jsonb,
  on_bot        jsonb,
  -- THE DEFENSE (2026-09-13, "fill those cards up") -- lib/nfl/dvpSignal.js's
  -- own matchupTag(), same TARGET/AVOID/EVEN tag the Games/Matchups pages
  -- already show pregame, applied after the fact to the defense he scored
  -- on. Null when the roster join or the role lookup came up empty, same
  -- discipline as on_bot above.
  defense       jsonb,
  x_post_id     text,
  discord_sent  boolean     not null default false,
  seen_at       timestamptz not null default now(),
  primary key (day, game_id, td_n)
);

create index if not exists nfl_td_feed_day_idx on public.nfl_td_feed (day desc);

-- Public by design, same policy as homer_feed: this is the record the site
-- is inviting people to check. Reads are open; every write goes through the
-- service role.
alter table public.nfl_td_feed enable row level security;
drop policy if exists nfl_td_feed_read_all on public.nfl_td_feed;
create policy nfl_td_feed_read_all on public.nfl_td_feed for select using (true);
