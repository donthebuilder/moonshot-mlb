'use client'
// THE LADDER, AS A BLOCK (2026-10-10, LAMP hero plan item 1; ledger audit findings 5 and 9).
// CALLED, ON THE BOARD, NOT ON THE BOARD and every dressed skater: n, goals scored, the rate and its 95% Wilson
// range on one row each, with the one sentence that says what the top rung did against the base. Every figure
// is a count the reader hands in (lib/record/ladder.js ladderFrom, from /api/calibration); nothing is typed
// here. The words are lib/callStatus STATUS_WORD's, rendered by CallStatusBadge. The theme comes from the
// product (props), never a literal, so the block takes any sport whose reader returns a ladder (LAMP today).
//
//   <LadderBlock ladder sport="nhl" />            the ladder table + sentence + scope
//     children                                    secondary lines under it (CAPTURE, labelled)
//   <LadderVersions ladder sport="nhl" />         the same CALLED rate, one row per model version
//   <LadderOddsNote sport="nhl" />                the price line, only when stored lock prices compute it
import { useMemo } from 'react'
import CallStatusBadge from '../CallStatusBadge'
import { SportTheme, useSportTheme } from '../SportTheme'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { C as NHL_C, NUM_FONT as NHL_NUM } from '../../lib/nhl/theme'
import { C as NFL_C, NUM_FONT as NFL_NUM } from '../../lib/nfl/theme'
import { straightLine } from '../../lib/record/callsLanded'
import { appHref } from '../../lib/routes'
import { ladderFrom, ladderRows, ladderCells, ladderSentence, ladderScope, ladderScopeShort, versionRows, POOLED_LABEL, BASE_LABEL, priceNote } from '../../lib/record/ladder'

const THEMES = {
  nhl: { theme: NHL_C, accent: NHL_C.ice, numFont: NHL_NUM },
  nfl: { theme: NFL_C, accent: NFL_C.green, numFont: NFL_NUM },
  mlb: { theme: null },
}

/** Mounts the product's theme for a server page (no provider above it); inside the app it is a no-op re-provide. */
function Themed({ sport, children }) {
  const t = THEMES[sport] || THEMES.mlb
  return <SportTheme theme={t.theme} accent={t.accent} numFont={t.numFont}>{children}</SportTheme>
}

const kicker = (C, NUM_FONT, accent) => ({ color: accent, font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '0 0 6px' })

function LadderTable({ ladder, accent, C, NUM_FONT, compact }) {
  const rows = ladderRows(ladder)
  const th = { padding: '0 0 4px', font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.06em', color: C.text3, textAlign: 'right', fontWeight: 800 }
  const td = { padding: compact ? '5px 0' : '7px 0', borderTop: `1px solid ${C.border2}`, textAlign: 'right', verticalAlign: 'middle', fontFamily: NUM_FONT }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
      <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Goals scored by group: CALLED, ON THE BOARD, NOT ON THE BOARD and every dressed skater. Each row gives the skaters counted, the goal scorers among them, the rate and its 95% range.
      </caption>
      <thead>
        <tr>
          <th scope="col" style={{ ...th, textAlign: 'left' }}>Group</th>
          <th scope="col" style={th}>Scored</th>
          <th scope="col" style={th}>Rate</th>
          <th scope="col" style={th}>95% range</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const c = ladderCells(r, ladder.minN)
          const isBase = r.key === 'base'
          return (
            <tr key={r.key}>
              <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400, fontFamily: 'inherit', paddingRight: 8 }}>
                {isBase
                  ? <span style={{ fontSize: 12, color: C.text2, fontWeight: 700 }}>{BASE_LABEL}</span>
                  : <CallStatusBadge status={r.status} accent={accent} size={10} />}
              </th>
              <td style={{ ...td, fontSize: 12, color: C.text2, whiteSpace: 'nowrap' }}>{c.of}</td>
              <td style={{ ...td, paddingLeft: 8 }}>
                <b style={{ fontSize: 15, color: r.key === 'called' ? accent : C.text, fontWeight: 900 }}>{c.rate}</b>
              </td>
              <td style={{ ...td, fontSize: 11, color: C.text3, paddingLeft: 8, whiteSpace: 'nowrap' }}>
                {c.range || '—'}{c.tracking ? <span style={{ display: 'block', letterSpacing: '.04em' }}>tracking</span> : null}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function LadderInner({ ladder, compact = false, heading = 'THE LADDER', children = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const sentence = useMemo(() => ladderSentence(ladder), [ladder])
  if (!ladder) return null
  return (
    <section aria-label="The ladder" style={{ margin: compact ? '8px 0' : '4px 0 14px' }}>
      <div style={kicker(C, NUM_FONT, accent)}>{heading}</div>
      {sentence ? <p style={{ margin: '0 0 8px', fontSize: compact ? 13.5 : 15, lineHeight: 1.4, color: C.text, fontWeight: 700 }}>{sentence}</p> : null}
      <LadderTable ladder={ladder} accent={accent} C={C} NUM_FONT={NUM_FONT} compact={compact} />
      <p style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.45, color: C.text3 }}>
        {compact ? ladderScopeShort(ladder) : <>{ladderScope(ladder)} The base is every dressed skater on the board, not one skater&apos;s chance.</>}
      </p>
      {children}
    </section>
  )
}

export default function LadderBlock({ ladder, sport = 'nhl', ...rest }) {
  if (!ladder) return null
  return <Themed sport={sport}><LadderInner ladder={ladder} {...rest} /></Themed>
}

