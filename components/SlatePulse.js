'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { gradedResultsUrl } from '../lib/dataSource'
import { nameOf, teamOf, clean, n } from '../lib/player'

// SLATE PULSE — two strips for the landing tab:
//
// 1. UNCONFIRMED PICKS COUNTDOWN. The archive says unconfirmed hitters homer
//    10.2% vs 15.2% confirmed — a real gap, so a designated pick whose lineup
//    isn't locked deserves a visible clock, sorted by first pitch. Chips
//    disappear as lineups confirm; the strip removes itself when all clear.
//
// 2. SLATE DIFF vs yesterday. The bot changing its mind IS information: who
//    became a pick today that wasn't one yesterday, who was dropped, who
//    changed category. Yesterday's picks come from the graded archive file
//    (game_pick_role on graded slots), so this works with data already on
//    the branch. Shown collapsed by default — it's context, not a task.

const primaryRole = (p) => String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()

function minsUntil(t) {
  if (!t) return null
  const d = new Date(t).getTime() - Date.now()
  return Number.isFinite(d) ? Math.round(d / 60000) : null
}
const fmtCountdown = (m) => {
  if (m == null) return ''
  if (m <= 0) return 'started'
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export default function SlatePulse({ players = [], backtest, onPlayerClick }) {
  // ── unconfirmed designated picks ──
  const unconfirmed = useMemo(() => (
    players
      .filter((p) => primaryRole(p) && !p?.lineup_confirmed)
      .map((p) => ({ p, mins: minsUntil(p?.game_time) }))
      .sort((a, b) => (a.mins ?? 9e9) - (b.mins ?? 9e9))
  ), [players])

  // ── yesterday's picks for the diff ──
  const [yday, setYday] = useState(null)
  const [showDiff, setShowDiff] = useState(false)

  const ydayDate = useMemo(() => {
    const per = backtest?.per_day
    const dates = (Array.isArray(per) ? per.map((d) => d?.date) : Object.keys(per || {})).filter(Boolean).sort()
    return dates[dates.length - 1] || null
  }, [backtest])

  useEffect(() => {
    if (!ydayDate) return
    let alive = true
    fetch(gradedResultsUrl(ydayDate))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setYday(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [ydayDate])

  const diff = useMemo(() => {
    if (!yday) return null
    const slots = Array.isArray(yday?.graded_slots) ? yday.graded_slots
      : Array.isArray(yday?.results) ? yday.results : []
    const was = new Map()
    slots.forEach((s) => {
      const role = String(s?.game_pick_role || s?.pick_type || '').split('/')[0].trim().toUpperCase()
      const nm = String(s?.name || '').toLowerCase().trim()
      if (role && nm) was.set(nm, role)
    })
    if (!was.size) return null
    const now = new Map()
    players.forEach((p) => {
      const role = primaryRole(p)
      if (role) now.set(String(nameOf(p)).toLowerCase().trim(), { role, p })
    })
    const added = [...now.entries()].filter(([nm]) => !was.has(nm))
    const dropped = [...was.entries()].filter(([nm]) => !now.has(nm))
    const changed = [...now.entries()]
      .filter(([nm, v]) => was.has(nm) && was.get(nm) !== v.role)
      .map(([nm, v]) => ({ nm, from: was.get(nm), to: v.role, p: v.p }))
    return { added, dropped, changed, date: ydayDate }
  }, [yday, players, ydayDate])

  if (!unconfirmed.length && !diff) return null

  return (
    <div style={{ marginBottom: 14 }}>
      {unconfirmed.length > 0 && (
        <div style={{
          background: 'linear-gradient(155deg, rgba(252,211,77,.08), rgba(252,211,77,.02))',
          border: '1px solid rgba(252,211,77,.3)', borderRadius: 11,
          padding: '8px 12px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FCD34D' }}>
              ⏳ {unconfirmed.length} pick{unconfirmed.length > 1 ? 's' : ''} not lineup-confirmed
            </span>
            <span style={{ fontSize: 9, color: C.text3 }}>
              unconfirmed hitters homered 10.2% vs 15.2% confirmed across the archive — watch these until they lock
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {unconfirmed.slice(0, 12).map(({ p, mins }) => (
              <button
                key={`${p?.player_id}-${p?.game_pk}`}
                onClick={() => onPlayerClick?.(p)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer',
                  background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: '3px 9px',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
                <span style={{ fontSize: 9, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
                  {primaryRole(p)}
                </span>
                <span style={{
                  fontSize: 9, fontFamily: NUM_FONT, fontWeight: 800,
                  color: mins != null && mins < 75 ? '#f87171' : C.text3,
                }}>{fmtCountdown(mins)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {diff && (diff.added.length || diff.dropped.length || diff.changed.length) > 0 && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px',
        }}>
          <div
            onClick={() => setShowDiff((v) => !v)}
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer' }}
          >
            <span style={{ fontSize: 11, fontWeight: 800 }}>🔁 Since {diff.date.slice(5)} {showDiff ? '▾' : '▸'}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
              {diff.added.length} new picks · {diff.dropped.length} dropped · {diff.changed.length} changed category
            </span>
          </div>
          {showDiff && (
            <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 10.5 }}>
              {diff.added.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 9.5 }}>NEW</span>
                  {diff.added.map(([nm, v]) => (
                    <span key={nm} onClick={() => onPlayerClick?.(v.p)}
                      style={{ cursor: 'pointer', color: C.text2 }}>
                      {nameOf(v.p)} <b style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9 }}>{v.role}</b>
                    </span>
                  ))}
                </div>
              )}
              {diff.changed.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ color: '#FCD34D', fontWeight: 800, fontSize: 9.5 }}>MOVED</span>
                  {diff.changed.map((c) => (
                    <span key={c.nm} onClick={() => onPlayerClick?.(c.p)}
                      style={{ cursor: 'pointer', color: C.text2 }}>
                      {nameOf(c.p)} <b style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>{c.from}→</b>
                      <b style={{ color: C.orange, fontFamily: NUM_FONT, fontSize: 9 }}>{c.to}</b>
                    </span>
                  ))}
                </div>
              )}
              {diff.dropped.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'baseline' }}>
                  <span style={{ color: '#f87171', fontWeight: 800, fontSize: 9.5 }}>DROPPED</span>
                  {diff.dropped.map(([nm, role]) => (
                    <span key={nm} style={{ color: C.text3 }}>
                      {nm.replace(/\b\w/g, (c) => c.toUpperCase())} <span style={{ fontFamily: NUM_FONT, fontSize: 9 }}>{role}</span>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 8.5, color: C.text3, lineHeight: 1.5 }}>
                Yesterday&apos;s picks come from the graded archive; dropped names may simply not be
                playing today rather than demoted. The bot changing its mind is information either way.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
