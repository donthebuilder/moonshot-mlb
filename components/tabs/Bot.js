'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { tierTone } from '../../lib/roleBadge'
import { PanelTitle, Empty, btnStyle } from '../ui'
import TheRead from '../TheRead'
import Shortlist from '../Shortlist'
import { logUrl } from '../../lib/dataSource'
import { pillMeta } from '../../lib/pills'

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
//     ⚠️ trap). It ranks on top_board_score_v2, the bot's own overall number,
//     which is a DIFFERENT question from the HR Board's — overall value
//     against tonight versus going deep specifically. (Until 2026-08-09 this
//     was also the only board free of a site-side ISO adjustment; that
//     adjustment is gone and every board now ranks on the bot's own numbers.)
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

// Colour by TOKEN, not by glyph. This used to sniff the pictograph out of the
// role string, which quietly made the emoji load-bearing: strip it for the
// redesign and every row goes grey. tierTone matches the glyph OR the text,
// so it works before and after the bot's format ever changes.
function roleColor(role) {
  return tierTone(role, C) || C.text2
}

// game_pick_role can now carry more than one tag on the same player
// (2026-08-12: TOP is allowed to also hold HR, joined "TOP/HR") — read as
// a list, not a single value, wherever a category match matters.
const rolesOf = (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).filter(Boolean)

// ── The Board — the bot's raw ranking, unadjusted ────────────────────────────

// Text, not emoji. These are the bot's own game_pick_role categories and the
// label should read as a filter, not as decoration.
const PICK_TABS = [
  { key: 'top',     label: 'Top',     roles: ['TOP'] },
  { key: 'hr',      label: 'HR',      roles: ['HR'] },
  { key: 'hrr',     label: 'HRR',     roles: ['HRR'] },
  { key: 'hit',     label: 'Hit',     roles: ['HIT'] },
  { key: 'contact', label: 'Contact', roles: ['CONTACT'] },
  { key: 'all',     label: 'All',     roles: null },
]

