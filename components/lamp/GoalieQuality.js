'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { useLampGoalieQuality } from '../../lib/nhl/useLamp'
import { goalieLine } from '../../lib/nhl/goalieQuality'
import LampTable from './LampTable'
import { Kicker } from './ui'

// 🥅 GOALIE QUALITY (2026-10-08): each goalie's shots faced, goals against, the expected goals on those same shots,
// goals saved above expected (shrunk) and the factor the team model uses for the goalie in the other net. From each
// club's own last 82 regular-season games before the game's date (lib/nhl/goalieQuality.js); under the minimum
// sample the derived columns are a dash. A measured count of goals, never a probability.
const XG_WORD = 'expected goals' // allow-probability: a measured count of goals on the shots faced, not a probability
const XGA = 'xGA'

const sv = (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0/, '') : '—')
const COLS = (onOpenPlayer) => [
  { key: 'name', label: 'Goalie', group: 'Goalie', heat: false, sticky: true, w: 128, link: (x) => (x.pid && onOpenPlayer ? () => onOpenPlayer(x.pid) : null) },
  { key: 'team', label: 'Team', group: 'Goalie', heat: false, w: 44, teamMark: 'nhl' },
  { key: 'factor', label: 'QUALITY', group: 'Quality', w: 64, dp: 2, invert: true, primary: true, fmt: (v) => (Number.isFinite(v) ? v.toFixed(2) : '—'), explain: `His goals allowed as a share of an average goalie's, pulled toward 1.00 when the sample is small. Under 1.00 is better than average, over 1.00 is worse. It is the factor LAMP's game projection applies to the shooters in front of him. A dash means too few shots.` },
  { key: 'saved', label: 'SAVED', group: 'Quality', w: 56, dp: 1, fmt: (v) => (Number.isFinite(v) ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) : '—'), explain: `Goals saved above expected: ${XG_WORD} minus goals allowed, pulled toward zero when the sample is small. Plus means he stopped more than an average goalie would have. A dash means too few shots.` },
  { key: 'xga', label: XGA, group: 'Quality', w: 52, dp: 1, invert: true, explain: `The ${XG_WORD} on the shots he faced: what an average goalie would have allowed from where those shots came from (the LAMP shot model). A dash means he has faced fewer than 300 shots, too few to trust.` },
  { key: 'ga', label: 'GA', group: 'Results', w: 40, dp: 0, invert: true, explain: 'Goals allowed on those shots.' },
  { key: 'svPct', label: 'SV%', group: 'Results', w: 54, fmt: sv, explain: 'Saves divided by shots faced, in those same games.' },
  { key: 'gp', label: 'GP', group: 'Workload', w: 40, dp: 0, explain: 'Games he played in this club\'s last 82 regular-season games before this one.' },
  { key: 'sa', label: 'SA', group: 'Workload', w: 48, dp: 0, explain: 'Shots on goal he faced in those games (empty-net goals left out).' },
]

/**
 * @param game  { home, away, date, state } abbrevs + the game's own date
 * @param box   the game's box goalies (reduceBoxPlayers) when the game has started, else null
 * @param lead  the game's own goalie box table (when it has started), drawn first under the same GOALIES heading
 */
export default function GoalieQuality({ game, box = null, onOpenPlayer = null, lead = null }) {
  const q = useLampGoalieQuality(game)
  const rows = useMemo(() => {
    const clubs = q.data?.available ? q.data.clubs : null
    if (!clubs) return []
    const all = Object.values(clubs).flat()
    const pick = box ? [...box.away.goalies, ...box.home.goalies].map((b) => {
      const hit = all.find((x) => x.id === String(b.id))
      // a goalie with no history before this game (a call-up, a first game): his line is a dash, never a guess
      return hit ? { ...hit, name: b.name || hit.name, team: b.team || hit.team } : { ...goalieLine({ id: String(b.id), gp: 0, sa: 0, ga: 0, xga: 0, recentSa: 0 }), name: b.name, team: b.team }
    }) : all
    return pick.map((x) => ({ ...x, pid: x.id, _key: `gq-${x.team}-${x.id}`, name: x.name || `Goalie ${x.id}` }))
  }, [q.data, box])
  if (!rows.length && !lead) return null   // pregame with no history table yet: no heading over nothing
  const pre = game.state === 'pre'
  return (
    <section aria-label="Goalies">
      <Kicker>GOALIES</Kicker>
      {lead}
      {rows.length > 0 && (
        <div style={{ marginTop: lead ? 10 : 0 }}>
          <LampTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={99} caption={`Goalie quality: shots faced, goals allowed against the ${XG_WORD} on them, and the quality factor`}
            rows={rows} columns={COLS(onOpenPlayer)} />
          <p style={{ margin: '6px 0 0', color: C.text3, font: '700 11px/1.45 system-ui, sans-serif' }}>
            {pre ? `Tonight's starter is not posted for ${game.away} or ${game.home}; these are the goalies each club has used lately. ` : ''}
            Each club's last 82 regular-season games before this one. QUALITY under 1.00 is better than an average goalie; a dash means under 300 shots faced.
          </p>
        </div>
      )}
    </section>
  )
}
