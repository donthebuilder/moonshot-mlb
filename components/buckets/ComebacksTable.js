'use client'
import { BY_CLUB, COMEBACKS_SEASON } from '../../lib/nba/comebacks'
import BucketsTable from './BucketsTable'
import { Kicker } from './ui'

// 🔁 COMEBACKS BY CLUB (2026-10-22, Donovan: "teams most likely to come back down a deficit ... third quarter deficits, fourth
// quarter ... teams with the most comebacks"). Every club's 2025-26: games it trailed by 10+ / 15+ at any point and how many it
// still won, down 10+ at the half and after Q3, and games it led by 15+ and lost (lib/nba/comebacks.js, measured from ESPN
// play-by-play). Plain counts; most comebacks first.
export default function ComebacksTable({ onOpenTeam }) {
  const frac = (w, n) => (n ? `${w}/${n}` : '—')
  const rows = BY_CLUB.map((c) => ({ ...c, _id: c.team }))
  const cols = [
    { key: 'team', label: 'Team', group: 'Team', w: 64, heat: false, sticky: true, bold: true, mono: true, teamMark: 'nba', link: (r) => (onOpenTeam ? () => onOpenTeam(r.team) : null) },
    { key: 'won10', label: 'WON', group: 'Down 10+', w: 46, mono: true, primary: true, title: 'Games it trailed by 10+ at any point and still won' },
    { key: 'down10', label: 'OF', group: 'Down 10+', w: 40, heat: false, mono: true, dim: true },
    { key: 'won15', label: 'WON', group: 'Down 15+', w: 46, mono: true },
    { key: 'down15', label: 'OF', group: 'Down 15+', w: 40, heat: false, mono: true, dim: true },
    { key: 'halfWon10', label: 'HALF', group: 'Down 10+ at', w: 54, heat: false, mono: true, fmt: (v, r) => frac(v, r.half10), title: 'Won / games it was down 10+ at the half' },
    { key: 'q3Won10', label: 'AFTER Q3', group: 'Down 10+ at', w: 68, heat: false, mono: true, fmt: (v, r) => frac(v, r.q3_10), title: 'Won / games it was down 10+ after Q3' },
    { key: 'blewLead15', label: 'BLEW 15+', group: 'Led 15+', w: 64, mono: true, title: 'Games it led by 15+ and lost' },
  ]
  return (
    <section aria-label="Comebacks by club">
      <Kicker>🔁 COMEBACKS · {COMEBACKS_SEASON}</Kicker>
      <BucketsTable rows={rows} columns={cols} initialSort={{ key: 'won10', dir: 'desc' }} heatMode="standouts" maxHeight={9999} maxRows={8}
        onRowClick={(r) => onOpenTeam?.((r?._raw ?? r).team)} caption={`Games each club trailed and still won, ${COMEBACKS_SEASON} regular season. Each row opens the club.`} />
    </section>
  )
}
