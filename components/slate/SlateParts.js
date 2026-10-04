'use client'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { btnStyle } from '../ui'
import { FilterPill } from '../Filters'
import MobileFold from '../MobileFold'
import { MatchLogos } from '../TeamMark'
import Rail from '../Rail'
import SlateCard from './SlateCard'

// THE SLATE, ONCE (2026-09-28). MOONSHOT's Slate (components/tabs/Games.js)
// pieces lifted out unchanged so TUDDY's and LAMP's Slates are built FROM them
// (CLAUDE.md: MOONSHOT's components are the base; Donovan: "i should be able
// to see each game and get a good breakdown just like mlb"). Every default is
// MOONSHOT's own -- its Slate renders exactly as before. The other two pass
// their words (filters, panel names) and their accent.
//
//   ViewPills        Table | Games
//   GameFilterRail   All · Live · Upcoming · Final · … with counts
//   StripFold        "🏟 All games (15) · reading NYM @ WSH"
//   GamePanelPills   the open game's jump links (The read · Lineups · …)
//   GameFrame        the open game's box and its header row
//   PrevNextGame     ‹ previous · 3 / 15 · next ›

export function ViewPills({ views, view, setView, accent = C.orange }) {
  return (
    <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
      {views.map(([k, label]) => (
        <button key={k} onClick={() => setView(k)} style={{
          padding: '4px 13px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body,
          fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
          border: `1px solid ${view === k ? accent : C.border}`,
          background: view === k ? alpha(accent, 0.14) : 'transparent',
          color: view === k ? accent : C.text3,
        }}>{label}</button>
      ))}
    </div>
  )
}

