// 🏠 THE FRONT DOOR.
//
// 2026-08-28, Donovan: "we dont have a front door." He's right, and the
// floating switcher wasn't one: a button in a corner that already assumes
// you know what MOONSHOT is. (That switcher is gone entirely as of
// 2026-08-29 — its three destinations live in the bottom bar's More sheet
// now, via components/NetworkSwitch.js. This page is unchanged by that; it
// was never where the switcher belonged.)
//
// This page answers three questions in the order a person actually asks them:
//
//   1. WHAT IS THIS — one line, three products, no scrolling required.
//   2. WHAT'S ON RIGHT NOW — tonight's baseball, this week's football, and
//      your leagues, with real numbers off the live payloads (lib/dash/pulse).
//   3. WHERE DO I GO — a jump-in link on every card, and the account block
//      that makes what you save follow you.
//
// WHAT IT IS NOT: a gate. Nothing here is required to use the site — MOONSHOT
// and TUDDY stay open to anyone, signed in or not.
//
// IT IS `/` AS OF 2026-08-28. The board moved to /app. Every link ever posted
// in the old shape (`/#sport=nfl&tab=home`) still opens the board on the right
// tab: components/LegacyHashRedirect.js reads the fragment in the browser —
// the only place a fragment exists — and forwards it. Reverting is two moves
// and a deleted component; nothing about the board itself changed.
//
// LIVE NUMBERS OR NO NUMBERS. Every figure on this page comes from the same
// published payloads the boards read. Where a payload is missing — preseason,
// a bot that hasn't run yet — the card renders without the figure rather than
// with a placeholder. A front door that invents a number to look alive is
// worse than one that admits it's early.

import Link from 'next/link'

import AlertsPanel from '../../components/AlertsPanel'
import DashAuthCard from '../../components/DashAuthCard'
import LegacyHashRedirect from '../../components/LegacyHashRedirect'
import SubmitButton from '../../components/fantasy/SubmitButton'
import { getNetworkPulse, liveProduct } from '../../lib/dash/pulse'
import { appHref, BRAND } from '../../lib/routes'
import { nextLine } from '../../lib/mlbNext'
import { wilson } from '../../lib/interval'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { dashSignOut } from './actions'
import styles from './dash.module.css'
import './scroll-anchor.css' // css-loader pure-selector fix, 2026-09-06
import OpenOnHash from '../../components/OpenOnHash'

export const metadata = {
  alternates: { canonical: '/' },
  title: 'DASH Network — one network, four ways to play',
  description: 'MOONSHOT (MLB), TUDDY (NFL), LAMP (NHL) and FRANCHISE (fantasy football). Every call graded in public.',
}

// The session makes this dynamic anyway; the payload fetches inside
// getNetworkPulse carry their own revalidate.
export const dynamic = 'force-dynamic'


function timeUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  // A kickoff already in the past means the card is showing a finished or
  // in-progress slate; the label ("Preseason · Aug 21") says more than "under
  // way" would, so fall through to it rather than printing a countdown of a
  // game that has already happened.
  if (ms <= 0) return null
  const hours = Math.round(ms / 3600000)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

// Hockey's clock reads in ET on purpose: this renders on the server (UTC on
// Vercel) and the front door has no viewer time zone; ET is the league's
// calendar and the one the Board page's day is cut on.
// "Tue 9/29" for a league calendar day (the date string is already ET).
const dayWord = (ymd) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' }).replace(',', '') : null)
// Why LAMP's panel has no number (Part A3): the season opener while it's
// ahead, else the next day with games. Null when there are games tonight
// and the season is on (the lock count says the rest).
function lampWhy(nhl) {
  if (!nhl) return null
  const opens = nhl.regularSeasonStart && nhl.date < nhl.regularSeasonStart ? `Season opens ${dayWord(nhl.regularSeasonStart)}` : null
  if (nhl.games) return opens
  return [opens || 'No NHL games tonight', !opens && nhl.next ? `next games ${dayWord(nhl.next)}` : null, 'calls lock before each puck drop'].filter(Boolean).join(' · ')
}
// "12 of 34 were on the board at lock" (Part A1): homer_feed's labels, the
// same reader /called uses. No share when the locked read is missing.
const lockedLine = (l) => (l && l.total ? `${l.onBoard} of ${l.total} were on the board at lock` : null)
const etClock = (iso) => (iso ? `${new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET` : null)

