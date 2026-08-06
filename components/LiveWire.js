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

export default function LiveWire({ players = [], results, watchIds, onPlayerClick }) {
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

  // ── 🔔 LOOK OUT — the notification layer: live tension, not results.
  // A cashed pair is news; a pair ONE LEG FROM cashing while the other leg's
  // game is still going is an alert. Same for pools one swing away and picks
  // running out of innings. Max eight, urgency-ordered.
  const alerts = []
  const lineOf = (x) => snap.lines[Number(x?.player_id)]
  const gameOf = (pkOrLine) => snap.games.find((g) => g.pk === (pkOrLine?.pk ?? pkOrLine))
  ;(results?.pair_pool_results?.all_pairs || []).forEach((pr) => {
    const la = lineOf(pr.a), lb = lineOf(pr.b)
    const aHR = la?.hr > 0, bHR = lb?.hr > 0
    if (aHR && bHR) {
      alerts.push({ pri: 0, icon: '💰', text: `PAIR CASHED — ${clean(pr.a?.name, '?')} + ${clean(pr.b?.name, '?')} both went deep (${pr.label})` })
    } else if (aHR || bHR) {
      const done = aHR ? pr.a : pr.b, needs = aHR ? pr.b : pr.a
      const nl = aHR ? lb : la
      if (nl?.state === 'Live') {
        alerts.push({ pri: 1, icon: '🎟', p: slateIds.get(Number(needs?.player_id)),
          text: `${clean(done?.name, '?')} went deep — ${clean(needs?.name, '?')} completes the "${pr.label}" pair, game live` })
      }
    }
  })
  ;(results?.pair_pool_results?.graded_pools || []).forEach((pl) => {
    const hit = Number(pl.hr_count) || 0, tot = Number(pl.total_count) || 0
    if (!tot) return
    const anyLive = (pl.players || []).some((mb) => lineOf(mb)?.state === 'Live')
    if (hit >= tot) alerts.push({ pri: 0, icon: '💰', text: `POOL CASHED — ${pl.label}, all ${tot} went deep` })
    else if (tot - hit === 1 && anyLive) {
      const missing = (pl.players || []).filter((mb) => !(lineOf(mb)?.hr > 0)).map((mb) => clean(mb?.name, '?'))
      alerts.push({ pri: 1, icon: '🎟', text: `${pl.label} is ${hit}/${tot} — one swing from cashing (${missing.join(', ')})` })
    }
  })
  graded.forEach(({ p, role, line, cleared }) => {
    if (cleared !== false && cleared !== null) return
    if (line.state !== 'Live') return
    const g = gameOf(line)
    if (!g?.inning || g.inning < 7) return
    const need = role === 'HR' || role === 'TOP' ? 'a homer'
      : role === 'HIT' ? 'a hit'
      : role === 'HRR' ? `2+ H+R+RBI (has ${line.h + line.r + line.rbi})`
      : `2+ TB (has ${line.tb})`
    alerts.push({ pri: 2, icon: '⏰', p, text: `${nameOf(p)} (${role} pick) still needs ${need} — ${g.inning}th inning` })
  })
  Object.entries(snap.lines).forEach(([id, l]) => {
    if (l.hr >= 2) {
      const p = slateIds.get(Number(id))
      alerts.push({ pri: 3, icon: '🚀', p, text: `${p ? nameOf(p) : `#${id}`} has ${l.hr} HR tonight${l.state === 'Live' ? ' — still batting' : ''}` })
    }
  })
  alerts.sort((a, b) => a.pri - b.pri)
  const topAlerts = alerts.slice(0, 8)

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
          {/* 🔔 look out — live tension, urgency-ordered */}
          {topAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8 }}>
              {topAlerts.map((a, i) => (
                <div key={i} onClick={() => a.p && onPlayerClick?.(a.p)} style={{
                  display: 'flex', gap: 7, alignItems: 'baseline', cursor: a.p ? 'pointer' : 'default',
                  fontSize: 10.5, lineHeight: 1.45, padding: '3px 8px', borderRadius: 7,
                  background: a.pri === 0 ? 'rgba(74,222,128,.09)' : a.pri === 1 ? 'rgba(252,211,77,.07)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${a.pri === 0 ? 'rgba(74,222,128,.35)' : a.pri === 1 ? 'rgba(252,211,77,.28)' : C.border}`,
                }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{a.icon}</span>
                  <span style={{ color: a.pri <= 1 ? C.text : C.text2, fontWeight: a.pri === 0 ? 800 : 600 }}>{a.text}</span>
                </div>
              ))}
            </div>
          )}

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
                  <span style={{ fontSize: 11, fontWeight: 700, color: h.p ? C.text : C.text3 }}>
                    {h.p ? nameOf(h.p) : (h.l.name || `#${h.id}`)}{h.l.hr > 1 ? ` ×${h.l.hr}` : ''}
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
                    <span style={{ fontSize: 12, fontWeight: 900, color: sCol, width: 12, flexShrink: 0 }}>{status}</span>
                    {/* CONTACT is 7 chars — 30px jammed it into the name */}
                    <span style={{ fontSize: 8, fontWeight: 900, color: col, fontFamily: NUM_FONT, width: 44, flexShrink: 0, letterSpacing: 0 }}>{role}</span>
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