// Counts on every pill, per the universal filter's rule: knowing the size of a
// slice before you click it is the difference between a filter and a guess. A
// slice that would be empty is disabled rather than hidden, so the rail does
// not change shape as games start and finish under you.
export const BASE_GAME_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: '🔴 Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'final', label: 'Final' },
]
export function GameFilterRail({ value, onChange, counts, opts = BASE_GAME_FILTERS }) {
  return (
    <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
      <span style={{ fontSize: TYPE.label, fontWeight: 800, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase' }}>Games</span>
      {opts.map((o) => (
        <FilterPill key={o.key} active={value === o.key} count={counts[o.key]} title={o.title}
          disabled={counts[o.key] === 0 && value !== o.key}
          onClick={() => onChange(o.key)}>{o.label}</FilterPill>
      ))}
    </div>
  )
}

// The strip folds at every width and remembers being closed: it is a
// selector you use once, then read one game for several screens.
/** THE SLATE STRIP (R9 #10, 2026-10-04): the fold holding the rail of game
 *  cards and the one-line legend under it -- TUDDY's and LAMP's slates
 *  assembled it by hand, line for line. MOONSHOT's own strip (tabs/Games.js)
 *  builds its cards in GameStrip and keeps doing so. */
export function SlateStrip({ sport, isPhone, rememberKey, accent, theme, open = null, cards, activeId, onSelect, legend }) {
  return (
    <StripFold isPhone={isPhone} count={cards.length} rememberKey={rememberKey} accent={accent}
      summary={open ? <>reading <MatchLogos sport={sport} away={open.away} home={open.home} px={14} gap={3} /></> : 'tap to pick one'}>
      <div style={{ marginBottom: 16 }}>
        <style>{'@keyframes gsLivePulse{0%,100%{opacity:1}50%{opacity:.3}}'}</style>
        <Rail itemMin={264} gap={8} wheelScroll={false}>
          {cards.map((c) => <SlateCard key={c.id} card={c} on={c.id === activeId} accent={accent} onSelect={onSelect} sport={sport} />)}
        </Rail>
        <div style={{ marginTop: 7, fontSize: 9.5, color: theme.text3 }}>{legend}</div>
      </div>
    </StripFold>
  )
}

export function StripFold({ isPhone, count, summary, rememberKey = 'moonshot_games_fold_v1', accent = C.orange, children }) {
  return (
    <MobileFold
      title="🏟 All games"
      count={count}
      summary={summary}
      maxWidth={760}
      always
      defaultOpen={!isPhone}
      rememberKey={rememberKey}
      accent={accent}
    >{children}</MobileFold>
  )
}

// JUMP LINKS, NOT A SWITCHER: every section of the open game renders stacked,
// a pill scrolls to it. Sticky under the header (and the game switcher) on a
// phone, from the CSS variables those two publish -- no scroll listener.
export function GamePanelPills({ panels, subs = {}, badges = {}, panel, setPanel, gamePk = '', isPhone = false, note = null, accent = C.orange, stickyTop = 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px))' }) {
  const jump = (k) => {
    setPanel(k)
    try {
      document.getElementById(`gp-${k}-${gamePk}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch { /* ignore */ }
  }
  return (
    <div style={isPhone ? {
      marginBottom: 10, position: 'sticky', top: stickyTop, zIndex: 30,
      background: C.bg, margin: '0 -14px 10px', padding: '8px 14px 6px',
      borderBottom: `1px solid ${C.border}`,
    } : { marginBottom: 10 }}>
      <div className="chip-row" style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {panels.map(([k, label]) => {
          const on = panel === k
          return (
            <button
              key={k}
              onClick={(e) => { e.stopPropagation(); jump(k) }}
              title={subs[k]}
              style={{
                padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.body,
                fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                border: `1px solid ${on ? accent : C.border}`,
                background: on ? alpha(accent, 0.14) : 'transparent',
                color: on ? accent : C.text3,
              }}
            >
              {label}
              {badges[k] && (
                <span style={{ marginLeft: 5, color: on ? accent : C.yellow, fontWeight: 900 }}>{badges[k]}</span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, marginTop: 5, maxWidth: 720, display: isPhone ? 'none' : 'block' }}>
        {subs[panel]}
        {note}
      </div>
    </div>
  )
}

// A section of the open game, anchored for the pills above.
export function PanelAnchor({ id, gamePk, children, style }) {
  return <div id={`gp-${id}-${gamePk}`} style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 56px)', ...style }}>{children}</div>
}

/** The open game's box: `clip`, not `hidden`, so the sticky pills inside still stick. */
export function GameFrame({ active = true, past = false, accent = C.orange, frameRef, children }) {
  return (
    <section
      ref={frameRef}
      style={{
        scrollMarginTop: 160, minWidth: 0,
        background: active ? `linear-gradient(160deg, ${alpha(accent, 0.05)}, ${C.bg2} 45%)` : C.bg2,
        border: `1px solid ${active ? alpha(accent, 0.5) : C.border}`,
        borderRadius: 14, overflow: 'clip',
        boxShadow: active ? `0 0 26px -10px ${alpha(accent, 0.5)}` : 'none',
        opacity: past && !active ? 0.65 : 1,
      }}
    >{children}</section>
  )
}

/** The matchup line at the top of an open game: "✓ NYM @ WSH" + whatever the sport puts beside it. */
export function GameHeaderLine({ away, home, past = false, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
      <span style={{ fontSize: TYPE.title, fontWeight: 900, fontFamily: NUM_FONT, letterSpacing: '-.02em', color: past ? C.text3 : C.text }}>
        {past ? '✓ ' : ''}{away || '—'} <span style={{ color: C.text3, fontWeight: 400 }}>@</span> {home || '—'}
      </span>
      {children}
    </div>
  )
}

/** ‹ previous · 3 / 15 · next ›, from the bottom of a game's read. */
export function PrevNextGame({ games, activeId, idOf = (g) => g.game_pk, onGo, accent = C.orange, sport = 'mlb' }) {
  if (activeId == null || games.length < 2) return null
  const idx = games.findIndex((g) => idOf(g) === activeId)
  const prev = idx > 0 ? games[idx - 1] : null
  const next = idx >= 0 && idx < games.length - 1 ? games[idx + 1] : null
  // logos (Donovan 10-02); the codes ride the logos' title / alt
  const lbl = (g) => <MatchLogos sport={sport} away={g.away} home={g.home} px={16} gap={3} />
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', margin: '-8px 0 20px' }}>
      <button disabled={!prev} onClick={() => prev && onGo(idOf(prev))} title={prev ? `${prev.away} @ ${prev.home}` : undefined} style={{ ...btnStyle(accent, false), opacity: prev ? 1 : 0.35, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        ‹ {prev ? lbl(prev) : 'first game'}
      </button>
      <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{idx + 1} / {games.length}</span>
      <button disabled={!next} onClick={() => next && onGo(idOf(next))} title={next ? `${next.away} @ ${next.home}` : undefined} style={{ ...btnStyle(accent, false), opacity: next ? 1 : 0.35, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {next ? lbl(next) : 'last game'} ›
      </button>
    </div>
  )
}
