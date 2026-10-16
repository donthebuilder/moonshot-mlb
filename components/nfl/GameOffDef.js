'use client'
import { useEffect, useMemo, useState } from 'react'
import PlayerFace from '../PlayerFace'
import { useIsPhone } from '../MobileFold'
import LineUp, { WhoChips } from './LineUp'
import { useInjuryLayer } from '../injuries/InjuryLayer'
import { STATUS_INFO, BLOCKS } from '../../lib/injuries/statuses'
import { injuryTag, isOut } from '../../lib/nfl/injury'
import { placeOffense, placeDefense, whoInZone, basisNote } from '../../lib/nfl/whoLines'
import TeamMark from '../TeamMark'
import { nflNickname } from '../../lib/nfl/teams'
import BroadcastField from './BroadcastField'
import FlatStage, { StageSeg, StageLens } from '../charts/FlatStage'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { fmtPct, HEAT_FULL } from '../../lib/nfl/fieldModel'
import { gameField, fieldSentence, zonesOf } from '../../lib/nfl/gameMatchup'
import { SOFT_THIN_GAMES } from '../../lib/nfl/dvpSignal'

// OFFENSE vs DEFENSE, ONE FIELD (2026-10-06, Donovan on the NFL game page:
// "move that up into the top area where it talks about offense versus
// defense"; the page must say where this offense attacks, where this defense is
// weak, and whether they overlap). One football field, three views of it:
//   Attack   where this offense sends its targets / carries (the team's share)
//   Defend   where the other defense gives up more than a normal one
//   Overlap  both at once -- the ringed tile is the spot to watch, in a sentence
// Passing | Running switches the zones; "TB attacking | DAL attacking" flips
// the direction. No stat here is new: components/nfl/FootballField paints the
// numbers lib/nfl/gameMatchup.js reads off the matchup file's field grids.
// THE CARD LOOK (2026-10-10, Donovan: "the chart is bad still, look at our cards we made and update the chart based on that"). The same
// vocabulary as lib/cards/playerCard.js, at screen size: a thin accent frame, the matchup said in slanted heavy capitals with both club
// marks, three metric tiles (label / big slanted number / ordinal-style line / thin bar, the accent only on the signal), then the field
// with ONLY its top zones numbered (the rest stay quiet: a lit zone, no tiny %), then the switches. Same data and same switches' meaning:
// which club has the ball, passing or running, and the lens. Overlap is the lens it opens on; Attack and Defend are the quiet two.
const MODES = [['overlap', 'Overlap'], ['attack', 'Attack'], ['defend', 'Defend']]
const TOP_NUMBERED = 3
const pct = (v) => `${Math.round(v)}%`

export const Kicker = ({ children, style }) => (
  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT, margin: '0 0 8px', ...style }}>{children}</div>
)

// the injury layer first (ESPN's report), the week file's own injury_status second; null = not listed (never guessed)
const TAG_WORD = { OUT: 'Out', IR: 'Injured reserve', D: 'Doubtful', Q: 'Questionable', SUSP: 'Suspended', PUP: 'PUP', NFI: 'Out' }
let WHO_PREF = null   // the choice, kept for the session (module memory, mirrored to sessionStorage where it works)
export function injuryStatusOf(layer, p) {
  const e = layer?.entryFor?.({ player_id: p.player_id, name: p.name, team: p.team })
  if (e && STATUS_INFO[e.status]) return { chip: STATUS_INFO[e.status].chip, word: STATUS_INFO[e.status].word, blocked: BLOCKS.has(e.status) }
  const tag = injuryTag(p)
  if (tag && tag !== 'Q') return { chip: tag, word: TAG_WORD[tag] || tag, blocked: isOut(tag) || tag === 'D' }
  return tag ? { chip: 'Q', word: 'Questionable', blocked: false } : null
}

