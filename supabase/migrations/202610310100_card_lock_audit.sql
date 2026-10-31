-- THE LOCK AUDIT (2026-10-31, lib/card/lockAudit.js): why a man was or was not picked, saved at the lock. Insert-only; the picker never reads it.
-- Until it runs the writer swallows the error and the lock is unaffected. RUN BEFORE THE CODE THAT WRITES IT SHIPS (or after: both are safe).
create table if not exists public.card_lock_audit (
  sport          text        not null,
  card_date      date        not null,
  slate_key      text        not null default '',
  model_version  text        not null,
  created_at     timestamptz not null default now(),
  window_games   integer,
  plays          jsonb       not null default '{}'::jsonb,   -- { straights, twoMan, picked: [{ product, slot, market, player_id, name, rule }] }
  audit          jsonb       not null default '[]'::jsonb,   -- [{ slot, market, eligible, shown, ranked: [{ rank, player_id, name, score, line, price, verdict }] }]
  skipped        jsonb       not null default '[]'::jsonb,   -- [{ slot, market, reason }]
  note           text,
  primary key (sport, card_date, slate_key, model_version)
);
create index if not exists card_lock_audit_day_idx on public.card_lock_audit (card_date, sport);
alter table public.card_lock_audit enable row level security;
revoke all on table public.card_lock_audit from anon, authenticated;
-- PROBE (expect one row, zero rows in the table):
--   select (select count(*) from information_schema.tables where table_name = 'card_lock_audit') as has_table, (select count(*) from public.card_lock_audit) as rows;
-- UNDO: drop table public.card_lock_audit;
