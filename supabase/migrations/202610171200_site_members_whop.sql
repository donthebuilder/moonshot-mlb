-- SITE MEMBERS x WHOP (2026-10-17): lets paying Whop members become members automatically (lib/members/whop.js, app/api/whop/webhook).
-- RUN THIS BEFORE the code ships. Idempotent. Hand-run in the Supabase SQL editor.
-- source = 'whop' marks rows the Whop sync owns; the daily reconcile only ever removes those. Hand-added rows keep source null and are never touched.
alter table public.site_members add column if not exists source text;
alter table public.site_members add column if not exists whop_membership_id text;
alter table public.site_members add column if not exists plan text;
alter table public.site_members add column if not exists status text;
alter table public.site_members add column if not exists valid_until timestamptz;
alter table public.site_members add column if not exists synced_at timestamptz;
create index if not exists site_members_source_idx on public.site_members (source);
-- probe: select source, count(*) from public.site_members group by 1;
