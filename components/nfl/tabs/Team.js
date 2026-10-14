'use client'
import TeamCards from '../../binder/TeamCards'
import HeadToHead from '../../h2h/HeadToHead'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { NFL_TEAMS } from '../../../lib/nfl/teams'
import { fetchNflStandings } from '../../../lib/nfl/standings'
import { hashParams, writeHash } from '../../../lib/urlState'
import { takeTarget, dropTarget, TARGET_EVENT } from '../../../lib/openTarget'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import TeamPage from '../../team/TeamPage'
import NflTable from '../NflTable'
import { Empty } from '../../ui'
import { tdPool } from '../../../lib/nfl/tdPool'
import { tdStatusFor } from '../../../lib/nfl/tdStatus'
import { useResultsArchive } from '../../../lib/nfl/resultsArchive'
import { useGameCalls } from '../GameCalls'
import { useTeamNav } from '../../../lib/teamNav'
import { buildNflTeam } from '../../../lib/team/nfl'
import { TeamDefenders } from '../DefenseSections'
import InjuryOut from '../../injuries/InjuryOut'

// 🏈 TUDDY'S TEAM PAGE, on the shared team page (2026-10-10, Donovan: "build out the team pages, showing all their data").
// The header (record, standing, home / road / division, streak, next game, last five), a one-row chips bar and seven
// sections from lib/team/registry.js: Players (role, availability, usage, every model score, the board's word), Schedule,
// Stats & ranks, Our calls, Next game (defense vs position, team model, stored line, pass rush, corners, QB pressure),
// Trends, Tendencies & usage. The view is lib/team/nfl.js's, built from the files TUDDY already loads (week, matchup, logs,
// standings, graded weeks) and /api/nfl/team (the season schedule, stored totals, touchdowns by status). The section rides
// the address as sec=. A defense and a tags section are open extension points (lib/team/registry.js), not built here.
const NAME = Object.fromEntries(NFL_TEAMS)

function Kick({ children }) {
  return <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: C.green, margin: '0 0 8px' }}>{children}</div>
}

export default function Team({ data, picks = null, matchup = null, logs = null, results = null, onOpenPlayer, onOpenGame }) {
  const [code, setCode] = useState(null)
  useEffect(() => { const t = String(takeTarget('team') || '').toUpperCase(); if (t) setCode(t) }, [])
  useEffect(() => {
    if (!code) return
    const h = hashParams()
    if (h.get('team') !== code) { const had = h.get('team'); h.set('team', code); writeHash(h, { push: Boolean(had) }) }   // club to club pushes, so Back walks back
  }, [code])
  // The address can change under a page that stays mounted (a pasted #team=, Back from one club to the last, a club
  // tapped while this page is open) -- MOONSHOT's Team rule. The address is the newer word, so a target nobody took is
  // dropped; a tap left a fresh one.
  useEffect(() => {
    const onAddress = () => { dropTarget('team'); const t = String(hashParams().get('team') || '').toUpperCase(); if (t) setCode(t) }
    const onTap = () => { const t = String(takeTarget('team') || '').toUpperCase(); if (t) setCode(t) }
    window.addEventListener('hashchange', onAddress); window.addEventListener('popstate', onAddress); window.addEventListener(TARGET_EVENT, onTap)
    return () => { window.removeEventListener('hashchange', onAddress); window.removeEventListener('popstate', onAddress); window.removeEventListener(TARGET_EVENT, onTap) }
  }, [])
  // THE BOARD'S OWN WORDS (lib/callStatus via lib/nfl/tdStatus): CALLED = on the bot's card, ON THE BOARD = the top third
  // of the week's TD board. Not "has a row this week".
  const gameCalls = useGameCalls()
  const status = useMemo(() => tdStatusFor({ picksCard: picks?.card, gameCalls, games: data?.games, board: tdPool(data).rows }), [picks, gameCalls, data])
  const [st, setSt] = useState(null)
  useEffect(() => { let alive = true; fetchNflStandings().then((d) => { if (alive) setSt(d) }).catch(() => {}); return () => { alive = false } }, [])
  const teamNav = useTeamNav()
  const known = Boolean(code && NAME[code])
  const { data: server, error: serverError } = useLiveFetch(known ? `/api/nfl/team?team=${code}` : null, { enabled: known })
  const { archive } = useResultsArchive(results, data?.season)
  const view = useMemo(() => (known ? buildNflTeam({ team: code, slate: data, matchup, logs, st, server, archive, picks, gameCalls: gameCalls?.missing ? null : gameCalls, statusOf: status.statusOf }) : null),
    [known, code, data, matchup, logs, st, server, archive, picks, gameCalls, status])
  // the injury module is one stable component; it reads the latest handlers from a ref (a new function each render would remount it)
  const live = useRef({})
  const slots = useMemo(() => ({
    teamCards: (p) => <TeamCards {...p} />,
    h2h: ({ sport, team }) => <HeadToHead sport={sport} a={team} heading={false} ui={{ Table: NflTable, EmptyState: Empty, Kicker: Kick }} theme={{ C, NUM_FONT, accent: C.green }} nav={{ onOpenTeam: (a) => live.current.openTeam?.(a), onOpenGame: (id, d) => live.current.openGame?.(id, d) }} />,
    defense: TeamDefenders,
    injuries: ({ clubs }) => <InjuryOut sport="nfl" clubs={clubs} theme={{ C, NUM_FONT, accent: C.green }} title="Out this week" onOpenTeam={(a) => live.current.openTeam?.(a)}
      openPlayer={(e) => (live.current.openPlayer && live.current.has(e.player_id) ? () => live.current.openPlayer(e.player_id) : null)} />,
  }), [])
  if (!code) return <Empty title="NO CLUB PICKED" note="Tap a club's logo anywhere on TUDDY — a board, a game, standings — to open its page." />
  if (!NAME[code]) return <Empty title="NO SUCH CLUB" note={`"${code}" isn't one of the 32 NFL clubs.`} />

  const player = (id) => {
    const p = (data?.players || []).find((x) => x.player_id === id)
    const s = matchup?.snaps?.[id]
    return p || { player_id: id, name: s?.name || matchup?.red_zone?.[id]?.name || '', team: code }
  }
  const nav = { onOpenPlayer: onOpenPlayer ? (id) => onOpenPlayer(player(id)) : null, onOpenGame, onOpenTeam: (abbr) => { const a = String(abbr || '').toUpperCase(); if (!a || !NAME[a] || a === code) return; if (teamNav) teamNav(a); else setCode(a) } }
  live.current = { openGame: nav.onOpenGame, openTeam: nav.onOpenTeam, openPlayer: nav.onOpenPlayer, has: (id) => (data?.players || []).some((x) => x.player_id === id) }
  return (
    <TeamPage
      view={view} theme={{ C, NUM_FONT, accent: C.green }}
      ui={{ Table: NflTable, EmptyState: Empty, Kicker: Kick, Weak: null, Slots: slots }}
      nav={nav}
      banner={serverError && !server ? <p style={{ margin: 0, color: C.amber, fontSize: 12 }}>The club&apos;s schedule feed is delayed — the week&apos;s players and the matchup are still current.</p> : null}
    />
  )
}
