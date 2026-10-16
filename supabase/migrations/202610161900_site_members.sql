-- SITE MEMBERS (2026-10-16): who may see the full called picks (lib/members/access.js). One row per paying member's EMAIL (lower case).
-- Add a member in the Supabase table editor the minute they pay; no redeploy. Service-only: RLS on, no public policy, so the list is
-- never readable from the browser. MEMBER_EMAILS (Vercel env) still works as a fallback. Idempotent. Hand-run in the SQL editor.
create table if not exists public.site_members (
  email     text        primary key check (email = lower(email)),
  note      text,                                   -- 'whop', 'friend', ...
  added_at  timestamptz not null default now()
);
alter table public.site_members enable row level security;
