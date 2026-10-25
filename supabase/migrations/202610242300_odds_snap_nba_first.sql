-- BUCKETS' FIRST-BASKET PRICES IN odds_snap (2026-10-24). The 09-26 table only took markets hr / td / goal, so NBA's
-- first-basket rows were refused (odds_snap_market_check) and, until lib/odds/snap.js stopped sending them, that failure
-- also blocked NBA's lock stamp and over/under lines. This widens the market check; then set MARKETS.NBA.stored = true.
-- Additive and idempotent: the old values stay allowed.
-- PROBE: select pg_get_constraintdef(oid) from pg_constraint where conname = 'odds_snap_market_check';
alter table public.odds_snap drop constraint if exists odds_snap_market_check;
alter table public.odds_snap add constraint odds_snap_market_check check (market in ('hr', 'td', 'goal', 'first'));
