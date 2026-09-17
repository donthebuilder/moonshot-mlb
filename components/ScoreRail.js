'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM_FONT } from '../lib/theme'
import { scheduleFor, slateDay } from '../lib/boxscore'
import { mlbId } from '../lib/player'
import { pickCleared } from '../lib/liveSlate'
import MlbTeamMark from './MlbTeamMark'

// 🛰 THE RAIL — every game on the slate, at a glance, with your side of it.
//
// 2026-08-15, Donovan sent ESPN's front page and asked what we can add to
// Home. The thing worth taking from it is the strip along the top: every game,
// score, state, always visible, no clicking.
//
// The thing worth ADDING to it is the only column ESPN can't have. Under each
// score is how the bot's designated picks in THAT game are doing right now —
// so the rail answers "what's happening" and "does it matter to me" in the
// same glance. A score is a fact anyone has; a score next to your own position
// in it is the reason to look here instead of there.
//
// It reads the schedule (one request, shared cache with the Boxes tab) and the
// slate rows already in memory. No new poll on the sitewide timer: it refreshes
// itself every 45s and only while something is actually live.
//
// ── THE APPLE SPORTS PASS (2026-08-16) ──────────────────────────────────────
//
// Donovan sent screenshots of the Apple Sports app and ESPN's app: "how can we
// make have something like these for the site" → "just the style feed and then
// the hover all simplicist look of it. i know we are more in the realm of
// research and stats but some aspects need to be like this."
//
// Scoped to the LIVE LAYER only — this rail and the game cards. The research
// tables stay dense, because studying is what they are for; this is where you
// GLANCE. Four principles, read off his screenshots, and what each one changed
// here. NOTHING WAS REMOVED — every fact, tooltip and title that rendered
// before still renders, some of it just smaller and greyer:
//
//   1. ONE THING PER ROW, LOTS OF AIR. Each game was a 118px box with a border
//      around six numbers. It is now a borderless column with real padding
//      between neighbours, so the eye lands on one game at a time.
//   2. TYPE DOES THE HIERARCHY, NOT BOXES. The score went 12px → 17px and the
//      state (inning, first pitch, F) dropped to small grey. Apple's score is
//      huge and its context is a whisper; the border that used to group the
//      two teams is now just whitespace, and the hover state (.quiet-tile in
//      MobileCSS) is the only box that ever appears.
//   3. COLOUR IS RARE. The live dot is the one piece of colour in the rail.
//      The green live tint and green border are gone; the winner is now told
//      by weight and by the loser going grey, the way Apple tells it, instead
//      of by an orange numeral. The pick record keeps green ONLY when a pick
//      has actually cleared — colour that means something.
//   4. NO CHROME. The record pill lost its border (a number needs no ring),
//      PPD/SUSP lost their colour coding (the word already says it).
//
// ── SHELLED OUT FOR TUDDY (2026-09-16) ───────────────────────────────────────
//
// Donovan: "why is the tuddy page spinning so fast" widened into "would it be
// best to full delete the nfl side, or shell it out so we have the same exact
// components... just branded for nfl and tuddy." This rail was the clearest
// case — TUDDY's own version (SlateStrip, in components/nfl/tabs/Home.js) was
// a 20-line placeholder missing this entire "does it matter to me" column, not
// just styled differently.
//
// So this is now the ONE rail both products render. Every sport-specific piece
// — colours, the team mark, how a game is fetched, what counts as "the bot's
// pick" and whether it cleared, and how a live game's clock reads — is a prop
// with an MLB default equal to EXACTLY what this file did before. MOONSHOT's
// own call site (components/tabs/Home.js) passes none of the new props and is
// byte-for-byte unaffected. TUDDY's adapter (components/nfl/tabs/Home.js)
// is built entirely from data this project already publishes — lib/nfl/
// liveSlate.js's gameFor/lineFor/tdsIn, the same functions NflYourPlayers and
// the header ticker already read — nothing new invented, per rule #16.

