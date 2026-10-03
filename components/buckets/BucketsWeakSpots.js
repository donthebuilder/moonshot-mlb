'use client'
import { useMemo } from 'react'
import { useTeamNav } from '../../lib/teamNav'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { WeakSpotGrid } from '../slate/WeakSpotCard'
import { SubLabel } from '../matchup/MatchupParts'

// BUCKETS' WEAK SPOTS -- MOONSHOT's "★ Weak spots" card (components/slate/
// WeakSpotCard.js), LAMP's twin's rule, from the fields the points board
// already carries: a defence whose points allowed a game (the board's oppPts
// leg) is in TONIGHT's top third, and the called players and best scorers
// facing it. "Tonight's third" is measured over the clubs playing and says so.
export default function BucketsWeakSpots({ rows = [], games = [], onOpenPlayer }) {
  const openTeam = useTeamNav()
  const cards = useMemo(() => {
    const allow = new Map()
    for (const r of rows) { const v = Number(r.legs?.oppPts); if (Number.isFinite(v)) allow.set(r.opp, v) }
    const vals = [...allow.values()].sort((a, b) => a - b)
    if (vals.length < 3) return []
    const cut = vals[Math.floor((vals.length - 1) * (2 / 3))]
    const out = []
    for (const g of games) {
      for (const [def, att] of [[g.home.abbrev, g.away.abbrev], [g.away.abbrev, g.home.abbrev]]) {
        const pa = allow.get(def)
        if (!(pa >= cut)) continue
        const facing = rows.filter((r) => r.gameId === g.id && r.team === att && r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        const picked = [...facing.filter((r) => r.status === 'called'), ...facing.filter((r) => r.status !== 'called')].slice(0, 4)
        if (!picked.length) continue
        out.push({
          key: `${g.id}-${def}`, title: `${def} defense`, onTitle: openTeam ? () => openTeam(def) : undefined, meta: `vs ${att}`,
          stat: { text: `${pa.toFixed(1)} PTS allowed`, hot: true, vs: "tonight's top third" },
          lead: `Gives up points: ${pa.toFixed(1)} a game, in the top third of tonight's clubs.`,
          rows: picked.map((r) => ({ key: `${r.playerId}`, spot: r.pos || '—', name: r.name, side: r.team, flag: r.status === 'called' ? 'CALLED' : null, edge: r.status === 'called',
            value: Math.round(r.score ?? 0), extra: r.legs?.ptsPg != null ? `${r.legs.ptsPg.toFixed(1)} PPG` : null,
            why: `${r.legs?.ptsPg?.toFixed(1) ?? '—'} points a game facing a defence that allows ${pa.toFixed(1)}.`, onClick: () => onOpenPlayer?.(r.playerId) })),
          _best: Math.max(...picked.map((r) => r.score ?? 0)),
        })
      }
    }
    return out.sort((a, b) => b._best - a._best)
  }, [rows, games, onOpenPlayer, openTeam])
  if (!cards.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubLabel theme={C} numFont={NUM_FONT}>★ WEAK SPOTS · {cards.length} DEFENSE{cards.length === 1 ? '' : 'S'} SOFT TONIGHT, AND WHO FACES THEM</SubLabel>
      <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>Measured over the clubs playing tonight: points allowed in the top third meets the called players and the best scorers facing it. The number on the right is his BUCKETS points score.</p>
      <WeakSpotGrid cards={cards} accent={C.purple} tagColor={C.teal} />
    </div>
  )
}
