'use client'
// "OUT TONIGHT" / "OUT THIS WEEK": who is out for both clubs of one game, collapsed by default (no full page; Donovan 10-10).
// A table, our board / CALLED men first, then by status, then the freshest report. Every name that has a player page is a link, every
// club is a link. The header is one 44px line with the count; the list previews six rows and says "+N more". Source and time are
// printed. An unreadable report is SAID, never shown as an empty list.
import { useEffect, useMemo, useState } from 'react'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import InjuryChip from './InjuryChip'
import { useInjuryLayer } from './InjuryLayer'
import { forGame } from '../../lib/injuries/lookup'
import { BLOCKS, STATUS_INFO } from '../../lib/injuries/statuses'
import { UNAVAILABLE_LINE, NONE_LINE, STALE_LINE, updatedLabel } from '../../lib/injuries/words'

const PREVIEW = 6

/**
 * @param sport       'mlb' | 'nfl' | 'nhl' | 'nba'
 * @param clubs       [awayAbbr, homeAbbr]
 * @param theme       { C, NUM_FONT, accent }
 * @param title       'Out tonight' | 'Out this week'
 * @param isOurs      (entry) => boolean, puts our board / CALLED men first
 * @param openPlayer  (entry) => (() => void) | null   a link when the man has a page in this product
 * @param onOpenTeam  (abbr) => void
 * @param roleOf      (entry) => string | null          NFL: RB1 / WR2 via lib/nfl/roles.js; otherwise his position
 * @param nextUpOf    (entry) => { role, next } | null  NFL: who steps up behind an OUT man, from ESPN's own depth chart (lib/nfl/depthChart.js); nothing guessed
 * @param openSignal  true when the page's "Out" pill was tapped: opens the module
 */
export default function InjuryOut({ sport, clubs, theme, title = 'Out tonight', isOurs = () => false, openPlayer = null, onOpenTeam = null, roleOf = null, nextUpOf = null, openSignal = false }) {
  const layer = useInjuryLayer()
  const { C, NUM_FONT, accent } = theme
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState(false)
  useEffect(() => { if (openSignal) setOpen(true) }, [openSignal])
  const rows = useMemo(() => (layer?.index ? forGame(layer.index, sport, clubs, { isOurs }) : []), [layer, sport, clubs, isOurs])
  if (!layer || layer.loading) return null
  const wrap = { border: `1px solid ${C.border}`, borderRadius: 12, marginTop: 12, marginBottom: 12, minWidth: 0, background: 'transparent' }
  const head = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: '0 13px', border: 0, background: 'transparent', textAlign: 'left', color: C.text }
  const kicker = { font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: accent }
  if (layer.unavailable) {
    return (
      <section aria-label={title} data-injury-module="unavailable" style={{ ...wrap, padding: '10px 13px' }}>
        <span style={kicker}>{title.toUpperCase()}</span>
        <div style={{ marginTop: 4, fontSize: 12, lineHeight: 1.5, color: C.text3 }}>{UNAVAILABLE_LINE}</div>
      </section>
    )
  }
  const outN = rows.filter((e) => BLOCKS.has(e.status)).length
  const maybeN = rows.length - outN
  const summary = rows.length ? [outN ? `${outN} out` : '', maybeN ? `${maybeN} ${maybeN === 1 ? 'might not play' : 'might not play'}` : ''].filter(Boolean).join(' · ') : 'none listed'
  if (!rows.length) {
    return (
      <section aria-label={title} data-injury-module="none" style={{ ...wrap, padding: '10px 13px' }}>
        <span style={kicker}>{title.toUpperCase()}</span>
        <span style={{ marginLeft: 8, fontSize: 12, color: C.text3 }}>{NONE_LINE}</span>
        {layer.snap?.stale && <div style={{ marginTop: 4, fontSize: 12, color: C.yellow }}>{STALE_LINE}</div>}
      </section>
    )
  }
  const shown = all ? rows : rows.slice(0, PREVIEW)
  const th = { textAlign: 'left', font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3, padding: '6px 8px', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }
  const td = { padding: '8px 6px', fontSize: 12, borderBottom: `1px solid ${C.border}`, verticalAlign: 'top' }
  return (
    <section aria-label={title} data-injury-module="list" style={wrap}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ ...head, cursor: 'pointer' }}>
        <span style={kicker}>{title.toUpperCase()}</span>
        <span style={{ fontSize: 12, color: C.text2, fontFamily: NUM_FONT }}>{summary}</span>
        <span aria-hidden style={{ marginLeft: 'auto', color: C.text3 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 0 6px' }}>
          {layer.snap?.stale && <div style={{ padding: '0 13px 6px', fontSize: 12, color: C.yellow }}>{STALE_LINE}</div>}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 0 }}>
              <thead>
                <tr>
                  <th style={th}>PLAYER</th><th style={th}>CLUB</th><th style={th}>{roleOf ? 'ROLE' : 'POS'}</th><th style={th}>STATUS</th><th style={th}>NOTE</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e) => {
                  const go = openPlayer ? openPlayer(e) : null
                  const ours = isOurs(e)
                  return (
                    <tr key={`${e.team}:${e.name}`} data-injury-row={e.status}>
                      <td style={{ ...td, fontWeight: 800, color: C.text, minWidth: 84 }}>
                        {go ? <Tap onClick={go}>{e.name}</Tap> : e.name}
                        {ours && <span title="On our board tonight" style={{ marginLeft: 6, color: accent, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>BOARD</span>}
                      </td>
                      <td style={{ ...td, verticalAlign: 'middle' }}>
                        {onOpenTeam ? <Tap onClick={() => onOpenTeam(e.team)}><TeamMark sport={sport} abbr={e.team} variant="logo" px={16} /></Tap> : <TeamMark sport={sport} abbr={e.team} variant="logo" px={16} />}
                      </td>
                      <td style={{ ...td, color: C.text2, fontFamily: NUM_FONT }}>{(roleOf && roleOf(e)) || e.position || '·'}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}><InjuryChip entry={e} C={C} font={NUM_FONT} size={11} label={STATUS_INFO[e.status].word} style={{ marginLeft: 0, letterSpacing: '.02em', padding: '1px 4px' }} /></td>
                      <td style={{ ...td, color: C.text2, minWidth: 96 }}>{e.note || '·'}{(() => { const up = nextUpOf && BLOCKS.has(e.status) ? nextUpOf(e) : null; return up ? <div style={{ color: accent, font: `800 11px/1.3 ${NUM_FONT}`, marginTop: 2 }}>NEXT UP · {up.next} ({up.role})</div> : null })()}<div style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11, marginTop: 2 }}>{updatedLabel(e.updatedAt).replace('updated ', '') || ''}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > PREVIEW && (
            <button type="button" onClick={() => setAll((v) => !v)} style={{ minHeight: 44, padding: '0 13px', border: 0, background: 'transparent', color: accent, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', cursor: 'pointer' }}>
              {all ? 'SHOW FEWER' : `+${rows.length - PREVIEW} MORE`}
            </button>
          )}
          <div style={{ padding: '2px 13px 6px', fontSize: 11, color: C.text3 }}>Source: ESPN injury report{nextUpOf ? ' and depth chart (NEXT UP = the next healthy name on his own line)' : ''}. A report can change up to game time.</div>
        </div>
      )}
    </section>
  )
}
