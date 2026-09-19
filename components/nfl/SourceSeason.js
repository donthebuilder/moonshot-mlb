'use client'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'

// WHICH YEAR IS THIS NUMBER FROM? (2026-09-18)
//
// nfl_bot.py has published both answers in nfl_matchup.json since the charting
// clock was built -- `season` for the tables built off play-by-play (DvP,
// field, splits) and `chart_season` for the four built off participation
// (coverage_team, coverage_player, disruption_team, route_value). Grepped the
// site on 2026-09-18: NOTHING read chart_season. Every coverage panel, every
// route table and every DvP strip printed last season's numbers with no year
// on them, which is #25's exact complaint -- not an error state, but the same
// failure, a number whose origin the reader cannot see.
//
// TWO DIFFERENT CLOCKS, and the difference matters to anyone reading them:
//
//   STATS (DvP, field, splits)  play-by-play, published nightly all season.
//       nfl_features.stats_season_for() serves LAST season until three weeks
//       of this one are played, because a week-1 defence-vs-position table
//       does not exist yet. It flips on its own around week 4. Waiting.
//
//   CHARTING (coverage, routes, pressure)  participation, published ONCE A
//       YEAR, after the postseason -- the 2025 file landed 2026-02-10. There
//       is no 2026 file and there will not be one until roughly Feb 2027, so
//       these tables are last season's for the WHOLE season, not just the
//       early weeks. Nothing to toggle to; see nfl_charting.py.
//
// So the badge says the year, and its tooltip says which clock it is on and
// when it changes. A reader in week 1 still sees the numbers -- they are real
// and they are the best available -- they just also see whose season they are.
export default function SourceSeason({ matchup, kind = 'charting', slateSeason = null, style }) {
  const year = Number(kind === 'charting' ? matchup?.chart_season : matchup?.season) || null
  if (!year) return null
  const slate = Number(slateSeason) || null
  // Same year as the slate = nothing worth saying on the stats clock; the
  // charting clock still names itself, because "2026 charting" is a real and
  // notable thing to see rather than an assumption.
  if (kind === 'stats' && slate && year === slate) return null
  const stale = slate ? year < slate : kind === 'charting'
  const title = kind === 'charting'
    ? `Coverage, routes and pressure come from nflverse participation charting, published once a year after the postseason. ${year} is the newest that exists \u2014 the ${year + 1} file lands around February ${year + 2}. Real numbers, last season's defence.`
    : `Defence-vs-position is built from play-by-play, which publishes all season. This season's own table opens once three weeks have been played; until then the honest answer is ${year}.`
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: NUM_FONT, fontSize: TYPE.micro, fontWeight: 900,
        letterSpacing: '.08em', whiteSpace: 'nowrap',
        color: stale ? C.yellow : C.text3,
        border: `1px solid ${stale ? C.yellow + '55' : C.border}`,
        borderRadius: 5, padding: '2px 6px', cursor: 'help',
        ...style,
      }}
    >
      {year} {kind === 'charting' ? 'CHARTING' : 'DEFENSE'}
    </span>
  )
}
