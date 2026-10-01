-- 0c (2026-10-01): ON THE BOARD = top third of the night's board, MLB.
-- Stores each night's board size on its homer_feed rows (stats.board_of), from
-- that night's pregame board on the data branch (slate_<date>_slim.json, the
-- exact board the alerts ranked against). Nights without that file keep the
-- old label (rated = on the board). Only fills rows that don't have it yet.
-- PREVIEW first:  select day, count(*) from public.homer_feed where stats->>'board_of' is null group by day order by day;
begin;
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 161) where day = '2026-09-17' and (stats->>'board_of') is null;  -- 161 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 269) where day = '2026-09-18' and (stats->>'board_of') is null;  -- 269 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 269) where day = '2026-09-19' and (stats->>'board_of') is null;  -- 269 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 268) where day = '2026-09-20' and (stats->>'board_of') is null;  -- 268 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 52) where day = '2026-09-21' and (stats->>'board_of') is null;  -- 52 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 275) where day = '2026-09-22' and (stats->>'board_of') is null;  -- 275 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 275) where day = '2026-09-23' and (stats->>'board_of') is null;  -- 275 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 215) where day = '2026-09-24' and (stats->>'board_of') is null;  -- 215 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 282) where day = '2026-09-25' and (stats->>'board_of') is null;  -- 282 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 234) where day = '2026-09-26' and (stats->>'board_of') is null;  -- 234 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 269) where day = '2026-09-27' and (stats->>'board_of') is null;  -- 269 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 71) where day = '2026-09-29' and (stats->>'board_of') is null;  -- 71 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 72) where day = '2026-09-30' and (stats->>'board_of') is null;  -- 72 on the board
update public.homer_feed set stats = coalesce(stats, '{}'::jsonb) || jsonb_build_object('board_of', 71) where day = '2026-10-01' and (stats->>'board_of') is null;  -- 71 on the board
commit;
-- PROBE afterwards:  select day, max((stats->>'board_of')::int) as board_of, count(*) as homers from public.homer_feed where day >= '2026-09-17' group by day order by day;
