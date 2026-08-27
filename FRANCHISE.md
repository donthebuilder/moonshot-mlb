# Franchise

Franchise is isolated under `/fantasy`; the existing MLB and NFL routes and data paths are unchanged.

## First working slice

1. Create a free Supabase project.
2. Run `supabase/migrations/202608250001_franchise_foundation.sql` in its SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and anon key. Set `NEXT_PUBLIC_SITE_URL` to the deployed origin in production.
4. In Supabase Auth URL Configuration, add `<site-url>/auth/callback` as a redirect URL.
5. Start the app, visit `/fantasy`, and create two accounts in separate browser sessions. The first user creates a league and shares the code; the second joins with a different team name.

The database owns account, membership, league, settings, and team state, so both sessions retain state across refreshes and devices. Row-level security limits private league data to members.

## Milestone status

- Complete: isolated route/layout, email/password auth, persistent profiles, multi-league membership model, invite-only create/join, commissioner/member roles, team creation, and the requested league configuration fields.
- Foundation present: responsive Franchise visual system and mobile navigation shell.
- Playable draft foundation complete: provider-neutral NFL player contract shared with DASH analytics; 134-player 2026 board including all 32 defenses; DASH-ranked/position-filtered player board; active roster and weekly lineup slots; per-player locking; mobile league room and member lobby; commissioner catalog/order/start/pause/resume controls; snake board; and transactional live picks that prevent duplicate players and advance the clock.
- Draft workflow now also includes player/team search, per-team auto-pick queues, expired-timer auto-picks, optional K/DEF enforcement, and commissioner assignment to any open pick.
- My Team foundation complete: persistent weekly QB/RB/WR/TE/FLEX/K/DEF/bench/IR slots, server-enforced position eligibility, team ownership checks, injured-only IR, and individual-player locking support for the future scoring feed.
- Season foundation complete: commissioner-generated 14-week round-robin schedules, persistent weekly head-to-head matchups, projected lineup comparison, around-the-league scoreboard, and standings calculated from final results.
- Player market foundation complete: The Wire player search, immediate free-agent additions, optional drops, 24-hour waiver windows for released players, persistent claims/cancellations, rolling team priority, commissioner processing, roster-limit checks, and transaction history storage.
- Trade Desk foundation complete: multi-player owner offers, accept/reject/cancel workflow, commissioner approval or veto, locked-player safeguards, atomic roster exchanges, lineup cleanup, and persistent trade transaction records.
- League Feed foundation complete: owner posts, threaded comments, four quick reactions, owner roll call, and a combined timeline of social posts plus automatic waiver/free-agent/trade activity.
- Scoring intelligence foundation complete: provider-neutral NFL games and weekly stat storage, league-specific PPR/Half-PPR/Standard scoring, feed-driven individual kickoff locks, matchup recalculation, and a live DASH Coach screen with explainable lineup/waiver recommendations plus DASH Score, Draft Score, and Waiver Score.
- Current limitation: the committed NFL snapshot supplies kickoff context and projections, but not trustworthy live box-score stats. Live fantasy totals will populate when the upstream NFL publisher adds its weekly stat payload; Franchise does not invent results.
- Weekly league content foundation complete: persistent DASH power rankings with week-over-week movement, commissioner publishing, High Score/Photo Finish/Statement Win awards, and generated recap headlines and summaries from finalized matchup results.
- Commissioner Control Room complete: commissioners can update the league name, manage all supported pre-draft rules, regenerate private invite codes, and view league capacity; structural rules lock after the draft begins.
- Product polish complete: sticky glass league navigation, ambient Franchise surfaces, animated route loading states, and a five-destination mobile bottom navigation shared across league screens.
- Automatic scoring foundation complete: a protected host-agnostic synchronization endpoint pulls the live DASH NFL payload, falls back to the committed snapshot, refreshes player/injury data, stores verified weekly stats, locks individual players at kickoff, recalculates every affected league, and records visible run health in DASH Coach.
- Next: connect the production scheduler credentials, richer NFL news context, and final cross-device performance tuning.

## Connected development backend

The local app is connected through ignored `.env.local` values to the free Supabase `Franchise` project in the `DASH Network` organization. All current migrations have been applied successfully. Public Auth and REST health checks return HTTP 200, and anonymous league reads return an empty RLS-filtered result as expected.

Background scoring calls `GET` or `POST /api/fantasy/scoring` with `Authorization: Bearer <FRANCHISE_CRON_SECRET>`. Production also needs `SUPABASE_SERVICE_ROLE_KEY`; both values stay server-only. Any scheduler can call the endpoint every few minutes during game windows, so Franchise is not tied to Vercel, Supabase Cron, or Sleeper.

The connected local environment now has a dedicated revocable `franchise_scoring` server key and an independent scheduler secret in ignored `.env.local`. The first protected sync completed successfully against the live DASH payload: 16 games and 545 player records were refreshed, and DASH Coach reported healthy automation. No matchups changed because that payload identified Week 18 while the current test league has no Week 18 matchup; the system correctly avoids applying those stats to a different week.

Production blocker: the endpoint must be deployed to a public HTTPS origin before a hosted scheduler can call it. Add the same two server-only environment variables to that host, then schedule the protected endpoint during NFL game windows.

The remaining end-to-end check requires two real email accounts: create the first account in the normal browser and a second account in a private/separate browser session, then create and join one league.

`npm audit --omit=dev` also reports high-severity advisories in the repository's existing Next.js 14/PostCSS dependency chain. The offered automated remediation is a breaking upgrade to Next.js 16. That migration should be tested across the MLB dashboard separately rather than folded into the isolated Franchise slice.

## Verification

- `npm run build`: passes, including `/`, `/fantasy`, and `/auth/callback`.
- Production server smoke test: `/` and `/fantasy` both return HTTP 200; without credentials, Franchise shows the intentional setup state.
- Supabase Auth settings endpoint: HTTP 200.
- Supabase REST `fantasy_leagues` endpoint: HTTP 200 with the expected anonymous empty result.
- Live two-account workflow: ready for user account creation and email confirmation.