/** Secondary line under the ladder (CAPTURE): its own words, its own window, never the headline. */
export function LadderAside({ label, children }) {
  const { C, NUM_FONT } = useSportTheme()
  return (
    <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: C.text3 }}>
      <b style={{ color: C.text2, fontFamily: NUM_FONT, letterSpacing: '.06em', fontSize: 11 }}>{label}</b> {children}
    </p>
  )
}

function VersionsInner({ ladder }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const rows = versionRows(ladder)
  if (!rows.length) return null
  const th = { padding: '0 0 4px', font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.06em', color: C.text3, textAlign: 'right', fontWeight: 800 }
  const td = { padding: '7px 0', borderTop: `1px solid ${C.border2}`, textAlign: 'right', verticalAlign: 'middle', fontFamily: NUM_FONT, fontSize: 12, color: C.text2 }
  const pooledC = ladderCells(ladder.rungs.called, ladder.minN)
  const pooledB = ladderCells(ladder.base, ladder.minN)
  return (
    <section aria-label="CALLED by model version" style={{ margin: '4px 0 14px' }}>
      <div style={kicker(C, NUM_FONT, accent)}>CALLED, BY MODEL VERSION</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          CALLED skaters who scored under each model version, with the rate for every dressed skater in the same nights beside it.
        </caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: 'left' }}>Version</th>
            <th scope="col" style={th}>CALLED scored</th>
            <th scope="col" style={th}>Rate</th>
            <th scope="col" style={th}>Base</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const c = ladderCells(v.called, ladder.minN)
            const b = ladderCells(v.base, ladder.minN)
            return (
              <tr key={v.version}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400, paddingRight: 8 }}>
                  <b style={{ color: v.live ? accent : C.text, fontSize: 13 }}>{v.label}</b>
                  {v.live ? <span style={{ marginLeft: 6, fontSize: 11, letterSpacing: '.06em', color: accent }}>LIVE</span> : null}
                  <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>{v.nights} {v.nights === 1 ? 'night' : 'nights'}</span>
                </th>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.of}</td>
                <td style={{ ...td, paddingLeft: 8 }}>
                  <b style={{ fontSize: 14, color: v.live ? accent : C.text, fontWeight: 900 }}>{c.rate}</b>
                  <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>{c.range ? `${c.range}${c.tracking ? ' · tracking' : ''}` : ''}</span>
                </td>
                <td style={{ ...td, paddingLeft: 8 }}>
                  <span style={{ fontSize: 13 }}>{b.rate}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>n={b.n}</span>
                </td>
              </tr>
            )
          })}
          <tr>
            <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 400, paddingRight: 8 }}>
              <b style={{ color: C.text2, fontSize: 12 }}>{POOLED_LABEL}</b>
              <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>{ladder.nights} nights, pooled</span>
            </th>
            <td style={{ ...td, whiteSpace: 'nowrap' }}>{pooledC.of}</td>
            <td style={{ ...td, paddingLeft: 8 }}>
              <b style={{ fontSize: 14, color: C.text, fontWeight: 900 }}>{pooledC.rate}</b>
              <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>{pooledC.range || ''}</span>
            </td>
            <td style={{ ...td, paddingLeft: 8 }}>
              <span style={{ fontSize: 13 }}>{pooledB.rate}</span>
              <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>n={pooledB.n}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: 11.5, lineHeight: 1.45, color: C.text3 }}>
        Each night was called by the version it locked under and is never rewritten. A version with few nights is tracking, not a rate to lean on. Base = every dressed skater in that version&apos;s nights.
      </p>
    </section>
  )
}

export function LadderVersions({ ladder, sport = 'nhl' }) {
  if (!ladder) return null
  return <Themed sport={sport}><VersionsInner ladder={ladder} /></Themed>
}

function OddsInner({ sport }) {
  const { C } = useSportTheme()
  const { data } = useLiveFetch(`/api/record/calls?sport=${sport}`)
  const note = useMemo(() => priceNote(straightLine(data?.calls || [])), [data])
  if (!note) return null
  return (
    <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45, color: C.text3 }}>
      {note.lead}: {note.facts}{' '}
      <a href={appHref(sport, 'odds')} style={{ color: 'inherit', textDecoration: 'underline', display: 'inline-block', padding: '12px 4px', margin: '-12px -4px' }}>See Odds</a>. Not an edge and not advice.
    </p>
  )
}

/** The price line under the ladder. Renders nothing until the stored lock prices compute it (100+ priced calls). */
export function LadderOddsNote({ sport = 'nhl' }) {
  return <Themed sport={sport}><OddsInner sport={sport} /></Themed>
}

/**
 * The ladder for the in-app Record tab: reads /api/calibration (the one lock-enforced reader), draws the ladder,
 * the version split and the price line. `aside` is a labelled secondary line (CAPTURE) under the ladder.
 */
export function LadderFromApi({ sport = 'nhl', versions = false, odds = false, compact = false, aside = null }) {
  const { data } = useLiveFetch(`/api/calibration?sport=${sport}`)
  const ladder = useMemo(() => ladderFrom(data), [data])
  if (!ladder) return null
  return (
    <Themed sport={sport}>
      <LadderInner ladder={ladder} compact={compact}>
        {aside}
        {odds ? <OddsInner sport={sport} /> : null}
      </LadderInner>
      {versions ? <VersionsInner ladder={ladder} /> : null}
    </Themed>
  )
}
