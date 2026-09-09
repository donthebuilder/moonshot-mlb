-- HOMER FEED — every home run tonight, and whether the bot had him.
--
-- 2026-09-05. Donovan: "its just our version of a hr tracker or like the same
-- tracker we have for our notifications." The push sender already sees every
-- homer in the league within about twenty seconds (app/api/dash/push/tick) and
-- throws away every one nobody follows. This table keeps them all, with the
-- bot's designation stapled on, so two things can read the same record:
--
--   · the public X / Discord bot (app/api/dash/homers/tick) — one post per
--     homer, "⭐ he was on the bot" or not;
--   · the public /called page — tonight's list and a ten-day capture rate.
--
-- ONE ROW PER HOME RUN, NOT PER PLAYER. (day, player_id, hr_n) is the key, so
-- a second homer by the same man tonight is its own row and its own post —
-- the same rule the push sender's `hr:2` key follows.
--
-- THE PRIMARY KEY IS THE CLAIM. Insert with ON CONFLICT DO NOTHING; the rows
-- that stick are the new homers, and two overlapping cron runs cannot both
-- decide the same one is theirs. No lock, no clock, same shape as
-- dash_push_seen.
--
-- THE ROLE IS WHAT THE BOARD SAID BEFORE THE BALL LEFT. `role` is copied from
-- the published slate at the moment the homer is first seen and never
-- re-graded, so a later slate rebuild can never quietly turn a miss into a
-- hit (the dropped_locked_rows lesson, 2026-08-22, in the other direction).

create table if not exists public.homer_feed (
  day           date        not null,
  player_id     text        not null,
  hr_n          smallint    not null default 1,
  name          text        not null,
  team          text,
  opponent      text,
  game_pk       text,
  inning        text,                      -- "bot 7th", as a person says it
  home          boolean     not null default false,   -- so "TOR @ KC" reads the right way round
  -- The bot's designation on the published board when the homer was seen.
  -- NULL = not on the board at all. '' never happens: an on-board man with no
  -- designation is stored as role NULL, on_board true.
  role          text,
  on_board      boolean     not null default false,
  hr_score      numeric(7,3),
  board_rank    integer,                   -- 1 = top of the board by hr_score
  -- The HR price when the homer was seen, from odds_latest.json's best_over /
  -- best_book (Fanatics or DraftKings tonight). Both or neither: a price
  -- without a book is never stored or shown.
  odds_over     integer,
  odds_book     text,
  -- The board row's bat/arm numbers as the card prints them (lib/dash/homerFeed
  -- statsFrom) plus his jersey, and the hook lines (same-day partner,
  -- back-to-back, the bot's record on him, numerology) — all computed when
  -- the homer was first seen so a re-rendered card a month later says what
  -- the post said.
  stats         jsonb,
  hooks         jsonb       not null default '[]'::jsonb,
  -- His most frequent same-day partner (pair_history_summary), so a later
  -- homer by that man tonight can say "pair complete".
  partner_id    text,
  -- Where it went, so a failed post can be retried and a sent one never
  -- duplicated. NULL = not sent (yet).
  x_post_id     text,
  discord_sent  boolean     not null default false,
  seen_at       timestamptz not null default now(),
  primary key (day, player_id, hr_n)
);

create index if not exists homer_feed_day_idx on public.homer_feed (day desc);

-- Public by design: this is the record the site is inviting people to check.
-- Reads are open; every write goes through the service role.
alter table public.homer_feed enable row level security;
drop policy if exists homer_feed_read_all on public.homer_feed;
create policy homer_feed_read_all on public.homer_feed for select using (true);

-- THE ACCOUNT'S OWN POSTS that are not a home run: the pregame call (the
-- proof that the ⭐ was public before first pitch — every called homer quotes
-- it), the nightly recap, the Sunday week. One row per (day, kind); the
-- primary key is the claim, same as everything else here. `payload` keeps
-- what was said (the pregame pick list, the week's numbers) so a quote or a
-- re-render never depends on a file that has since been rebuilt.
create table if not exists public.homer_feed_posts (
  day           date        not null,
  kind          text        not null check (kind in ('pregame', 'recap', 'weekly')),
  x_post_id     text,
  discord_sent  boolean     not null default false,
  payload       jsonb       not null default '{}'::jsonb,
  seen_at       timestamptz not null default now(),
  primary key (day, kind)
);
alter table public.homer_feed_posts enable row level security;
drop policy if exists homer_feed_posts_read_all on public.homer_feed_posts;
create policy homer_feed_posts_read_all on public.homer_feed_posts for select using (true);
