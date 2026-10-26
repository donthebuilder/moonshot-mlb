-- ============================================================================
-- DASH NETWORK -- DATABASE CHECKUPS, PLAIN ENGLISH                 2026-10-26
-- ============================================================================
-- Read-only questions you can ask the Supabase database any time, plus a
-- short list of things on hold at the bottom.
--
-- HOW TO USE
--   1. Supabase dashboard -> SQL Editor -> New query.
--   2. Copy ONE question (from its "-- C#" line to the semicolon). Paste. Run.
--   3. Compare the answer to the GOOD / BAD lines above it.
--   Nothing here changes data. (The lines in ON HOLD are all commented out.)
--
-- C1  Can the public key read anything paid?        C7  Slowest database calls
-- C2  How big is the database?                      C8  What can logged-out visitors call?
-- C3  Which tables take the most room?              C9  Is every table behind row-level security?
-- C4  Which tables are rewritten over and over?     C10 What can the public key read?
-- C5  Is there dead clutter?                        C11 Was anything written after a game started?
-- C6  Which indexes are never used?                 C12 Does the database match the migration files?
--
-- Some numbers (updates, call times) only ever go up. Read them as "write it
-- down, look again in a week, subtract."
-- The fixes that were made on 2026-10-26 are the three migrations
-- 202610261000, 202610261010 and 202610261020 in supabase/migrations.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- C1  Can the public key read anything paid?
-- GOOD: 0, 0 and 0.   BAD: any other number -> migration 202610261000 is not applied.
-- 10-26: 197, 19 and 9 before the fix; 0, 0 and 0 after (applied 10-26).
-- ----------------------------------------------------------------------------
drop table if exists pg_temp.check_result;
create temp table check_result (paid_writeups int, members_rows int, whyboard_posts int);
do $$
declare a int; b int; c int;
begin
  set local role anon;
  select count(*) into a from public.homer_feed_posts
   where kind like 'writeup%' and coalesce(payload->>'free','false') <> 'true';
  select count(*) into b from public.homer_feed_posts where kind ilike '%members%';
  select count(*) into c from public.homer_feed_posts where kind = 'nfl_whyboard';
  reset role;
  insert into pg_temp.check_result values (a, b, c);
end $$;
select paid_writeups, members_rows, whyboard_posts,
       (paid_writeups = 0 and members_rows = 0 and whyboard_posts = 0) as leak_closed
  from pg_temp.check_result;


-- ----------------------------------------------------------------------------
-- C2  How big is the database?
-- GOOD: a few hundred MB. It grows about 200 MB a month in season, so a jump
--       much faster than that is worth a look.
-- 10-26: about 392 MB.
-- ----------------------------------------------------------------------------
select pg_size_pretty(pg_database_size(current_database())) as database_size;


-- ----------------------------------------------------------------------------
-- C3  Which tables take the most room?
-- GOOD: the top ones are your history (shots, logs, odds). Nothing odd.
-- BAD: a table you didn't expect near the top, or one that doubled in a week.
-- 10-26: buckets_shots 55 MB, buckets_log 43, odds_snap 40, lamp_prop_log 38,
--        lamp_shots 30, hist_mlb 26, odds_lines 22, opening_players 21.
-- ----------------------------------------------------------------------------
select relname as table_name,
       pg_size_pretty(pg_total_relation_size(relid)) as total_size,
       n_live_tup as rows_stored
  from pg_stat_user_tables
 order by pg_total_relation_size(relid) desc
 limit 15;


