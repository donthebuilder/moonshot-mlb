-- PIN THE SEARCH PATH ON 12 HELPER FUNCTIONS (2026-10-26, Supabase advisor "function_search_path_mutable"). These looked up table names
-- through the caller's search_path. Pinned to public, pg_temp so a caller cannot redirect them to a look-alike table. All 12 read
-- before pinning: none touches another schema (auth, extensions, vault ...), so behaviour is unchanged; four of them are the guard
-- triggers on card_calls, card_tracked, game_line_calls and top_totals_calls.
-- RUN: applied live 2026-10-26 (by Claude, Donovan's go-ahead). Idempotent.
-- PROBE: select p.oid::regprocedure, p.proconfig from pg_proc p where p.pronamespace = 'public'::regnamespace
--          and p.proname in ('buckets_blowout_minutes','buckets_defpos','buckets_defpos5','buckets_posvs','card_calls_guard',
--          'card_tracked_guard','fantasy_position_cap','fantasy_required_starters','game_line_calls_guard','lamp_zone_of',
--          'opening_legs','top_totals_calls_guard');   -- 12 rows, each {"search_path=public, pg_temp"}
-- UNDO: alter function <name>(<args>) reset search_path;   for each of the 12.
alter function public.buckets_blowout_minutes(p_players text[], p_seasons integer[], p_margin integer) set search_path = public, pg_temp;
alter function public.buckets_defpos(p_season integer) set search_path = public, pg_temp;
alter function public.buckets_defpos5(p_season integer) set search_path = public, pg_temp;
alter function public.buckets_posvs(p_season integer, p_opp text, p_pos text) set search_path = public, pg_temp;
alter function public.card_calls_guard() set search_path = public, pg_temp;
alter function public.card_tracked_guard() set search_path = public, pg_temp;
alter function public.fantasy_position_cap(p_position text) set search_path = public, pg_temp;
alter function public.fantasy_required_starters(p_league_id uuid) set search_path = public, pg_temp;
alter function public.game_line_calls_guard() set search_path = public, pg_temp;
alter function public.lamp_zone_of(nx double precision, ny double precision) set search_path = public, pg_temp;
alter function public.opening_legs(p_sport text, p_seasons integer[], p_teams text[]) set search_path = public, pg_temp;
alter function public.top_totals_calls_guard() set search_path = public, pg_temp;
