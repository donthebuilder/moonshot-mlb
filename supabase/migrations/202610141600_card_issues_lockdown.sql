-- CARD ISSUANCE LOCKDOWN (2026-10-14). The first probe showed the anon key could call issue_card (Supabase grants EXECUTE on public functions to anon by
-- default and the migration's revoke did not remove it). Revoke every signature of issue_card / correct_card from public, anon and authenticated, and grant
-- the service role only. Safe to run twice.
do $$
declare r record;
begin
  for r in select oid::regprocedure as sig from pg_proc where proname in ('issue_card', 'correct_card') and pronamespace = 'public'::regnamespace loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;
-- probe (from outside): the anon key must be refused on issue_card (scripts/probe-card-issues.mjs, first check), and the service role must still issue.
