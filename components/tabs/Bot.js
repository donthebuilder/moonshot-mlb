'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Empty, btnStyle } from '../ui'
import { logUrl } from '../../lib/dataSource'

// THE BOT TAB, rebuilt (2026-08-04).
//
// What it was: four views — a "Picks" heat grid duplicating the Scoreboard,
// a board list, and two log viewers that rendered the breakdown sheet as
// CENTER-ALIGNED text with a regex that highlighted every capitalized pair
// of words. The sheet is a structured document the bot writes with its own
// section headers; showing it as a centered blob threw that structure away.
//
// What it is now, two views per slate:
//   THE SHEET — the bot's own output, parsed into its own sections
//     (THE FOUR, BY GAME, PAIRS, POOLS, TOP 30, ALT LOOKS, BOMB WATCH …),
//     each collapsible, with a chip nav that jumps to any section and a
//     search that auto-expands whatever it matches. Left-aligned, monospace,
//     like the document it is.
//   THE BOARD — the slate ranked by the bot's own top_board_score_v2 with
//     its native flags (⭐ weak spot, 🎯 pitch match, 👻 hidden value,
//     ⚠️ trap). This stays because it's the one board on the site showing
//     the bot's raw opinion with no site-side adjustment — the HR Board is
//     ISO-adjusted, this is not, and comparing the two is informative.
//
// The old "Picks" view is gone: The Four (Scoreboard) and the per-game pick
// cards (Games) show the same designations with more context.

function hrwEmoji(s) {
  const v = Number(s || 0)
  if (v > 80) return '🌋'
  if (v > 70) return '🚀'
  if (v >= 55) return '⚡'
  if (v >= 45) return '🌤️'
  return '🧊'
}

function roleColor(role) {
  const s = String(role || '')
  if (s.includes('🏆') || s.includes('🧨')) return '#FB923C'
  if (s.includes('🔥')) return '#f97316'
  if (s.includes('🏁')) return '#22d3ee'
  if (s.includes('💠')) return '#38bdf8'
  if (s.includes('🔭')) return '#a78bfa'
  if (s.includes('⛔')) return '#ef4444'
  return C.text2
}

// ── The Board — the bot's raw ranking, unadjusted ────────────────────────────

const PICK_TABS = [
  { key: 'top',     label: '🏆 Top',     roles: ['TOP'] },
  { key: 'hr',      label: '🧨 HR',      roles: ['HR'] },
  { key: 'hrr',     label: '🏁 HRR',     roles: ['HRR'] },
  { key: 'hit',     label: '💠 Hit',     roles: ['HIT'] },
  { key: 'contact', label: '⚾ Contact', roles: ['CONTACT'] },
  { key: 'all',     label: 'All',        roles: null },
]

function BoardRow({ p, i, onPlayerClick }) {
  const role = p.final_hr_role || ''
  const col = roleColor(role)
  const pick = p.game_pick_role || ''
  const pills = Array.isArray(p.signal_pills) ? p.signal_pills.slice(0, 3) : []
  const pickColors = { TOP: '#FCD34D', HR: '#FB923C', HRR: '#22d3ee', HIT: '#38bdf8', CONTACT: '#a78bfa' }
  const pickCol = pickColors[pick] || C.text3
  const isTrap = p.trap_flag && !p.got_hr

  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: '28px 1fr auto',
        gap: 8, alignItems: 'center', padding: '9px 14px',
        borderTop: i ? `1px solid ${C.border}` : 'none',
        background: isTrap ? 'rgba(248,113,113,0.04)' : 'transparent',
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}
      onClick={() => onPlayerClick && onPlayerClick(p)}
    >
      <div style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3, textAlign: 'center' }}>#{i + 1}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</span>
          {p.weak_spot_flag && <span style={{ fontSize: 11 }}>⭐</span>}
          {p.pitch_type_match_flag && <span style={{ fontSize: 11 }} title={p.pitch_type_match_note || ''}>🎯</span>}
          {p.hidden_hr_value && <span style={{ fontSize: 11 }}>👻</span>}
          {isTrap && <span style={{ fontSize: 11 }} title={p.trap_reason || ''}>⚠️</span>}
          <span style={{ fontSize: 10, color: C.text3 }}>{p.team}</span>
          {pick && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: `${pickCol}22`, color: pickCol, fontWeight: 700, textTransform: 'uppercase', fontFamily: NUM_FONT }}>{pick}</span>
          )}
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ color: col }}>{role}</span>
          {pills.map((pl, pi) => <span key={pi}>{pl}</span>)}
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
          vs {p.pitcher_name} ({p.pitcher_throws}) · #{p.lineup_spot} · {p.opponent}
          {p.pitcher_attack_tag ? ` · ${p.pitcher_attack_tag}` : ''}
          {isTrap && p.trap_reason ? <span style={{ color: '#f87171', marginLeft: 4 }}>{p.trap_reason}</span> : null}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 16, color: C.orange }}>{Math.round(p.hr_score || 0)}</div>
        <div style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
          HRW {Math.round(p.hrw_score || 0)} {hrwEmoji(p.hrw_score || 0)}
        </div>
        {(p.last5_hr || 0) > 0 && (
          <div style={{ fontFamily: NUM_FONT, fontSize: 10, color: (p.last5_hr || 0) >= 2 ? C.orange : C.text3 }}>
            L5: {p.last5_hr}HR
          </div>
        )}
      </div>
    </div>
  )
}

