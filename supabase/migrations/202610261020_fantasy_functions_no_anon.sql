-- LOGGED-OUT VISITORS COULD CALL 34 FRANCHISE FUNCTIONS (2026-10-26, Supabase audit). 43 SECURITY DEFINER functions in public were
-- executable by the anon role (Supabase's default privileges grant EXECUTE to anon, authenticated and service_role directly, so
-- "revoke ... from public" alone leaves anon in -- same cause as 202609242000). Each write function checks auth.uid() inside, so no
-- abuse was found; this removes the door. Signed-in users and the service key keep EXECUTE, which is every caller in the repo
-- (server actions use the user's session; app/api/fantasy/draft-tick and scoring use the service key). No policy, view, default or
-- trigger uses any of the 34 (checked in pg_policies, pg_views, pg_attrdef, pg_trigger).
-- KEPT OPEN ON PURPOSE (9): card_calls_free_id, card_calls_revealed (public receipts); is_fantasy_commissioner, is_fantasy_league_member,
-- fantasy_player_locked_now, fantasy_player_taken, fantasy_trade_cap_error (rules call them); handle_new_user, rls_auto_enable (triggers).
-- ALSO CLOSED HERE: fantasy_regular_standings (added by 202609241200). That migration revokes only from public, so anon could still
-- read any league's standings. Now signed-in + service only. (Open item: it still has no membership check, so any signed-in user
-- can read any league -- KNOWN-ISSUES.)
-- RUN: applied live 2026-10-26 (by Claude, Donovan's go-ahead). Idempotent; skips a function that is not on the database.
-- PROBE: select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
--          and has_function_privilege('anon', p.oid, 'execute');      -- 9
-- UNDO: loop the same list with  grant execute on function <f> to public, anon;
do $$
declare
  f text;
  done int := 0;
begin
  foreach f in array array[
    'public.add_fantasy_draft_queue(uuid,uuid)',
    'public.add_fantasy_free_agent(uuid,uuid,uuid)',
    'public.cancel_fantasy_trade(uuid)',
    'public.cancel_fantasy_waiver_claim(uuid)',
    'public.comment_fantasy_feed_post(uuid,text)',
    'public.commissioner_assign_fantasy_pick(uuid,integer,uuid)',
    'public.commissioner_replace_fantasy_pick(uuid,integer,uuid)',
    'public.commissioner_roster_move(uuid,uuid,uuid,uuid)',
    'public.create_fantasy_feed_post(uuid,text)',
    'public.create_fantasy_league(text,text,jsonb)',
    'public.delete_fantasy_league(uuid,text)',
    'public.drop_fantasy_player(uuid,uuid)',
    'public.fantasy_draft_ranking(uuid,uuid)',
    'public.fantasy_regular_standings(uuid,smallint)',
    'public.generate_fantasy_schedule(uuid,smallint,smallint)',
    'public.generate_fantasy_weekly_content(uuid,smallint,smallint)',
    'public.join_fantasy_league(text,text)',
    'public.make_fantasy_draft_pick(uuid,uuid)',
    'public.prepare_fantasy_draft(uuid,uuid[],smallint)',
    'public.process_fantasy_waivers(uuid)',
    'public.propose_fantasy_trade(uuid,uuid,uuid[],uuid[],text)',
    'public.refresh_fantasy_matchup_scores(uuid,smallint,smallint)',
    'public.regenerate_fantasy_invite_code(uuid)',
    'public.remove_fantasy_draft_queue(uuid,uuid)',
    'public.reset_fantasy_draft(uuid,text)',
    'public.respond_fantasy_trade(uuid,text)',
    'public.review_fantasy_trade(uuid,text,text)',
    'public.run_expired_fantasy_auto_pick(uuid)',
    'public.set_fantasy_draft_state(uuid,text)',
    'public.set_fantasy_lineup_slot(uuid,smallint,smallint,text,smallint,uuid)',
    'public.set_fantasy_matchup_score(uuid,numeric,numeric,text)',
    'public.start_fantasy_draft(uuid)',
    'public.submit_fantasy_waiver_claim(uuid,uuid,uuid)',
    'public.toggle_fantasy_feed_reaction(uuid,text)',
    'public.update_fantasy_league_settings(uuid,jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated, service_role', f);
      done := done + 1;
    end if;
  end loop;
  raise notice 'locked % functions against logged-out visitors', done;
end $$;
