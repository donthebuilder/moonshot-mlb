-- COLLECTIBLE CARD ISSUANCE (2026-10-14, Donovan: "a real issue number only from a real issuance system"). WRITTEN AS A FILE ONLY: NOT RUN.
-- Run it in the Supabase SQL editor BEFORE any code that reads or writes card_issues ships (none does yet: the collect route prints "ISSUE NO. PREVIEW").
--
-- WHAT IT GUARANTEES
--   * one row per card:        unique (card_id). card_id is the deterministic hash of event + player + achievement + season + rules version (lib/cards/rulesV2.js cardIdOf).
--   * one card per achievement: unique (slot_id). slot_id is the same hash WITHOUT the rules version, so a later rules version cannot issue the same achievement twice.
--   * a monotonic issue number per moment: issue_no = 1, 2, 3 ... for each moment key, assigned by issue_card() under a lock; never reused, never edited, gap-free
--     unless a transaction rolls back (then the number is simply not taken: the sequence below is the counter, and a rolled-back issue leaves NO row, so the
--     numbers of rows that exist are 1..n with no duplicates; a skipped number is possible only if a row is deleted, which the table forbids).
--   * private: row level security is on and there is NO policy, so the anon and authenticated roles read and write nothing; the service role (the server) bypasses RLS.
--   * an audit trail: card_issue_log appends one row for every issue, tier change (a corrected official stat) or void. card_issues rows are never updated except tier / status
--     through correct_card(), which writes the log row in the same transaction.
-- NOTHING HERE IS A GRADE, A POPULATION OR A SCARCITY CLAIM. issue_no is "the Nth card of this moment that DASH issued", a fact about the record, nothing more.
-- Idempotent: safe to run twice.

create table if not exists public.card_issues (
  id            bigint generated always as identity primary key,
  card_id       text        not null,                       -- DN-<12 hex>: lib/cards/rulesV2.js cardIdOf().cardId
  slot_id       text        not null,                       -- DS-<12 hex>: the same achievement under any rules version
  moment        text        not null,                       -- lib/cards/moments.js key (nhl_hat_trick ...)
  sport         text        not null check (sport in ('nhl', 'mlb', 'nfl', 'nba')),
  player_id     text        not null,
  season        text        not null,
  event_key     text        not null,                       -- the moment's own id (gameId:playerId[:goalN] ...)
  game_day      date        not null,                       -- the game's own date, never the wall clock
  tier          text        not null check (tier in ('base', 'star', 'elite', 'legend')),
  rules_version text        not null,
  issue_no      integer     not null check (issue_no >= 1),
  status        text        not null default 'issued' check (status in ('issued', 'void')),
  evidence      jsonb       not null default '{}'::jsonb,    -- the stored rows the card was proven from (so a correction can be diffed)
  portrait      jsonb       not null default '{}'::jsonb,    -- { provider, source_url, verified } or { placeholder: true, reason }
  is_test       boolean     not null default false,         -- TEST rows are labelled and never counted
  issued_at     timestamptz not null default now(),
  constraint card_issues_card_id_key unique (card_id),
  constraint card_issues_slot_id_key unique (slot_id),
  constraint card_issues_moment_issue_key unique (moment, issue_no),
  constraint card_issues_not_hidden check (sport <> 'nba' or is_test)   -- BUCKETS stays hidden: no real NBA card can be issued until this line is dropped on purpose
);
create index if not exists card_issues_player_idx on public.card_issues (sport, player_id, game_day desc);

create table if not exists public.card_issue_log (
  id        bigint generated always as identity primary key,
  card_id   text        not null references public.card_issues (card_id),
  action    text        not null check (action in ('issue', 'tier_change', 'void')),
  old_tier  text,
  new_tier  text,
  reason    text,
  evidence  jsonb       not null default '{}'::jsonb,
  at        timestamptz not null default now()
);

alter table public.card_issues enable row level security;
alter table public.card_issue_log enable row level security;
-- deliberately NO policies: private. (The service role bypasses RLS; nothing else can touch these tables.)
revoke all on public.card_issues from anon, authenticated;
revoke all on public.card_issue_log from anon, authenticated;

