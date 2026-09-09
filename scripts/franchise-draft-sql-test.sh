#!/bin/bash
# ── THE DRAFT, TESTED AS SQL ────────────────────────────────────────────────
#
# Every other check in scripts/ reads JavaScript. The draft's real logic is not
# in JavaScript — it is four plpgsql functions, and the bug this script was
# written for (#91) could not have been caught by reading the site code at all,
# because the site was already correct. The database was not.
#
# WHAT IT PROVES. It stands up a throwaway Postgres, applies EVERY migration in
# order (which is itself worth having — nothing else checks the chain still
# applies to an empty database), then plays out the exact situation that hung a
# draft: a player rostered off the wire, so he has a roster entry and no pick.
#
# Before the fix the auto-picker chose him, the roster insert hit the unique
# constraint, the transaction rolled back, and the clock never moved. Every
# subsequent tick did the same thing. With the server draft clock running every
# minute that is fourteen hundred identical failures a day, for ever, with
# nothing on screen but "auto-picking…".
#
# Needs a local postgres. Skips cleanly (exit 0) when there isn't one, so it
# can sit in the same loop as the JS checks without failing a machine that has
# no database installed.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

command -v psql >/dev/null 2>&1 || { echo "skip franchise-draft-sql-test: no psql"; exit 0; }
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$PGBIN" ] || { echo "skip franchise-draft-sql-test: no postgres server"; exit 0; }

PORT=${PGPORT_TEST:-5433}
DATA=$(mktemp -d)
trap 'su postgres -c "$PGBIN/pg_ctl -D $DATA stop -m immediate" >/dev/null 2>&1; rm -rf "$DATA"' EXIT
chown -R postgres "$DATA" 2>/dev/null
su postgres -c "$PGBIN/initdb -D $DATA -A trust" >/dev/null 2>&1 || { echo "skip: initdb failed"; exit 0; }
su postgres -c "$PGBIN/pg_ctl -D $DATA -o '-p $PORT' -l $DATA/log start" >/dev/null 2>&1
sleep 3
P="psql -h 127.0.0.1 -p $PORT -U postgres -X -q"
$P -c "select 1" >/dev/null 2>&1 || { echo "skip: server did not start"; exit 0; }

$P -c "create database f" >/dev/null
D="$P -d f"
# The slice of Supabase the migrations actually touch.
$D >/dev/null <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
SQL

