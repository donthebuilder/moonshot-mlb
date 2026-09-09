-- FRANCHISE — team identity (2026-08-29).
--
-- Owners pick their own color and monogram (Donovan's call in the 08-29
-- UI/UX pass; the C4 "de-bland" item from the master plan). Both nullable:
-- a team that never picks renders with a deterministic fallback hashed from
-- its id (components/fantasy/teamIdentity.js), so nothing here is required
-- for any screen to work.
--
-- Writes go through the existing "owners update teams" RLS policy — an owner
-- can already update their own fantasy_teams row and nobody else's, which is
-- exactly the audience for these two columns.
--
-- ORDER OF OPERATIONS: run this BEFORE deploying the matching site build.
-- The columns are additive, so the current build ignores them; the new build
-- selects them (via the existing select('*') calls) and saves them.

alter table public.fantasy_teams
  add column if not exists color text
    check (color is null or color ~* '^#[0-9a-f]{6}$'),
  add column if not exists monogram text
    check (monogram is null or (monogram ~ '^[0-9A-Z]{1,3}$'));

comment on column public.fantasy_teams.color is
  'Owner-picked team color (#rrggbb). Null = deterministic fallback in the UI.';
comment on column public.fantasy_teams.monogram is
  'Owner-picked 1-3 character monogram (A-Z, 0-9). Null = initials fallback.';