export default function GameOffDef({ matchup, players, game, onPlayerClick = null, defending = null, onDefend = null }) {
  const phone = useIsPhone(430)
  const [pref, setPref] = useState(WHO_PREF)   // null = never touched this session: open on desktop, closed on a phone
  useEffect(() => { if (WHO_PREF == null) { try { const v = sessionStorage.getItem('tuddy-who-open'); if (v != null) { WHO_PREF = v === '1'; setPref(WHO_PREF) } } catch (e) { /* no storage */ } } }, [])
  const who = pref ?? !phone
  const setWho = (f) => { const v = f(who); WHO_PREF = v; setPref(v); try { sessionStorage.setItem('tuddy-who-open', v ? '1' : '0') } catch (e) { /* private window: the choice just is not remembered */ } }
  const [zonePick, setZonePick] = useState(null)
  const layer = useInjuryLayer()
  const [mode, setMode] = useState('overlap')
  const [pass, setPass] = useState(true)
  const [side, setSide] = useState(defending ? (defending === game.home ? 'away' : 'home') : 'away')
  const off = side === 'away' ? game.away : game.home
  const def = side === 'away' ? game.home : game.away
  const field = matchup?.field
  const gf = useMemo(() => gameField({ field, players, off, def, pass }), [field, players, off, def, pass])
  const statusOf = (p) => injuryStatusOf(layer, p)
  const offMen = useMemo(() => placeOffense({ matchup, players, off, pass, statusOf, maxFaces: phone ? 3 : undefined }), [matchup, players, off, pass, layer, phone])   // eslint-disable-line react-hooks/exhaustive-deps
  const defMen = useMemo(() => (pass ? placeDefense({ matchup, def, statusOf }) : { placed: [], chips: [] }), [matchup, def, pass, layer])   // eslint-disable-line react-hooks/exhaustive-deps
  const inZone = useMemo(() => (zonePick ? whoInZone({ matchup, players, off, pass, zone: zonePick, statusOf }) : []), [matchup, players, off, pass, zonePick, layer])   // eslint-disable-line react-hooks/exhaustive-deps
  const rushable = Boolean(field?.def_rush?.[def] || field?.player_rush)
  if (!field) return null

  const unit = pass ? 'target' : 'carry'
  const zones = zonesOf(pass)
  const cells = {}
  const even = gf?.even || 0
  for (const z of zones) {
    const c = gf?.by?.[z]
    let heat = null, big = '—', pips = 0, arrow = false, w = 0
    if (c) {
      if (mode === 'defend') {
        if (c.leak != null) { heat = c.leak > 0 ? Math.min(1, c.leak / HEAT_FULL) : null; big = fmtPct(c.leak) }
        pips = c.tdDef
      } else {
        if (c.share != null) big = pct(c.share)
        if (mode === 'attack') {
          heat = c.share != null && gf.maxShare > 0 && c.share >= 1 ? c.share / gf.maxShare : null
          arrow = c.share != null && c.share >= even && !z.endsWith('|behind')
        } else {
          heat = c.ov > 0 && gf.maxOv > 0 ? Math.min(1, c.ov / gf.maxOv) * (c.qual ? 1 : 0.12) : null
          arrow = Boolean(c.qual) && !z.endsWith('|behind')
        }
        w = gf.maxShare > 0 && c.share != null ? c.share / gf.maxShare : 0
        pips = c.tdOff
      }
    }
    const tip = c ? [
      c.where,
      c.share != null ? `${off}: ${Math.round(c.share)}% of its ${unit}s (${c.att})` : null,
      c.leak != null ? `${def} give up ${fmtPct(c.leak)} yards a ${unit} vs a normal defense` : `${def}: too few plays here to call it`,
      c.tdOff ? `${off}: ${c.tdOff} TD there` : null,
      c.tdDef ? `${def}: ${c.tdDef} TD allowed there` : null,
    ].filter(Boolean).join('\n') : z
    cells[z] = { heat, big, pips, arrow, w, title: tip }
  }
  // only the strongest zones carry their number (the rest are lit, not labelled)
  const keyOf = (c) => (mode === 'defend' ? c.leak ?? -1 : mode === 'attack' ? c.share ?? -1 : (c.qual ? 1000 : 0) + (c.ov || 0) + (c.share || 0) / 1000)
  const loud = new Set((gf?.cells || []).filter((c) => keyOf(c) > 0 && cells[c.z]?.big !== '—').sort((a, b) => keyOf(b) - keyOf(a)).slice(0, TOP_NUMBERED).map((c) => c.z))
  for (const z of zones) if (cells[z]) cells[z] = loud.has(z) ? { ...cells[z], heat: cells[z].heat ?? 0.3 } : { ...cells[z], big: null }
  const pickedKey = mode === 'attack' ? gf?.topShare?.z : mode === 'defend' ? gf?.softest?.z : gf?.ring?.z
  const sentence = fieldSentence({ gf, mode, off, def, pass })
  const legend = {
    attack: `Brighter = more of ${off}'s ${unit}s go there. The number is that share. Dots = touchdowns.`,
    defend: `Brighter = ${def} give up more yards a ${unit} than a normal defense. Dots = touchdowns allowed.`,
    overlap: `Ringed = where ${off} goes a lot and ${def} are soft. The number is ${off}'s share. Dots = ${off} touchdowns.`,
  }[mode]
  const games = matchup?.tendencies?.offense?.[off]?.games
  const early = Number.isFinite(games) && games < SOFT_THIN_GAMES
  const sample = gf?.total ? `${off}: ${gf.total} ${unit}s${Number.isFinite(games) ? ` in ${games} ${games === 1 ? 'game' : 'games'}` : ''}${early ? ' · early' : ''}` : null
  const edge = (t) => <TeamMark sport="nfl" abbr={t} variant="logo" px={24} />
  const edge2 = (t, px) => <TeamMark sport="nfl" abbr={t} variant="logo" px={px} />

  const offTop = gf?.topShare
  const soft = gf?.softest
  const ring = gf?.ring
  const th = { C, numFont: NUM_FONT, accent: C.green }
  const Lens = () => <StageLens {...th} items={MODES} value={mode} onChange={setMode} />
  const whoBlock = (
    <div style={{ marginTop: 2 }}>
      <button type="button" aria-expanded={who} onClick={() => setWho((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: 0, marginBottom: who ? 6 : 0, background: 'none', border: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
        <span style={{ font: `800 12px/1.2 ${NUM_FONT}`, letterSpacing: '.18em', color: C.green, whiteSpace: 'nowrap' }}>WHO LINES UP WHERE</span>
        <span style={{ font: `800 12px/1.2 ${NUM_FONT}`, color: C.text2, whiteSpace: 'nowrap' }}>· {offMen.placed.length + defMen.placed.length} placed</span>
        <span aria-hidden="true" style={{ flex: 1, height: 1, background: `${C.green}55` }} />
        <span aria-hidden="true" style={{ font: `900 14px/1 ${NUM_FONT}`, color: C.green, transform: who ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {who && (
        <>
          <LineUp off={off} def={def} pass={pass} offMen={offMen.placed} defMen={defMen.placed} onPlayer={onPlayerClick} />
          <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>Left and right: the offence’s view, up the page at the defence. {basisNote({ placed: [...offMen.placed, ...defMen.placed], pass, hasDef: defMen.placed.length > 0 })} No slot: not published.</p>
          <WhoChips chips={[...offMen.chips, ...defMen.chips]} onPlayer={onPlayerClick} />
        </>
      )}
    </div>
  )
  const zoneWho = zonePick && (
    <div role="group" aria-label="Who gets the ball in this zone" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, margin: '0 0 2px' }}>
      <span style={{ flexBasis: '100%', font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text2 }}>{(cells[zonePick]?.title || zonePick).split('\n')[0].toUpperCase()}: WHO GETS THE {unit.toUpperCase()}S</span>
      {inZone.length === 0 && <span style={{ fontSize: 12, color: C.text3 }}>No {off} player has a {unit} logged here yet.</span>}
      {inZone.map((r) => (
        <button key={r.id} type="button" onClick={() => onPlayerClick?.(r.row)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px 0 6px', borderRadius: 22, border: `1px solid ${C.green}66`, background: `${C.green}14`, color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>
          <PlayerFace sport="nfl" espnId={r.espn_id} team={r.team} name={r.name} size={32} />
          <span style={{ textAlign: 'left' }}><span style={{ display: 'block', font: `800 12px/1.2 ${NUM_FONT}` }}>{r.last}</span><span style={{ display: 'block', font: `700 11px/1.2 ${NUM_FONT}`, color: C.text2 }}>{r.role} · {r.att} {unit}{r.att === 1 ? '' : 's'}{r.share != null ? ` · ${Math.round(r.share)}%` : ''}</span></span>
        </button>
      ))}
      <button type="button" onClick={() => setZonePick(null)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 22, border: `1px solid ${C.border}`, background: 'transparent', color: C.text2, font: `800 12px/1 ${NUM_FONT}`, cursor: 'pointer' }}>Clear</button>
    </div>
  )
  return (
    <FlatStage theme={C} numFont={NUM_FONT} accent={C.green} label={`${off} offense against ${def} defense`} kicker="THE FIELD" right={pass ? 'PASSING' : 'RUNNING'}
      lead={edge(off)} title={`${nflNickname(off)} attacking ${nflNickname(def)}`} mark={edge2(off, 120)}
      sentence={<>{sentence.a}{sentence.b && <b style={{ fontWeight: 900, color: C.green }}>{sentence.b}</b>}{sentence.c}{sentence.detail ? ` ${sentence.detail}` : ''}</>}
      tiles={[
        { label: `${off} BUSIEST`, big: offTop?.share != null ? pct(offTop.share) : '—', pct: offTop?.share != null && gf.maxShare > 0 ? (100 * offTop.share) / gf.maxShare : null, hot: Boolean(ring && offTop && ring.z === offTop.z), line: offTop?.share != null ? `of ${unit}s: ${offTop.where}` : 'no data yet' },
        { label: `${def} LEAK`, big: soft?.leak != null ? fmtPct(soft.leak) : '—', pct: soft?.leak > 0 ? Math.min(100, (100 * soft.leak) / HEAT_FULL) : null, hot: Boolean(ring && soft && ring.z === soft.z), line: soft?.leak != null ? `yards a ${unit} vs normal: ${soft.where}` : 'too few plays to call' },
        { label: 'OVERLAP', big: ring ? pct(ring.share) : 'NONE', pct: ring && gf.maxOv > 0 ? Math.min(100, (100 * ring.ov) / gf.maxOv) : null, hot: Boolean(ring), line: ring ? `ringed: ${ring.where}` : 'no clear spot where both meet' },
      ]}
      maxWidth={440} foldTiles={phone} fullscreen fullLabel="The field, full screen"
      legend={<>{legend}{sample ? ` ${sample}.` : ''} Left/right: the offence’s view. Tap a zone: who gets the ball.</>}
      controls={<>
        {zoneWho}
        <StageSeg {...th} label="Which team has the ball" value={side} onChange={(v) => { setSide(v); setZonePick(null); onDefend?.(v === 'away' ? game.home : game.away) }}
          items={[['away', 'attacking', edge(game.away)], ['home', 'attacking', edge(game.home)]]} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ flex: '0 1 220px', minWidth: 190 }}>
            <StageSeg {...th} label="Passing or running" value={pass ? 'pass' : 'run'} onChange={(k) => { setPass(k === 'pass' || !rushable); setZonePick(null) }}
              items={[['pass', 'Passing'], ['run', 'Running']]} />
          </div>
          <Lens />
        </div>
      </>}
      foot={whoBlock}>
      <BroadcastField mode={pass ? 'pass' : 'rush'} maxWidth={440} hue={mode === 'defend' ? C.text2 : C.green} core={mode === 'overlap'}
        offTeam={off} ringKey={pickedKey ?? null} cells={cells} onZone={(z) => setZonePick((cur) => (cur === z ? null : z))} pickedZone={zonePick} label={`${off} offense against ${def} defense`} />
    </FlatStage>
  )
}
