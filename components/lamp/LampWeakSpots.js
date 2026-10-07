'use client'
import { STATUS_WORD } from '../../lib/callStatus'
import { useTeamNav } from '../../lib/teamNav'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { WeakSpotGrid } from '../slate/WeakSpotCard'
import { SubLabel } from '../matchup/MatchupParts'
import { spotOf, pct1 } from './tabs/Board'

// LAMP'S WEAK SPOTS (2026-09-28, parity plan 00Q step 2). MOONSHOT's "★ Weak
// spots" (a starter's soft slot and the hitter in it), in hockey, from the
// fields the night's board already carries -- nothing new fetched:
//   soft penalty kill  a club whose PK% is in TONIGHT's weakest third, and the
//                      skaters facing it who have power-play goals
//   soft defense       a club whose goals allowed a game is in TONIGHT's top
//                      third, and the called skaters facing it
// "Tonight's third" is measured over the clubs playing tonight and says so --
// the board carries no league-wide rank to lean on. Same card as MOONSHOT's
// (components/slate/WeakSpotCard.js).
const third = (vals, hi) => {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b)
  if (v.length < 3) return null
  return hi ? v[Math.floor((v.length - 1) * (2 / 3))] : v[Math.floor((v.length - 1) / 3)]
}

/** The cut-offs over tonight's clubs: { pkCut, gaCut }. */
export function weakCuts(games) {
  const pks = []; const gas = new Map()
  for (const g of games) {
    for (const t of [g.game.away.abbrev, g.game.home.abbrev]) pks.push(Number(spotOf(g, t, true)?.pkPct))
    for (const r of g.rows) { const ga = Number(r.context?.oppGaPg); if (Number.isFinite(ga)) gas.set(r.opp || `${g.game.id}|${r.team}`, ga) }
  }
  return { pkCut: third(pks, false), gaCut: third([...gas.values()], true) }
}

export default function LampWeakSpots({ items = [], games = [], onOpenPlayer }) {
  // the card title opens the club (0g A3): LAMP's team door
  const openTeam = useTeamNav()
  const cards = useMemo(() => {
    const { pkCut, gaCut } = weakCuts(games)
    const out = []
    for (const g of games) {
      for (const [def, att] of [[g.game.home.abbrev, g.game.away.abbrev], [g.game.away.abbrev, g.game.home.abbrev]]) {
        const pk = Number(spotOf(g, def, true)?.pkPct)
        const facing = items.filter(({ r, g: gg }) => gg.game.id === g.game.id && r.team === att)
        const ga = Number(facing[0]?.r.context?.oppGaPg)
        const softPk = pkCut != null && Number.isFinite(pk) && pk <= pkCut
        const softD = gaCut != null && Number.isFinite(ga) && ga >= gaCut
        if (!softPk && !softD) continue
        const pp = softPk ? facing.filter(({ r }) => Number(r.ppg) > 0).sort((a, b) => Number(b.r.ppg) - Number(a.r.ppg) || (b.r.score ?? 0) - (a.r.score ?? 0)).slice(0, 5) : []
        const called = softD ? facing.filter(({ r }) => r.status === 'called' && !pp.some((x) => x.r.playerId === r.playerId)) : []
        const rows = [
          ...pp.map(({ r }) => ({
            key: `pp-${r.playerId}`, spot: 'PP', name: r.name, side: r.pos, flag: r.status === 'called' ? STATUS_WORD.called : null, edge: true,
            value: Math.round(r.score ?? 0), extra: 'score',
            why: `${r.ppg} power-play goal${Number(r.ppg) === 1 ? '' : 's'} this season`,
            onClick: () => onOpenPlayer?.(r.playerId),
          })),
          ...called.map(({ r }) => ({
            key: `d-${r.playerId}`, spot: `#${r.rank}`, name: r.name, side: r.pos, flag: STATUS_WORD.called, edge: false,
            value: Math.round(r.score ?? 0), extra: 'score',
            why: `${def} allow ${ga.toFixed(2)} goals a game`,
            onClick: () => onOpenPlayer?.(r.playerId),
          })),
        ]
        if (!rows.length) continue
        out.push({
          key: `${g.game.id}-${def}`,
          title: `${def} defense`,
          onTitle: openTeam ? () => openTeam(def) : undefined,
          meta: `vs ${att}`,
          stat: softPk ? { label: 'Penalty kill', value: `${pct1(pk)}%`, hot: true } : { label: 'Goals allowed a game', value: ga.toFixed(2), hot: true },
          lead: softPk && softD ? `One of the weakest penalty kills tonight, and they give up a lot of goals.` : softPk ? `One of the weakest penalty kills tonight. ${pp.length} ${att} skater${pp.length === 1 ? '' : 's'} with power-play goals face${pp.length === 1 ? 's' : ''} it.` : 'They give up more goals than most teams playing tonight.',
          rows,
          _best: Math.max(...rows.map((x) => Number(x.value) || 0)),
        })
      }
    }
    return out.sort((a, b) => b._best - a._best)
  }, [items, games, onOpenPlayer, openTeam])

  if (!cards.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubLabel theme={C} numFont={NUM_FONT}>★ WEAK SPOTS · {cards.length} SOFT DEFENSE{cards.length === 1 ? '' : 'S'} TONIGHT</SubLabel>
      <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.5, color: C.text3 }}>
        Teams with a weak penalty kill or a leaky defense tonight, and the skaters who face them. The number on the right of each skater is his LAMP score.
      </p>
      <WeakSpotGrid cards={cards} accent={C.ice} tagColor={C.teal || C.ice} large />
    </div>
  )
}
