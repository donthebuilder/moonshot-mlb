'use client'
import { useMemo, useState } from 'react'
import Rink from './Rink'
import { ZONES } from './ShotPanel'
import FlatStage, { StageSeg, StageLens } from '../charts/FlatStage'
import TeamMark from '../TeamMark'
import { nhlNickname } from '../../lib/nhl/teams'
import { useIsPhone } from '../MobileFold'
import { useLampShots } from '../../lib/nhl/useLamp'
import { stampLine } from '../../lib/nhl/shotStamp'
import { C, NUM_FONT } from '../../lib/nhl/theme'

// THE GAME'S RINK (Wave 6, 2026-10-11). The shot zones of the two clubs in this game on the stage frame (components/charts/FlatStage),
// the way TUDDY's game page draws one field for "who attacks whom". Real data only: /api/lamp/shots (lib/nhl/shotMap.js), the same
// maps the Shot map tab and Matchups read, cached a day. Nothing is computed that the Shot map does not already print:
//   ATTACK   where the attacking club's own attempts come from (its last 10 games, or its season)
//   ALLOWED  where the other club's goalie and skaters let attempts come from (shots against)
// Every attempt is turned to attack the right-hand net, so both clubs read on the same rink. The slot is the shaded box on the map.
// This is each club's season map, not this game's shots (the game's own shots are not on a route yet).
const WINDOWS = [['last10', 'Last 10'], ['all', 'Season']]
const LENS = [['attack', 'Attack'], ['allowed', 'Allowed']]
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)

function zoneItems(shots) {
  return ZONES.map((z) => {
    const inZ = shots.filter(z.test)
    const g = inZ.filter((sh) => sh[2] === 'goal').length
    return { key: z.key, label: z.label, g, n: inZ.length, total: shots.length, pct: shots.length ? (100 * inZ.length) / shots.length : 0, def: z.def }
  })
}

export default function GameRink({ game }) {
  const phone = useIsPhone(430)
  const [side, setSide] = useState('away')
  const [lens, setLens] = useState('attack')
  const [win, setWin] = useState('last10')
  const [tap, setTap] = useState(null)
  const att = side === 'away' ? game.away : game.home
  const def = side === 'away' ? game.home : game.away
  const own = useLampShots({ team: att.abbrev }, null)
  const against = useLampShots({ against: def.abbrev }, null)
  const d = lens === 'attack' ? own.data : against.data
  const other = lens === 'attack' ? against.data : own.data
  const m = d?.season ? (d[win] || d.last10 || d.all) : null
  const mo = other?.season ? (other[win] || other.last10 || other.all) : null
  const items = useMemo(() => zoneItems(m?.recent || []), [m])
  const itemsO = useMemo(() => zoneItems(mo?.recent || []), [mo])
  const th = { C, numFont: NUM_FONT, accent: C.ice }
  if ((own.loading && !own.data) || (!d && !own.error && !against.error && (own.loading || against.loading))) return <div style={{ color: C.text3, fontSize: 12, padding: '8px 0' }}>Loading the rink…</div>
  if (!m || !m.recent?.length) return null
  const atM = lens === 'attack' ? m : mo
  const dfM = lens === 'attack' ? mo : m
  const lg = d?.league?.slotShare
  const mark = (t, px) => <TeamMark sport="nhl" abbr={t} variant="logo" px={px} />
  const slotItem = items.find((z) => z.key === 'slot')
  const tapped = tap ? { a: items.find((z) => z.key === tap), b: itemsO.find((z) => z.key === tap) } : null
  const zoneLine = (z, who) => (z ? `${who}: ${z.n} of ${z.total} attempts (${Math.round(z.pct)}%), ${z.g} goal${z.g === 1 ? '' : 's'}` : null)
  const sentence = atM?.slotShare != null
    ? <>{att.abbrev}: <b style={{ color: C.ice, fontWeight: 900 }}>{pct(atM.slotShare)}</b> of shots on net come from the slot{lg != null ? ` (league ${pct(lg)})` : ''}.{dfM?.slotShare != null ? <> {def.abbrev} allow <b style={{ color: C.text, fontWeight: 900 }}>{pct(dfM.slotShare)}</b> from there.</> : null}</>
    : null
  const shots = m.recent
  return (
    <FlatStage theme={C} numFont={NUM_FONT} accent={C.ice} label={`${att.abbrev} attacking ${def.abbrev}: shot zones`} kicker="THE RINK" right={lens === 'attack' ? 'WHERE THEY SHOOT' : 'WHAT THEY ALLOW'}
      lead={mark(att.abbrev, 24)} title={`${nhlNickname(att.abbrev)} attacking ${nhlNickname(def.abbrev)}`} mark={mark(att.abbrev, 120)} sentence={sentence}
      tiles={[
        { label: `${att.abbrev} SLOT`, big: pct(atM?.slotShare), pct: atM?.slotShare != null ? atM.slotShare * 100 : null, hot: true, line: 'of shots on net' },
        { label: `${def.abbrev} ALLOW`, big: pct(dfM?.slotShare), pct: dfM?.slotShare != null ? dfM.slotShare * 100 : null, line: 'from the slot' },
        { label: 'LEAGUE', big: pct(lg), pct: lg != null ? lg * 100 : null, line: 'slot share' },
      ]}
      foldTiles={phone} maxWidth={420} fullscreen fullLabel="The rink, full screen"
      legend={<>Brighter = more of the shots shown. The number is that share (top 3 zones only); goals are the red marks. {slotItem ? `The slot is the shaded box between the dots and the goal line.` : ''} Tap a zone for both clubs&apos; numbers. {stampLine(d, m)}.</>}
      controls={<>
        {tapped && (tapped.a || tapped.b) && (
          <div aria-live="polite" style={{ font: `700 12px/1.45 ${NUM_FONT}`, color: C.text2 }}>
            <b style={{ color: C.text }}>{(ZONES.find((z) => z.key === tap)?.label || '').toUpperCase()}</b>
            <div>{zoneLine(tapped.a, lens === 'attack' ? `${att.abbrev} shoot` : `${def.abbrev} allow`)}</div>
            <div>{zoneLine(tapped.b, lens === 'attack' ? `${def.abbrev} allow` : `${att.abbrev} shoot`)}</div>
          </div>
        )}
        <StageSeg {...th} label="Which club has the puck" value={side} onChange={(v) => { setSide(v); setTap(null) }}
          items={[['away', 'attacking', mark(game.away.abbrev, 22)], ['home', 'attacking', mark(game.home.abbrev, 22)]]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ flex: '0 1 220px', minWidth: 190 }}><StageSeg {...th} label="Shot window" value={win} onChange={setWin} items={WINDOWS} /></div>
          <StageLens {...th} items={LENS} value={lens} onChange={(v) => { setLens(v); setTap(null) }} word="SHOWING" />
        </div>
      </>}>
      <Rink map={m} slot={d.slot} gridSpec={d.gridSpec} height={420} shots={shots} view="zones" onView={() => {}} zones={items} loud={3} onZoneTap={(k) => setTap((c) => (c === k ? null : k))} tappedZone={tap} hideViews />
    </FlatStage>
  )
}