bad=0
for f in supabase/migrations/*.sql; do
  if ! $D -v ON_ERROR_STOP=1 -f "$f" >/dev/null 2>&1; then
    echo "MISS migration does not apply: $(basename "$f")"; bad=$((bad+1))
  fi
done
[ "$bad" = "0" ] && echo "ok   all $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') migrations apply to an empty database"

L=aaaaaaaa-0000-0000-0000-000000000001
TAKEN=cccccccc-0000-0000-0000-000000000001
FREE=cccccccc-0000-0000-0000-000000000002
AS_MEMBER="set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';"
# Two of the three refusals are gated on WHOSE turn it is and on being the
# commissioner, so they have to be attempted by the right person -- otherwise
# the function refuses for the wrong reason and the test passes for the wrong
# reason, which is worse than failing.
AS_COMMISH="set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';"

$D -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
insert into auth.users (id,email) values
 ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x');
insert into public.fantasy_leagues (id,name,commissioner_id,invite_code,team_count,status)
 values ('$L','T','11111111-1111-1111-1111-111111111111','CODE01',8,'drafting');
insert into public.fantasy_league_memberships (league_id,user_id,role) values
 ('$L','11111111-1111-1111-1111-111111111111','commissioner'),('$L','22222222-2222-2222-2222-222222222222','member');
insert into public.fantasy_teams (id,league_id,owner_id,name) values
 ('bbbbbbbb-0000-0000-0000-000000000001','$L','11111111-1111-1111-1111-111111111111','A'),
 ('bbbbbbbb-0000-0000-0000-000000000002','$L','22222222-2222-2222-2222-222222222222','B');
-- The rostered man scores HIGHER, so the auto-picker prefers him. If the guard
-- is wrong he is chosen and everything jams.
insert into public.nfl_players (id,source,source_player_id,season,name,position,team,active,source_payload) values
 ('$TAKEN','dash','p1',2026,'Already Rostered','RB','SF',true,'{"scores":{"TD":99}}'),
 ('$FREE','dash','p2',2026,'Genuinely Free','RB','LA',true,'{"scores":{"TD":10}}');
insert into public.fantasy_drafts (id,league_id,status,current_overall_pick,timer_seconds,pick_deadline)
 values ('dddddddd-0000-0000-0000-000000000001','$L','live',1,60, now() - interval '5 minutes');
insert into public.fantasy_draft_picks (draft_id,league_id,team_id,round,pick_in_round,overall_pick) values
 ('dddddddd-0000-0000-0000-000000000001','$L','bbbbbbbb-0000-0000-0000-000000000002',1,1,1),
 ('dddddddd-0000-0000-0000-000000000001','$L','bbbbbbbb-0000-0000-0000-000000000001',1,2,2);
-- rostered off the wire: a roster entry and NO pick, which is the whole bug.
insert into public.fantasy_roster_entries (league_id,team_id,player_id,acquired_via)
 values ('$L','bbbbbbbb-0000-0000-0000-000000000001','$TAKEN','free_agent');
SQL

fail=0
say() { if [ "$2" = "1" ]; then echo "ok   $1"; else echo "MISS $1"; fail=$((fail+1)); fi }

$D -t -A -c "$AS_MEMBER select public.run_expired_fantasy_auto_pick('$L');" >/dev/null 2>&1
clock=$($D -t -A -c "select current_overall_pick from public.fantasy_drafts;" 2>/dev/null | tr -d ' ')
who=$($D -t -A -c "select coalesce((select name from nfl_players where id=(select player_id from fantasy_draft_picks where overall_pick=1)),'EMPTY');" 2>/dev/null)
say "the auto-picker skips a rostered player instead of jamming" "$([ "$who" = "Genuinely Free" ] && echo 1 || echo 0)"
say "and the clock advances (1 -> $clock)" "$([ "$clock" = "2" ] && echo 1 || echo 0)"

# After the tick above the clock sits on pick 2, which belongs to the
# commissioner's team -- so he is both on the clock and allowed to assign.
for who_fn in "$AS_MEMBER|public.add_fantasy_draft_queue('$L','$TAKEN')" \
              "$AS_COMMISH|public.make_fantasy_draft_pick('$L','$TAKEN')" \
              "$AS_COMMISH|public.commissioner_assign_fantasy_pick('$L',2,'$TAKEN')"; do
  who=${who_fn%%|*}; fn=${who_fn#*|}
  out=$($D -t -A -c "$who select $fn;" 2>&1)
  say "refused: ${fn%%(*}" "$(echo "$out" | grep -qi 'already on a roster' && echo 1 || echo 0)"
  # A refusal for the WRONG reason is not a pass.
  if echo "$out" | grep -qiE 'not your turn|access required'; then
    echo "     (refused for the wrong reason: $out)"
  fi
done

# The control. If the guard is too wide, nobody can be drafted at all.
$D -q -c "insert into nfl_players (id,source,source_player_id,season,name,position,team,active,source_payload) values ('cccccccc-0000-0000-0000-000000000003','dash','p3',2026,'Third Man','WR','NYG',true,'{\"scores\":{\"TD\":50}}');" >/dev/null 2>&1
$D -t -A -c "$AS_COMMISH select public.commissioner_assign_fantasy_pick('$L',2,'cccccccc-0000-0000-0000-000000000003');" >/dev/null 2>&1
got=$($D -t -A -c "select coalesce((select name from nfl_players where id=(select player_id from fantasy_draft_picks where overall_pick=2)),'EMPTY');" 2>/dev/null)
say "a genuinely free player is still draftable" "$([ "$got" = "Third Man" ] && echo 1 || echo 0)"

echo
if [ "$fail" = "0" ] && [ "$bad" = "0" ]; then
  echo "ok   the draft cannot be handed a player who is already on a roster"
  exit 0
fi
echo "$((fail + bad)) problem(s)"
exit 1