-- ----------------------------------------------------------------------------
-- C4  Which tables are being rewritten over and over?  (wasted work)
-- Every update writes a new copy of the row, so a 760-row table updated 2
-- million times is doing millions of rewrites for nothing.
-- GOOD: after the NFL fix, these numbers stop growing between looks.
-- BAD: a number that keeps climbing on a small table.
-- 10-26: nfl_players 2.29M updates on 760 rows, nfl_player_week_stats 2.28M on
--        4,530. dash_lineup_state 1.5M on 198 and dash_user_state 139K on 39
--        are OLD totals: the 2026-10-03 change already stops them, and the
--        tables are tiny (80 kB / 1.3 MB).
-- 10-26 10:17 AM Phoenix, the NFL fix (202610261030) went in. These totals are
--        lifetime and never go down, so the sign it works is that they STOP
--        CLIMBING (a game day still adds real changes, but not a rewrite of
--        every row every run). Starting point for the next look:
--          nfl_players            2,294,249     nfl_player_week_stats   2,278,114
--          nfl_week_games            63,681
--        (about 150 of each are my own test runs, which were undone.)
-- ----------------------------------------------------------------------------
select relname as table_name,
       n_live_tup as rows_stored,
       n_tup_upd as times_updated,
       round(n_tup_upd::numeric / greatest(n_live_tup, 1)) as updates_per_row
  from pg_stat_user_tables
 where n_tup_upd > 50000 and n_tup_upd > 20 * greatest(n_live_tup, 1)
 order by n_tup_upd desc;


-- ----------------------------------------------------------------------------
-- C5  Is there dead clutter taking up room?
-- GOOD: no rows come back (or pct_dead under 20).
-- BAD: a table with a big dead_rows number and last_cleanup long ago.
-- 10-26: no rows.
-- ----------------------------------------------------------------------------
select relname as table_name, n_live_tup as live_rows, n_dead_tup as dead_rows,
       round(100.0 * n_dead_tup / greatest(n_live_tup + n_dead_tup, 1)) as pct_dead,
       last_autovacuum::date as last_cleanup
  from pg_stat_user_tables
 where n_dead_tup > 10000
 order by n_dead_tup desc;


-- ----------------------------------------------------------------------------
-- C6  Which indexes are never used?   (an index is a second copy of a column)
-- GOOD: a short list of tiny ones.
-- NOTE: "never used" can just mean "not used yet this season". Don't drop one
-- without asking (see ON HOLD, H1).
-- 10-26: opening_players_player_idx 3.4 MB; refresh_tokens_updated_at_idx is
--        Supabase's own, leave it.
-- ----------------------------------------------------------------------------
select s.relname as table_name, s.indexrelname as index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid)) as size,
       s.idx_scan as times_used
  from pg_stat_user_indexes s
  join pg_index i on i.indexrelid = s.indexrelid
 where s.idx_scan = 0 and not i.indisunique and not i.indisprimary
   and pg_relation_size(s.indexrelid) > 65536
 order by pg_relation_size(s.indexrelid) desc;


-- ----------------------------------------------------------------------------
-- C7  Which database calls take the most total time?
-- Most rows here are the site talking to the database through the API (they
-- start with "WITH pgrst_source"). The "calls" column is how often.
-- These are totals since the counters last reset, so they look old. To see
-- only what is happening now, run H2 (ON HOLD) once, then ask again in a day.
-- 10-26: the top item is the saved-state write (655K calls, 21 ms each, an old
--        burst: only 74 calls in the last 24 h). Then hist_nfl and hist_nhl reads.
-- ----------------------------------------------------------------------------
select left(regexp_replace(query, '\s+', ' ', 'g'), 80) as query,
       calls,
       round(total_exec_time::numeric / 1000) as total_seconds,
       round(mean_exec_time::numeric) as avg_ms,
       rows
  from pg_stat_statements
 order by total_exec_time desc
 limit 10;


-- ----------------------------------------------------------------------------
-- C8  Which database functions can a logged-out visitor call?
-- GOOD: exactly 9 rows:
--   card_calls_free_id, card_calls_revealed, fantasy_player_locked_now,
--   fantasy_player_taken, fantasy_trade_cap_error, handle_new_user,
--   is_fantasy_commissioner, is_fantasy_league_member, rls_auto_enable
-- 10-26: 43 rows before migration 202610261020; 9 after (applied 10-26).
-- ----------------------------------------------------------------------------
select p.oid::regprocedure::text as function_name
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
   and has_function_privilege('anon', p.oid, 'execute')
 order by 1;


