-- LAMP ANYTIME-GOAL DEVIG (2026-10-24). One row per player per snapshot: the book's
-- price against the feed's NO-VIG fair price, taken from the odds_snap rows the
-- odds tick already holds (no extra SGO object). Insert-only. A different way of
-- pricing is a new `method`, never an edit. Nothing is written at or after puck drop.
-- Stores fair_odds (American), never a printed probability (NHL/NBA rule).
--
-- SERVICE ROLE ONLY: RLS on, no policies, no grants to anon/authenticated.
-- Idempotent: safe to run twice.

create table if not exists public.lamp_atg_devig (
  event_id        text        not null,
  sgo_player_id   text        not null,
  snap            text        not null check (snap in ('list', 'lock')),
  method          text        not null default 'sgo-fair-v1',
  game_date       date        not null,
  starts_at       timestamptz not null,
  taken_at        timestamptz not null,
  player_name     text,
  team            text,
  our_player_id   text,                         -- NHL id; null = unmatched, never guessed
  fair_odds       integer     not null,         -- the feed's no-vig fair price (American)
  open_fair_odds  integer,                      -- the market's opening fair price
  best_book       text,
  best_odds       integer,
  best_ev_pct     numeric(6,2),                 -- EV of one unit at the best book vs the fair price
  books           jsonb       not null default '{}'::jsonb,   -- { book: { odds, ev_pct } }
  kalshi_ticker   text,                         -- only when exactly one market matched
  kalshi_yes_size numeric(12,2),   -- resting size on the YES side of Kalshi's book
  kalshi_no_size  numeric(12,2),
  kalshi_trusted  boolean,                      -- 500+ resting on BOTH sides (lib/odds/kalshi.js)
  primary key (event_id, sgo_player_id, snap, method),
  check (taken_at < starts_at)
);
create index if not exists lamp_atg_devig_day_idx on public.lamp_atg_devig (game_date, snap);
create index if not exists lamp_atg_devig_player_idx on public.lamp_atg_devig (our_player_id) where our_player_id is not null;

alter table public.lamp_atg_devig enable row level security;
revoke all on table public.lamp_atg_devig from anon, authenticated;
grant all on table public.lamp_atg_devig to service_role;

-- Probe (one row, rls = true):
--   select relname, relrowsecurity as rls from pg_class where relname = 'lamp_atg_devig';
