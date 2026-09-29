'use client'
import { useMemo, useState } from 'react'
import Rink from './Rink'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampShots } from '../../lib/nhl/useLamp'
import { DelayedBanner, Loading, Pills } from './ui'
import { FactLines, BarList } from '../matchup/MatchupParts'
import { ChipGroup } from '../matchup/SprayParts'

// 🏒 WHERE HE SHOOTS FROM (lamp research step 3). The rink plus the numbers
// it is drawn from, for one player or one club: season or last 10 games,
// attempts / on net / goals, and the slot share with the slot defined in
// words beside it. A player with no shots on file gets a sentence, not an
// empty rink. Data: /api/lamp/shots (aggregates, cached a day).
const WINDOWS = [{ key: 'all', text: 'SEASON' }, { key: 'last10', text: 'LAST 10' }]
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const share = (n, d) => `${Math.round((100 * n) / d)}%`

// SHOT DEPTH (2026-09-28): what the archive already knows past the rink --
// the shot types (unblocked attempts; a block has no type), how far out the
// shots on net and the goals come from, and, once the archive keeps it, why
// the misses missed. MOONSHOT's plain lines, LAMP's colours.
function depthLines(m, who, against = false) {
  const types = Object.entries(m.types || {}).sort((a, b) => b[1].att - a[1].att)
  const nTyped = types.reduce((a, [, t]) => a + t.att, 0)
  const top = types.slice(0, 3)
  const his = against ? "opponents'" : who === 'He' ? 'his' : 'their'
  return [
    ['Shot types', nTyped >= 10 ? <>{top.map(([k, t], i) => <span key={k}>{i ? ' · ' : ''}{k} {share(t.att, nTyped)}{t.g ? ` (${t.g} ${t.g === 1 ? 'goal' : 'goals'})` : ''}</span>)}<span style={{ color: C.text3 }}> of {nTyped} unblocked</span>.</> : null],
    ['Distance', m.distSog != null ? <>{his} shots on net come from {m.distSog} ft on average{m.distGoal != null ? <>, {his} goals from {m.distGoal} ft</> : null}.</> : null],
    ['Misses', m.missWhy && m.missWhy.n >= 10 ? <>wide {share(m.missWhy.wide, m.missWhy.n)} · high {share(m.missWhy.high, m.missWhy.n)} · off the post or bar {share(m.missWhy.iron, m.missWhy.n)}<span style={{ color: C.text3 }}> of {m.missWhy.n} misses</span>.</> : null],
  ]
}

// THE SPRAY-CHART PASS (2026-09-29, Donovan: "i love the where he shoots from
// -- make it better just like the spray chart"). MOONSHOT's spray chart
// pieces on the rink: its filter chips (components/matchup/SprayParts.js --
// result, shot type, strength, period, each chip counting what is in the
// window), zone bars (MatchupParts BarList) with every zone defined in words,
// and a tap-a-shot card. Filters cut the drawn shots (the most recent 200);
// the season numbers in the list are always the whole window.
const RES = [['ALL', 'All'], ['goal', 'Goal'], ['sog', 'On net'], ['miss', 'Miss'], ['block', 'Blocked']]
const STR = [['ALL', 'All'], ['ev', 'Even'], ['pp', 'PP'], ['sh', 'SH']]
const PER = [['ALL', 'All'], ['1', '1st'], ['2', '2nd'], ['3', '3rd'], ['OT', 'OT']]
const perOf = (sh) => (sh[6] && sh[6] !== 'REG' ? 'OT' : sh[5] != null ? String(sh[5]) : null)
const NET_X = 89
const distOf = (sh) => Math.round(Math.hypot(NET_X - sh[0], sh[1]))
// Zones, in the league's feet after every shot is turned to attack the right-hand net.
const ZONES = [
  { key: 'slot', label: 'Slot', def: 'between the faceoff dots and the goal line', test: ([x, y]) => x >= 69 && x <= 89 && Math.abs(y) <= 22 },
  { key: 'high', label: 'High slot', def: 'the middle, from the top of the circles to the dots', test: ([x, y]) => x >= 54 && x < 69 && Math.abs(y) <= 22 },
  { key: 'circles', label: 'Circles', def: 'outside the dots, either side', test: ([x, y]) => x >= 54 && x <= 89 && Math.abs(y) > 22 },
  { key: 'point', label: 'Point', def: 'the blue line to the top of the circles', test: ([x]) => x < 54 },
  { key: 'below', label: 'Below', def: 'behind the goal line', test: ([x]) => x > 89 },
]
const clock = (t) => (t == null ? '' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)
const RES_WORD = { goal: 'Goal', sog: 'On net, saved', miss: 'Missed the net', block: 'Blocked' }

