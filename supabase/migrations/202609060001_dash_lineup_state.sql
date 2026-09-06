-- THE DROP-OUT'S MEMORY.
--
-- callup (this same pass) proved a NEW arrival by keying off dash_push_seen's
-- own "have we ever told you about this" ledger -- a pure key-SET, no value
-- column, reused for free. A drop-out cannot be proved the same way: to know
-- a followed man is missing from tonight's card, something has to already
-- know which TEAM he plays for, so it knows which of tonight's games to
-- check him against. dash_push_seen has nowhere to put that. This table does.
--
-- ONE ROW PER FOLLOWED PLAYER, not per event. lib/dash/pushRules.js's
-- lineupUpdatesFrom() overwrites a man's row every time he appears in a
-- posted lineup, so it always holds his MOST RECENT team and the day he was
-- last seen starting -- which is exactly the fact a drop-out check needs and
-- the only fact it needs. It is not an events table and is never queried for
-- history.
--
-- SERVICE-ROLE ONLY, same as dash_push_seen and for the same reason: this is
-- the sender's own memory, not the user's data, and there is nothing here
-- for a browser to read directly.
--
-- SIZE IS SELF-LIMITING. A row exists only for a player who has ever both
-- (a) been followed and (b) started a posted lineup, so this table can never
-- grow past "how many hitters has this account ever followed" -- no prune
-- job, unlike dash_push_seen's rolling two-day window of one-off events.

create table if not exists public.dash_lineup_state (
  player_id text primary key,
  team_id integer,
  name text,
  last_seen_day text not null,
  updated_at timestamptz not null default now()
);

alter table public.dash_lineup_state enable row level security;
