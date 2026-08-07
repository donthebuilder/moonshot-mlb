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
  // Collapsible like the Since panel (2026-08-07, Donovan: everything on this
  // page should be hideable). Choice persists per device; effect-read so the
  // server render and first client render agree.
  const [unconfOpen, setUnconfOpen] = useState(false)
  useEffect(() => { try { if (localStorage.getItem('sp_unconf_open') === '1') setUnconfOpen(true) } catch {} }, [])
  const flipUnconf = () => setUnconfOpen((v) => { try { localStorage.setItem('sp_unconf_open', v ? '0' : '1') } catch {}; return !v })
  const [colOpen, setColOpen] = useState({})

  const ydayDate = useMemo(() => {
    const per = backtest?.per_day
    const dates = (Array.isArray(per) ? per.map((d) => d?.date) : Object.keys(per || {})).filter(Boolean).sort()
    // STRICTLY BEFORE TODAY. Grading now catches up same-day, so the latest
    // graded file can be TODAY's — and diffing today's slate against today's
    // own in-progress grading declared every pick "new" ("Since 08-05 · 85
    // new picks" on 08-05). Yesterday means yesterday.
    const today = new Date().toLocaleDateString('en-CA')
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
    // Did last night's pick CLEAR? Per-category bars, same rules the archive
    // grades on: HR/TOP = homered, HIT = got a hit, HRR = 2+ H+R+RBI,
    // CONTACT = 2+ TB. Null (no mark) when the slot never finalized.
    const clearedOf = (s, role) => {
      if (!s || Number(s.is_final) !== 1) return null
      const h = n(s.actual_hits, 0), hr = n(s.actual_hr, 0)
      const combo = h + n(s.actual_runs, 0) + n(s.actual_rbi, 0)
      if (role === 'HR' || role === 'TOP') return hr >= 1
      if (role === 'HIT') return h >= 1
      if (role === 'HRR') return combo >= 2
      if (role === 'CONTACT' || role === 'TB') return n(s.actual_tb, 0) >= 2
      return null
    }
    const was = new Map()
    slots.forEach((s) => {
      const role = String(s?.game_pick_role || s?.pick_type || '').split('/')[0].trim().toUpperCase()
      const nm = String(s?.name || '').toLowerCase().trim()
      if (role && nm) was.set(nm, { role, cleared: clearedOf(s, role) })
    })
    if (!was.size) return null
    const now = new Map()
    players.forEach((p) => {
      const role = primaryRole(p)
      if (role) now.set(String(nameOf(p)).toLowerCase().trim(), { role, p })
    })
    const added = [...now.entries()].filter(([nm]) => !was.has(nm))
    const dropped = [...was.entries()].filter(([nm]) => !now.has(nm))
      .map(([nm, w]) => [nm, w.role, w.cleared])
    const changed = [...now.entries()]
      .filter(([nm, v]) => was.has(nm) && was.get(nm).role !== v.role)
      .map(([nm, v]) => ({ nm, from: was.get(nm).role, to: v.role, p: v.p, cleared: was.get(nm).cleared }))
    // HELD — picked yesterday, picked today, same category. The tracker the
    // diff was missing: continuity plus whether he actually delivered.
    const held = [...now.entries()]
      .filter(([nm, v]) => was.has(nm) && was.get(nm).role === v.role)
      .map(([nm, v]) => ({ nm, role: v.role, p: v.p, cleared: was.get(nm).cleared }))
    return { added, dropped, changed, held, date: ydayDate }
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
          <div onClick={flipUnconf} style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: unconfOpen ? 5 : 0, cursor: 'pointer' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#FCD34D' }}>
              ⏳ {unconfirmed.length} pick{unconfirmed.length > 1 ? 's' : ''} not lineup-confirmed {unconfOpen ? '▾' : '▸'}
            </span>
            <span style={{ fontSize: 9, color: C.text3 }}>
              unconfirmed hitters homered 10.2% vs 15.2% confirmed across the archive — watch these until they lock
            </span>
          </div>
          {unconfOpen && (<>
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
          </>)}
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
              {diff.added.length} new · {diff.held?.length || 0} held
              {(() => {
                const marked = (diff.held || []).filter((h) => h.cleared != null)
                const ok = marked.filter((h) => h.cleared).length
                return marked.length ? ` (${ok}/${marked.length} cleared last night)` : ''
              })()}
              {' '}· {diff.changed.length} moved · {diff.dropped.length} dropped
            </span>
          </div>
          {/* COLUMNS, NOT RIVERS (2026-08-06). Thirty-six names run together
              in a paragraph is a wall, not information. Three columns with
              counts, ten rows each, expanders for the rest — the eye can
              actually walk a list. */}
          {showDiff && (() => {
            // SMARTER (2026-08-06): the columns now THINK instead of listing.
            //  - DROPPED splits schedule from judgment: a name still on
            //    tonight's slate but stripped of its pick is a DEMOTION (the
            //    news: red, clickable, sorted first); a name not playing is
            //    just the calendar (dimmed, last).
            //  - Every column sorts by meaning: cleared first in HELD, post-
            //    miss moves first in MOVED, confirmed lineups first in NEW.
            //  - Each column carries a one-line read, and the panel opens
            //    with the headline the numbers add up to.
            const mark = (c) => (c == null ? '' : c ? '✓ ' : '✗ ')
            const byName = new Map(players.map((p) => [String(nameOf(p)).toLowerCase().trim(), p]))
            const sortOk = (a, b) => (b.ok === true) - (a.ok === true) || (a.ok === false) - (b.ok === false)
            const held = (diff.held || []).map((h) => ({ key: h.nm, label: nameOf(h.p), tag: `${mark(h.cleared)}${h.role}`, ok: h.cleared, p: h.p })).sort(sortOk)
            const added = diff.added.map(([nm, v]) => ({ key: nm, label: nameOf(v.p), tag: `${v.p?.lineup_confirmed === true ? '✓ ' : ''}${v.role}`, p: v.p, conf: v.p?.lineup_confirmed === true }))
              .sort((a, b) => (b.conf === true) - (a.conf === true))
            const moved = diff.changed.map((c) => ({ key: c.nm, label: nameOf(c.p), tag: `${mark(c.cleared)}${c.from}→${c.to}`, ok: c.cleared, p: c.p }))
              .sort((a, b) => (b.ok === false) - (a.ok === false))
            const droppedAll = diff.dropped.map(([nm, role, cleared]) => {
              const p = byName.get(nm) || null
              return { key: nm, label: p ? nameOf(p) : nm.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                tag: `${mark(cleared)}${role}`, ok: cleared, p, demoted: !!p }
            }).sort((a, b) => (b.demoted === true) - (a.demoted === true))
            const heldOk = held.filter((x) => x.ok === true).length
            const heldBad = held.filter((x) => x.ok === false).length
            const movedAfterMiss = moved.filter((x) => x.ok === false).length
            const demotions = droppedAll.filter((x) => x.demoted).length
            const offSlate = droppedAll.length - demotions
            const META = {
              held: `✓${heldOk} · ✗${heldBad} · —${held.length - heldOk - heldBad}`,
              new: `${added.filter((x) => x.conf).length} in confirmed lineups`,
              moved: movedAfterMiss ? `${movedAfterMiss} of ${moved.length} after a miss` : 'no post-miss moves',
              dropped: `${demotions} demoted · ${offSlate} off slate`,
            }
            const headline = [
              droppedAll.length ? (demotions
                ? `${demotions} real demotion${demotions > 1 ? 's' : ''} — the other ${offSlate} drops are just today's schedule`
                : `all ${offSlate} drops are schedule, not judgment`) : null,
              movedAfterMiss ? `${movedAfterMiss} move${movedAfterMiss > 1 ? 's' : ''} came right after a miss` : null,
            ].filter(Boolean).join(' · ')
            const COLS = [
              ['held', 'HELD', '#22d3ee', held],
              ['new', 'NEW', '#4ade80', added],
              ['moved', 'MOVED', '#FCD34D', moved],
              ['dropped', 'DROPPED', '#f87171', droppedAll],
            ].filter(([, , , list]) => list.length)
            return (
              <div style={{ marginTop: 8 }}>
                {headline && (
                  <div style={{
                    fontSize: 10.5, color: C.text2, lineHeight: 1.5, marginBottom: 8,
                    borderLeft: `2px solid ${C.orange}`, paddingLeft: 9,
                  }}>{headline}</div>
                )}
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
                  {COLS.map(([k, label, color, list]) => {
                    const open = !!colOpen[k]
                    const shown = open ? list : list.slice(0, 10)
                    return (
                      <div key={k} style={{ minWidth: 0, background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 900, color, letterSpacing: '.08em', fontFamily: NUM_FONT }}>
                          {label} <span style={{ color: C.text3, fontWeight: 400 }}>{list.length}</span>
                        </div>
                        <div style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, marginBottom: 5 }}>{META[k]}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {shown.map((it) => (
                            <div key={it.key}
                              onClick={() => it.p && onPlayerClick?.(it.p)}
                              style={{
                                display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0,
                                cursor: it.p ? 'pointer' : 'default',
                              }}>
                              <span style={{
                                fontSize: 10.5, fontWeight: it.demoted ? 700 : 600,
                                color: k === 'dropped' ? (it.demoted ? '#f87171' : C.text3) : C.text2,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }} title={it.demoted ? 'On tonight’s slate but stripped of the pick — a real demotion' : undefined}>
                                {it.label}{it.demoted ? ' ▾' : ''}
                              </span>
                              <span style={{
                                marginLeft: 'auto', fontSize: 8.5, fontFamily: NUM_FONT, fontWeight: 800, flexShrink: 0,
                                color: it.ok === true ? '#4ade80' : it.ok === false ? 'rgba(248,113,113,.75)'
                                  : k === 'moved' ? color : k === 'dropped' ? C.text3 : C.orange,
                              }}>{it.tag}</span>
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
                  ✓/✗ = whether last night&apos;s pick cleared its own bar (HR homered, HIT got a hit,
                  HRR 2+ H+R+RBI, CONTACT 2+ TB); no mark = the slot never finalized.
                  <b style={{ color: '#f87171' }}> Red names ▾ in DROPPED are real demotions</b> — on
                  tonight&apos;s slate but stripped of the pick, and clickable; dim names just aren&apos;t
                  playing today. The bot changing its mind is information either way.
                </div>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