export default function ShotPanel({ sel, who = 'He', height = 300 }) {
  const { data, error, loading } = useLampShots(sel)
  const [win, setWin] = useState('all')
  const [res, setRes] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [str, setStr] = useState('ALL')
  const [per, setPer] = useState('ALL')
  const [picked, setPicked] = useState(null)
  const m = data?.[win]
  const recent = m?.recent || []
  const pass = (sh, skip) => (skip === 'res' || res === 'ALL' || sh[2] === res)
    && (skip === 'type' || type === 'ALL' || sh[3] === type)
    && (skip === 'str' || str === 'ALL' || sh[4] === str)
    && (skip === 'per' || per === 'ALL' || perOf(sh) === per)
  const shots = useMemo(() => recent.filter((sh) => pass(sh)), [recent, res, type, str, per]) // eslint-disable-line react-hooks/exhaustive-deps
  // Each chip counts the shots the OTHER filters leave, so a count never promises more than a tap gives.
  const countIn = (skip, test) => recent.filter((sh) => pass(sh, skip) && test(sh)).length
  const types = useMemo(() => {
    const t = {}; for (const sh of recent) if (sh[3]) t[sh[3]] = (t[sh[3]] || 0) + 1
    return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k)
  }, [recent])
  const zoneItems = ZONES.map((z) => {
    const inZ = shots.filter(z.test)
    const g = inZ.filter((sh) => sh[2] === 'goal').length
    return { key: z.key, label: z.label, pct: shots.length ? (100 * inZ.length) / shots.length : 0,
      text: `${inZ.length}${g ? ` · ${g}G` : ''}`, def: z.def }
  })
  const filtered = res !== 'ALL' || type !== 'ALL' || str !== 'ALL' || per !== 'ALL'
  const chipProps = { theme: C, numFont: NUM_FONT }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <DelayedBanner error={error} what="the shot map" />
      {loading && !data ? <Loading what="the shot map" /> : null}
      {data && !data.season ? (
        <p style={{ margin: 0, color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
          No regular-season shots on file for {sel?.team || sel?.against ? 'this club' : 'him'} yet. The archive holds 2025-26 and fills in after every graded game.
        </p>
      ) : null}
      {data?.season && m ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Pills ariaLabel="Shot window" value={win} onChange={setWin} options={WINDOWS} />
            <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{data.seasonLabel} REGULAR SEASON{data.stale ? ' · LAST SEASON' : ''} · {m.games} GAMES{data.stale && data.currentGames > 0 ? ` · ${data.currentLabel}: ${data.currentGames} OF ${data.minGames} IN` : ''}</span>
          </div>
          {recent.length > 0 && recent[0].length > 3 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <ChipGroup {...chipProps} first label="Result" value={res} onChange={(k) => { setRes(k); setPicked(null) }} color={C.lamp}
                options={RES.map(([k, label]) => ({ k, label, n: countIn('res', (sh) => sh[2] === k), title: k === 'ALL' ? 'Every drawn attempt' : `Only ${label.toLowerCase()} attempts` }))} />
              <ChipGroup {...chipProps} label="Type" value={type} onChange={(k) => { setType(k); setPicked(null) }} color={C.ice}
                options={[['ALL', 'All'], ...types.map((t) => [t, t])].map(([k, label]) => ({ k, label, n: countIn('type', (sh) => sh[3] === k), title: k === 'ALL' ? 'Every shot type' : `Only ${label} shots (a block has no type)` }))} />
              <ChipGroup {...chipProps} label="Strength" value={str} onChange={(k) => { setStr(k); setPicked(null) }} color={C.teal || C.ice}
                options={STR.map(([k, label]) => ({ k, label, n: countIn('str', (sh) => sh[4] === k), title: k === 'ALL' ? 'Every strength' : `Only ${label === 'PP' ? 'power-play' : label === 'SH' ? 'shorthanded' : 'even-strength'} attempts` }))} />
              <ChipGroup {...chipProps} label="Period" value={per} onChange={(k) => { setPer(k); setPicked(null) }} color={C.cream || C.ice}
                options={PER.map(([k, label]) => ({ k, label, n: countIn('per', (sh) => perOf(sh) === k), title: k === 'ALL' ? 'Every period' : `Only the ${label} ${k === 'OT' ? '(overtime)' : 'period'}` }))} />
              {filtered && <button type="button" onClick={() => { setRes('ALL'); setType('ALL'); setStr('ALL'); setPer('ALL'); setPicked(null) }}
                style={{ background: 'transparent', border: 'none', color: C.text3, font: `700 10px/1 ${NUM_FONT}`, cursor: 'pointer', textDecoration: 'underline dotted', minHeight: 0 }}>clear</button>}
            </div>
          )}
          {filtered && !shots.length && <p style={{ margin: 0, color: C.text3, fontSize: 12 }}>None of {who === 'He' ? 'his' : 'their'} last {recent.length} attempts match every filter at once.</p>}
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <Rink map={m} slot={data.slot} gridSpec={data.gridSpec} height={height} shots={shots}
              onPick={(sh) => setPicked(sh === picked ? null : sh)} picked={picked}
              onPickCell={(cell) => setPicked({ cell })} />
            {/* The card has a fixed place under the rink, so tapping a dot
                never moves the page (SprayField's readout rule). */}
            <div aria-live="polite" style={{ minHeight: 40, maxWidth: 340, padding: '7px 10px', borderRadius: 9, border: `1px solid ${C.border}`, background: C.bg2, font: `700 10.5px/1.5 ${NUM_FONT}`, color: C.text2 }}>
              {!picked ? <span style={{ color: C.text3 }}>Tap a shot for its detail{m?.grid ? ' · on HEAT, tap a zone' : ''}.</span>
                : picked.cell ? <>{picked.cell.att} attempts in that zone · {picked.cell.sog} on net · <b style={{ color: C.lamp }}>{picked.cell.g} goal{picked.cell.g === 1 ? '' : 's'}</b></>
                  : <>
                    <b style={{ color: picked[2] === 'goal' ? C.lamp : C.text }}>{RES_WORD[picked[2]] || picked[2]}</b>
                    {picked[3] ? ` · ${picked[3]}` : ''} · {distOf(picked)} ft
                    {picked[4] ? ` · ${picked[4].toUpperCase()}` : ''}
                    {picked[5] != null ? ` · ${perOf(picked) === 'OT' ? 'OT' : `P${picked[5]}`} ${clock(picked[7])}` : ''}
                    {picked[8] ? ` · ${picked[8]}` : ''}
                    {picked[9] ? ` · ${picked[9].replace(/-/g, ' ')}` : ''}
                  </>}
            </div>
            </div>
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', gap: '6px 14px', alignContent: 'start', fontFamily: NUM_FONT }}>
              {[
                ['SLOT SHARE', pct(m.slotShare), C.ice],
                ['ATTEMPTS', m.attempts, C.text],
                ['ON NET', m.sog, C.text],
                ['GOALS', m.goals, C.lamp],
                ['MISSED', m.misses, C.text2],
                ['BLOCKED', m.blocked, C.text2],
                ['ON THE PP', m.byStrength?.pp || 0, C.text2],
              ].map(([k, v, tone]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt style={{ color: C.text3, fontSize: 9, fontWeight: 800, letterSpacing: '.1em', alignSelf: 'center' }}>{k}</dt>
                  <dd style={{ margin: 0, color: tone, fontSize: 15, fontWeight: 900, textAlign: 'right' }}>{v}</dd>
                </div>
              ))}
              <dd style={{ gridColumn: '1 / -1', margin: '4px 0 0', color: C.text3, fontSize: 10, lineHeight: 1.45, maxWidth: 220, fontFamily: 'inherit' }}>
                {sel?.against
                  ? <>Opponents&apos; shots on net from the slot — between the faceoff dots and the goal line — as a share of every shot on net against them.</>
                  : <>{who === 'He' ? 'His' : 'Their'} shots on net from the slot — between the faceoff dots and the goal line — as a share of all {who === 'He' ? 'his' : 'their'} shots on net.</>}
              </dd>
            </dl>
          </div>
          {shots.length > 0 && recent[0]?.length > 3 && (
            <div>
              <BarList theme={C} numFont={NUM_FONT} accent={C.ice} labelWidth={74}
                label={`WHERE ${filtered ? 'THESE' : `THE LAST ${recent.length}`} COME FROM`} items={zoneItems} />
              <div style={{ marginTop: -8, fontSize: 10.5, color: C.text3, lineHeight: 1.5 }}>
                {ZONES.map((z, i) => <span key={z.key}>{i ? ' · ' : ''}<b style={{ color: C.text2 }}>{z.label}</b> {z.def}</span>)}.
              </div>
            </div>
          )}
          <FactLines theme={C} lines={depthLines(m, who, Boolean(sel?.against))} />
        </>
      ) : null}
    </div>
  )
}