const ROLES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const roleOf = (p) => String(p?.game_pick_role || '').split('/').filter(Boolean).map((r) => r.trim().toUpperCase())

// ── COLLAPSED BY DEFAULT (2026-09-03) ───────────────────────────────────────
//
// Donovan: "the thing tracking all the players from the live at the top of the
// screen takes up the screen every time I open the page."
//
// It is the tallest always-on block above the fold: a header row, then a
// scroller of 124px tiles two team-rows deep, on every visit to Home whether
// or not tonight is the reason you came. Everything in it is a GLANCE, and a
// glance you did not ask for is furniture.
//
// So it opens as one line carrying the same three facts the header row already
// carried -- how many are live, how many are final, how the bot's picks are
// doing across them -- and the tiles are one tap away. It remembers the tap
// for the rest of the browser session (sessionStorage, not localStorage: "I
// want the scores today" is a mood, not a setting, and a preference you set
// once in August should not still be deciding your layout in October).
const RAIL_OPEN_KEY = 'dash_rail_open_v1'
const railWasOpen = (key) => {
  try { return sessionStorage.getItem(key) === '1' } catch { return false }
}

// The exact MLB reducer this file always ran, now named so it can serve as
// the default `computeByGame`. Signature unchanged: (players, results).
// Exported (round 10, ONE COMBINED RAIL) so lib/combinedRail.js's merged-
// state helper can share it instead of copying the ternary a second time.
export function defaultMlbByGame(players, results) {
  const lines = new Map()
  const rows = results?.graded_slots || results?.results || []
  rows.forEach((r) => {
    const id = mlbId(r)
    if (!id) return
    // One row per pick CATEGORY, identical actual_* on each — first wins.
    if (!lines.has(id)) {
      lines.set(id, {
        ab: Number(r.actual_ab) || 0, bb: Number(r.actual_bb) || 0,
        h: Number(r.actual_hits) || 0, hr: Number(r.actual_hr) || 0,
        tb: Number(r.actual_tb) || 0, r: Number(r.actual_runs) || 0,
        rbi: Number(r.actual_rbi) || 0, settled: true,
      })
    }
  })
  const out = new Map()
  players.forEach((p) => {
    const roles = roleOf(p).filter((x) => ROLES.includes(x))
    if (!roles.length) return
    const pk = Number(p?.game_pk)
    if (!pk) return
    const line = lines.get(mlbId(p)) || null
    const rec = out.get(pk) || { n: 0, ok: 0, live: 0, names: [] }
    roles.forEach((role) => {
      rec.n += 1
      // Void is not a miss and it is not a hit — it simply leaves both
      // counts, the same rule as everywhere else in this project.
      if (line && line.ab === 0 && line.bb === 0) { rec.n -= 1; return }
      const c = line ? pickCleared(role, line) : null
      if (c === true) { rec.ok += 1; rec.names.push(`${p.player_name || ''} ${role} ✓`) }
      else if (c === null || !line) rec.live += 1
    })
    out.set(pk, rec)
  })
  return out
}

// The exact MLB state-text ternary this file always ran, now the default
// `renderState`. Exported (round 10) for the same reason as
// `defaultMlbByGame` above -- lib/combinedRail.js's `combinedRenderState`
// reuses this for the MLB half of a merged rail instead of duplicating it.
export function defaultMlbState(g) {
  return g.postponed ? 'PPD'
    : g.suspended ? 'SUSP'
      : g.live ? `${/top/i.test(g.inningState) ? '▲' : '▼'}${g.inning ?? ''}`
        : g.final ? 'F'
          : g.startTime ? new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
}

