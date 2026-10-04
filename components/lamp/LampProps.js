'use client'
import { useMemo } from 'react'
import PropCards from '../props/PropCards'
import TeamMark from '../TeamMark'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampBoard } from '../../lib/nhl/useLamp'
import { nhlMug, fmtSec } from '../../lib/nhl/format'
import { useFollowing } from '../../lib/dash/follow'

// 🏒 LAMP PROPS, MOONSHOT'S PAGE (2026-10-04, Donovan: "make sure the props
// pages look like the mlb one"). The shared grid (components/props/PropCards.js)
// with LAMP's two public markets -- GOAL and SHOTS 3+ ("LAMP Shots becomes a
// market on Props") -- read from the same /api/lamp/board rows the table below
// uses. A skater's card wears the market you browse: its own score, its own
// called status (lib/nhl/goalModel scoreNight, never re-derived here), its
// why line, and the three numbers its score is built from. LAMP has no
// per-player price on the board, so 'Priced' finds nobody rather than guess.

const MARKETS = ['GOAL', 'SOG', 'NONE']
const WORD = { GOAL: 'Goal', SOG: 'Shots 3+', NONE: 'On the board' }
const BAR = { GOAL: '1+ goal', SOG: '3+ shots', NONE: '1+ goal' }
const f2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '—')
const ord = (p) => (Number.isFinite(Number(p)) ? `${Math.round(Number(p))}th` : '—')

function lampAdapter(season) {
  const color = (k) => (k === 'SOG' ? (C.teal || C.cyan) : k === 'GOAL' ? C.ice : C.text3)
  const rowOf = (r, k) => (k === 'SOG' ? r.sog : r.goal) || r.goal || r.sog
  return {
    markets: MARKETS,
    pillLabel: (k) => WORD[k],
    groupLabel: (k) => (k === 'NONE' ? 'On the board' : `${WORD[k]} · ${BAR[k]}`),
    color,
    rolesOf: (r) => MARKETS.filter((k) => k !== 'NONE' && rowOf(r, k)?.status === 'called' && (k === 'SOG' ? r.sog : r.goal)),
    primaryOf: (r) => (r.goal?.status === 'called' ? 'GOAL' : r.sog?.status === 'called' ? 'SOG' : null),
    score: (r, k) => { const x = rowOf(r, k); return Number.isFinite(x?.score) ? x.score : null },
    idOf: (r) => String(r.id),
    keyOf: (r) => `${r.id}-${r.gameId}`,
    card: (r, k) => {
      const x = rowOf(r, k) || {}
      const legs = x.legs || {}
      const pct = x.pct || {}
      const tiles = k === 'SOG'
        ? [{ k: 'SHOTS / GP', v: f2(legs.shotsPg) }, { k: 'ICE TIME', v: Number.isFinite(legs.toi) ? fmtSec(legs.toi) : '—' }, { k: 'OPP SA %ILE', v: ord(pct.oppSaPg) }]
        : [{ k: 'SHOTS / GP', v: f2(legs.shotsPg) }, { k: 'GOALS / GP', v: f2(legs.goalsPg) }, { k: 'ICE TIME', v: Number.isFinite(legs.toi) ? fmtSec(legs.toi) : '—' }]
      const chips = []
      // the result, once graded: goals for GOAL, shots (value) for SHOTS 3+
      if (x.hit === true || x.hit === false) chips.push({ t: k === 'SOG' ? `${x.hit ? '✅' : '❌'} ${x.value ?? '—'} shots` : `${x.hit ? '✅' : '❌'} ${x.goals ?? 0} goal${Number(x.goals) === 1 ? '' : 's'}`, warn: !x.hit })
      else if (x.preview) chips.push({ t: '⏳ preview — not locked yet', warn: true })
      if (x.context?.b2b) chips.push({ t: 'back-to-back', warn: false })
      if (Number(x.ppg) > 0 && chips.length < 2) chips.push({ t: `${x.ppg} PP goal${Number(x.ppg) === 1 ? '' : 's'}`, warn: false })
      return {
        photo: nhlMug(season, r.team, r.id),
        dialTitle: `${WORD[k]} score — LAMP's number for this market, 0-100 within tonight's pool`,
        market: BAR[k],
        title: r.name,
        badge: k === 'NONE' ? (x.status === 'board' ? 'ON BOARD' : 'NOT CALLED') : (x.status === 'called' ? 'CALLED' : 'ON BOARD'),
        badgeQuiet: x.status !== 'called',
        meta: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
          <TeamMark sport="nhl" abbr={r.team} variant="logo" px={16} />
          <span>{r.home ? 'vs' : '@'}</span>
          <TeamMark sport="nhl" abbr={r.opp} variant="logo" px={16} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {r.pos}</span>
        </span>,
        metaRight: null,
        line: x.why || null,
        facts: null,
        chips: chips.slice(0, 2),
        tiles,
      }
    },
    priced: () => false,
    priceNum: () => null,
    startsAt: (r) => Date.parse(r.startUtc || ''),
    gameOf: (r) => (r?.gameId ? { key: String(r.gameId), label: r.home ? `${r.opp}@${r.team}` : `${r.team}@${r.opp}` } : null),
    precisionKey: 'lamp_precision_v1',
    sortTimeLabel: 'Puck drop',
    picksTitle: 'every skater called tonight, on goals or shots',
    unit: 'call',
    copy: { priced: 'LAMP prices live on the Odds page; the board carries no per-player price, so this finds nobody.' },
  }
}

export default function LampProps({ date = null, onOpenPlayer }) {
  const goal = useLampBoard(date, 'GOAL')
  const sog = useLampBoard(date, 'SOG')
  const following = useFollowing('nhl')
  // `season` on the board payload is an object ({ id, label, ... }); the mug path wants the id
  const season = goal.data?.season?.id || sog.data?.season?.id || null
  const rows = useMemo(() => {
    const m = new Map()
    const add = (data, key) => {
      for (const g of data?.games || []) for (const x of g.rows || []) {
        const id = `${x.playerId}|${g.game?.id}`
        const cur = m.get(id) || { id: x.playerId, gameId: g.game?.id, name: x.name, team: x.team, opp: x.opp, home: x.home, pos: x.pos, startUtc: g.game?.startUtc }
        cur[key] = x
        m.set(id, cur)
      }
    }
    add(goal.data, 'goal'); add(sog.data, 'sog')
    return [...m.values()]
  }, [goal.data, sog.data])
  const a = useMemo(() => lampAdapter(season), [season])
  if (!goal.data && !sog.data) return null
  return (
    <PropCards a={a} rows={rows} onOpen={(r) => onOpenPlayer?.(r.id)}
      onWatch={(r) => following.toggle({ id: r.id, name: r.name, team: r.team, position: r.pos })}
      watchIds={following.ids} theme={C} numFont={NUM_FONT} accent={C.ice} accentWash={`color-mix(in srgb, ${C.ice} 14%, transparent)`} />
  )
}
