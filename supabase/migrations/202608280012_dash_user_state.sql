-- DASH USER STATE — the one table that makes the network's saved things follow
-- a person instead of a browser.
--
-- Everything the site remembers about you today lives in localStorage:
-- mlb_watchlist_v1, tuddy_watchlist_v1, my_picks_v1, nfl_my_picks_v1 and the
-- rest. That was the right call while there was no account. Franchise brought
-- one (Supabase, since 202608250001), so the account now exists on every page
-- of the network — this table is where those same keys land for a signed-in
-- user, and nothing more than that.
--
-- DESIGN NOTES, because the shape looks lazier than it is:
--
--   · KEY/VALUE, NOT A TABLE PER FEATURE. The client owns the meaning of each
--     blob; the server owns identity and nothing else. A new synced feature is
--     a new key string, never a migration. The tradeoff — no server-side query
--     of what's inside — is fine: nothing on the server ever asks "who else
--     follows Schwarber."
--   · updated_at IS THE MERGE CLOCK. Last write wins per key, and the writer
--     sends what it believes the current version is; a stale write loses. Sets
--     that must not lose members (the follow list) are merged by union on the
--     client BEFORE the write, so a lost race costs an ordering, not a name.
--   · SIZE IS CAPPED IN THE DATABASE, not just in the client. A runaway loop
--     writing an ever-growing blob is a real failure mode for a store this
--     dumb, so the check constraint is the backstop.
--   · RLS IS OWN-ROW ONLY. There is no sharing story here and there should not
--     be one; if two people ever need to see the same list, that is a real
--     feature with a real table, not a policy widening on this one.

create table if not exists public.dash_user_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (char_length(key) between 1 and 64),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key),
  constraint dash_user_state_value_size check (pg_column_size(value) < 262144)
);

create index if not exists dash_user_state_user_idx on public.dash_user_state(user_id);

alter table public.dash_user_state enable row level security;

drop policy if exists dash_user_state_select_own on public.dash_user_state;
create policy dash_user_state_select_own on public.dash_user_state
  for select using (auth.uid() = user_id);

drop policy if exists dash_user_state_insert_own on public.dash_user_state;
create policy dash_user_state_insert_own on public.dash_user_state
  for insert with check (auth.uid() = user_id);

drop policy if exists dash_user_state_update_own on public.dash_user_state;
create policy dash_user_state_update_own on public.dash_user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dash_user_state_delete_own on public.dash_user_state;
create policy dash_user_state_delete_own on public.dash_user_state
  for delete using (auth.uid() = user_id);

-- Upsert with a clock guard. Called by /api/dash/state so the API route never
-- has to read-then-write (two round trips and a race between them).
-- Returns the row that ended up stored, so the client can tell "mine won" from
-- "someone else's newer write won" without a second request.
create or replace function public.dash_state_put(
  p_key text,
  p_value jsonb,
  p_updated_at timestamptz
)
returns public.dash_user_state
language plpgsql security invoker set search_path = public as $$
declare
  stored public.dash_user_state;
  stamp timestamptz := least(coalesce(p_updated_at, now()), now() + interval '5 minutes');
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  insert into public.dash_user_state (user_id, key, value, updated_at)
  values (auth.uid(), p_key, coalesce(p_value, '{}'::jsonb), stamp)
  on conflict (user_id, key) do update
    set value = excluded.value, updated_at = excluded.updated_at
    where public.dash_user_state.updated_at <= excluded.updated_at
  returning * into stored;

  if stored is null then
    select * into stored from public.dash_user_state
      where user_id = auth.uid() and key = p_key;
  end if;

  return stored;
end;
$$;
