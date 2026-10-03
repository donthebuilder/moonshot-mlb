-- PER-DEVICE SPORT CHOICE for web push (2026-10-02).
--
-- Which sports this DEVICE wants the "everyone" alerts for (slate homer,
-- TUDDY board red zone, LAMP called goal). Followed-player alerts are already
-- sport-scoped by the follow list itself; this only governs the alerts that
-- are not about anyone you named.
--
-- NULL = every sport. That is the value every existing row gets, so nothing
-- changes for a device until its owner picks. Values: 'mlb' | 'nfl' | 'nhl'.
alter table public.dash_push_subscriptions
  add column if not exists sports text[];
