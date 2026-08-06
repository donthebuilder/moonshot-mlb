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
  const [showAllUnconf, setShowAllUnconf] = useState(false)
  const [colOpen, setColOpen] = useState({})

  const ydayDate = useMemo(() => {
    const per = backtest?.per_day
    const dates = (Array.isArray(per) ? per.map((d) => d?.date) : Object.keys(per || {})).filter(Boolean).sort()
    // STRICTLY BEFORE TODAY. Grading now catches up same-day, so the latest
    // graded file can be TODAY's — and diffing today's slate against today's
    // own in-progress grading declared every pick "new" ("Since 08-05 · 85
    // new picks" on 08-05). Yesterday means yesterday.
    const today = new Date().toISOString().slice(0, 10)
    const prior = dates.filter((d) => d < today)
    return prior[prior.length - 1] || null
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
          {/* Restraint pass (2026-08-06): a 49-chip wall buried the page.
              Eight chips — the ones locking SOONEST, which are the only
              urgent ones — and an honest expander for the rest. */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {unconfirmed.slice(0, showAllUnconf ? unconfirmed.length : 8).map(({ p, mins }) => (
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
            {unconfirmed.length > 8 && (
              <button onClick={() => setShowAllUnconf((v) => !v)} style={{
                fontSize: 10, fontWeight: 700, color: '#FCD34D', cursor: 'pointer',
                background: 'transparent', border: '1px dashed rgba(252,211,77,.4)',
                borderRadius: 7, padding: '3px 10px', fontFamily: NUM_FONT,
              }}>
                {showAllUnconf ? 'show fewer' : `+${unconfirmed.length - 8} more`}
              </button>
            )}
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
          {/* COLUMNS, NOT RIVERS (2026-08-06). Thirty-six names run together
              in a paragraph is a wall, not information. Three columns with
              counts, ten rows each, expanders for the rest — the eye can
              actually walk a list. */}
          {showDiff && (() => {
            const COLS = [
              ['new', 'NEW', '#4ade80', diff.added.map(([nm, v]) => ({ key: nm, label: nameOf(v.p), tag: v.role, p: v.p }))],
              ['moved', 'MOVED', '#FCD34D', diff.changed.map((c) => ({ key: c.nm, label: nameOf(c.p), tag: `${c.from}→${c.to}`, p: c.p }))],
              ['dropped', 'DROPPED', '#f87171', diff.dropped.map(([nm, role]) => ({ key: nm, label: nm.replace(/\b\w/g, (ch) => ch.toUpperCase()), tag: role, p: null }))],
            ].filter(([, , , list]) => list.length)
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                  {COLS.map(([k, label, color, list]) => {
                    const open = !!colOpen[k]
                    const shown = open ? list : list.slice(0, 10)
                    return (
                      <div key={k} style={{ minWidth: 0, background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 900, color, letterSpacing: '.08em', fontFamily: NUM_FONT, marginBottom: 5 }}>
                          {label} <span style={{ color: C.text3, fontWeight: 400 }}>{list.length}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {shown.map((it) => (
                            <div key={it.key}
                              onClick={() => it.p && onPlayerClick?.(it.p)}
                              style={{
                                display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0,
                                cursor: it.p ? 'pointer' : 'default',
                              }}>
                              <span style={{
                                fontSize: 10.5, fontWeight: 600, color: k === 'dropped' ? C.text3 : C.text2,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>{it.label}</span>
                              <span style={{ marginLeft: 'auto', fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 800, color: k === 'moved' ? color : k === 'dropped' ? C.text3 : C.orange, flexShrink: 0 }}>{it.tag}</span>
                            </div>
                          ))}
                        </div>
                        {list.length > 10 && (
                          <button onClick={() => setColOpen((s) => ({ ...s, [k]: !open }))} style={{
                            marginTop: 5, fontSize: 9, fontWeight: 700, color, cursor: 'pointer',
                            background: 'transparent', border: 'none', padding: 0, fontFamily: NUM_FONT,
                          }}>{open ? 'show fewer' : `+${list.length - 10} more`}</button>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 8.5, color: C.text3, lineHeight: 1.5, marginTop: 6 }}>
                  Yesterday&apos;s picks come from the graded archive; dropped names may simply not be
                  playing today rather than demoted. The bot changing its mind is information either way.
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
