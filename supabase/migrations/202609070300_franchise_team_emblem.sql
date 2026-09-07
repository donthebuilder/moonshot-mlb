-- FRANCHISE — teams can pick an emblem, not just a colour and initials.
--
-- Donovan: "give a few logos and colors for people to pick from for their
-- teams." The colours shipped on 2026-08-29 with fantasy_teams.color; this is
-- the mark that goes with them.
--
-- A SLUG, NOT THE ART. The column stores 'bolt', and the eight paths live in
-- components/fantasy/emblems.js. Redrawing one later is a code change rather
-- than a data migration, and the check constraint below names the same eight
-- so a value the app cannot draw cannot be written by going around the form.
--
-- Nullable, like color and monogram: a team that picks nothing keeps the
-- initials it already had. Nothing about this column is required for any screen
-- to work, which is what makes it safe to add mid-season.
--
-- Additive and idempotent. No data is touched.

alter table public.fantasy_teams
  add column if not exists emblem text
    check (emblem is null or emblem in
      ('bolt','flame','shield','star','skull','crown','anchor','horns'));

comment on column public.fantasy_teams.emblem is
  'Owner-picked emblem slug, drawn by components/fantasy/emblems.js. Null = monogram.';
