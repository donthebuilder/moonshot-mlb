'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { scheduleFor, slateDay } from '../lib/boxscore'
import { mlbId } from '../lib/player'
import { pickCleared } from '../lib/liveSlate'

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
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
        <span style={{
          fontSize: 8.5, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase',
          color: C.text2, fontFamily: NUM_FONT,
        }}>Tonight</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          {live.length ? `${live.length} live · ` : ''}{games.filter((g) => g.final).length} final
          {' '}· the number under each score is the bot&apos;s picks in that game
        </span>
        {onNavigate && (
          <button onClick={() => onNavigate('boxes')} style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: NUM_FONT, fontSize: 9.5, color: C.orange, fontWeight: 800,
          }}>full boxes →</button>
        )}
      </div>

      <div className="dense-scroll rail" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 3 }}>
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
          const stateCol = g.live ? '#4ade80' : g.postponed ? '#a1a1aa' : g.suspended ? '#60A5FA' : C.text3
          return (
            <div key={g.pk}
              onClick={() => onNavigate?.('boxes')}
              title={rec?.names?.length ? rec.names.join('\n') : undefined}
              style={{
                flex: '0 0 auto', minWidth: 118, cursor: onNavigate ? 'pointer' : 'default',
                border: `1px solid ${g.live ? 'rgba(74,222,128,.3)' : C.border}`,
                borderRadius: 10, padding: '6px 9px',
                background: g.live ? 'rgba(74,222,128,.05)' : C.bg2,
              }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, color: stateCol }}>{stateTxt}</span>
                {rec?.n > 0 && (
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900,
                    padding: '0 5px', borderRadius: 999,
                    color: rec.ok ? '#4ade80' : C.text3,
                    border: `1px solid ${rec.ok ? 'rgba(74,222,128,.35)' : C.border}`,
                  }}>{rec.ok}/{rec.n}{rec.live ? '·' : ''}</span>
                )}
              </div>
              {[['away', g.away], ['home', g.home]].map(([side, t]) => (
                <div key={side} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 11,
                    fontWeight: w === side ? 900 : 600,
                    color: w && w !== side ? C.text3 : C.text,
                  }}>{t.abbr || t.name}</span>
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 12, fontWeight: 900,
                    color: t.score == null ? C.text3 : w === side ? C.orange : C.text,
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
