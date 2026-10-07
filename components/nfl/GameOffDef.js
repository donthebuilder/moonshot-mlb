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
const MODES = [['attack', 'Attack'], ['defend', 'Defend'], ['overlap', 'Overlap']]
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

  return (
    <section aria-label={`${off} offense against ${def} defense`} style={{ marginBottom: 14 }}>
      <Kicker>OFFENSE VS DEFENSE</Kicker>
      {/* the answer first: one plain sentence, then the field, then the switches */}
      <p style={{ margin: '0 0 4px', fontSize: 20, lineHeight: 1.3, fontWeight: 600, color: C.text }}>{sentence.a}{sentence.b && <b style={{ fontWeight: 900, color: C.green }}>{sentence.b}</b>}{sentence.c}</p>
      {sentence.detail && <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.45, color: C.text2 }}>{sentence.detail}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 440 }}>
          <BroadcastField mode={pass ? 'pass' : 'rush'} maxWidth={440} hue={mode === 'defend' ? C.text2 : C.green} core={mode === 'overlap'}
            offTeam={off} ringKey={pickedKey ?? null} cells={cells} label={`${off} offense against ${def} defense`} />
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <Seg label="Which team has the ball" value={side} onChange={setSide}
              items={[['away', `${game.away} attacking`, edge(game.away)], ['home', `${game.home} attacking`, edge(game.home)]]} />
            <Seg label="What to show" value={mode} onChange={setMode} items={MODES} />
            <Seg label="Passing or running" value={pass ? 'pass' : 'run'} onChange={(k) => setPass(k === 'pass' || !rushable)}
              items={[['pass', 'Passing'], ['run', 'Running']]} />
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 12, lineHeight: 1.5, color: C.text2 }}>{legend}</p>
          {sample && <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: C.text3 }}>{sample}</p>}
        </div>
      </div>
    </section>
  )
}