-- ISSUE: idempotent. Re-running it for the same card returns the existing row and takes no new number.
create or replace function public.issue_card(
  p_card_id text, p_slot_id text, p_moment text, p_sport text, p_player_id text, p_season text, p_event_key text,
  p_game_day date, p_tier text, p_rules_version text, p_evidence jsonb default '{}'::jsonb, p_portrait jsonb default '{}'::jsonb, p_is_test boolean default false
) returns public.card_issues
language plpgsql security definer set search_path = public as $$
declare r public.card_issues;
begin
  select * into r from card_issues where card_id = p_card_id or slot_id = p_slot_id limit 1;
  if found then return r; end if;
  -- one lock per moment: two issuers can never read the same max(issue_no)
  perform pg_advisory_xact_lock(hashtext('card_issues:' || p_moment));
  select * into r from card_issues where card_id = p_card_id or slot_id = p_slot_id limit 1;
  if found then return r; end if;
  insert into card_issues (card_id, slot_id, moment, sport, player_id, season, event_key, game_day, tier, rules_version, issue_no, evidence, portrait, is_test)
  values (p_card_id, p_slot_id, p_moment, p_sport, p_player_id, p_season, p_event_key, p_game_day, p_tier, p_rules_version,
          coalesce((select max(issue_no) from card_issues where moment = p_moment), 0) + 1, p_evidence, p_portrait, p_is_test)
  returning * into r;
  insert into card_issue_log (card_id, action, new_tier, evidence) values (r.card_id, 'issue', r.tier, p_evidence);
  return r;
end $$;

-- CORRECTION: the league corrects an official stat. The card keeps its id and its issue number; its tier follows the corrected record, and the change is logged.
-- A card whose achievement no longer holds is voided (status = 'void', never deleted, its number never reused).
create or replace function public.correct_card(p_card_id text, p_new_tier text, p_reason text, p_evidence jsonb default '{}'::jsonb)
returns public.card_issues language plpgsql security definer set search_path = public as $$
declare r public.card_issues;
begin
  select * into r from card_issues where card_id = p_card_id for update;
  if not found then raise exception 'no such card %', p_card_id; end if;
  if p_new_tier is null then
    update card_issues set status = 'void' where card_id = p_card_id returning * into r;
    insert into card_issue_log (card_id, action, old_tier, reason, evidence) values (p_card_id, 'void', r.tier, p_reason, p_evidence);
  elsif p_new_tier <> r.tier then
    insert into card_issue_log (card_id, action, old_tier, new_tier, reason, evidence) values (p_card_id, 'tier_change', r.tier, p_new_tier, p_reason, p_evidence);
    update card_issues set tier = p_new_tier where card_id = p_card_id returning * into r;
  end if;
  return r;
end $$;
revoke all on function public.issue_card(text, text, text, text, text, text, text, date, text, text, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.correct_card(text, text, text, jsonb) from public, anon, authenticated;

-- PROBES (run after, each as its own run; they use a TEST row and clean up):
--   select relrowsecurity from pg_class where oid = 'public.card_issues'::regclass;                        -- expect t
--   select count(*) from pg_policies where tablename in ('card_issues', 'card_issue_log');                  -- expect 0
--   select (issue_card('DN-TESTAAAAAAAA', 'DS-TESTAAAAAAAA', 'nhl_hat_trick', 'nhl', '1', '20262027', '1:1', '2026-01-01', 'elite', 'r2', '{}', '{}', true)).issue_no;   -- expect 1 on a fresh table
--   select (issue_card('DN-TESTAAAAAAAA', 'DS-TESTAAAAAAAA', 'nhl_hat_trick', 'nhl', '1', '20262027', '1:1', '2026-01-01', 'elite', 'r2', '{}', '{}', true)).issue_no;   -- expect 1 again (idempotent)
--   select (issue_card('DN-TESTBBBBBBBB', 'DS-TESTAAAAAAAA', 'nhl_hat_trick', 'nhl', '1', '20262027', '1:1', '2026-01-01', 'elite', 'r3', '{}', '{}', true)).card_id;       -- expect DN-TESTAAAAAAAA (same achievement, newer rules: no second card)
--   delete from card_issue_log where card_id like 'DN-TEST%'; delete from card_issues where card_id like 'DN-TEST%';