function BoardRow({ p, i, onPlayerClick }) {
  const role = p.final_hr_role || ''
  const col = roleColor(role)
  // Primary (first) role only, for the single-badge display — a TOP/HR
  // double-up shows as TOP here; it still surfaces in the HR tab/count below.
  const pick = String(p.game_pick_role || '').split('/')[0].trim()
  const pills = Array.isArray(p.signal_pills) ? p.signal_pills.slice(0, 3) : []
  const pickColors = { TOP: '#FCD34D', HR: '#FB923C', HRR: '#22d3ee', HIT: '#38bdf8', CONTACT: '#a78bfa' }
  const pickCol = pickColors[pick] || C.text3
  const isTrap = p.trap_flag && !p.got_hr

  // DE-TACKIFIED (2026-08-07, "the raw board looks tacky"): the full-height
  // ember wash, zero-padded ranks and emoji pile-up read as decoration. Now:
  // a 2px score underline at the row's foot, plain medals for the top three,
  // flags capped at two with the full set in the tooltip, and the score in a
  // tier color instead of flat orange.
  const barW = Math.min(100, Math.max(0, Number(p.hr_score) || 0))
  const flagsAll = []
  if (p.weak_spot_flag) flagsAll.push(['⭐', 'weak pitcher spot'])
  if (p.pitch_type_match_flag) flagsAll.push(['🎯', p.pitch_type_match_note || 'pitch match'])
  if (p.hidden_hr_value) flagsAll.push(['👻', 'hidden value'])
  if (isTrap) flagsAll.push(['⚠️', p.trap_reason || 'trap flag'])
  const flagTitle = flagsAll.map(([e, t]) => `${e} ${t}`).join(' · ')
  const scoreCol = barW >= 70 ? C.orange : barW >= 55 ? '#FCD34D' : C.text2
  const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
  return (
    <div
      style={{
        position: 'relative',
        display: 'grid', gridTemplateColumns: '36px 1fr auto',
        gap: 10, alignItems: 'center', padding: '8px 14px 9px',
        borderTop: i ? `1px solid ${C.border}` : 'none',
        background: isTrap ? 'rgba(248,113,113,0.04)' : 'transparent',
        cursor: onPlayerClick ? 'pointer' : 'default',
        overflow: 'hidden',
      }}
      onClick={() => onPlayerClick && onPlayerClick(p)}
    >
      <div style={{
        position: 'absolute', left: 0, bottom: 0, height: 2, width: `${barW}%`,
        background: `linear-gradient(90deg, ${scoreCol}, transparent)`,
        opacity: 0.55, pointerEvents: 'none',
      }} />
      <div style={{ fontFamily: NUM_FONT, fontSize: medal ? 15 : 12, fontWeight: 800, textAlign: 'center', color: C.text3 }}>
        {medal || i + 1}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{p.team}</span>
          {flagsAll.length > 0 && (
            <span title={flagTitle} style={{ fontSize: 10.5, cursor: 'help', flexShrink: 0, letterSpacing: 1 }}>
              {flagsAll.slice(0, 2).map(([e]) => e).join('')}
            </span>
          )}
          {pick && (
            <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 999, border: `1px solid ${pickCol}55`, background: `${pickCol}14`, color: pickCol, fontWeight: 800, fontFamily: NUM_FONT, flexShrink: 0 }}>🤖 {pick}</span>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: col }}>{role}</span>
          {' · '}vs {p.pitcher_name} ({p.pitcher_throws}) · #{p.lineup_spot}
          {pills.length > 0 && <> · {pills.map((pl, pi) => (
            <span key={pi} title={pillMeta(pl).title} style={{ color: pillMeta(pl).color }}>{pl}{pi < pills.length - 1 ? ' ' : ''}</span>
          ))}</>}
          {isTrap && p.trap_reason ? <span style={{ color: '#f87171', marginLeft: 4 }}>{p.trap_reason}</span> : null}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexShrink: 0 }}>
        {(p.last5_hr || 0) > 0 && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: (p.last5_hr || 0) >= 2 ? C.orange : C.text3 }}>
            L5 {p.last5_hr}HR
          </span>
        )}
        <span title={`HRW ${Math.round(p.hrw_score || 0)}`} style={{ fontSize: 11 }}>{hrwEmoji(p.hrw_score || 0)}</span>
        <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: 16, color: scoreCol, width: 34, textAlign: 'right' }}>
          {Math.round(p.hr_score || 0)}
        </span>
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
    ? sorted.filter((p) => tab.roles.some((r) => rolesOf(p).includes(r)))
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
            {t.roles ? ` (${sorted.filter((p) => t.roles.some((r) => rolesOf(p).includes(r))).length})` : ` (${Math.min(sorted.length, 40)})`}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10, fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
        <span>⭐ weak pitcher spot</span>
        <span>🎯 pitch type match</span>
        <span>👻 hidden value</span>
        <span>⚠️ trap flag</span>
      </div>
      {/* 🥇 THE PODIUM (2026-08-08 redesign) — an actual podium, not three
          chips in a row. Silver-gold-bronze steps, the champion elevated in
          the middle, each with the score on its own scale and the arm he
          faces — the briefing's cold open. */}
      {sorted.length >= 3 && pickTab === 'all' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12, maxWidth: 640 }}>
          {[1, 0, 2].map((idx) => {
            const p = sorted[idx]
            const first = idx === 0
            const col = first ? '#FCD34D' : idx === 1 ? '#d4d4d8' : '#d97706'
            return (
              <button key={p.player_id || idx} onClick={() => onPlayerClick?.(p)} style={{
                flex: first ? '1.25 1 0' : '1 1 0', minWidth: 0, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                background: `linear-gradient(175deg, ${col}${first ? '22' : '12'}, ${C.bg2} 75%)`,
                border: `1px solid ${col}${first ? '77' : '40'}`,
                borderRadius: '11px 11px 6px 6px',
                padding: first ? '14px 10px 10px' : '9px 8px 8px',
                boxShadow: first ? `0 0 20px ${col}1f` : 'none',
              }}>
                <span style={{ fontSize: first ? 19 : 15 }}>{['🥇', '🥈', '🥉'][idx]}</span>
                <span style={{
                  fontSize: first ? 13 : 11.5, fontWeight: 900, maxWidth: '100%',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{p.name}</span>
                <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.team} · vs {String(p.pitcher_name || 'TBD').split(' ').slice(-1)[0]}
                </span>
                <span style={{ fontSize: first ? 18 : 14, fontWeight: 900, fontFamily: NUM_FONT, color: col }}>
                  {(p.top_board_score_v2 || 0).toFixed(1)}
                </span>
              </button>
            )
          })}
        </div>
      )}
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

  // The masthead numbers — parsed from the bot's own sheet, same loose
  // patterns the header pill uses. Anything that doesn't parse just doesn't
  // print; the sheet below is always the source of truth.
  const brief = useMemo(() => {
    if (!text) return null
    const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
    const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
    const profiles = text.match(/top\s+HR\s+profiles\s*[:\s]\s*(\d+)/i)
    const weak = text.match(/weak\s+pitcher\s+spots\s*[:\s]\s*(\d+)/i)
    return {
      lo: range ? Number(range[1]) : null,
      hi: range ? Number(range[2]) : null,
      grade: grade ? grade[1].trim() : '',
      profiles: profiles ? Number(profiles[1]) : null,
      weak: weak ? Number(weak[1]) : null,
    }
  }, [text])

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
      {/* ── THE MASTHEAD (2026-08-08) — the sheet arrives as a briefing, not
          a text dump: dateline, the bot's own headline numbers, then its
          sections in its own words below. */}
      <div style={{
        background: `linear-gradient(150deg, ${C.bg2}, rgba(249,115,22,.07))`,
        border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.orange}`,
        borderRadius: 13, padding: '13px 16px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14 }}>🤖</span>
          <span style={{ fontSize: 12.5, fontWeight: 900, letterSpacing: '.12em', fontFamily: NUM_FONT }}>THE BOT&apos;S DAILY BRIEFING</span>
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{label}</span>
        </div>
        {(brief?.lo != null || brief?.grade || brief?.profiles != null || brief?.weak != null) && (
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
            {brief.lo != null && (
              <span style={{ border: '1px solid rgba(249,115,22,.5)', background: 'rgba(249,115,22,.1)', color: C.orange, borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT }}>
                💣 {brief.lo}–{brief.hi} HR projected
              </span>
            )}
            {brief.grade && (
              <span style={{ border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT }}>
                power grade {brief.grade}
              </span>
            )}
            {brief.profiles != null && (
              <span style={{ border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT }}>
                {brief.profiles} top HR profiles
              </span>
            )}
            {brief.weak != null && (
              <span style={{ border: '1px solid rgba(252,211,77,.45)', color: '#FCD34D', borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT }}>
                ★ {brief.weak} weak pitcher spots
              </span>
            )}
          </div>
        )}
        <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.5 }}>
          The numbers above are parsed from the sheet itself; everything below is the bot&apos;s own
          words, split into its own sections. Search opens whatever it finds.
        </div>
      </div>

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
                background: C.bg2, border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${open ? 'rgba(249,115,22,.55)' : C.border}`,
                borderRadius: 11,
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

// ORDER IS THE FIX (2026-08-10). Donovan: "there's no dedicated page to just
// showing the bot picks... the bot page is kinda just unusable — it does
// nothing." It wasn't missing a feature, it was landing on the wrong thing:
// `view` defaulted to 'sheet', a raw dump of mlb_breakdown_today.txt, and the
// picks sat behind a second click under a 40-row table. A tab called The Bot
// that opens on a wall of monospace does nothing, exactly as described.
//
// THE READ first and by default (2026-08-11). Tonight's Picks and the Raw
// Board both came out: the picks view was four short columns and then half a
// screen of nothing, and the Raw Board's only real idea — "where the two
// boards disagree, the gap IS the site's adjustment" — was a caption it never
// actually showed you, since it rendered one of the two rankings and not the
// difference. Section 3 of The Read shows that gap directly, so nothing was
// lost by dropping it. The sheets stay, unedited, because they are the
// receipt.
// ── THE READ NO LONGER LEADS THIS TAB (2026-08-17) ──────────────────────────
// Donovan: "honestly remove the read from the bot page its dumb", alongside
// "the read on the home page is good".
//
// So the read itself is fine — landing on a page of prose when you opened the
// bot's tab to see its PICKS is what is wrong. Shortlist leads now and The Read
// sits last in the row.
//
// Not deleted outright, for one concrete reason: Home's ReadTeaser links here
// for the full version, and that link is the thing he says he likes. Removing
// the view would break it. If he wants it gone entirely, the teaser moves to an
// inline expand on Home first — one change, not a dangling link.
const VIEWS = [
  { key: 'short',    label: '🎯 Shortlist' },
  { key: 'sheet',    label: '📄 Today’s Sheet' },
  { key: 'tomorrow', label: '📄 Tomorrow' },
  { key: 'read',     label: '📝 The Read' },
]

export default function Bot({ players = [], onPlayerClick, onGoPairs, odds = null }) {
  const [view, setView] = useState('short')

  return (
    <div>
      <PanelTitle
        title="The Bot"
        sub="Tonight read back in sentences · its sheet, in its own sections"
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

      {view === 'read'     && <TheRead players={players} onPlayerClick={onPlayerClick} odds={odds} />}
      {view === 'short'    && <Shortlist players={players} odds={odds} onPlayerClick={onPlayerClick} />}
      {view === 'sheet'    && <SheetViewer url={logUrl('today')} label="Today's sheet" />}
      {view === 'tomorrow' && <SheetViewer url={logUrl('tomorrow')} label="Tomorrow's sheet" />}
    </div>
  )
}
