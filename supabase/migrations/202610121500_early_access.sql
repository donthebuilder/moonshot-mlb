-- EARLY ACCESS (2026-10-12, Donovan: "give me something to give early access to people I want for BUCKETS or any feature I want to add like that").
--
-- Two PRIVATE tables. The site reads and writes them ONLY from server routes with the service-role key (it bypasses RLS). RLS is on with NO policies and
-- the anon / authenticated roles have every privilege taken away, so the browser keys can neither read nor write a single row. A user learns their own
-- grants only through /api/early-access/mine (feature keys, nothing else).
--
--   early_access_invites   one row per invite link. The plain code is NEVER stored: code_hash = sha256(code) in hex, plus the last 4 characters for the admin list.
--                          So a read of this table cannot reveal a working link. The code is 32 base32 characters (160 bits).
--   early_access_grants    one row per (account, feature): the account may use that gated feature (lib/features.js) while the row is active
--                          (revoked_at null and expires_at null or in the future). invite_id says which invite produced it (the admin list shows who redeemed).
--
-- Until this is run every early-access path degrades safely: access checks answer "no grant" (BUCKETS stays exactly as it is for non-admins), the admin card
-- says to run the update and stores nothing, and /early/<code> shows its one generic message.
-- Idempotent: safe to run twice. RUN IT BEFORE THE CODE THAT NEEDS IT. No `set role`.

create table if not exists public.early_access_invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   text not null,
  code_tail   text not null,
  feature     text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid null,
  expires_at  timestamptz null,
  max_uses    integer not null default 1,
  uses        integer not null default 0,
  note        text null,
  revoked_at  timestamptz null
);

create table if not exists public.early_access_grants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  feature     text not null,
  granted_at  timestamptz not null default now(),
  granted_by  uuid null,
  expires_at  timestamptz null,
  revoked_at  timestamptz null,
  note        text null,
  invite_id   uuid null
);

-- constraints, each added only when missing
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'early_access_invites_code_hash_key') then
    alter table public.early_access_invites add constraint early_access_invites_code_hash_key unique (code_hash);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_invites_code_hash_shape') then
    alter table public.early_access_invites add constraint early_access_invites_code_hash_shape check (code_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_invites_code_tail_shape') then
    alter table public.early_access_invites add constraint early_access_invites_code_tail_shape check (char_length(code_tail) = 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_invites_feature_shape') then
    alter table public.early_access_invites add constraint early_access_invites_feature_shape check (feature ~ '^[a-z][a-z0-9_]{0,39}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_invites_uses_range') then
    alter table public.early_access_invites add constraint early_access_invites_uses_range check (max_uses between 1 and 1000 and uses >= 0 and uses <= max_uses);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_grants_user_feature_key') then
    alter table public.early_access_grants add constraint early_access_grants_user_feature_key unique (user_id, feature);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_grants_feature_shape') then
    alter table public.early_access_grants add constraint early_access_grants_feature_shape check (feature ~ '^[a-z][a-z0-9_]{0,39}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_grants_invite_fk') then
    alter table public.early_access_grants add constraint early_access_grants_invite_fk
      foreign key (invite_id) references public.early_access_invites (id) on delete set null;
  end if;
end $$;

create index if not exists early_access_invites_feature_idx on public.early_access_invites (feature, created_at desc);
create index if not exists early_access_grants_feature_idx on public.early_access_grants (feature, granted_at desc);

-- PRIVATE: RLS on, no policies, no privileges for the browser roles (the service role bypasses RLS)
alter table public.early_access_invites enable row level security;
alter table public.early_access_grants  enable row level security;
revoke all on table public.early_access_invites from anon, authenticated;
revoke all on table public.early_access_grants  from anon, authenticated;

-- drop any policy that might have been added by hand (there should be none)
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and tablename in ('early_access_invites', 'early_access_grants')
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- PROBES (run these afterwards, one at a time; they only read):
--   select relname, relrowsecurity from pg_class where relname in ('early_access_invites', 'early_access_grants');
--       -> both rows: relrowsecurity = true
--   select count(*) from pg_policies where tablename in ('early_access_invites', 'early_access_grants');
--       -> 0
--   select has_table_privilege('anon', 'public.early_access_grants', 'select') as anon_grants,
--          has_table_privilege('authenticated', 'public.early_access_grants', 'select') as authed_grants,
--          has_table_privilege('anon', 'public.early_access_invites', 'select') as anon_invites,
--          has_table_privilege('authenticated', 'public.early_access_invites', 'select') as authed_invites;
--       -> all four false
--   select column_name, data_type from information_schema.columns where table_name = 'early_access_invites' order by ordinal_position;
--       -> id, code_hash, code_tail, feature, created_at, created_by, expires_at, max_uses, uses, note, revoked_at (NO column holds a plain code)
--   select conname from pg_constraint where conname like 'early_access_%' order by 1;
--       -> the keys, shape checks and the invite foreign key named above
