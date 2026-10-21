'use client'
// THE GAME'S FIELD, SMALL (Donovan 10-19: the Throw map was "way too big and doesn't fit the site vibe"; "model
// everything we've added onto the old style of the matchup chart ... the small one is good ... fit the names"). The
// run holes' look (components/nfl/RunLineField.js) for both halves of a game:
//   Pass  components/nfl/PassAreaField.js: each area the offense's share of its targets, the top receiver's name
//         where it counts, the defense's weak areas boxed (dashed; solid = attack: weak and 15%+ of the throws)
//   Run   RunLineField: this defense's yards a carry through each hole (the league's where it has too few carries)
// Tap an area or a hole: who gets the ball there (4, then All N). The 3D pill draws the same areas on the turf (GameArena `areas`).
// Numbers: lib/nfl/throwMap.js (pass), nfl_matchup.json field.def_rush / player_rush (run). Nothing modelled.
import { flatChip } from '../../lib/chips'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { throwMap, throwFlags } from '../../lib/nfl/throwMap'
import { LANES, LANE_WORD } from '../../lib/nfl/fieldModel'
import { usePreview, ShowMoreButton } from '../ListPreview'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { Kicker } from './Kicker'
import PassAreaField, { areaName } from './PassAreaField'
import RunLineField from './RunLineField'

const GameArena = dynamic(() => import('./GameArena'), { ssr: false })
const MIN_DEF_CAR = 8
const lastN = (n) => String(n || '').split(' ').slice(-1)[0]
const shortName = (n) => String(n || '').replace(/^(\S)\S*\s+/, '$1. ')