-- ----------------------------------------------------------------------------
-- C9  Is every table protected by row-level security?
-- GOOD: no rows. BAD: any table name -> it is wide open to the public key.
-- 10-26: no rows.
-- ----------------------------------------------------------------------------
select c.relname as table_name, c.relrowsecurity as rls_on
  from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and not c.relrowsecurity
 order by 1;


-- ----------------------------------------------------------------------------
-- C10  What can the public key READ?   (every rule that lets a logged-out
--      visitor see rows)
-- Read the "visible_when" column. "true" means every row is public.
-- 10-26: 14 rules on 13 tables. The "true" ones are public receipts as far as
--        I can tell. One question for you, in ON HOLD H4: lamp_goal_log and
--        lamp_prop_log show picks to the public before they are graded.
-- ----------------------------------------------------------------------------
select tablename as table_name, policyname as rule, cmd,
       left(coalesce(qual, 'true'), 70) as visible_when
  from pg_policies
 where schemaname = 'public' and (roles && array['anon', 'public']::name[]) and cmd in ('SELECT', 'ALL')
 order by 1, 2;


-- ----------------------------------------------------------------------------
-- C11  Was anything written AFTER the game started?  (your lock rule)
-- GOOD: 0 on every row. BAD: any number above 0 -> tell me which table.
-- 10-26: 0, 0, 0.
-- ----------------------------------------------------------------------------
select 'lamp_goal_log' as table_name, count(*) as written_after_game_start from public.lamp_goal_log where locked_at >= start_utc
union all select 'lamp_prop_log', count(*) from public.lamp_prop_log where locked_at >= start_utc
union all select 'buckets_log',   count(*) from public.buckets_log   where locked_at >= start_utc;


-- ----------------------------------------------------------------------------
-- C12  Does the live database still match the repo's migration files?
-- It lists anything the repo says should exist but doesn't.
-- GOOD: only these 2 rows, both harmless (the indexes were renamed from
--   nba_line_calls_* to game_line_calls_*):
--     missing index  nba_line_calls_date_idx
--     missing index  nba_line_calls_open_idx
-- BAD: any function, table or column listed -> a migration was never run.
-- 10-26: 10 rows before the FRANCHISE playoffs migration (those 2 + 5 columns +
--   3 functions); 2 rows after (applied 10-26).
-- It only knows migrations up to 2026-10-24. After you add a new migration,
-- add its new names to the lists below.
-- ----------------------------------------------------------------------------
select 'missing function' as kind, n as name from unnest(array['add_fantasy_draft_queue','add_fantasy_free_agent','advance_all_fantasy_playoffs','advance_fantasy_playoffs_unchecked','buckets_blowout_minutes','buckets_defpos','buckets_defpos5','buckets_posvs','cancel_fantasy_trade','cancel_fantasy_waiver_claim','card_calls_free_id','card_calls_guard','card_calls_revealed','card_tracked_guard','comment_fantasy_feed_post','commissioner_assign_fantasy_pick','commissioner_replace_fantasy_pick','commissioner_roster_move','commissioner_roster_move_unchecked','correct_card','create_fantasy_feed_post','create_fantasy_league','dash_push_log_prune','dash_push_seen_prune','dash_state_put','delete_fantasy_league','drop_fantasy_player','fantasy_draft_ranking','fantasy_player_locked_now','fantasy_player_taken','fantasy_points_for_stats','fantasy_position_cap','fantasy_regular_standings','fantasy_required_starters','fantasy_trade_cap_error','game_line_calls_guard','generate_fantasy_schedule','generate_fantasy_weekly_content','handle_new_user','is_fantasy_commissioner','is_fantasy_league_member','issue_card','join_fantasy_league','lamp_goalie_giveups','lamp_goalie_zones','lamp_league_shot_grid','lamp_league_zones','lamp_zone_of','lock_fantasy_player_lineup','make_fantasy_draft_pick','opening_legs','opening_rows_mlb','prepare_fantasy_draft','process_all_fantasy_waivers','process_fantasy_waivers','process_fantasy_waivers_unchecked','propose_fantasy_trade','refresh_all_fantasy_matchup_scores','refresh_fantasy_matchup_scores','regenerate_fantasy_invite_code','remove_fantasy_draft_queue','reset_fantasy_draft','respond_fantasy_trade','review_fantasy_trade','run_expired_fantasy_auto_pick','set_fantasy_draft_state','set_fantasy_lineup_slot','set_fantasy_matchup_score','start_fantasy_draft','submit_fantasy_waiver_claim','sync_nfl_player_catalog','sync_nfl_week_feed','toggle_fantasy_feed_reaction','top_totals_calls_guard','update_fantasy_league_settings']) n
 where not exists (select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace and s.nspname='public' where p.proname=n)
