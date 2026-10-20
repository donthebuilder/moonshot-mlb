'use client'
import { useMemo, useRef } from 'react'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { useBucketsTeam, useBucketsTeamDeep, useBucketsBoard, useBucketsShots } from '../../../lib/nba/useBuckets'
import { unpackShots } from '../../../lib/nba/shots'
import { nbaTeam } from '../../../lib/nba/teams'
import { useTeamNav } from '../../../lib/teamNav'
import UsageTreemap from '../../charts/UsageTreemap'
import { NBA_USAGE_METRICS, NBA_USAGE_GROUPS } from '../../../lib/nba/teamUsage'
import { buildNbaTeam } from '../../../lib/team/nba'
import TeamPage from '../../team/TeamPage'
import BucketsTable from '../BucketsTable'
import ShotChart from '../ShotChart'
import InjuryOut from '../../injuries/InjuryOut'
import TeamCards from '../../binder/TeamCards'
import HeadToHead from '../../h2h/HeadToHead'
import { EmptyState, DelayedBanner, Loading, Kicker, BackBtn } from '../ui'

// 🏀 BUCKETS' TEAM PAGE, on the shared team page (2026-10-10; NBA is the long-term flagship, so it gets the same depth as the
// other three): the header (record, seed, streak, home / road / last ten, next game, last five), a one-row chips bar and six
// sections from lib/team/registry.js -- Players (season lines, availability, tonight's board word, the shared injury module),
// Schedule, Stats & ranks (with where the club shoots from), Splits (the standings' records and our own results: months,
// opponents, rest as numbers with their games), Our calls (the graded BUCKETS log) and Next game (the team model's expected
// points, the stored line, both clubs' ranks). The view is lib/team/nba.js's. HIDDEN: every route behind this page answers 404
// until BUCKETS_PUBLIC=on (lib/nba/gate.js), and the tab itself is only reachable inside the BUCKETS shell.
export default function Team({ abbrev, onBack, backLabel = 'Teams', onOpenPlayer, onOpenGame, onOpenTeam }) {
  const known = nbaTeam(abbrev)
  const { data: payload, error, loading } = useBucketsTeam(known ? abbrev : null)
  const { data: deep, error: deepError } = useBucketsTeamDeep(known ? abbrev : null)
  const { data: board } = useBucketsBoard(null, 'pts')
  const shotsRead = useBucketsShots(known ? { team: known.abbrev } : null)
  const shots = useMemo(() => unpackShots(shotsRead.data?.shots), [shotsRead.data])
  const teamNav = useTeamNav()
  const view = useMemo(() => (known ? buildNbaTeam({ team: known.abbrev, payload, deep, board, shots: shots.length > 0 }) : null), [known, payload, deep, board, shots])
  // the two modules are one stable component each (a new function every render would remount them); they read the latest props from a ref
  const live = useRef({})
  live.current = { known, shots, onOpenPlayer, onOpenGame, onOpenTeam: onOpenTeam || teamNav }
  const slots = useMemo(() => ({
    teamCards: (p) => <TeamCards {...p} />,
    h2h: ({ sport, team }) => <HeadToHead sport={sport} a={team} heading={false} ui={{ Table: BucketsTable, EmptyState: EmptyState, Kicker: Kicker }} theme={{ C, NUM_FONT, accent: C.purple }} nav={{ onOpenTeam: (a) => live.current.onOpenTeam?.(a), onOpenGame: (id, d) => live.current.onOpenGame?.(id, d) }} />,
    injuries: ({ clubs }) => <InjuryOut sport="nba" clubs={clubs} theme={{ C, NUM_FONT, accent: C.purple }} title="Out" onOpenTeam={(a) => live.current.onOpenTeam?.(a)} openPlayer={(e) => (live.current.onOpenPlayer && e.player_id ? () => live.current.onOpenPlayer(e.player_id) : null)} />,
    usage: ({ usage }) => <UsageTreemap usage={usage} metrics={NBA_USAGE_METRICS} groups={NBA_USAGE_GROUPS} theme={{ C, NUM_FONT, accent: C.purple }} title="Who carries it"
      onOpen={(p) => live.current.onOpenPlayer?.(p.id)} />,
    shots: () => <ShotChart shots={live.current.shots} filters={['result', 'type']} title={`${live.current.known?.nick}, every field-goal attempt on file`} source="Every field-goal attempt on file for the club, from ESPN play-by-play." />,
  }), [])
  if (!abbrev) return <EmptyState title="NO CLUB PICKED" note="Open a club from Teams or Standings."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!known) return <EmptyState title="NO SUCH CLUB" note={`“${String(abbrev).slice(0, 8)}” isn’t an NBA club code.`}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !payload) return <Loading what="the club" />
  return (
    <TeamPage
      view={view} theme={{ C, NUM_FONT, accent: C.purple }}
      ui={{ Table: BucketsTable, EmptyState, Kicker, Weak: null, Slots: slots }}
      nav={{ onOpenPlayer, onOpenGame, onOpenTeam: onOpenTeam || teamNav }}
      back={<BackBtn onBack={onBack} label={backLabel} />}
      banner={<><DelayedBanner error={payload ? null : error} what="club data" /><DelayedBanner error={deep ? null : deepError} what="the club’s league numbers" /></>}
    />
  )
}
