'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
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

const ROLES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const roleOf = (p) => String(p?.game_pick_role || '').split('/').filter(Boolean).map((r) => r.trim().toUpperCase())

export default function ScoreRail({ players = [], results, onNavigate }) {
  const [games, setGames] = useState(null)

  useEffect(() => {
    let alive = true
    const pull = () => scheduleFor(slateDay(0)).then((g) => { if (alive && g) setGames(g) }).catch(() => {})
    pull()
    const t = setInterval(() => { if (!document.hidden) pull() }, 45000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  // The bot's picks, per game, graded off the published results file. This is
  // the SAME grading rule every other surface uses (pickCleared), and it is
  // fed the date-gated results copy — a stale file must never put a green
  // check on tonight's rail.
  const byGame = useMemo(() => {
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
  }, [players, results])

  if (!games?.length) return null

  const live = games.filter((g) => g.live)
  const rest = games.filter((g) => !g.live)
  const ordered = [...live, ...rest]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
          color: C.text2, fontFamily: NUM_FONT,
        }}>Tonight</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          {live.length ? `${live.length} live · ` : ''}{games.filter((g) => g.final).length} final
          {' '}· the x/y beside each game&apos;s state is the bot&apos;s picks in that game
        </span>
        {onNavigate && (
          <button onClick={() => onNavigate('boxes')} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: NUM_FONT, fontSize: 9.5, color: C.orange, fontWeight: 800,
          }}>full boxes →</button>
        )}
      </div>

      {/* Principle 1 — the air lives in the tiles' own padding rather than in
          the gap, so a hovered tile is one continuous surface instead of a box
          floating inside a bigger box. */}
      <div className="dense-scroll rail" style={{ display: 'flex', gap: 2, overflowX: 'auto', paddingBottom: 4 }}>
        {ordered.map((g) => {
          const rec = byGame.get(g.pk)
          const w = g.final && g.away.score != null && g.home.score != null
            ? (g.away.score > g.home.score ? 'away' : g.home.score > g.away.score ? 'home' : null)
            : null
          const stateTxt = g.postponed ? 'PPD'
            : g.suspended ? 'SUSP'
              : g.live ? `${/top/i.test(g.inningState) ? '▲' : '▼'}${g.inning ?? ''}`
                : g.final ? 'F'
                  : g.startTime ? new Date(g.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
          return (
            <div key={g.pk}
              className="quiet-tile"
              onClick={() => onNavigate?.('boxes')}
              title={rec?.names?.length ? rec.names.join('\n') : undefined}
              style={{
                flex: '0 0 auto', minWidth: 124, cursor: onNavigate ? 'pointer' : 'default',
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
                      see lib/mlbTeams.js. */}
                  <MlbTeamMark abbr={t.abbr || t.name} dim={!!(w && w !== side)} />
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
    </div>
  )
}