async function account() {
  if (!hasSupabaseConfig()) return { configured: false, user: null, leagues: [], teams: [] }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { configured: false, user: null, leagues: [], teams: [] }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { configured: true, user: null, leagues: [], teams: [] }

  const { data: memberships } = await supabase
    .from('fantasy_league_memberships')
    .select('league_id, role')
    .eq('user_id', user.id)

  const ids = (memberships || []).map((row) => row.league_id)
  if (!ids.length) return { configured: true, user, leagues: [], teams: [] }

  const [{ data: leagues }, { data: teams }] = await Promise.all([
    supabase.from('fantasy_leagues').select('id,name,status,team_count').in('id', ids).order('created_at'),
    supabase.from('fantasy_teams').select('id,league_id,owner_id,name').in('league_id', ids),
  ])

  return { configured: true, user, leagues: leagues || [], teams: teams || [] }
}

export default async function DashHome({ searchParams }) {
  const params = (await searchParams) || {}
  // Set by dashSignUp on a successful sign-up that produced a session.
  const welcomeName = typeof params.welcome === 'string' && params.welcome ? params.welcome.slice(0, 40) : ''
  const [pulse, me] = await Promise.all([getNetworkPulse(), account()])
  const { mlb, nfl, nhl, record } = pulse
  const displayName = me.user?.user_metadata?.display_name || me.user?.email?.split('@')[0] || null
  // The one primary button: the board that's on today (funnel step 1).
  const live = liveProduct(pulse)
  // A day with no MLB games: the slate on hand is an earlier day's, and the
  // next game day is later (lib/mlbNext.js).
  const mlbOff = Boolean(mlb?.date && mlb?.today && mlb.date < mlb.today && nextLine(mlb?.next, mlb.today))
  // Football on tonight = a kickoff today (ET) or one under way (4 h). Else
  // one line: "next game Thu 8:15 PM ET".
  const nflOff = (() => {
    const ks = (nfl?.kickoffs || []).map((k) => Date.parse(k)).filter(Number.isFinite).sort((a, b) => a - b)
    const now = Date.now()
    const todayEt = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const on = ks.some((t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === todayEt || (t <= now && now - t < 4 * 3600e3))
    if (on || !ks.length) return null
    const next = ks.find((t) => t > now)
    return next ? `next game ${new Date(next).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })} ET` : 'no game left this week'
  })()
  // The sign-up fold opens by itself when someone is mid-flow: a failed
  // attempt, a confirm-your-email return, or the welcome after sign-up.
  const authOpen = Boolean(welcomeName || params.error || params.message || params.confirm || params.em)

  return (
    <main className={styles.page} id="top">
      {/* Old /#sport=…&tab=… links land here now. This sends them on to the
          board with the hash intact — see the component for why it cannot be
          done on the server. */}
      <LegacyHashRedirect />
      <header className={styles.bar}>
        {/* A link, not a div. On the network's other surfaces the mark went
            home in pass 19; here — the one page where somebody stuck in a form
            reaches for it — it was inert. #top rather than "/" so it does not
            reload the page you are already on. */}
        <a className={styles.brand} href="#top" aria-label="Back to the top of DASH Network">
          <img src="/icon-192.png" alt="" width="34" height="34" />
          <div><small>DASH</small><strong>NETWORK</strong></div>
        </a>
        <nav className={styles.barNav}>
          <a className={styles.barNavSection} href="#tonight">Tonight</a>
          <a className={styles.barNavSection} href="#products">Products</a>
          <a className={styles.barNavSection} href="#alerts">Alerts</a>
          {me.user
            ? <><Link href="/account">Account</Link><form action={dashSignOut}><input type="hidden" name="next" value="/" /><SubmitButton className={styles.ghost} pendingLabel="Signing out…">Sign out</SubmitButton></form></>
            : <>
              {/* ── THE LABEL WAS THE BUG (2026-08-31) ────────────────────
                  Donovan, on a 45+ user: "couldn't find sign-up at all."
                  He was right, and it was not buried — it was MISLABELLED.
                  The only auth control on this page read "Sign in", and it
                  pointed at a card whose DEFAULT TAB is Create an account.
                  A first-time visitor reads "Sign in", concludes it is for
                  people who already have accounts, and never clicks the one
                  thing that would have signed them up.
                  Two controls now, and the one a stranger needs is the one
                  wearing the button. */}
              <a href="#sign-in">Sign in</a>
              <a className={styles.barCta} href="#create-account">Create account</a>
            </>}
        </nav>
      </header>

      {/* Still here for anyone who lands at the top — but this used to be the
          ONLY place a sign-up error appeared, roughly 1,500px above the form
          it was describing. The card carries its own copy now. */}
      {(params.error || params.message) && (
        <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
      )}

      <section className={styles.hero}>
        <p className={styles.eyebrow}><span>●</span> ONE NETWORK. FOUR WAYS TO PLAY.</p>
        <h1>{displayName ? <>Welcome back, {displayName}.</> : <>Every call, <em>graded in public.</em></>}</h1>
        <p className={styles.heroCopy}>
          MOONSHOT reads tonight&apos;s baseball. TUDDY reads the football week. LAMP reads
          tonight&apos;s hockey. FRANCHISE runs your league. Same scoring language, same receipts,
          one account.
        </p>
        {/* THE WORDS, BEFORE THE NUMBERS (2026-09-26, stranger test F1/F7).
            A first-timer met "board", "call" and "the bot" in every tile below
            and nothing here said what they were. Worded from /start's own
            lines, so the two pages say it the same way. */}
        {/* SIGNED IN (front door F, 2026-09-27): the three definitions are for a
            first visit, so a returning account gets them folded; a stranger
            still sees them open. */}
        {(() => {
          const words = (
            <dl className={styles.words}>
              <div><dt>The board</dt><dd>every player the model rated before the game, ranked.</dd></div>
              <div><dt>A call</dt><dd>a player the model &mdash; the bot &mdash; designated before the game: MOONSHOT&apos;s HR, HIT, HRR and CONTACT picks, TUDDY&apos;s touchdown picks, LAMP&apos;s top three in each game.</dd></div>
              <div><dt>Graded</dt><dd>after the game, every call is checked against the bar it was made for, in public, wins and misses alike.</dd></div>
            </dl>
          )
          return me.user ? <details className={styles.wordsFold}><summary>What the words mean</summary>{words}</details> : words
        })()}
        <div className={styles.heroActions}>
          {/* /start is the page that explains a product and carries the
              sign-up; CALLED IT is the public record. Neither had a door here
              (stranger test F1). The board is one tap further, from either,
              and from every product card below; the header keeps the
              account button. */}
          {/* FUNNEL STEP 1 (2026-09-26): ONE primary, and it moves forward --
              into the product that's live today. /start and the record stay
              as the quieter doors beside it. */}
          <Link href={appHref(live)}>Open tonight&apos;s board <b>→</b><small className={styles.heroWhich}>{BRAND[live].name} · {BRAND[live].league}</small></Link>
          {/* Signed in (F): the other two products, as two small links. */}
          {me.user ? (
            <span className={styles.otherProducts}>or {['mlb', 'nfl', 'nhl'].filter((k) => k !== live).map((k, i) => <span key={k}>{i ? ' · ' : ''}<Link href={appHref(k)}>{BRAND[k].name}</Link></span>)}</span>
          ) : null}
          <Link href="/start">What is this?</Link>
          <Link href="/called">CALLED IT &middot; the public record</Link>
        </div>
      </section>

      <section className={styles.slate} id="tonight">
        <div className={styles.slateHead}><p className={styles.kicker}>ON RIGHT NOW</p><h2>The whole network, one glance.</h2></div>
        {/* GROUPED BY PRODUCT (front door C, 2026-09-27): was eight tiles in a
            6 + 2 grid, three colours mixed in one row, LAMP's two empty. Now one
            column per product in its own colour, the whole column a link into
            it; a product with nothing on tonight is one line saying why and
            when, instead of zeros. Phone: one product per row, tiles two across. */}
        <div className={styles.productCols}>
          {mlbOff ? (
            <Link href={appHref('mlb')} className={`${styles.productOff} ${styles.mlb}`}><b>MOONSHOT</b> · No MLB games tonight · {nextLine(mlb.next, mlb.today)}</Link>
          ) : (
            <Link href={appHref('mlb')} className={`${styles.productCol} ${styles.mlb}`} aria-label="MOONSHOT, tonight's baseball">
              <span className={styles.productColHead}>MOONSHOT · MLB</span>
              <span className={styles.productColTiles}>
                <Tile label="GAMES" value={mlb?.games} sub={mlb?.live ? `${mlb.live} live` : mlb?.final ? `${mlb.final} final` : 'pre-game'} accent="mlb" />
                <Tile label="CALLS TONIGHT" value={mlb?.calls} sub={mlb?.started ? `${mlb.cleared ?? 0} cleared, of ${mlb.started} that batted` : 'HR · HIT · HRR · CONTACT'} accent="mlb" />
                <Tile label="HRs ON THE SLATE" value={mlb?.locked?.total || mlb?.homers} sub={lockedLine(mlb?.locked)} accent="mlb" />
              </span>
            </Link>
          )}
          {nflOff ? (
            <Link href={appHref('nfl')} className={`${styles.productOff} ${styles.nfl}`}><b>TUDDY</b> · {nflOff}</Link>
          ) : (
            <Link href={appHref('nfl')} className={`${styles.productCol} ${styles.nfl}`} aria-label="TUDDY, the football week">
              <span className={styles.productColHead}>TUDDY · NFL</span>
              <span className={styles.productColTiles}>
                <Tile label="GAMES THIS WEEK" value={nfl?.games} sub={timeUntil(nfl?.kickoff) || nfl?.label} accent="nfl" />
                <Tile label="PLAYERS RATED" value={nfl?.players} sub={nfl?.label} accent="nfl" />
              </span>
            </Link>
          )}
          {/* Hockey: the count and the lock. A preview never counts (lib/nhl/pulse.js). */}
          {!nhl?.games ? (
            <Link href={appHref('nhl')} className={`${styles.productOff} ${styles.nhl}`}><b>LAMP</b> · {lampWhy(nhl) || nhl?.label || 'No NHL games tonight'}</Link>
          ) : (
            <Link href={appHref('nhl')} className={`${styles.productCol} ${styles.nhl}`} aria-label="LAMP, tonight's hockey">
              <span className={styles.productColHead}>LAMP · NHL</span>
              <span className={styles.productColTiles}>
                <Tile label="GAMES" value={nhl.games} sub={nhl.live ? `${nhl.live} live` : nhl.final ? `${nhl.final} final` : `first puck ${etClock(nhl.firstStart)}`} accent="nhl" />
                <Tile label="LOCKED" value={`${nhl.lockedGames}/${nhl.games}`} sub={nhl.lockedGames ? 'games with a locked call' : `locks from ${etClock(nhl.locksFromUtc)}`} accent="nhl" />
              </span>
            </Link>
          )}
        </div>
        <p className={styles.stamp}>
          Live from the published payloads, cached two minutes.{mlb?.label ? ` MLB: ${mlb.label}.` : ''}
          {nfl?.label ? ` NFL: ${nfl.label}.` : ''}
          {nhl?.label ? ` NHL: ${nhl.label}.` : ''}
        </p>
      </section>

      {/* ── THE RECORD (2026-08-31) ────────────────────────────────────────
          The headline on this page is "Every call, graded in public." What a
          stranger actually got underneath it was tonight's COUNTS — 14 games,
          56 called slots, 31 homers — and not one number about whether any of
          it has ever been right. The most persuasive thing this site can show
          was the one thing the front door was withholding, and it has been in
          backtest_summary.json all along.

          EACH ROW ON ITS OWN BAR. An HR call is graded on homers, a HIT call
          on getting a hit, an HRR call on 2+ H+R+RBI, a CONTACT call on 2+
          total bases. Reading 69% against 16% would be comparing four
          different questions, so every rate prints the bar beside it and the
          rows are never ranked against each other.

          AND EVERY ROW CARRIES ITS INTERVAL. A percentage with no denominator
          is the thing this whole site exists not to do — lib/interval.js's
          Wilson bounds are the same ones the Results page uses, on the same
          counts. */}
      {/* ALL THREE (front door D, 2026-09-27): MOONSHOT's call precision, then
          TUDDY's board coverage and LAMP's called scorers from the readers
          /called uses, each naming its own question and linking to its record
          page; "How this is counted" folds the small print. */}
      {record?.rows?.length || pulse.nflRecord || nhl ? (
        <section className={styles.record} id="record">
          <div className={styles.slateHead}>
            <p className={styles.kicker}>THE RECORD</p>
            <h2>Graded in public means this.</h2>
          </div>
          {record?.rows?.length ? <p className={styles.recordQ}><b className={styles.mlbInk}>MOONSHOT</b> · did each call clear the bar it was made for? · <Link href="/called?sport=mlb">the record&nbsp;→</Link></p> : null}
          <div className={styles.recordRows}>
            {(record?.rows || []).map((r) => {
              // wilson() returns [lo, hi] ALREADY IN PERCENT, not a
              // {lo, hi} in 0..1. The first cut of this block assumed the
              // object form and printed "95% band NaN–NaN%" on all four rows —
              // caught in render, which is the only place it could have been.
              const ci = wilson(r.ok, r.n)
              const [lo, hi] = ci || [null, null]
              if (lo == null) return null
              return (
                <div key={r.key} className={styles.recordRow}>
                  <div className={styles.recordHead}>
                    <strong>{r.label}</strong>
                    <span>graded on {r.bar}</span>
                  </div>
                  <div className={styles.recordNum}>
                    <b>{r.pct.toFixed(1)}%</b>
                    <span>{r.ok} of {r.n}</span>
                  </div>
                  {/* The bar is the RATE; the paler band behind its right edge
                      is the 95% interval, drawn at the same scale. A reader
                      should not have to take the point estimate on faith when
                      the uncertainty can simply be shown. */}
                  <div className={styles.recordBar} title={`${r.ok} of ${r.n} cleared ${r.bar}. 95% interval ${lo.toFixed(1)}% to ${hi.toFixed(1)}%.`}>
                    <span className={styles.recordCi} style={{ left: `${lo}%`, width: `${hi - lo}%` }} />
                    <span className={styles.recordFill} style={{ width: `${r.pct}%` }} />
                  </div>
                  <div className={styles.recordCiText}>
                    95% band {lo.toFixed(1)}–{hi.toFixed(1)}%
                  </div>
                </div>
              )
            })}
          </div>
          <p className={styles.recordQ}><b className={styles.nflInk}>TUDDY</b> · of the touchdown scorers, how many were on the board? · <Link href="/called?sport=nfl">the record&nbsp;→</Link></p>
          <p className={styles.recordLine}>
            {pulse.nflRecord
              ? <><b>{pulse.nflRecord.onBoard} of {pulse.nflRecord.total}</b> on the board ({Math.round((100 * pulse.nflRecord.onBoard) / pulse.nflRecord.total)}%) · {pulse.nflRecord.called} of them CALLED · {pulse.nflRecord.days} game days with the board rank recorded</>
              : 'The football record fills in once three game days have their pregame board rank recorded.'}
          </p>
          <p className={styles.recordQ}><b className={styles.nhlInk}>LAMP</b> · of the goal scorers, how many were CALLED? · <Link href="/called?sport=nhl">the record&nbsp;→</Link></p>
          <p className={styles.recordLine}>
            {pulse.nhlRecord
              ? <><b>{pulse.nhlRecord.called} of {pulse.nhlRecord.total}</b> CALLED ({Math.round((100 * pulse.nhlRecord.called) / pulse.nhlRecord.total)}%) · {pulse.nhlRecord.onBoard} on the board · {pulse.nhlRecord.days} regular-season nights</>
              : 'No graded regular-season night yet.'}
          </p>
          <details className={styles.recordFold}>
            <summary>How this is counted</summary>
            <p className={styles.stamp}>
              {record?.nights ? `${record.nights} graded nights, pooled` : 'Graded nights, pooled'} — the real totals divided, not an average of nightly
              percentages, which would weight a six-pick night the same as a thirty-pick one. Each MOONSHOT row is
              scored on the bar that call was made for, so the four are four different questions and are
              never ranked against each other. TUDDY leads with board coverage because its ladder names five
              players a week against two dozen touchdowns; LAMP counts goal scorers against the three it calls in
              each game, regular season only. Every night behind these numbers is on the{' '}
              <Link href="/app#sport=mlb&tab=results">Results page</Link> and each product&apos;s record page, one row at a time.
            </p>
          </details>
        </section>
      ) : null}

      <section className={styles.products} id="products">
        <article className={`${styles.product} ${styles.mlb}`}>
          <header><i>M</i><div><strong>MOONSHOT</strong><small>MLB</small></div></header>
          <h3>Tonight&apos;s board, graded by morning.</h3>
          <p>Four call categories — HR, HIT, HRR, CONTACT — plus the full ranked board, the pairs, and every receipt the next morning.</p>
          {/* THE SAME SHAPE AS TUDDY'S (front door E, 2026-09-27): tonight's HR
              calls as a list, top five by score, a homer marked -- was three
              numbers the tiles above already show. */}
          {mlb?.topCalls?.length && !mlbOff ? (
            <ul className={styles.six}>
              {mlb.topCalls.map((c) => (
                <li key={c.id}><small>HR CALL</small><b>{c.name}</b><span>{c.team ? `${c.team} · ` : ''}{Math.round(c.score)}{c.homered ? ' · 🏠 HOMERED' : ''}</span></li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>{mlbOff ? `No MLB games tonight · ${nextLine(mlb.next, mlb.today)}.` : 'Tonight’s calls post with the board.'}</p>
          )}
          <footer>
            <Link href="/app#sport=mlb&tab=home">Open MOONSHOT →</Link>
            <Link href="/app#sport=mlb&tab=results">Results</Link>
            <Link href="/app#sport=mlb&tab=watch">Your watchlist</Link>
          </footer>
        </article>

        <article className={`${styles.product} ${styles.nfl}`}>
          <header><i>T</i><div><strong>TUDDY</strong><small>NFL</small></div></header>
          <h3>The Six, one call per market.</h3>
          <p>{nfl?.label ? `${nfl.label} — ` : ''}anytime TD, receiving yards, rushing yards, receptions, passing yards and kicker points.</p>
          {nfl?.six?.length ? (
            <ul className={styles.six}>
              {nfl.six.map((call) => (
                <li key={call.key}><small>{call.label}</small><b>{call.name}</b><span>{call.team} · {Math.round(call.score)}</span></li>
              ))}
            </ul>
          ) : (
            <dl><div><dt>Games</dt><dd>{nfl?.games ?? '—'}</dd></div><div><dt>Players rated</dt><dd>{nfl?.players ?? '—'}</dd></div></dl>
          )}
          <footer>
            <Link href="/app#sport=nfl&tab=home">Open TUDDY →</Link>
            <Link href="/app#sport=nfl&tab=boards">Boards</Link>
            <Link href="/app#sport=nfl&tab=watchlist">Your watchlist</Link>
          </footer>
        </article>

        <article className={`${styles.product} ${styles.nhl}`}>
          <header><i>L</i><div><strong>LAMP</strong><small>NHL</small></div></header>
          <h3>Three called per game, locked before puck drop.</h3>
          <p>{nhl?.label ? `${nhl.label} — ` : ''}the goal board: shots, goals and ice time per game over his last 82, ranked against tonight&apos;s skaters, graded off the boxscore.</p>
          {nhl?.calls?.length ? (
            // The #1 called in each LOCKED game. Once graded, the lamp on a scorer.
            <ul className={styles.six}>
              {nhl.calls.map((call) => (
                <li key={call.gameId}><small>{call.away} @ {call.home}</small><b>{call.name}</b><span>{call.team} · {Math.round(call.score)}{call.graded ? (call.hit ? ' · 🚨 SCORED' : call.dressed === false ? ' · VOID' : ' · no goal') : ''}</span></li>
              ))}
            </ul>
          ) : nhl?.games ? (
            <dl>
              <div><dt>Games</dt><dd>{nhl.games}</dd></div>
              <div><dt>Locked</dt><dd>{`${nhl.lockedGames} / ${nhl.games}`}</dd></div>
              <div><dt>First lock</dt><dd>{nhl.lockedGames ? 'done' : etClock(nhl.locksFromUtc)}</dd></div>
            </dl>
          ) : (
            // No games tonight: say why, from the schedule (Part A3), not three dashes.
            <p>{lampWhy(nhl) || 'No NHL games tonight.'}</p>
          )}
          <footer>
            <Link href="/app#sport=nhl&tab=home">Open LAMP →</Link>
            <Link href="/app#sport=nhl&tab=board">Board</Link>
            <Link href="/app#sport=nhl&tab=results">The record</Link>
            <Link href="/nhl/standings">Standings</Link>
          </footer>
        </article>

        <article className={`${styles.product} ${styles.fantasy}`}>
          <header><i>F</i><div><strong>FRANCHISE</strong><small>FANTASY</small></div></header>
          <h3>Your league, with DASH reading it.</h3>
          {me.user && me.leagues.length ? (
            <ul className={styles.leagues}>
              {me.leagues.map((league) => {
                const mine = me.teams.find((team) => team.league_id === league.id && team.owner_id === me.user.id)
                return (
                  <li key={league.id}>
                    <Link href={`/fantasy/league/${league.id}`}>
                      <b>{league.name}</b>
                      <span>{mine?.name || 'your team'} · {league.status}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.muted}>
              {me.user ? 'No leagues yet — create one or enter an invite code.' : 'Draft with friends, run waivers and trades, and get a straight answer when you are stuck.'}
            </p>
          )}
          <footer>
            <Link href="/fantasy">Open FRANCHISE →</Link>
          </footer>
        </article>
      </section>

      <section className={styles.auth} id="sign-in">
        {/* ── WHAT NOW (2026-08-31) ────────────────────────────────────────
            Donovan's third sign-up report: "didn't know what to do after
            signing up." The old flow redirected to `/` — the very page they
            were already on — with no acknowledgement that anything had
            happened. An account was created and the site said nothing.
            Three destinations, because three is a choice and eight is a
            menu, and each one names what it is FOR rather than where it
            goes. */}
        {welcomeName ? (
          <div className={styles.welcome}>
            <p className={styles.kicker}>YOU&apos;RE IN</p>
            <h2>Welcome, {welcomeName}.</h2>
            <p>
              That&apos;s the whole sign-up — nothing else is needed. Your watchlist, who you
              follow and your picks now save to this account and turn up on any device you sign
              in on. Here is where most people go first.
            </p>
            <div className={styles.welcomeSteps}>
              <Link href="/app#sport=mlb&tab=home">Open MOONSHOT<span>MOONSHOT&apos;s read on tonight&apos;s baseball, graded by morning.</span></Link>
              <Link href="/app#sport=mlb&tab=bot">Star a few hitters<span>The ☆ on any player saves him to your watchlist — that is the thing an account is for.</span></Link>
              <Link href="/account">Turn on alerts<span>Get told when one of your names goes deep, on this device or off it.</span></Link>
            </div>
          </div>
        ) : null}
        {me.user ? (
          <div className={styles.signedIn}>
            <p className={styles.kicker}>YOUR ACCOUNT</p>
            <h2>{displayName}, your lists follow you.</h2>
            <p className={styles.muted}>
              Watchlist, Following, and My Picks on MOONSHOT, TUDDY and LAMP save to this account and turn up on
              any device you sign in on. Sign out and they stay on this browser only.
            </p>
            <div className={styles.signOutRow}>
              <Link className={styles.barCta} href="/account">Account settings →</Link>
              <form action={dashSignOut}><input type="hidden" name="next" value="/" /><SubmitButton pendingLabel="Signing out…">Sign out</SubmitButton></form>
            </div>
          </div>
        ) : me.configured ? (
          // Folded behind one button (funnel step 1): the form was ~900px of
          // a 4,000px phone page. #sign-in / #create-account open it (the
          // header links, /login, the actions' redirects), and it opens by
          // itself when someone is mid-sign-up.
          <details className={styles.authFold} id="auth" open={authOpen || undefined}>
            <summary className={styles.barCta}>Create free account</summary>
            <div className={styles.authIntro}>
              <p className={styles.kicker}>ONE ACCOUNT, WHOLE NETWORK</p>
              <h2>Keep your list when you switch devices.</h2>
              <span>
                Free, and it changes nothing about reading the site — MOONSHOT, TUDDY and LAMP are
                open to everyone, signed in or not. What it saves: your watchlist, who you follow, and
                your picks. It is the same login Franchise already uses.
              </span>
            </div>
            <div className={styles.authGrid}>
              {/* notice/defaults come from back() in actions.js: a failed
                  attempt returns here with the name and email already typed,
                  the right tab open, and the reason next to the field rather
                  than at the top of the page. The password is deliberately
                  never carried in a URL. */}
              <DashAuthCard
                next="/"
                notice={params.error || params.message || null}
                noticeType={params.error ? 'error' : 'message'}
                defaultEmail={typeof params.em === 'string' ? params.em : ''}
                defaultName={typeof params.nm === 'string' ? params.nm : ''}
                confirmEmail={typeof params.confirm === 'string' ? params.confirm : ''}
              />
              <p className={styles.authEscape}>
                Don&apos;t want an account? <Link href="/app#sport=mlb&tab=home">Open MOONSHOT anyway →</Link>{' '}
                Everything on MOONSHOT, TUDDY and LAMP is readable without one.
              </p>
            </div>
          </details>
        ) : (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy — everything you save stays in this browser.</p>
        )}
        <OpenOnHash id="auth" also={['sign-in', 'create-account']} />
      </section>

      {/* Thirty-six switches are for somebody who has already decided; a
          stranger scrolled past two screens of them (stranger test F2). One
          tap opens it, and so does the header's #alerts link (OpenOnHash --
          a browser won't open a <details> just because a link targets it). */}
      <section className={styles.alertsSection}>
        <details className={styles.alertsFold} id="alerts">
          <summary>Alerts &mdash; tell me when my players do something</summary>
          <AlertsPanel styles={styles} />
        </details>
        <OpenOnHash id="alerts" />
      </section>

      <footer className={styles.foot}>
        <span>DASH NETWORK</span>
        <Link href="/start">Start here</Link>
        <Link href="/called">CALLED IT</Link>
        <Link href="/app#sport=mlb&tab=home">MOONSHOT · MLB</Link>
        <Link href="/app#sport=nfl&tab=home">TUDDY · NFL</Link>
        <Link href="/app#sport=nhl&tab=home">LAMP · NHL</Link>
        <Link href="/fantasy">FRANCHISE · FANTASY</Link>
      </footer>
    </main>
  )
}

function Tile({ label, value, sub, accent }) {
  return (
    <div className={`${styles.tile} ${styles[accent] || ''}`}>
      <small>{label}</small>
      <strong>{value ?? '—'}</strong>
      <span>{sub || ''}</span>
    </div>
  )
}