union all
select 'missing table', n from unnest(array['board_lock','board_rank_snapshots','buckets_box','buckets_feed','buckets_games','buckets_log','buckets_quarters','buckets_shots','card_calls','card_issue_log','card_issues','card_tracked','dash_board_day','dash_flags','dash_lines','dash_lineup_state','dash_push_log','dash_push_seen','dash_push_subscriptions','dash_user_state','discord_sends','early_access_grants','early_access_invites','early_access_pending','fantasy_draft_picks','fantasy_draft_queue','fantasy_drafts','fantasy_feed_comments','fantasy_feed_posts','fantasy_feed_reactions','fantasy_league_memberships','fantasy_leagues','fantasy_lineup_slots','fantasy_matchups','fantasy_player_availability','fantasy_power_rankings','fantasy_roster_entries','fantasy_scoring_sync_runs','fantasy_teams','fantasy_trade_items','fantasy_trades','fantasy_transactions','fantasy_waiver_claims','fantasy_weekly_awards','fantasy_weekly_recaps','game_line_calls','growth_snapshots','hist_mlb','hist_mlb_post','hist_nfl','hist_nhl','homer_feed','homer_feed_posts','lamp_atg_devig','lamp_box','lamp_goal_feed','lamp_goal_games','lamp_goal_log','lamp_prop_log','lamp_shot_speed','lamp_shots','lamp_team_game_xg','mlb_first_log','multi_games','multi_gp','nfl_game_td_snapshots','nfl_player_week_stats','nfl_players','nfl_td_feed','nfl_week_games','numerology_lane_nights','numerology_log','numerology_numbers','odds_events','odds_game_lines','odds_game_totals','odds_lines','odds_snap','opening_games','opening_players','profiles','record_corrections','sim_convergence','site_members','storyline_base_nights','storyline_log','top_totals_calls']) n
 where not exists (select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace and s.nspname='public' where c.relname=n and c.relkind in ('r','p','v','m'))
