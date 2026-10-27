-- SECURITY HARDENING (2026-10-26 security check, .claude-notes/SECURITY-CHECK-2026-10-26.md). Safe to re-run.
--
-- 1. Two internal functions were callable by anyone over the API (/rest/v1/rpc/...). They only ever run as a trigger:
--    handle_new_user (on auth.users insert) and rls_auto_enable (the ensure_rls event trigger). A trigger fires without EXECUTE,
--    so revoking it from the API roles changes nothing for the site.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 2. Saved state (dash_user_state): a signed-in account could store unlimited keys (128 KB each), straight through the table or
--    dash_state_put. Cap: 50 keys per account, key at most 64 characters (the busiest account had 8 on 2026-10-26). Updating an existing
--    key is always allowed.
create or replace function public.dash_user_state_limits()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.key is null or length(new.key) = 0 or length(new.key) > 64 then
    raise exception 'saved state: key must be 1-64 characters';
  end if;
  if (select count(*) from public.dash_user_state s where s.user_id = new.user_id and s.key <> new.key) >= 50 then
    raise exception 'saved state: at most 50 keys per account';
  end if;
  return new;
end;
$$;
revoke execute on function public.dash_user_state_limits() from public, anon, authenticated;
drop trigger if exists dash_user_state_limits on public.dash_user_state;
create trigger dash_user_state_limits before insert on public.dash_user_state
  for each row execute function public.dash_user_state_limits();
