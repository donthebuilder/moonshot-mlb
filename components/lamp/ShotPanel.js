'use client'
import { useState } from 'react'
import Rink from './Rink'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampShots } from '../../lib/nhl/useLamp'
import { DelayedBanner, Loading, Pills } from './ui'
import { FactLines } from '../matchup/MatchupParts'

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

export default function ShotPanel({ sel, who = 'He', height = 300 }) {
  const { data, error, loading } = useLampShots(sel)
  const [win, setWin] = useState('all')
  const m = data?.[win]
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
            <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{data.seasonLabel} REGULAR SEASON{data.stale ? ' · LAST SEASON' : ''} · {m.games} GAMES</span>
          </div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Rink map={m} slot={data.slot} gridSpec={data.gridSpec} height={height} />
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
          <FactLines theme={C} lines={depthLines(m, who, Boolean(sel?.against))} />
        </>
      ) : null}
    </div>
  )
}
