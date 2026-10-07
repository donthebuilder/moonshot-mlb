'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { btnStyle, WhatThis } from './ui'
import DenseTable from './DenseTable'

// ══ 🧾 THE SEASON RECORD ══════════════════════════════════════════════════════
//
// Donovan, 2026-09-01, asked what "discuss the ledger more" meant now that the
// disappearing-on-Final bug was long fixed: "I want a multi-day / season
// record." Asked which shape — per hitter, per night, or both — "probably both
// to be fair or safe." So: both, stacked. The NIGHTS on top, one line each,
// tap a night for its hitters; the HITTERS below, one line each across every
// night held.
//
// WHAT IT COUNTS. Every homer in baseball on each night held — not just the
// sheet's ~90 — because the grader's own hr_capture_report already lists them
// all, with distance and exit velocity, and marks which ones the sheet had.
// That is the difference between this and "The archive" beside it: the
// archive is a name-pattern corpus over the sheet's hitters; this is the
// record, with the sheet's coverage printed as a percentage on every line.
//
// WHAT IT NEVER DOES. Add a season total. "was on N" is the number the slate
// carried for him the night he went deep, stated as such; the league's live
// total is the one-night ledger's job (it asks the league). Rule 3 of
// lib/ledgerArchive.js, learned 2026-08-09 when the ledger double-counted.
//
// The nights live in this browser (localStorage), pulled off the branch's own
// graded files, so the record on a phone is the record for that phone. The
// view tops itself up to 45 nights on first open; the buttons pull further.

const shortDate = (d) => {
  const t = new Date(`${d}T12:00:00Z`)
  return Number.isNaN(t.getTime()) ? d
    : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

const panel = (accent) => ({
  background: C.bg2, border: `1px solid ${C.border}`,
  borderLeft: `3px solid ${accent}`, borderRadius: 14,
  padding: '13px 16px', marginBottom: 12,
})

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.

function Head({ icon, title, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, fontWeight: 900 }}>{icon} {title}</span>
      {note && <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{note}</span>}
    </div>
  )
}

