'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../PageHeader'
import SectionView from './SectionView'
import { resolveSection } from '../../lib/team/registry'
import { readHashKey } from '../../lib/filterHash'
import { writeParam } from '../../lib/useShellRoute'
import { fmtDay } from '../../lib/nhl/format'
import { localTime } from '../../lib/localTime'

// THE SHARED TEAM PAGE (2026-10-10, Donovan: "build out the team pages, showing all their data").
// One page for every sport, from a view (lib/team/contract.js): a header (logo, record, standing, splits, the next
// game and the last five), a ONE-ROW chips bar for the sections, and the chosen section below it. The section is the
// address: #...&team=TOR&sec=stats, so a shared link opens the same club on the same section and Back/forward follow.
// The sport passes its theme, table, empty state and navigation; nothing here names a sport.
const CHIP_H = 44

function Chips({ view, sec, onPick, theme }) {
  const { C, NUM_FONT, accent } = theme
  return (
    <nav aria-label="Team sections" style={{ position: 'sticky', top: 'var(--hdr-h, 0px)', zIndex: 15, background: C.bg, margin: '0 -2px', padding: '4px 2px' }}>
      <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', paddingBottom: 2 }}>
        {view.sections.map((s) => {
          const on = s.id === sec
          return (
            <button key={s.id} type="button" role="tab" aria-selected={on} id={`team-chip-${s.id}`} onClick={() => onPick(s.id)}
              style={{ flex: '0 0 auto', minHeight: CHIP_H, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
                border: `1px solid ${on ? accent : C.border2}`, background: on ? `${accent}22` : C.bg2, color: on ? accent : s.state === 'ok' ? C.text2 : C.text3,
                font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', textTransform: 'uppercase' }}>
              {s.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

const tap = (C, NUM_FONT) => ({ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 8px', background: 'transparent', border: 0, cursor: 'pointer', color: C.text2, font: `800 11px/1 ${NUM_FONT}` })

function NextGame({ header, nav, theme }) {
  const { C, NUM_FONT } = theme
  const g = header.live || header.next
  if (!g) return <div style={{ color: C.text3, fontSize: 12 }}>No game ahead on the club schedule.</div>
  const when = header.live ? `${g.us ?? 0}–${g.them ?? 0}` : `${fmtDay(g.date)}${g.startUtc ? ` · ${localTime(g.startUtc, { zone: false })}` : ''}`
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, minHeight: 44 }}>
      <span style={{ color: C.text3, font: `900 9px/1 ${NUM_FONT}`, letterSpacing: '.12em', marginRight: 6 }}>{header.live ? 'LIVE NOW' : 'NEXT'}</span>
      <button type="button" onClick={() => nav.onOpenGame?.(g.gameId)} style={{ ...tap(C, NUM_FONT), color: C.text, cursor: nav.onOpenGame ? 'pointer' : 'default' }}>{when}</button>
      <span style={{ color: C.text3, font: `800 11px/1 ${NUM_FONT}` }}>{g.home ? 'vs' : '@'}</span>
      <button type="button" onClick={() => nav.onOpenTeam?.(g.opp)} style={{ ...tap(C, NUM_FONT), color: C.text3, fontWeight: 600 }}>{g.opp}</button>
      {g.venue && <span style={{ color: C.text3, fontSize: 11 }}>{g.venue}</span>}
    </div>
  )
}

function Last5({ header, nav, theme }) {
  const { C, NUM_FONT, accent } = theme
  if (!header.last5?.length) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} aria-label="Last five results">
      <span style={{ flex: '0 0 auto', color: C.text3, font: `900 9px/1.1 ${NUM_FONT}`, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>LAST {header.last5.length}</span>
      {header.last5.map((g) => {
        const w = g.result === 'W'
        return (
          <button key={g.gameId} type="button" onClick={() => nav.onOpenGame?.(g.gameId)} title={`${g.home ? 'vs' : '@'} ${g.opp} · ${g.date}`}
            style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '4px 2px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${w ? `${accent}88` : C.border2}`, background: w ? `${accent}18` : C.bg2, color: w ? accent : C.text3, textAlign: 'center', lineHeight: 1.15 }}>
            <span style={{ display: 'block', font: `800 11px/1.15 ${NUM_FONT}` }}>{g.result} {g.us}–{g.them}</span>
            <span style={{ display: 'block', font: `600 9px/1.15 ${NUM_FONT}`, opacity: 0.8 }}>{g.home ? 'vs' : '@'}{g.opp}{g.outcome && g.outcome !== 'REG' ? ` ${g.outcome}` : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function TeamPage({ view, theme, ui, nav, back = null, hashKey = 'sec', banner = null, footer = null, children = null }) {
  const { C, NUM_FONT, accent } = theme
  const h = view.header
  const [sec, setSec] = useState(() => resolveSection(view.sport, null))
  useEffect(() => {
    const on = () => setSec(resolveSection(view.sport, readHashKey(hashKey)))
    on()
    window.addEventListener('hashchange', on); window.addEventListener('popstate', on)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on) }
  }, [view.sport, hashKey, h.code])
  const pick = (id) => { setSec(id); writeParam(hashKey, id === resolveSection(view.sport, null) ? null : id) }
  const active = view.sections.find((s) => s.id === sec) || view.sections[0]
  const stats = [h.record && { value: h.record, label: h.stale ? `${h.seasonLabel} FINAL` : 'RECORD', tone: h.stale ? C.amber : C.text2 }, h.points != null && { value: h.points, label: 'PTS', tone: C.text }, h.diff != null && { value: h.diff > 0 ? `+${h.diff}` : h.diff, label: 'DIFF', tone: C.text2 }].filter(Boolean)
  const note = [h.record && `${h.stale ? `${h.seasonLabel} final ` : ''}${h.record}${h.points != null ? ` (${h.points} pts)` : ''}`, h.standing, h.splits && `Home ${h.splits.home} · Road ${h.splits.road} · Last 10 ${h.splits.l10}`, h.streak && `Streak ${h.streak}`].filter(Boolean).join(' · ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {back}
      {banner}
      <PageHeader eyebrow={h.eyebrow} theme={C} numFont={NUM_FONT} accent={accent}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{h.logo && <img src={h.logo} alt="" width={56} height={56} style={{ width: 56, height: 56, objectFit: 'contain' }} />}{h.name || h.code}</span>}
        note={note || 'No standings row for this club yet.'} stats={stats.length ? stats : null} />
      <NextGame header={h} nav={nav} theme={theme} />
      <Last5 header={h} nav={nav} theme={theme} />
      <Chips view={view} sec={active.id} onPick={pick} theme={theme} />
      <section aria-labelledby={`team-chip-${active.id}`}>
        <SectionView section={active} ui={ui} nav={nav} theme={theme} />
      </section>
      {children}
      {footer}
    </div>
  )
}
