'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, clean, playerId as pidOf } from '../lib/player'
import { fetchLiveSlate, pickCleared } from '../lib/liveSlate'

// 📡 LIVE WIRE — the site's live feed, and deliberately NOT a highlight
// ticker (ESPN owns that). This is the model grading itself in public:
//   · every designated pick, live, against its own category bar — ✓ cleared,
//     still working, or ran out of at-bats
//   · every homer tonight as it lands, tagged 🤖 when the bot had him and
//     ★ when he's on your watchlist
//   · the slate's games with score and inning as the spine
// Refresh is a button, plus an opt-in 60s auto while the tab is visible.
// Nothing polls in the background; nothing here feeds a score.

const ROLE_COLOR = { TOP: '#FCD34D', HR: '#FB923C', HIT: '#60A5FA', HRR: '#22d3ee', CONTACT: '#A78BFA' }
const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

export default function LiveWire({ players = [], watchIds, onPlayerClick }) {
  const [snap, setSnap] = useState(null)
  const [busy, setBusy] = useState(false)
  const [auto, setAuto] = useState(false)
  const [open, setOpen] = useState(true)
  const timer = useRef(null)

  const refresh = async () => {
    setBusy(true)
    const s = await fetchLiveSlate()
    setSnap(s); setBusy(false)
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    clearInterval(timer.current)
    if (auto) timer.current = setInterval(() => { if (!document.hidden) refresh() }, 60000)
    return () => clearInterval(timer.current)
  }, [auto])

  if (!snap) return null
  const live = snap.games.filter((g) => g.state === 'Live')
  const finals = snap.games.filter((g) => g.state === 'Final')
  if (!live.length && !finals.length) return null   // pregame: the wire waits

  const abbrFor = (p) => teamOf(p)
  // designated picks with live lines
  const picks = players
    .filter((p) => primaryRole(p))
    .map((p) => {
      const line = snap.lines[Number(p?.player_id ?? p?.id)]
      const role = primaryRole(p)
      return { p, role, line, cleared: line ? pickCleared(role, line) : null }
    })
    .sort((a, b) => (b.cleared === true) - (a.cleared === true))
  const graded = picks.filter((x) => x.line)
  const clearedCount = graded.filter((x) => x.cleared === true).length

  // every homer tonight, model-tagged
  const slateIds = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const homers = Object.entries(snap.lines)
    .filter(([, l]) => l.hr > 0)
    .map(([id, l]) => {
      const p = slateIds.get(Number(id))
      return { id: Number(id), p, l, role: p ? primaryRole(p) : '', watched: p && watchIds?.has(pidOf(p)) }
    })
    .sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0) || b.l.hr - a.l.hr)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.025))`,
      border: '1px solid rgba(74,222,128,.22)', borderRadius: 12,
      padding: '9px 13px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}>
        <span style={{ fontSize: 12, fontWeight: 900, color: '#4ade80' }}>
          📡 Live wire {open ? '▾' : '▸'}
        </span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {live.length ? `${live.length} live` : 'slate final'}
          {graded.length > 0 && <> · picks {clearedCount}/{graded.length} cleared</>}
          {homers.length > 0 && <> · {homers.reduce((a, h) => a + h.l.hr, 0)} HR</>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setAuto((v) => !v)} title="Re-pull every 60s while this tab is visible" style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${auto ? '#4ade80' : C.border}`, background: auto ? 'rgba(74,222,128,.12)' : 'transparent',
            color: auto ? '#4ade80' : C.text3,
          }}>{auto ? '● auto 60s' : '○ auto'}</button>
          <button onClick={refresh} disabled={busy} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer', borderRadius: 6, padding: '2px 8px',
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}>{busy ? '…' : '↻ refresh'}</button>
        </span>
      </div>

      {open && (
        <>
          {/* homers as they land, model-tagged */}
          {homers.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {homers.map((h) => (
                <button key={h.id} onClick={() => h.p && onPlayerClick?.(h.p)} style={{
                  display: 'flex', gap: 6, alignItems: 'baseline', cursor: h.p ? 'pointer' : 'default',
                  border: `1px solid ${h.role ? 'rgba(249,115,22,.5)' : C.border}`,
                  background: h.role ? 'rgba(249,115,22,.08)' : 'rgba(255,255,255,.02)',
                  borderRadius: 7, padding: '3px 9px',
                }}>
                  <span style={{ fontSize: 11 }}>💥</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>
                    {h.p ? nameOf(h.p) : `#${h.id}`}{h.l.hr > 1 ? ` ×${h.l.hr}` : ''}
                  </span>
                  {h.role && <span style={{ fontSize: 8.5, fontWeight: 900, color: ROLE_COLOR[h.role] || C.orange, fontFamily: NUM_FONT }}>🤖 {h.role}</span>}
                  {h.watched && <span style={{ fontSize: 9 }}>★</span>}
                </button>
              ))}
            </div>
          )}

          {/* the picks, graded live against their own bars */}
          {graded.length > 0 && (
            <div style={{ display: 'grid', gap: 3, marginTop: 9, gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))' }}>
              {graded.map(({ p, role, line, cleared }) => {
                const col = ROLE_COLOR[role] || C.text3
                const done = line.state === 'Final'
                const status = cleared === true ? '✓' : done ? '✗' : '…'
                const sCol = cleared === true ? '#4ade80' : done ? 'rgba(248,113,113,.8)' : C.text3
                return (
                  <div key={pidOf(p)} onClick={() => onPlayerClick?.(p)} style={{
                    display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer', minWidth: 0,
                    padding: '2px 6px', borderRadius: 6,
                    background: cleared === true ? 'rgba(74,222,128,.06)' : 'transparent',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: sCol, width: 12 }}>{status}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 900, color: col, fontFamily: NUM_FONT, width: 30 }}>{role}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                      {nameOf(p)}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.text3, flexShrink: 0 }}>
                      {line.h}-{line.ab}{line.hr ? ` ${line.hr}HR` : ''}{line.tb > 1 ? ` ${line.tb}TB` : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 7, lineHeight: 1.5 }}>
            The model grading itself in public: each pick against ITS OWN bar (HR homers, HIT a hit,
            HRR 2+ H+R+RBI, CONTACT 2+ TB) — ✓ cleared, … still working, ✗ final without it. 💥 chips
            are every slate homer tonight, orange when the bot had him. Boxscore truth, refreshed when
            you ask{auto ? ' (auto every 60s while visible)' : ''} — no background polling.
          </div>
        </>
      )}
    </div>
  )
}