function Tile({ label, value, color, sub }) {
  return (
    <div style={{ background: `${color}0d`, border: `1px solid ${color}33`, borderRadius: 9, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 19, fontFamily: NUM_FONT, fontWeight: 900, color, marginTop: 1, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.text3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  )
}

// The badge the bot had on him that night, or where he stood with the sheet.
// Three states, and the middle one matters: "on sheet" without a badge is a
// hitter the model was tracking and did not designate — the difference
// between a miss and a near-miss.
function RoleChip({ r }) {
  if (r.badged) {
    return (
      <span title={`Wore ${r.role} that night`} style={{
        fontSize: 8.5, fontWeight: 900, letterSpacing: '.04em', padding: '1.5px 7px', borderRadius: 999,
        border: `1px solid ${C.green}66`, background: `${C.green}18`, color: C.green,
      }}>{r.role}</span>
    )
  }
  if (r.onSheet) {
    return (
      <span title={r.role ? `Wore ${r.role} — a non-HR badge` : 'On the board, no badge'} style={{
        fontSize: 8.5, fontWeight: 800, letterSpacing: '.04em', padding: '1.5px 7px', borderRadius: 999,
        border: `1px solid ${C.border2}`, color: C.text2,
      }}>{r.role || 'on sheet'}</span>
    )
  }
  return <span title="Not on that night's sheet at all" style={{ fontSize: 8.5, color: C.text3 }}>not on sheet</span>
}

const NIGHTS_FOLD = 14
const HITTERS_FOLD = 40

export default function SeasonRecord({ season, busy = false, msg = '', onPull, onPlayerClick }) {
  const [openNight, setOpenNight] = useState(null)
  const [allNights, setAllNights] = useState(false)
  const [allHitters, setAllHitters] = useState(false)
  const [q, setQ] = useState('')
  const [hSort, setHSortKey] = useState('hr')
  const [hDir, setHDir] = useState('desc')
  // Pills open descending; a header click on the active column flips it.
  const setHSort = (k, fromHeader = false) => {
    if (fromHeader && k === hSort) { setHDir((d) => (d === 'desc' ? 'asc' : 'desc')); return }
    setHSortKey(k); setHDir(fromHeader && k === 'name' ? 'asc' : 'desc')
  }

  const hitters = useMemo(() => {
    if (!season) return []
    const needle = q.trim().toLowerCase()
    let r = season.hitters
    if (needle) r = r.filter((h) => h.name.toLowerCase().includes(needle) || h.team.toLowerCase().includes(needle))
    const by = {
      hr: (a, b) => b.hr - a.hr || b.nights - a.nights,
      recent: (a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : b.hr - a.hr),
      badged: (a, b) => b.badgedNights - a.badgedNights || b.hr - a.hr,
      far: (a, b) => (b.longest?.ft || 0) - (a.longest?.ft || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      // header-only keys
      nights: (a, b) => b.nights - a.nights || b.hr - a.hr,
      sheet: (a, b) => b.sheetNights - a.sheetNights || b.hr - a.hr,
      score: (a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1),
      ev: (a, b) => (b.ev || 0) - (a.ev || 0),
    }
    const out = [...r].sort(by[hSort] || by.hr)
    return hDir === 'asc' ? out.reverse() : out
  }, [season, q, hSort, hDir])

  const open = (r) => onPlayerClick?.({ player_id: r.pid != null ? Number(r.pid) : undefined, player_name: r.name, name: r.name, team: r.team })

  return (
    <div>
      {/* ── THE RECORD, IN ONE LINE ──────────────────────────────────────── */}
      <div style={panel(C.orange)}>
        <Head
          icon="🧾" title="Season record"
          note={season
            ? `${season.count} night${season.count === 1 ? '' : 's'} · ${shortDate(season.from)} → ${shortDate(season.to)}`
            : 'nothing held on this device yet'}
        />
        {season ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 7 }}>
              <Tile label="Home runs" value={season.total} color={C.orange} sub={`${season.perNight} a night`} />
              <Tile label="On the board" value={season.capturePct != null ? `${season.capturePct}%` : '—'} color={C.cyan} sub={`${season.onSheet} of ${season.total}`} />
              <Tile label="Badged (call)" value={season.badged} color={C.green} sub="TOP/HR/HIT/HRR/CONTACT, on the night" />
              <Tile
                label="Longest" value={season.longest ? `${season.longest.ft} ft` : '—'} color={C.purple}
                sub={season.longest ? `${season.longest.name} · ${shortDate(season.longest.date)}` : ''}
              />
            </div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.7, marginTop: 9 }}>
              Every home run hit in the majors on the nights this device holds — not only the
              board&apos;s hitters — with the board&apos;s coverage printed beside it. Tap a night
              for who went deep; the hitters below are the same homers added up by name.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.75 }}>
            Load the last few weeks and this fills in — every night comes from the
            same results The record page reads, so the two agree.
          </div>
        )}
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 11, alignItems: 'center' }}>
          <button disabled={busy} onClick={() => onPull?.(14)} style={btnStyle(C.orange, false)}>
            {busy ? 'Updating…' : 'Update · 14 nights'}
          </button>
          <button disabled={busy} onClick={() => onPull?.(45)} style={btnStyle(C.orange, false)}>Pull · 45 nights</button>
          <button disabled={busy} onClick={() => onPull?.(120)} style={btnStyle(C.orange, false)}>Pull · 120 nights</button>
          {msg && <span style={{ fontSize: 10, color: C.text3 }}>{msg}</span>}
        </div>
        <WhatThis label="what the record is and is not" maxWidth={680}>
          About 150 graded nights are kept, so the record can reach back that far but
          no further. &ldquo;Was on N&rdquo; is the season total the slate carried for him the
          night he homered — it is not added to, and it can trail the league by a day. Nothing
          here scores anything or changes a pick.
        </WhatThis>
      </div>

      {season && (
        <>
          {/* ── THE NIGHTS ──────────────────────────────────────────────── */}
          <div style={panel(C.cyan)}>
            <Head icon="🌙" title="The nights" note="newest first · tap one" />
            {(allNights ? season.nights : season.nights.slice(0, NIGHTS_FOLD)).map((n) => {
              const isOpen = openNight === n.date
              return (
                <div key={n.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <button
                    onClick={() => setOpenNight(isOpen ? null : n.date)}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 9, width: '100%', padding: '7px 2px',
                      background: 'transparent', border: 'none', color: C.text, cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 12, minWidth: 52 }}>{shortDate(n.date)}</span>
                    <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 12, color: C.orange, minWidth: 46 }}>
                      {n.total} HR
                    </span>
                    <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, minWidth: 0, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={`${n.onSheet} of ${n.total} were on the board · ${n.badged} badged (TOP/HR/HIT/HRR/CONTACT)${n.multi ? ` · ${n.multi} multi-homer night${n.multi === 1 ? '' : 's'}` : ''}`}>
                      sheet {n.capturePct != null ? `${Math.round(n.capturePct)}%` : '—'} · {n.badged} badged
                      {n.longest ? ` · ${n.longest.ft} ft ${n.longest.name.split(' ').slice(-1)[0]}` : ''}
                    </span>
                    <span style={{ fontSize: 10, color: C.text3 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 0 9px' }}>
                      {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). */}
                      <DenseTable bare noGroups tight rows={n.homers.map((r, i) => ({ ...r, _key: `${r.pid || r.name}-${i}` }))}
                        columns={[
                          { key: 'name', label: 'Hitter', heat: false, sticky: true, w: 150, link: (r) => () => open(r),
                            fmt: (v, r) => <span title="Open his card">{v}{r.team && <span style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{r.team}</span>}</span> },
                          { key: 'hr', label: 'HR', w: 36, dp: 0, tone: (x) => ({ color: x >= 2 ? C.orange : C.text, weight: 900 }) },
                          { key: 'ft', label: 'Ft', w: 40, dp: 0, title: 'Longest of the night, feet', fmt: (v) => v || '—' },
                          { key: 'ev', label: 'EV', w: 44, dp: 1, title: 'Hardest of the night, mph off the bat', fmt: (v) => (v ? Number(v).toFixed(1) : '—') },
                          { key: 'spot', label: 'Spot', w: 38, dp: 0, title: 'Lineup spot that night', fmt: (v) => v || '—', tone: () => ({ color: C.text3 }) },
                          { key: 'hrScore', label: 'Score', w: 46, title: "MOONSHOT's HR score for him that night, where the board had him", fmt: (v) => (v != null ? Math.round(v) : '—') },
                          { key: 'sheet', label: 'Sheet', heat: false, numeric: false, w: 90, fmt: (_, r) => <RoleChip r={r} /> },
                          { key: 'seasonHrSlate', label: 'Was on', w: 50, title: 'Season total the slate carried for him that night — not added to', fmt: (v) => (v != null ? v : '—'), tone: () => ({ color: C.text3 }) },
                        ]}
                        heatMode="sorted" maxHeight={9999} maxRows={60} caption={`Every homer on ${shortDate(n.date)}`} />
                    </div>
                  )}
                </div>
              )
            })}
            {season.nights.length > NIGHTS_FOLD && (
              <button onClick={() => setAllNights((v) => !v)} style={{ ...btnStyle(C.cyan, false), marginTop: 9 }}>
                {allNights ? 'Fewer nights' : `All ${season.nights.length} nights`}
              </button>
            )}
          </div>

          {/* ── THE HITTERS ─────────────────────────────────────────────── */}
          <div style={panel(C.green)}>
            <Head icon="💣" title="The hitters" note={`${season.hitters.length} men have gone deep in this window`} />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
              {[['hr', 'Most homers'], ['recent', 'Most recent'], ['badged', 'Most badged'], ['far', 'Farthest'], ['name', 'Name']].map(([k, label]) => (
                <button key={k} onClick={() => setHSort(k)} style={btnStyle(C.green, hSort === k)}>{label}</button>
              ))}
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="hitter or team"
                style={{
                  marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10.5, padding: '4px 9px',
                  borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
                  color: C.text, minWidth: 120, outline: 'none',
                }}
              />
            </div>
            {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): opens in the
                pill's order; every header re-sorts. */}
            <DenseTable key={`${hSort}-${hDir}`} bare noGroups
              rows={(allHitters ? hitters : hitters.slice(0, HITTERS_FOLD)).map((h) => ({ ...h, _key: h.k, far: h.longest ? h.longest.ft : null }))}
              columns={[
                { key: 'name', label: 'Hitter', heat: false, sticky: true, w: 150, link: (h) => () => open(h),
                  fmt: (v, h) => <span title="Open his card">{v}{h.team && <span style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{h.team}</span>}</span> },
                { key: 'hr', label: 'HR', w: 36, dp: 0, primary: true, tone: () => ({ color: C.orange, weight: 900 }), title: 'Home runs across the nights held' },
                { key: 'nights', label: 'Nights', w: 50, title: 'Nights he went deep',
                  fmt: (v, h) => <span title={h.multi ? `${h.multi} multi-homer night${h.multi === 1 ? '' : 's'}` : ''}>{v}{h.multi ? <span style={{ color: C.orange, fontSize: 8.5, marginLeft: 3 }}>×{h.multi}</span> : null}</span> },
                { key: 'badgedNights', label: 'Badged', w: 52, dp: 0, tone: (x) => ({ color: x ? C.green : C.text3, weight: 800 }), title: 'Nights he went deep wearing a call badge — TOP, HR, HIT, HRR or CONTACT' },
                { key: 'sheetNights', label: 'On board', w: 58, dp: 0, title: 'Nights he went deep while on the board at all (badged or not)' },
                { key: 'avgScore', label: 'Avg score', w: 62, fmt: (v) => v ?? '—', title: "Average of MOONSHOT's HR score on his homer nights, where the board had him" },
                { key: 'far', label: 'Longest', w: 56, fmt: (v, h) => <span title={h.longest ? shortDate(h.longest.date) : ''}>{v ?? '—'}</span>, title: 'His longest in the window, feet' },
                { key: 'ev', label: 'Max EV', w: 52, fmt: (v) => (v ? Number(v).toFixed(1) : '—'), title: 'Hardest, mph' },
                { key: 'last', label: 'Last', heat: false, numeric: false, w: 52, fmt: (v) => shortDate(v), title: 'Most recent homer night' },
                { key: 'wasOn', label: 'Was on', w: 50, fmt: (v) => v ?? '—', tone: () => ({ color: C.text3 }), title: 'Season total the slate carried for him on his latest homer night — not added to' },
              ]}
              heatMode="sorted" maxHeight={9999} maxRows={Math.max(hitters.length, 1)} caption="Every hitter who has gone deep in the nights held" />
            {hitters.length > HITTERS_FOLD && (
              <button onClick={() => setAllHitters((v) => !v)} style={{ ...btnStyle(C.green, false), marginTop: 9 }}>
                {allHitters ? 'Fewer' : `All ${hitters.length}`}
              </button>
            )}
            {!hitters.length && q && (
              <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Nobody matching &ldquo;{q}&rdquo; has homered in the nights held.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
