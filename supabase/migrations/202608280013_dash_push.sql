-- WEB PUSH — the alerts that arrive with the site closed.
--
-- Everything before this needed a tab. lib/notify.js says so in its own
-- docstring: routed through the service worker, a notification survives a
-- backgrounded or frozen tab, but with the site fully CLOSED nothing arrives,
-- because that needs the Web Push protocol — VAPID keys, a subscription stored
-- per device, and something server-side deciding what to send. These are those
-- two tables.
--
-- TWO TABLES, AND THEY ARE DELIBERATELY DIFFERENT SHAPES:
--
--   · dash_push_subscriptions is PER DEVICE, not per user. One person with a
--     phone and a laptop has two rows, because a push subscription is issued
--     by the browser and belongs to that browser. Own-row RLS, like everything
--     else the account keeps.
--   · dash_push_seen is the SENDER'S memory, and it is not the user's data at
--     all. It records which real-world events have already been pushed so a
--     cron that runs every ten minutes doesn't re-announce the same home run
--     six times. Service-role only: RLS on, no policies, nobody reads it from
--     a browser.
--
-- WHY THE SEEN TABLE IS GLOBAL, NOT PER USER. A person who subscribes at 9pm
-- must not receive the eight home runs that happened before they subscribed.
-- Keyed globally, an event that already exists in this table is old by
-- definition and is never sent to anyone — so a new subscription starts at
-- "from now on" with no backlog logic anywhere in the sender.
--
-- WHAT IS NOT STORED: nothing about what was in the notification. The key is
-- an opaque event id (date, player, count) and a timestamp. The body text is
-- built at send time and kept nowhere.

create table if not exists public.dash_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures smallint not null default 0
);

create index if not exists dash_push_subs_user_idx on public.dash_push_subscriptions(user_id);

alter table public.dash_push_subscriptions enable row level security;

drop policy if exists dash_push_subs_select_own on public.dash_push_subscriptions;
create policy dash_push_subs_select_own on public.dash_push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists dash_push_subs_insert_own on public.dash_push_subscriptions;
create policy dash_push_subs_insert_own on public.dash_push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists dash_push_subs_update_own on public.dash_push_subscriptions;
create policy dash_push_subs_update_own on public.dash_push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dash_push_subs_delete_own on public.dash_push_subscriptions;
create policy dash_push_subs_delete_own on public.dash_push_subscriptions
  for delete using (auth.uid() = user_id);

-- The sender's memory. RLS enabled with NO policies: the service role bypasses
-- RLS, every browser-side client is refused. That is the intent — this is not
-- the user's data and there is nothing here for them to read.
create table if not exists public.dash_push_seen (
  event_key text primary key,
  first_seen_at timestamptz not null default now()
);

alter table public.dash_push_seen enable row level security;

-- Keeps the table from growing forever. Called by the cron on each run; a day
-- is far longer than any event stays interesting.
create or replace function public.dash_push_seen_prune()
returns void language sql security definer set search_path = public as $$
  delete from public.dash_push_seen where first_seen_at < now() - interval '2 days';
$$;
