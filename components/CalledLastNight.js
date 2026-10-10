'use client'
import { useState } from 'react'
import { C as MLB_C } from '../lib/theme'
import WatchBox from './WatchBox'
import MobileFold from './MobileFold'
import { DrawerSection, drawerChip } from './FiltersDrawer'
import { SECTION_TITLE, RESULT_WORD, sectionOrder, summaryLine, emptyNote, dayWord, CALLED_WORD } from '../lib/calledLast/core'

// CALLED LAST NIGHT, TWO SURFACES, ONE LENS (lib/calledLast/useCalledLast.js).
//   <CalledLastNight>   the section: MOONSHOT's WatchBox, a sibling of the B2B / Goal / TD watch. Under the board
//                       (so the first ranked row does not move), folded on a phone, a few rows then "+N more".
//   <CalledLastFilter>  the one entry in the board's Filters sheet: "Called last night", everyone the bot called
//                       the previous slate; Missed / Hit / Didn't play optionally narrow it.
// Information only. The words are lib/calledLast/core.js; the status word CALLED is callStatus's.
const PREVIEW = 6

/** The board column: yesterday's call and result in one cell that wraps instead of squeezing to "…". Pass the board's own group / label / width. */
export const lastNightColumn = (extra = {}) => ({
  key: 'cln', label: 'Last night', heat: false, dim: true, w: 200,
  title: 'The previous slate: was he called, and what he did. Not tonight\u2019s status.',
  fmt: (v) => <span style={{ display: 'block', whiteSpace: 'normal', lineHeight: 1.3, padding: '2px 0' }}>{v || '—'}</span>,
  ...extra,
})

export function CalledLastFilter({ lens }) {
  if (!lens?.enabled) return null
  const { mode, setMode, data, loading, failed } = lens
  const note = loading ? 'Reading last night’s calls…' : failed ? 'Could not read last night’s calls just now.'
    : data?.unavailable ? 'Last night’s calls are not available yet.'
    : data?.rows?.length ? summaryLine(data.date, lens.summary) : emptyNote({ date: data?.date, state: data?.state })
  const chip = (on) => ({ ...drawerChip(on), minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px' })
  return (
    <DrawerSection label={SECTION_TITLE} hint="Everyone the bot called at lock on the previous slate, and what each did. Information only.">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
        <button type="button" aria-pressed={Boolean(mode)} onClick={() => setMode(mode ? '' : 'all')} style={chip(Boolean(mode))}>{SECTION_TITLE}</button>
      </div>
      {mode ? (
        <div role="group" aria-label="Narrow last night’s calls" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {lens.modes.filter((m) => m.key !== 'all').map((m) => (
            <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => setMode(mode === m.key ? 'all' : m.key)} style={chip(mode === m.key)}>{m.label}</button>
          ))}
        </div>
      ) : null}
      <div style={{ fontSize: 11, color: MLB_C.text3, marginTop: 6, lineHeight: 1.45 }}>{note}</div>
    </DrawerSection>
  )
}

const linkBtn = (color) => ({ minHeight: 44, background: 'transparent', border: 'none', color, font: 'inherit', fontWeight: 800, cursor: 'pointer', padding: 0 })

function Section({ lens, onOpen, accent, theme, numFont, logoSport }) {
  const [all, setAll] = useState(false)
  const C = theme || MLB_C
  const { data, rows } = lens
  const ordered = [...rows].sort(sectionOrder)
  const shown = all ? ordered : ordered.slice(0, PREVIEW)
  const more = ordered.length - shown.length
  const by = (res) => shown.filter((r) => r.result === res)
  const item = (r) => ({
    key: r.pid, tile: r.team || '·', name: r.name,
    line: `${RESULT_WORD[r.result]} · ${r.line}${r.calledAs ? ` · called ${r.calledAs}` : ''}`,
    hit: r.result === 'hit', hitText: `✓ ${RESULT_WORD.hit} · ${r.line}`,
    onClick: () => onOpen?.(r),
  })
  const rowsOut = [
    { key: 'miss', label: `${RESULT_WORD.miss}`, accent: C.amber, items: by('miss').map(item) },
    { key: 'void', label: RESULT_WORD.void, accent: C.text3, items: by('void').map(item) },
    { key: 'pending', label: RESULT_WORD.pending, accent: C.text3, items: by('pending').map(item) },
    { key: 'hit', label: RESULT_WORD.hit, items: by('hit').map(item) },
  ]
  const s = lens.summary
  const status = lens.loading ? 'reading last night’s calls…' : lens.failed ? 'could not read last night’s calls'
    : data?.unavailable ? 'not available yet' : rows.length ? summaryLine(data.date, s) : emptyNote({ date: data?.date, state: data?.state })
  return (
    <WatchBox logoSport={logoSport} icon="🕐" title={SECTION_TITLE.toUpperCase()} accent={accent} theme={theme} numFont={numFont} ariaLabel={SECTION_TITLE}
      status={status} note={`${CALLED_WORD} at lock · what happened`} rows={rowsOut}
      footer={(
        <div>
          <div>What happened to {data?.date ? dayWord(data.date) : 'last night'}’s calls: the stored result, nothing re-graded.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
            {more > 0 ? <button type="button" onClick={() => setAll(true)} style={linkBtn(accent || C.orange)}>+{more} more</button> : null}
            {all && ordered.length > PREVIEW ? <button type="button" onClick={() => setAll(false)} style={linkBtn(C.text3)}>show fewer</button> : null}
            <button type="button" onClick={() => lens.setMode(lens.mode ? '' : 'all')} style={linkBtn(accent || C.orange)}>{lens.mode ? 'Show the whole board' : 'Narrow the board to these'}</button>
          </div>
        </div>
      )}
    />
  )
}

export default function CalledLastNight({ lens, onOpen, accent = null, theme = null, numFont = null, logoSport = null, rememberKey = 'fold_calledlast_v1' }) {
  if (!lens?.enabled) return null
  const C = theme || MLB_C
  const s = lens.summary
  const summary = lens.loading ? 'reading…' : lens.rows.length ? `${s.called} called · ${s.hit} hit · ${s.miss} missed` : 'no calls stored'
  return (
    <MobileFold title={`🕐 ${SECTION_TITLE}`} summary={summary} count={lens.rows.length || null} accent={accent || C.orange} rememberKey={rememberKey}>
      <Section lens={lens} onOpen={onOpen} accent={accent || C.orange} theme={theme} numFont={numFont} logoSport={logoSport} />
    </MobileFold>
  )
}
