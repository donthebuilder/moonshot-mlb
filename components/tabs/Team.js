'use client'
import TeamCards from '../binder/TeamCards'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { teamKey, isKnownTeam } from '../../lib/mlbTeams'
import { hashParams, writeHash } from '../../lib/urlState'
import { openingParam } from '../../lib/team/openingLink'
import { takeTarget, leaveTarget } from '../../lib/openTarget'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { useTeamNav, usePitcherNav } from '../../lib/teamNav'
import { buildMlbTeam } from '../../lib/team/mlb'
import TeamPage from '../team/TeamPage'
import InjuryOut from '../injuries/InjuryOut'
import DenseTable from '../DenseTable'
import { Empty } from '../ui'

// ⚾ MOONSHOT'S TEAM PAGE, on the shared team page (2026-10-10, Donovan: "build out the team pages, showing all their data",
// and "team splits just like how ESPN has them"). Header (record, standing, streak, next game, last five), a one-row chips
// bar and six sections from lib/team/registry.js: Hitters (tonight's board with CALLED / ON THE BOARD from lib/callStatus,
// every model number, the shared injury module), Schedule, Stats & ranks, Splits (batting / pitching / record & park, every
// table naming its source), Our calls (the one locked record) and Next game. The view is lib/team/mlb.js's, built from the
// board rows MOONSHOT already loaded plus /api/mlb/team. The section rides the address as sec= (and the Splits view as sv=).
// A tapped team logo anywhere on MOONSHOT lands here (TeamNav); the club rides the address (team=).
// A cold link (#sport=mlb&tab=team&team=NYY) loses team= to the shell's first hash rewrite before this page mounts: the club is
// also read once from the opening address (lib/team/openingLink.js).
function Kick({ children }) {
  return <div style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.16em', color: C.orange, margin: '0 0 8px' }}>{children}</div>
}

export default function Team({ players = [], onPlayerClick, onOpenGame, onOpenBox }) {
  const [code, setCode] = useState(null)
  useEffect(() => {
    const t = teamKey(takeTarget('team') || hashParams().get('team') || openingParam('team'))
    if (t) setCode(t)
  }, [])
  useEffect(() => {
    if (!code) return
    const h = hashParams()
    if (h.get('team') !== code) { const had = h.get('team'); h.set('team', code); writeHash(h, { push: Boolean(had) }) }   // club to club pushes, so Back walks back
  }, [code])
  // The address can change under a page that stays mounted -- a club tapped on a player card opened here, or Back from one
  // club to the last (TUDDY's rule, 10-04).
  useEffect(() => {
    const on = () => { const t = teamKey(hashParams().get('team') || ''); if (t) setCode(t) }
    window.addEventListener('hashchange', on); window.addEventListener('popstate', on)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('popstate', on) }
  }, [])
  const teamNav = useTeamNav(); const pitcherNav = usePitcherNav()
  const known = Boolean(code && isKnownTeam(code))
  const { data: server, error } = useLiveFetch(known ? `/api/mlb/team?team=${code}` : null, { enabled: known })
  const view = useMemo(() => (known ? buildMlbTeam({ team: code, players, server }) : null), [known, code, players, server])
  // the injury module is one stable component (a new function each render would remount it); it reads the latest handlers from a ref
  const live = useRef({})
  const slots = useMemo(() => ({
    teamCards: (p) => <TeamCards {...p} />,
    injuries: ({ clubs }) => <InjuryOut sport="mlb" clubs={clubs} theme={{ C, NUM_FONT, accent: C.orange }} title="Out" onOpenTeam={(a) => live.current.openTeam?.(a)}
      openPlayer={(e) => (live.current.openPlayer && live.current.has(e.player_id) ? () => live.current.openPlayer(e.player_id) : null)} />,
  }), [])
  if (!code) return <Empty title="NO CLUB PICKED" note="Tap a club's logo anywhere on MOONSHOT — a board, a game, a player's card — to open its page." />
  if (!isKnownTeam(code)) return <Empty title="NO SUCH CLUB" note={`"${code}" isn't one of the 30 MLB clubs.`} />

  // Tonight's slate has a page per game (Games). A game that is not on it -- last week's, or next week's -- has no lineup
  // page; its destination is the Box scores page on THAT date with the game open. Falls back to Games when the shell has no box door.
  const openGame = (pk, date) => {
    if (!pk) return
    if (onOpenBox && !players.some((p) => String(p?.game_pk) === String(pk))) { leaveTarget('boxday', date); leaveTarget('boxgame', pk); onOpenBox(); return }
    leaveTarget('game', pk); onOpenGame?.(pk)
  }
  const rawOf = (key) => players.find((p) => `${p.player_id}-${p.game_pk}` === String(key)) || players.find((p) => String(p.player_id) === String(key)) || null
  const nav = {
    onOpenPlayer: onPlayerClick ? (key) => { const p = rawOf(key); if (p) onPlayerClick(p) } : null,
    onOpenGame: openGame,
    onOpenTeam: (abbr) => { const a = teamKey(abbr); if (!a || a === code) return; if (teamNav) teamNav(a); else setCode(a) },
    onOpenPitcher: pitcherNav,
  }
  const theme = { C, NUM_FONT, accent: C.orange }
  live.current = { openTeam: nav.onOpenTeam, openPlayer: nav.onOpenPlayer, has: (id) => Boolean(rawOf(id)) }
  return (
    <TeamPage
      view={view} theme={theme}
      ui={{ Table: DenseTable, EmptyState: Empty, Kicker: Kick, Weak: null, Slots: slots }}
      nav={nav}
      banner={error && !server ? <p style={{ margin: 0, color: C.amber, fontSize: 12 }}>The club&apos;s feeds are delayed — the board below is still current.</p> : null}
    />
  )
}