union all
select 'missing index', n from unnest(array['board_lock_date_idx','board_rank_snapshots_recent','buckets_box_opp_idx','buckets_box_player_idx','buckets_log_date_idx','buckets_quarters_player_idx','buckets_shots_player_idx','buckets_shots_team_game_event','card_calls_card_idx','card_calls_open_idx','card_issues_player_idx','card_tracked_card_idx','card_tracked_open_idx','dash_lines_date_idx','dash_push_log_at','dash_push_log_user_at','dash_push_subs_user_idx','dash_user_state_user_idx','discord_sends_sent_at_idx','early_access_grants_feature_idx','early_access_invites_feature_idx','early_access_pending_feature_idx','fantasy_draft_picks_idx','fantasy_feed_comments_post_idx','fantasy_feed_posts_league_idx','fantasy_lineup_week_idx','fantasy_matchups_week_idx','fantasy_memberships_user_idx','fantasy_roster_team_idx','fantasy_scoring_sync_runs_started_idx','fantasy_teams_league_idx','fantasy_trade_items_trade_idx','fantasy_trades_league_idx','fantasy_transactions_league_idx','fantasy_waiver_pending_idx','game_line_calls_date_idx','game_line_calls_open_idx','hist_mlb_fr_idx','hist_mlb_hr_idx','hist_mlb_id_idx','hist_mlb_post_fr_idx','hist_nfl_fr_idx','hist_nhl_fr_idx','homer_feed_day_idx','homer_feed_mlbhr_owed_idx','lamp_atg_devig_day_idx','lamp_atg_devig_player_idx','lamp_box_opp_idx','lamp_box_player_idx','lamp_goal_feed_day_idx','lamp_goal_log_date_idx','lamp_goal_log_player_idx','lamp_prop_log_date_idx','lamp_prop_log_player_idx','lamp_shot_speed_date_idx','lamp_shots_date_idx','lamp_shots_goalie_idx','lamp_shots_player_idx','lamp_shots_team_idx','lamp_team_game_xg_team_idx','mlb_first_log_date','multi_games_day_idx','multi_games_player_idx','multi_games_season_idx','nba_line_calls_date_idx','nba_line_calls_open_idx','nfl_game_td_snapshots_week_idx','nfl_player_week_stats_lookup_idx','nfl_players_lookup_idx','nfl_td_feed_day_idx','nfl_week_games_lookup_idx','numerology_log_day_idx','numerology_log_lane_idx','numerology_numbers_day_idx','odds_events_day_idx','odds_events_start_idx','odds_game_lines_date_idx','odds_game_totals_date_idx','odds_lines_date_idx','odds_lines_player_idx','odds_snap_date_idx','odds_snap_player_idx','opening_games_team_idx','opening_players_player_idx','opening_players_team_idx','sim_convergence_ungraded_idx','site_members_source_idx','storyline_log_day_idx','storyline_log_ungraded_idx','top_totals_calls_open_idx','top_totals_calls_slate_idx']) n
 where not exists (select 1 from pg_indexes i where i.schemaname='public' and i.indexname=n)
union all
select 'missing column', t||'.'||c from unnest(array['buckets_box','buckets_box','buckets_box','card_calls','card_calls','dash_push_log','dash_push_subscriptions','fantasy_leagues','fantasy_leagues','fantasy_matchups','fantasy_matchups','fantasy_matchups','fantasy_teams','fantasy_teams','fantasy_teams','fantasy_teams','homer_feed','homer_feed','homer_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_feed','lamp_goal_games','lamp_goal_games','lamp_goal_games','lamp_goal_games','lamp_shots','nfl_td_feed','nfl_td_feed','nfl_td_feed','numerology_numbers','opening_games','opening_games','opening_games','opening_games','opening_games','opening_games','opening_players','opening_players','opening_players','opening_players','opening_players','site_members','site_members','site_members','site_members','site_members','site_members','top_totals_calls','top_totals_calls','top_totals_calls','top_totals_calls']) with ordinality a(t,i)
 join unnest(array['fga','pos5','tpa','market','window_games','detail','sports','playoff_start_week','playoff_teams','away_seed','home_seed','round','color','emblem','monogram','waiver_priority','mlbhr_post_id','mlbhr_reply_id','reply_post_id','clip_url','confirmed_at','correction_discord_at','correction_post_id','discord_sent','model_version','overturned_at','push_sent','x_post_id','goalies','starters','starters_actual','starters_source','miss_reason','jersey','reply_x_post_id','td_board','rebuilt','first_hit_pa','first_hit_player','first_hit_team','first_hr_pa','first_hr_player','first_hr_team','bat_order','p1_hr','p1_rbi','p1_runs','p1_tb','plan','source','status','synced_at','valid_until','whop_membership_id','book_books','book_event_id','book_line','book_taken_at']) with ordinality b(c,j) on i=j
 where not exists (select 1 from information_schema.columns k where k.table_schema='public' and k.table_name=t and k.column_name=c)
order by 1,2;