export default function GameFieldSmall({ matchup, players, game, onPlayerClick = null, initialOff = null, onDefend = null, title = 'THE FIELD' }) {
  const [off, setOffRaw] = useState(initialOff || game.away)
  const def = off === game.away ? game.home : game.away
  const [pass, setPass] = useState(true)
  const [three, setThree] = useState(false)
  const [pickRaw, setPick] = useState(null)
  const map = useMemo(() => throwMap({ matchup, players, off, def }), [matchup, players, off, def])
  const f = matchup?.field || {}

  // the run half: this defense's holes, the offense's backs through each
  const run = useMemo(() => {
    const dl = f.def_rush?.[def] || {}, lg = f.league_rush || {}
    const mine = (players || []).filter((p) => p.team === off)
    const cells = {}, who = {}
    for (const z of LANES) {
      const d = dl[z], l = lg[z] || {}
      const own = d && d.att >= MIN_DEF_CAR, m = own ? d : l
      const vs = own && l.ypc ? Math.round(100 * (d.ypc / l.ypc - 1)) : null
      cells[z] = { big: m.ypc != null ? m.ypc.toFixed(1) : '—', sub: own ? `${d.att}` : 'league', yards: m.ypc ?? null, thin: m.ypc == null,
        title: `${LANE_WORD[z]} · ${own ? `${def} allow ${d.ypc} yds a carry on ${d.att}${vs != null ? ` (${vs > 0 ? '+' : ''}${vs}% vs the league)` : ''}` : `league ${l.ypc ?? '—'} (${def}: too few carries)`}` }
      who[z] = mine.map((p) => ({ player: p, n: f.player_rush?.[p.player_id]?.[z]?.att || 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)
    }
    return { cells, who, vsOf: (z) => (dl[z]?.att >= MIN_DEF_CAR && lg[z]?.ypc ? Math.round(100 * (dl[z].ypc / lg[z].ypc - 1)) : null) }
  }, [f, def, off, players])

  const passCells = useMemo(() => {
    if (!map) return {}
    return Object.fromEntries(Object.entries(map.zones).map(([k, z]) => {
      const fl = throwFlags(z), top = z.who[0]
      return [k, { big: `${z.share}%`, value: z.share, name: top && (z.share >= 8 || fl.weak) ? lastN(top.player.name) : null, n: top?.tgt, weak: fl.weak, atk: fl.atk, thin: !z.att,
        title: `${areaName(k)}: ${z.share}% of ${off}'s throws${z.weak != null ? ` · ${def} ${z.weak > 0 ? '+' : ''}${z.weak}% yds a throw vs the league` : ''}` }]
    }))
  }, [map, off, def])

  const best = useMemo(() => {
    if (pass) {
      if (!map) return null
      const zs = Object.entries(map.zones)
      return (zs.find(([, z]) => throwFlags(z).atk) || [...zs].sort((a, b) => b[1].share - a[1].share)[0])[0]
    }
    return [...LANES].sort((a, b) => (run.vsOf(b) ?? -99) - (run.vsOf(a) ?? -99))[0]
  }, [pass, map, run])
  const pick = pickRaw && (pass ? map?.zones[pickRaw] : run.cells[pickRaw]) ? pickRaw : best
  const z = pass && map && pick ? map.zones[pick] : null
  const rows = pass ? (z?.who || []).map((w) => ({ player: w.player, n: w.tgt })) : (run.who[pick] || [])
  const pv = usePreview(rows)
  if (!map && !f.def_rush) return null

  const setOff = (t) => { setOffRaw(t); setPick(null); if (pv.open) pv.toggle(); onDefend?.(t === game.away ? game.home : game.away) }
  const pill = (on) => flatChip(on, C.green, C, NUM_FONT)   // flat square chips (lib/chips.js, 10-20)
  const fl = z ? throwFlags(z) : {}
  const vs = !pass && pick ? run.vsOf(pick) : null
  const tag = pass
    ? (fl.atk ? 'ATTACK HERE' : fl.weak ? `${def} WEAK HERE` : fl.tough ? `${def} TOUGH HERE` : z?.share >= 15 ? 'THEY GO HERE A LOT' : null)
    : (vs != null && vs >= 10 ? `${def} WEAK HERE` : vs != null && vs <= -15 ? `${def} TOUGH HERE` : null)
  const hot = pass ? fl.weak : vs != null && vs >= 10
  const head = pass ? (pick ? areaName(pick) : '') : String(LANE_WORD[pick] || '').replace(/^runs /, '').replace(/^./, (c) => c.toUpperCase())
  const line = pass
    ? (z ? `${z.share}% of ${off}'s throws${z.weak != null ? ` · ${def} ${z.weak > 0 ? '+' : ''}${z.weak}% yds a throw` : ''}` : '')
    : (vs != null ? `${def} allow ${f.def_rush[def][pick].ypc} yds a carry · ${vs > 0 ? '+' : ''}${vs}% vs the league` : `${def}: too few carries here`)

  return (
    <section aria-label="The field" style={{ marginBottom: 16 }}>
      <Kicker>{title}</Kicker>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        {[game.away, game.home].map((t) => (
          <button key={t} type="button" className="tap-box" aria-pressed={t === off} onClick={() => setOff(t)} style={pill(t === off)}>
            <TeamMark sport="nfl" abbr={t} variant="logo" px={14} />{t} ball
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
          {[[true, 'Pass'], [false, 'Run']].map(([v, t]) => (
            <button key={t} type="button" className="tap-box" aria-pressed={pass === v} onClick={() => { setPass(v); setPick(null); setThree(false); if (pv.open) pv.toggle() }} style={pill(pass === v)}>{t}</button>
          ))}
          {pass ? <button type="button" className="tap-box" aria-pressed={three} onClick={() => setThree((v) => !v)} style={pill(three)}>3D</button> : null}
        </span>
      </div>
      {/* DESKTOP: the field and who gets the ball sit side by side (10-20, Donovan: "a big space right next to each chart");
          on a phone they wrap, field first */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, flex: '1 1 340px', minWidth: 0, maxWidth: three ? 'none' : 520 }}>
        <div style={{ font: `800 ${TYPE.label}px/1.3 ${NUM_FONT}`, color: C.text, marginBottom: 6 }}>
          {pass ? `${off} throws vs ${def}` : `${def} allow, yards a carry`}
        </div>
        {three && pass && map
          ? <GameArena areas={passCells} title={`${off} throws vs ${def}`} />
          : pass
            ? <PassAreaField cells={passCells} pickedKey={pick} onPick={(k) => { setPick(k); if (pv.open) pv.toggle() }} label={`${off}'s share of its throws in each area, against ${def}`} />
            : <RunLineField cells={run.cells} pickedKey={pick} onPick={(k) => { setPick(k); if (pv.open) pv.toggle() }} hue={C.green} label={`${def} yards a carry allowed through each hole`} />}
        <div style={{ fontSize: TYPE.label, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
          {pass ? `% = ${off}'s share of its targets · dashed = ${def} weak (10%+ yds a throw) · solid = attack` : `Yds a carry per hole · small = carries · "league" = ${def} too few`}
        </div>
      </div>
      {pick ? (
        <div style={{ display: 'grid', gap: 6, flex: '1 1 260px', minWidth: 0, alignContent: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'baseline' }}>
            <b style={{ font: `900 15px/1.1 ${NUM_FONT}`, color: C.text }}>{head}</b>
            <span style={{ fontSize: TYPE.label, color: C.text2 }}>{line}</span>
            {tag ? <span style={{ font: `900 10.5px/1 ${NUM_FONT}`, letterSpacing: '.05em', padding: '5px 7px', borderRadius: 6, border: `1px solid ${hot ? C.green : C.border2}`, color: hot ? C.green : C.text2 }}>{tag}</span> : null}
          </div>
          {rows.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              {pv.shown.map((w, i) => (
                <div key={w.player.player_id} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: 6, alignItems: 'baseline', padding: '7px 0', borderTop: `1px solid ${C.border}` }}>
                  <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: C.text3 }}>{i + 1}</span>
                  <b style={{ fontSize: 13, lineHeight: 1.2, overflowWrap: 'anywhere', color: C.text }}>{onPlayerClick ? <Tap onClick={() => onPlayerClick(w.player, pass ? 'TD' : 'RUSH_YDS')}>{shortName(w.player.name)}</Tap> : shortName(w.player.name)}</b>
                  <span style={{ font: `900 15px/1 ${NUM_FONT}`, color: C.text }}>{w.n}<small style={{ font: `700 10px/1 ${NUM_FONT}`, color: C.text3 }}> {pass ? 'tgt' : 'car'}</small></span>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: TYPE.label, color: C.text3 }}>No {off} {pass ? 'targets' : 'carries'} charted here.</div>}
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} />
        </div>
      ) : null}
      </div>
    </section>
  )
}
