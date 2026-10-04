-- THE CORRECTIONS RECORD (2026-10-04, integrity audit F9). Model records are
-- never rewritten silently: when a written grade is wrong (a stale feed, a
-- grader bug), the fix is an UPDATE plus a row here -- which row, which
-- fields, the old and new values, why, and from what source. Public read,
-- like the records themselves; written by the service role only.
-- First use: RUN-IN-SUPABASE-2026-10-04-lamp-bufchi-regrade.sql (which also
-- creates this table, idempotently).
create table if not exists public.record_corrections (
  id            bigserial    primary key,
  sport         text         not null check (sport in ('mlb','nfl','nhl','nba')),
  table_name    text         not null,
  row_key       jsonb        not null,
  fields        text         not null,
  old_value     jsonb,
  new_value     jsonb,
  reason        text         not null,
  source        text,
  corrected_at  timestamptz  not null default now()
);
alter table public.record_corrections enable row level security;
drop policy if exists record_corrections_read on public.record_corrections;
create policy record_corrections_read on public.record_corrections for select using (true);
