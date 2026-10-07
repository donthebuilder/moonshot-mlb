'use client'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampSpecialTeams } from '../../../lib/nhl/useLamp'
import { DelayedBanner, Loading, SourceLine, StaleSeasonNote, EmptyState, fmtSec } from '../ui'
import { NHL_TEAMS } from '../../../lib/nhl/teams'
import PenaltyBox from '../PenaltyBox'

const NICK = Object.fromEntries(NHL_TEAMS.map(([abbrev, , , nick]) => [abbrev, nick]))

// 🏒 SPECIAL TEAMS (lamp research step 2, 2026-09-26) — every club's power
// play and penalty kill, one sortable table, tonight's matchups flagged: a
// club playing tonight carries a stripe and its opponent, so "their PP
// against his PK" is one glance. Measured, straight from the league's team
// reports (/api/lamp/specialteams); nothing here is a LAMP score.
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}`)
const mmss = fmtSec
const COLUMNS = [
  { key: 'team', label: 'Team', w: 150, heat: false, sticky: true, bold: true },
  { key: 'tonight', label: 'TONIGHT', w: 70, heat: false, mono: true },
  { key: 'gp', label: 'GP', w: 36, heat: false },
  { key: 'ppPct', label: 'PP%', w: 50, primary: true, fmt: pct },
  { key: 'ppOppPg', label: 'PP OPP/GP', w: 64, primary: true, dp: 2 },
  { key: 'ppGpg', label: 'PPG/GP', w: 56, dp: 2 },
  { key: 'ppToiPg', label: 'PP TOI/GP', w: 64, fmt: mmss },
  { key: 'pkPct', label: 'PK%', w: 50, primary: true, fmt: pct },
  { key: 'shPg', label: 'TSH/GP', w: 56, invert: true, dp: 2 },
  { key: 'pkToiPg', label: 'PK TOI/GP', w: 64, invert: true, fmt: mmss },
]

export default function SpecialTeams({ onOpenTeam, onOpenPlayer = null }) {
  const { data, error, loading } = useLampSpecialTeams()
  const tonight = data?.tonight || {}
  const rows = (data?.teams || []).map((t) => ({
    ...t, team: `${t.abbrev} ${NICK[t.abbrev] || t.name}`,
    tonight: tonight[t.abbrev] ? `${tonight[t.abbrev].home ? 'vs' : '@'} ${tonight[t.abbrev].opp}` : '',
    _playing: Boolean(tonight[t.abbrev]),
  }))
  const playing = rows.filter((r) => r._playing).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · SPECIAL TEAMS" title={data?.seasonLabel ? `${data.seasonLabel} special teams` : 'Special teams'}
        note="Power play and penalty kill, all 32 clubs. Tonight’s teams are marked."
        theme={C} numFont={NUM_FONT} accent={C.ice}
        stats={data ? [{ value: rows.length, label: 'TEAMS', tone: C.text2 }, { value: playing, label: 'PLAYING TONIGHT', tone: C.ice }] : null} />
      {data?.stale && <StaleSeasonNote label={data.seasonLabel} what="special teams" />}
      <DelayedBanner error={error} what="special teams" />
      {loading && !data ? <Loading what="special teams" /> : null}
      {data && !rows.length ? <EmptyState title="NOTHING YET" note="No special-teams numbers for any club yet." /> : null}
      {rows.length > 0 && (
        <LampTable rows={rows} columns={COLUMNS} heatMode="primary" initialSort="ppPct" maxRows={12 /* 0g E3: 32 clubs, preview then "show N more" */} maxHeight={9999}
          rowEdge={(r) => (r._playing ? C.ice : null)} onRowClick={(r) => onOpenTeam?.(r.abbrev)} />
      )}
      <SourceLine>api.nhle.com/stats team/powerplay and team/penaltykill, regular season (gameTypeId 2): powerPlayPct, ppOpportunitiesPerGame, ppGoalsPerGame, ppTimeOnIcePerGame, penaltyKillPct, timesShorthandedPerGame, pkTimeOnIcePerGame. Tonight: the league scoreboard.</SourceLine>
      {/* who sends his team short, and who puts it on the power play */}
      <PenaltyBox onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} />
    </div>
  )
}