export default function ScoreRail({
  players = [], results, onNavigate,
  sport = 'mlb',
  theme,
  TeamMark = MlbTeamMark,
  fetchGames = () => scheduleFor(slateDay(0)),
  computeByGame = defaultMlbByGame,
  renderState = defaultMlbState,
  label = 'Tonight',
  moreLabel = 'full boxes →',
  moreTarget = 'boxes',
  // ONE RAIL, BOTH SPORTS (round 10, 2026-09-17). Donovan: "merge it over to
  // moon shot ... i just want the hader to be seamleass acrre those whole
  // site" -- asked which "exact match" he meant for this rail specifically
  // (AskUserQuestion), and he picked merging both sports into one rail
  // rather than keeping two visually-identical-but-separate ones. `fetchGames`
  // can now hand back games from BOTH sports in one array, each tagged
  // `sport: 'mlb'|'nfl'` (see lib/combinedRail.js) -- this component still
  // has no idea two sports exist beyond that one optional tag. `onSwitchSport`
  // is new and optional: when a tile's own tag disagrees with this rail's own
  // `sport` prop, a tap has nowhere sensible to navigate TO on this product
  // (MOONSHOT's own box-scores tab can't show an NFL game), so it calls this
  // instead -- same job the header ticker's `setSport('mlb'/'nfl')` already
  // does for a cross-sport tile. Untagged games (every existing caller that
  // hasn't opted into a merged `fetchGames`) never hit that branch at all.
  onSwitchSport,
}) {
  const C = theme?.C || MLB_C
  const NUM_FONT = theme?.NUM_FONT || MLB_NUM_FONT
  // MOONSHOT keeps the exact original key so an already-open rail never
  // resets for existing users; every other sport gets its own key so the
  // two rails don't fight over one flag in the same browser tab.
  const storageKey = sport === 'mlb' ? RAIL_OPEN_KEY : `dash_rail_open_v1_${sport}`
  const [games, setGames] = useState(null)
  // Read in an effect, not in useState's initialiser: this component renders
  // on the server too, where sessionStorage does not exist, and a first paint
  // that disagrees with the second is a hydration error.
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(railWasOpen(storageKey)) }, [storageKey])
  const toggle = () => setOpen((v) => {
    const next = !v
    try { sessionStorage.setItem(storageKey, next ? '1' : '0') } catch { /* private mode */ }
    return next
  })

  // `fetchGames`/`computeByGame` come in as props and may be a fresh function
  // identity on every parent render (TUDDY's adapter is built inline). The
  // poller below must still only ever run ONCE per mount — exactly like this
  // file always has — so it reads the latest one through a ref instead of
  // depending on it, the same "read fresh, don't restart the loop" pattern
  // lib/headlines.js's useAutoScroll already uses.
  const fetchGamesRef = useRef(fetchGames)
  useEffect(() => { fetchGamesRef.current = fetchGames })
  useEffect(() => {
    let alive = true
    const pull = () => fetchGamesRef.current().then((g) => { if (alive && g) setGames(g) }).catch(() => {})
    pull()
    const t = setInterval(() => { if (!document.hidden) pull() }, 45000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // The bot's picks, per game. MLB's default reads the graded results file
  // (pickCleared); TUDDY's own computeByGame ignores these two args entirely
  // and closes over its own live snapshot instead — see components/nfl/tabs/
  // Home.js's nflComputeByGame for why.
  const byGame = useMemo(() => computeByGame(players, results), [players, results, computeByGame])

  if (!games?.length) return null

  const live = games.filter((g) => g.live)
  const rest = games.filter((g) => !g.live)
  const ordered = [...live, ...rest]

  // The pick record across every game, so the collapsed line can carry the one
  // number the tiles exist to show. Same counts, summed -- not a second rule.
  let pn = 0; let pok = 0
  byGame.forEach((r) => { pn += r.n; pok += r.ok })

  return (
    <div style={{ marginBottom: open ? 16 : 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: open ? 7 : 0 }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={open ? `Collapse ${label}’s games` : 'Show every game on the slate'}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 8, background: 'none',
            border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{
            fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
            color: C.text2, fontFamily: NUM_FONT,
          }}>{label}</span>
          <span style={{ fontSize: 9, color: C.text3 }}>
            {live.length ? `${live.length} live · ` : ''}{games.filter((g) => g.final).length} final
            {pn > 0 && <> · picks <b style={{ color: pok ? C.green : C.text3 }}>{pok}/{pn}</b> cleared</>}
            {open
              ? <> · the x/y beside each game&apos;s state is the bot&apos;s picks in that game</>
              : <> · {games.length} game{games.length === 1 ? '' : 's'}</>}
          </span>
          <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
            {open ? '▴' : '▾'}
          </span>
        </button>
        {onNavigate && (
          <button onClick={() => onNavigate(moreTarget)} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: NUM_FONT, fontSize: 9.5, color: C.orange, fontWeight: 800,
          }}>{moreLabel}</button>
        )}
      </div>
      {/* Principle 1 — the air lives in the tiles' own padding rather than in
          the gap, so a hovered tile is one continuous surface instead of a box
          floating inside a bigger box. */}
      {!open ? null : (
      <div className="dense-scroll rail" style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 4 }}>
        {ordered.map((g) => {
          const rec = byGame.get(g.pk)
          const w = g.final && g.away.score != null && g.home.score != null
            ? (g.away.score > g.home.score ? 'away' : g.home.score > g.away.score ? 'home' : null)
            : null
          const stateTxt = renderState(g)
          // A tile for the OTHER sport (merged rail only -- see onSwitchSport
          // above) has no `moreTarget` on this product worth going to; switch
          // products instead, same as the header ticker does for its own
          // cross-sport tiles.
          const foreign = g.sport && g.sport !== sport
          return (
            <div key={g.pk}
              className="quiet-tile"
              onClick={() => (foreign ? onSwitchSport?.(g.sport) : onNavigate?.(moreTarget))}
              title={rec?.names?.length ? rec.names.join('\n') : undefined}
              style={{
                flex: '0 0 auto', minWidth: 124, cursor: (foreign ? onSwitchSport : onNavigate) ? 'pointer' : 'default',
                padding: '5px 12px 6px',
              }}>
              {/* Principle 3 + 4 — the dot is the rail's only colour, and the
                  state text beside it is deliberately the quietest thing on
                  the tile. minHeight keeps the two team rows on the same
                  baseline across live and non-live games. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 13 }}>
                {g.live && (
                  <span className="live-pulse" style={{
                    width: 5, height: 5, borderRadius: '50%', background: C.green, flexShrink: 0,
                  }} />
                )}
                <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 700, color: C.text3 }}>{stateTxt}</span>
                {rec?.n > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 700,
                    color: rec.ok ? C.green : C.text3,
                  }}>{rec.ok}/{rec.n}{rec.live ? '·' : ''}</span>
                )}
              </div>
              {[['away', g.away], ['home', g.home]].map(([side, t]) => (
                <div key={side} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  alignItems: 'baseline', lineHeight: 1.22,
                }}>
                  {/* ── THE CLUB, NOT JUST ITS LETTERS (2026-08-29) ────────
                      Donovan, on blending FRANCHISE's look into MOONSHOT:
                      team identity marks are the biggest "looks modern" win
                      available and they add zero claims. This rail rendered
                      thirty clubs in identical grey monospace, which is the
                      one place on the site where you are meant to find YOUR
                      game at a glance.

                      The mark carries the club's own colour and nothing else
                      — no logo (licensing, and thirty image requests on a
                      strip that has to stay fast). The losing side still
                      dims, because that is how this rail says who won and a
                      club colour must never take that job over.

                      A club colour is an IDENTITY here, never a data colour:
                      see lib/mlbTeams.js (MLB) / lib/nfl/teamColors.js (NFL). */}
                  <TeamMark abbr={t.abbr || t.name} dim={!!(w && w !== side)} sport={g.sport || sport} />
                  {/* Principle 2 — the score is the biggest thing here by a
                      factor the old 12px never gave it. The winner is told by
                      the loser dimming, not by an accent. */}
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 17, fontWeight: 700, letterSpacing: '-.02em',
                    color: t.score == null || (w && w !== side) ? C.text3 : C.text,
                  }}>{t.score ?? '–'}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>
      )}
    </div>
  )
}