function Board({ players, onPlayerClick }) {
  const [pickTab, setPickTab] = useState('all')

  const sorted = useMemo(() =>
    [...players].sort((a, b) => (b.top_board_score_v2 || 0) - (a.top_board_score_v2 || 0)),
  [players])

  const tab = PICK_TABS.find((t) => t.key === pickTab) || PICK_TABS[0]
  const rows = tab.roles
    ? sorted.filter((p) => tab.roles.includes(p.game_pick_role || ''))
    : sorted.slice(0, 40)

  if (!players.length) return <Empty text="No player data loaded." />

  return (
    <div>
      <div style={{
        fontSize: 10, color: C.text3, lineHeight: 1.55, margin: '2px 0 10px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 640,
      }}>
        The bot&apos;s own ranking (top_board_score_v2), <b style={{ color: C.text2 }}>unadjusted</b> —
        unlike the HR Board, no ISO multiplier touches this. Where the two boards disagree, the gap
        IS the site&apos;s adjustment, visible.
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {PICK_TABS.map((t) => (
          <button key={t.key} onClick={() => setPickTab(t.key)} style={btnStyle(C.orange, pickTab === t.key)}>
            {t.label}
            {t.roles ? ` (${sorted.filter((p) => t.roles.includes(p.game_pick_role || '')).length})` : ` (${Math.min(sorted.length, 40)})`}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
        <span>⭐ weak pitcher spot</span>
        <span>🎯 pitch type match</span>
        <span>👻 hidden value</span>
        <span>⚠️ trap flag</span>
      </div>
      {rows.length === 0
        ? <Empty text="No picks in this category." />
        : (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {rows.map((p, i) => <BoardRow key={p.player_id || i} p={p} i={i} onPlayerClick={onPlayerClick} />)}
          </div>
        )}
    </div>
  )
}

// ── The Sheet — the bot's document, given back its structure ─────────────────
//
// The bot writes section headers as lines of the form
//   "⚾ THE BOARDS ─────────────" / "🔄 ALT LOOKS · small sample ──────"
// i.e. a title followed by a run of box-drawing dashes. Split on those and
// the sheet becomes what it always was: a document with a table of contents.

const HEADER_RE = /^(.{2,60}?)[\s·]*─{4,}\s*$/

function parseSections(text) {
  const sections = []
  let current = { title: '📌 Slate summary', lines: [] }
  text.split('\n').forEach((raw) => {
    const line = raw.replace(/\s+$/, '')
    const m = line.match(HEADER_RE)
    if (m && m[1].trim()) {
      if (current.lines.some((l) => l.trim())) sections.push(current)
      current = { title: m[1].trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  })
  if (current.lines.some((l) => l.trim())) sections.push(current)
  return sections
}

function SheetViewer({ url, label }) {
  const [text, setText] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [openSet, setOpenSet] = useState(() => new Set([0]))
  const refs = useRef({})

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${url}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.text() : Promise.resolve('')))
      .catch(() => '')
      .then((t) => { if (!cancelled) { setText(t || null); setLoading(false) } })
    return () => { cancelled = true }
  }, [url])

  const sections = useMemo(() => (text ? parseSections(text) : []), [text])

  // Search: which sections contain the filter, and force them open.
  const f = filter.trim().toLowerCase()
  const matching = useMemo(() => {
    if (!f) return null
    return new Set(sections.map((s, i) => (
      s.lines.some((l) => l.toLowerCase().includes(f)) || s.title.toLowerCase().includes(f) ? i : -1
    )).filter((i) => i >= 0))
  }, [sections, f])

  const isOpen = (i) => (matching ? matching.has(i) : openSet.has(i))
  const toggle = (i) => setOpenSet((s) => {
    const next = new Set(s)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const jump = (i) => {
    setOpenSet((s) => new Set([...s, i]))
    setTimeout(() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 40)
  }

  if (loading) return <div style={{ padding: '20px 4px', fontSize: 12, color: C.text3 }}>Loading the sheet…</div>
  if (!text) return <Empty text={`No ${label.toLowerCase()} published yet.`} />

  return (
    <div>
      {/* toolbar: search + section chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input
          type="search"
          placeholder="Search the whole sheet…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 7,
            padding: '6px 11px', fontSize: 12, color: C.text, outline: 'none',
            width: 220, fontFamily: NUM_FONT,
          }}
        />
        {f && (
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
            {matching?.size || 0} section{(matching?.size || 0) === 1 ? '' : 's'} match
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => jump(i)}
            style={{
              padding: '3px 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 10, fontWeight: 700,
              border: `1px solid ${matching?.has(i) ? C.orange : C.border}`,
              background: matching?.has(i) ? 'rgba(249,115,22,.12)' : 'transparent',
              color: matching?.has(i) ? C.orange : C.text2,
              whiteSpace: 'nowrap',
            }}
          >{s.title.length > 32 ? `${s.title.slice(0, 30)}…` : s.title}</button>
        ))}
      </div>

      {/* sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map((s, i) => {
          const open = isOpen(i)
          const shown = f
            ? s.lines.filter((l) => l.toLowerCase().includes(f))
            : s.lines
          return (
            <div
              key={i}
              ref={(el) => { refs.current[i] = el }}
              style={{
                background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
                overflow: 'hidden', scrollMarginTop: 130,
              }}
            >
              <div
                onClick={() => toggle(i)}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, cursor: 'pointer',
                  padding: '9px 14px', background: C.bg3,
                  borderBottom: open ? `1px solid ${C.border}` : 'none',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800 }}>{s.title}</span>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                  {f ? `${shown.length} matching` : `${s.lines.filter((l) => l.trim()).length} lines`}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.text3 }}>{open ? '▾' : '▸'}</span>
              </div>
              {open && (
                <pre style={{
                  margin: 0, padding: '12px 16px',
                  fontSize: 11.5, lineHeight: 1.65,
                  color: C.text2, fontFamily: NUM_FONT,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  maxHeight: 480, overflowY: 'auto',
                }}>
                  {shown.map((line, li) => {
                    const isError = /\berror\b|\bfail(ed|ure)?\b|exception|traceback/i.test(line)
                    return (
                      <div key={li} style={{
                        color: isError ? '#f87171' : undefined,
                        background: f && line.toLowerCase().includes(f) ? 'rgba(249,115,22,0.10)' : 'transparent',
                      }}>{line || ' '}</div>
                    )
                  })}
                </pre>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

const VIEWS = [
  { key: 'sheet',    label: '📄 Today’s Sheet' },
  { key: 'tomorrow', label: '📄 Tomorrow' },
  { key: 'board',    label: '🏆 Raw Board' },
]

export default function Bot({ players = [], onPlayerClick }) {
  const [view, setView] = useState('sheet')

  return (
    <div>
      <PanelTitle
        title="The Bot"
        sub="Its sheet, in its own sections · its board, unadjusted"
        right={
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {VIEWS.map((v) => (
              <button key={v.key} onClick={() => setView(v.key)} style={btnStyle(C.orange, view === v.key)}>
                {v.label}
              </button>
            ))}
          </div>
        }
      />

      {view === 'sheet'    && <SheetViewer url={logUrl('today')} label="Today's sheet" />}
      {view === 'tomorrow' && <SheetViewer url={logUrl('tomorrow')} label="Tomorrow's sheet" />}
      {view === 'board'    && <Board players={players} onPlayerClick={onPlayerClick} />}
    </div>
  )
}
