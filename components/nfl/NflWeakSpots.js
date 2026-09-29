'use client'
import { useMemo } from 'react'
import { weakSpotRoles, softLine, plainRole } from '../../lib/nfl/dvpSignal'
import { WeakSpotGrid } from '../slate/WeakSpotCard'
import { SubLabel } from '../matchup/MatchupParts'
import { C, NUM_FONT } from '../../lib/nfl/theme'

// TUDDY'S WEAK SPOTS (2026-09-28, parity plan 00Q step 2). MOONSHOT's "★ Weak
// spots" -- a starter's soft lineup slot and the hitter standing in it -- is,
// in football, a defense's soft ROLE and the player filling it this week:
//   soft role   every role x stat cell the defense gives up clearly more than
//               the league's own average for that role (lib/nfl/dvpSignal.js
//               softRoles, z >= 1 -- the Matchups page's own measure)
//   the player  whoever holds that depth role on the offense it faces
//               (matchup.roles, the bot's depth chart)
// Same card as MOONSHOT's (components/slate/WeakSpotCard.js). Nothing new is
// computed; a defense with no standout soft role has no card.

export default function NflWeakSpots({ matchup, players = [], games = [], onPlayerClick, onOpenTeam = null }) {
  const cards = useMemo(() => {
    const byTeamRole = new Map()
    for (const p of players) {
      const role = matchup?.roles?.[p.player_id]
      if (role) byTeamRole.set(`${p.team}|${role}`, [...(byTeamRole.get(`${p.team}|${role}`) || []), p])
    }
    const out = []
    for (const g of games) {
      for (const [def, off] of [[g.home, g.away], [g.away, g.home]]) {
        const soft = weakSpotRoles(matchup, def)
        const rows = []
        for (const d of soft) {
          for (const p of byTeamRole.get(`${off}|${d.role}`) || []) {
            rows.push({
              key: `${d.role}-${p.player_id}`, spot: d.role, name: p.name, side: p.position,
              flag: p.high_confidence_td_flag ? 'HIGH CONF' : null, edge: d === soft[0],
              value: Number.isFinite(p.scores?.TD) ? Math.round(p.scores.TD) : '—',
              extra: d.multiple ? `${d.multiple.toFixed(1)}x` : null,
              why: `${def} ${softLine(d)}.`,
              onClick: () => onPlayerClick?.(p, 'TD'),
              _sort: Number(p.scores?.TD) || 0,
            })
          }
        }
        if (!rows.length) continue
        const top = soft[0]
        out.push({
          key: `${def}-${g.game_id}`,
          title: `${def} defense`,
          meta: `vs ${off}`,
          stat: { text: top.multiple ? `${top.multiple.toFixed(1)}x` : `z ${top.z.toFixed(1)}`, hot: true, vs: `on ${plainRole(top.role)} ${top.label}` },
          lead: rows.length === 1 ? `One soft role this week, and ${rows[0].name} is in it.` : `${soft.length} soft role${soft.length === 1 ? '' : 's'} this week, ${rows.length} players in them.`,
          rows,
          _best: Math.max(...rows.map((r) => r._sort)),
          _z: top.z,
        })
      }
    }
    // The best player standing in a soft role first, like MOONSHOT's.
    return out.sort((a, b) => b._best - a._best || b._z - a._z)
  }, [matchup, players, games, onPlayerClick])

  if (!cards.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <SubLabel theme={C} numFont={NUM_FONT}>★ WEAK SPOTS · {cards.length} DEFENSE{cards.length === 1 ? '' : 'S'} WITH A SOFT ROLE, AND WHO IS IN IT</SubLabel>
      <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.5, color: C.text3 }}>
        A soft role is a starter&apos;s role (QB, RB1, WR1-3, TE1) this defense gives up clearly more touchdowns or red-zone chances to than the league&apos;s average (a standard deviation or more — the Matchups page&apos;s measure). The number on the right is his TD score and how many times the league average they allow.
      </p>
      <WeakSpotGrid cards={cards} accent={C.green} tagColor={C.cyan} />
    </div>
  )
}
