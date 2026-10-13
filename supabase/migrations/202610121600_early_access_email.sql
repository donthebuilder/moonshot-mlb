-- EARLY ACCESS, GRANT BY EMAIL (2026-10-12, Donovan: "grant by email is cool, by button click"). Run AFTER 202610121500_early_access.sql (it does not change that file).
--
-- One more PRIVATE table, early_access_pending: a grant waiting for an email that has no confirmed account yet.
--   email_hash   sha256 (hex) of the lowercased address; the plain address is NEVER stored
--   email_tail   the MASKED address (j***@gmail.com) for the admin list only
--   It becomes a real row in early_access_grants the first time an account with that email signs in with a CONFIRMED email; activated_at then records when.
-- Same privacy as the other two tables: RLS on, NO policies, every browser-role privilege revoked; only the server's service-role key reads or writes it.
-- Until this is run the by-email button says "run the update" and stores nothing; invites and existing grants are unaffected.
-- Idempotent: safe to run twice. RUN IT BEFORE THE CODE THAT NEEDS IT. No `set role`.

create table if not exists public.early_access_pending (
  id            uuid primary key default gen_random_uuid(),
  email_hash    text not null,
  email_tail    text not null,
  feature       text not null,
  expires_at    timestamptz null,
  note          text null,
  created_at    timestamptz not null default now(),
  created_by    uuid null,
  revoked_at    timestamptz null,
  activated_at  timestamptz null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'early_access_pending_email_feature_key') then
    alter table public.early_access_pending add constraint early_access_pending_email_feature_key unique (email_hash, feature);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_pending_hash_shape') then
    alter table public.early_access_pending add constraint early_access_pending_hash_shape check (email_hash ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'early_access_pending_feature_shape') then
    alter table public.early_access_pending add constraint early_access_pending_feature_shape check (feature ~ '^[a-z][a-z0-9_]{0,39}$');
  end if;
end $$;

create index if not exists early_access_pending_feature_idx on public.early_access_pending (feature, created_at desc);

alter table public.early_access_pending enable row level security;
revoke all on table public.early_access_pending from anon, authenticated;

do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and tablename = 'early_access_pending'
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- PROBES (run afterwards, one at a time; they only read):
--   select relname, relrowsecurity from pg_class where relname = 'early_access_pending';          -> relrowsecurity = true
--   select count(*) from pg_policies where tablename = 'early_access_pending';                    -> 0
--   select has_table_privilege('anon', 'public.early_access_pending', 'select') as anon_pending,
--          has_table_privilege('authenticated', 'public.early_access_pending', 'select') as authed_pending;   -> both false
--   select column_name from information_schema.columns where table_name = 'early_access_pending' order by ordinal_position;
--       -> id, email_hash, email_tail, feature, expires_at, note, created_at, created_by, revoked_at, activated_at (no plain email column)
