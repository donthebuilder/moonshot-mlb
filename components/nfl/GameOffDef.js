'use client'
import { useMemo, useState } from 'react'
import TeamMark from '../TeamMark'
import BroadcastField from './BroadcastField'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
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

function Seg({ items, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
      {items.map(([k, text, extra]) => {
        const on = value === k
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={on}
            style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '0 10px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: `1px solid ${on ? C.green : C.border}`, background: on ? `${C.green}22` : 'rgba(255,255,255,.035)',
              color: on ? C.green : C.text2, fontSize: TYPE.name, fontWeight: 800, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
            {extra}{text}
          </button>
        )
      })}
    </div>
  )
}

export const Kicker = ({ children, style }) => (
  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT, margin: '0 0 8px', ...style }}>{children}</div>
)

export default function GameOffDef({ matchup, players, game }) {
  const [mode, setMode] = useState('overlap')
  const [pass, setPass] = useState(true)
  const [side, setSide] = useState('away')
  const off = side === 'away' ? game.away : game.home
  const def = side === 'away' ? game.home : game.away
  const field = matchup?.field
  const gf = useMemo(() => gameField({ field, players, off, def, pass }), [field, players, off, def, pass])
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
  const Tile = ({ label, big, line, pct, hot }) => (
    <div style={{ flex: '1 1 0', minWidth: 0, padding: '2px 10px', borderLeft: `2px solid ${C.text}1f` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, fontFamily: NUM_FONT, color: hot ? C.green : C.text, transform: 'skewX(-8deg)', transformOrigin: 'left center' }}>{big}</div>
      <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: `${C.text}1a`, margin: '4px 0 3px' }}>{pct != null && <div style={{ width: `${Math.max(4, Math.min(100, pct))}%`, height: 4, borderRadius: 2, background: hot ? C.green : `${C.text}80` }} />}</div>
      <div style={{ fontSize: 11, lineHeight: 1.3, color: C.text2, minHeight: 28 }}>{line}</div>
    </div>
  )
  const Lens = () => (
    <div role="group" aria-label="What to show" style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, marginRight: 4 }}>LENS</span>
      {MODES.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)}
          style={{ minHeight: 44, minWidth: 44, padding: '0 12px', border: 0, borderBottom: `3px solid ${mode === k ? C.green : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontFamily: NUM_FONT, fontSize: TYPE.name, fontWeight: 800, color: mode === k ? C.green : C.text2 }}>{text}</button>
      ))}
    </div>
  )
  const frame = `${C.green}88`
  return (
    <section aria-label={`${off} offense against ${def} defense`} style={{ marginBottom: 14, position: 'relative', overflow: 'hidden', border: `2px solid ${frame}`, borderRadius: 14, background: `radial-gradient(circle at 10% 0%, ${C.green}22 0%, transparent 55%), ${C.bg2}` }}>
      <div style={{ position: 'absolute', right: -18, top: 34, opacity: 0.1, pointerEvents: 'none' }}>{edge2(off, 120)}</div>
      <div style={{ position: 'relative', padding: '10px 12px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.28em', color: C.green, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>THE FIELD</span>
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: `${C.green}55` }} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: C.text2, fontFamily: NUM_FONT }}>{pass ? 'PASSING' : 'RUNNING'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 2px', flexWrap: 'wrap' }}>
          {edge(off)}
          <span style={{ fontSize: 22, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.01em', color: C.text, transform: 'skewX(-8deg)' }}>{off} attacking {def}</span>
        </div>
        <p style={{ margin: '2px 0 8px', fontSize: 14, lineHeight: 1.4, color: C.text2 }}>{sentence.a}{sentence.b && <b style={{ fontWeight: 900, color: C.green }}>{sentence.b}</b>}{sentence.c}{sentence.detail ? ` ${sentence.detail}` : ''}</p>
        <div style={{ display: 'flex', margin: '0 -2px 8px' }}>
          <Tile label={`${off} BUSIEST`} big={offTop?.share != null ? pct(offTop.share) : '—'} pct={offTop?.share != null && gf.maxShare > 0 ? (100 * offTop.share) / gf.maxShare : null} hot={Boolean(ring && offTop && ring.z === offTop.z)} line={offTop?.share != null ? `of ${unit}s: ${offTop.where}` : 'no data yet'} />
          <Tile label={`${def} LEAK`} big={soft?.leak != null ? fmtPct(soft.leak) : '—'} pct={soft?.leak > 0 ? Math.min(100, (100 * soft.leak) / HEAT_FULL) : null} hot={Boolean(ring && soft && ring.z === soft.z)} line={soft?.leak != null ? `yards a ${unit} vs normal: ${soft.where}` : `too few plays to call`} />
          <Tile label="OVERLAP" big={ring ? pct(ring.share) : 'NONE'} pct={ring && gf.maxOv > 0 ? Math.min(100, (100 * ring.ov) / gf.maxOv) : null} hot={Boolean(ring)} line={ring ? `ringed: ${ring.where}` : 'no clear spot where both meet'} />
        </div>
        <div style={{ maxWidth: 440, margin: '0 auto' }}>
          <BroadcastField mode={pass ? 'pass' : 'rush'} maxWidth={440} hue={mode === 'defend' ? C.text2 : C.green} core={mode === 'overlap'}
            offTeam={off} ringKey={pickedKey ?? null} cells={cells} label={`${off} offense against ${def} defense`} />
        </div>
        <p style={{ margin: '6px 0 6px', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>{legend}{sample ? ` ${sample}.` : ''}</p>
        <div style={{ display: 'grid', gap: 6 }}>
          <Seg label="Which team has the ball" value={side} onChange={setSide}
            items={[['away', `${game.away} attacking`, edge(game.away)], ['home', `${game.home} attacking`, edge(game.home)]]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ flex: '0 1 220px', minWidth: 190 }}>
              <Seg label="Passing or running" value={pass ? 'pass' : 'run'} onChange={(k) => setPass(k === 'pass' || !rushable)}
                items={[['pass', 'Passing'], ['run', 'Running']]} />
            </div>
            <Lens />
          </div>
        </div>
      </div>
    </section>
  )
}
