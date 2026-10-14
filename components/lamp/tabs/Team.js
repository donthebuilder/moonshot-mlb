'use client'
import TeamCards from '../../binder/TeamCards'
import HeadToHead from '../../h2h/HeadToHead'
import { useMemo, useRef } from 'react'
import TeamPage from '../../team/TeamPage'
import LampTable from '../LampTable'
import GoalieWeakSpots from '../GoalieWeakSpots'
import TeamGoalies from '../TeamGoalies'
import InjuryOut from '../../injuries/InjuryOut'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampTeam, useLampTeamDeep, useLampBoardOnce, useLampHotSticks } from '../../../lib/nhl/useLamp'
import { nhlTeam } from '../../../lib/nhl/teams'
import { useTeamNav } from '../../../lib/teamNav'
import { buildNhlTeam } from '../../../lib/team/nhl'
import { EmptyState, DelayedBanner, Loading, SourceLine, Kicker } from '../ui'

// 🏒 TEAM — one club, a real destination (spec §11), never a modal. 2026-10-10: it is the SHARED team page now
// (components/team/TeamPage.js): the header (record, standing, splits, next game, last five), a one-row chips bar,
// and eight sections from the registry in lib/team/registry.js -- roster with tonight's board status, schedule,
// stats with the rank of 32, OUR calls on the club's skaters, the next game's matchup, trends, goalies (starter, season line, weak zones, rest, injuries), special teams. The view is built by lib/team/nhl.js from four reads that already exist or were added for it:
// /api/lamp/team (schedule, roster, season lines), /api/lamp/teamdeep (ranks, xG, calls, next game),
// /api/lamp/board (tonight's status words) and /api/lamp/hotsticks (last 5 / last 10). The section rides the address
// as sec=. A feed that is down leaves its sections empty with the data named, never a made-up number.
export default function Team({ abbrev, onOpenPlayer, onOpenGame, onOpenTeam = null, onBack, backLabel = 'Teams' }) {
  const goodCode = /^[A-Za-z]{3}$/.test(String(abbrev || ''))
  const club = goodCode ? nhlTeam(abbrev) : null
  const { data: t, error, loading } = useLampTeam(club ? abbrev : null)
  const { data: deep, error: deepError } = useLampTeamDeep(club ? abbrev : null)
  const { data: board } = useLampBoardOnce(null)
  const { data: form } = useLampHotSticks()
  const nav = useTeamNav()
  const openTeam = onOpenTeam || nav
  const view = useMemo(() => (club ? buildNhlTeam({ team: club.abbrev, payload: t, deep, board, form }) : null), [club, t, deep, board, form])
  // the slot components are stable (a new function each render would remount them); they read the latest handlers from a ref
  const live = useRef({})
  live.current = { openPlayer: onOpenPlayer, openTeam, openGame: onOpenGame }
  const Slots = useMemo(() => ({
    teamCards: (p) => <TeamCards {...p} />,
    h2h: ({ sport, team }) => <HeadToHead sport={sport} a={team} heading={false} ui={{ Table: LampTable, EmptyState: EmptyState, Kicker: Kicker }} theme={{ C, NUM_FONT, accent: C.ice }} nav={{ onOpenTeam: (a) => live.current.openTeam?.(a), onOpenGame: (id, d) => live.current.openGame?.(id, d) }} />,
    goalieReads: (p) => <TeamGoalies {...p} onOpenPlayer={live.current.openPlayer ? (id) => live.current.openPlayer(id) : null} />,
    injuries: ({ clubs }) => <InjuryOut sport="nhl" clubs={clubs} theme={{ C, NUM_FONT, accent: C.ice }} title="Out" onOpenTeam={(a) => live.current.openTeam?.(a)}
      openPlayer={(e) => (e.player_id && live.current.openPlayer ? () => live.current.openPlayer(e.player_id) : null)} />,
  }), [])
  if (!goodCode) return <EmptyState title="NO CLUB PICKED" note="Open a club from Teams, the Board, a roster, or a player’s file."><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (!club) return <EmptyState title="NO SUCH CLUB" note="That is not one of the 32 NHL clubs." tone={C.text3}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  if (loading && !t) return <Loading what="the club" />
  if (!t && (error?.status === 400 || error?.status === 404)) return <EmptyState title="NO SUCH CLUB" note="That is not one of the 32 NHL clubs." tone={C.text3}><BackBtn onBack={onBack} label={backLabel} /></EmptyState>
  return (
    <TeamPage
      view={view} theme={{ C, NUM_FONT, accent: C.ice }}
      ui={{ Table: LampTable, EmptyState, Kicker, Weak: GoalieWeakSpots, Slots }}
      nav={{ onOpenPlayer, onOpenGame, onOpenTeam: openTeam }}
      back={<BackBtn onBack={onBack} label={backLabel} />}
      banner={<><DelayedBanner error={t ? null : error} what="this club" /><DelayedBanner error={deep ? null : deepError} what="the club’s league numbers" /></>}
      footer={<SourceLine>Source: NHL standings/now, roster, club-stats and club-schedule-season via /api/lamp/team; api.nhle.com team/summary, powerplay and penaltykill, and our club-game xG table (lamp_team_game_xg) and goal log (lamp_goal_log) via /api/lamp/teamdeep; tonight’s board and the league’s per-game report for last 5 / last 10. Season lines are for the newest season with games in it.</SourceLine>}
    />
  )
}

function BackBtn({ onBack, label }) {
  return <div><button type="button" onClick={onBack} style={{ minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border2}`, background: C.bg2, color: C.text2, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.04em' }}>‹ {label}</button></div>
}