-- ############################################################################
-- ON HOLD  (do NOT run these yet. They are here so you can find them
--           later. Every line is commented out.)
-- ############################################################################


-- ----------------------------------------------------------------------------
-- H1  Drop 3 unused indexes.                       Saves about 4.5 MB. SKIP.
-- ----------------------------------------------------------------------------
-- Only opening_players_player_idx (3.4 MB) is big enough to matter, and the
-- openings pages may use it when next season starts. 4.5 MB is not worth the
-- risk. If you do it anyway, the three CREATE lines under it put them back.
--
-- drop index if exists public.opening_players_player_idx;
-- drop index if exists public.dash_user_state_user_idx;
-- drop index if exists public.fantasy_draft_picks_idx;
--
-- UNDO H1:
-- create index if not exists opening_players_player_idx on public.opening_players using btree (sport, player_id, game_date desc);
-- create index if not exists dash_user_state_user_idx   on public.dash_user_state   using btree (user_id);
-- create index if not exists fantasy_draft_picks_idx    on public.fantasy_draft_picks using btree (draft_id, overall_pick);


-- ----------------------------------------------------------------------------
-- H2  Reset the "slowest calls" counters (so C7 shows only what is happening
--     now instead of everything since the counters last reset).
-- ----------------------------------------------------------------------------
-- Safe, changes no data, nothing to undo. It only zeroes the statistics
-- counters. Run it once, then ask C7 again tomorrow.
--
-- select pg_stat_statements_reset();


-- ----------------------------------------------------------------------------
-- H3  DONE 2026-10-26 (supabase/migrations/202610261030_nfl_sync_only_if_changed_and_waiver_unique.sql)
-- ----------------------------------------------------------------------------
-- (a) NFL sync no longer rewrites rows that did not change. Tested by feeding
--     the functions rows identical to what is stored: before, 50 of 50
--     catalog rows, 20 of 20 games and 50 of 50 stat lines were rewritten;
--     after, 0 of each. One real change rewrites exactly 1 row.
-- (b) Waivers: "one pending claim per team per player" replaces "one claim per
--     team, player and status", and each league is processed on its own, so a
--     failure in one is a WARNING in the Postgres logs and the others go on.
-- To look at it again any time (every column should read as shown):
--   select (select indexdef from pg_indexes where indexname = 'fantasy_waiver_claims_one_pending') as new_rule,
--          (select count(*) from pg_constraint where conname = 'fantasy_waiver_claims_team_id_player_id_status_key') as old_rule_gone_if_0,
--          pg_get_functiondef('public.sync_nfl_player_catalog(jsonb)'::regprocedure) like '%is distinct from%' as catalog_guard,
--          pg_get_functiondef('public.sync_nfl_week_feed(jsonb,jsonb)'::regprocedure) like '%is distinct from%' as feed_guard;
--   -- new_rule shows a partial index "WHERE status = 'pending'", old_rule_gone_if_0 = 0, both guards true.
-- To see a skipped league after the fact: Supabase dashboard -> Logs -> Postgres,
--   search "process_all_fantasy_waivers: league".


-- ----------------------------------------------------------------------------
-- H4  A QUESTION, not SQL:  should picks be public BEFORE they are graded?
-- ----------------------------------------------------------------------------
-- Today the public key can read every row of lamp_goal_log and lamp_prop_log
-- the moment it is locked, graded or not. If that is what you want ("here is
-- what we locked before puck drop"), leave it. If you only want them public
-- after grading, tell me and I'll write the rule. No change until you say.


-- ----------------------------------------------------------------------------
-- H5  Do NOT add a "no writes after the game starts" trigger to the older
--     tables (lamp_goal_log, lamp_prop_log, buckets_log, numerology_log).
-- ----------------------------------------------------------------------------
-- Grading is an update-after-start on those same rows, so a simple trigger
-- would block grading. The lock is enforced in code today, and C11 shows
-- 0 violations. If you want a guard, it has to allow the grade columns and
-- refuse changes to the pick columns. I'd design it per table.
