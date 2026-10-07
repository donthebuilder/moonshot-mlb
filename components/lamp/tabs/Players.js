'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../../lib/nhl/theme'
import { useLampPlayers, useLampSeasonStats } from '../../../lib/nhl/useLamp'
import { SportTheme } from '../../SportTheme'
import PlayerBoardFrame from '../../players/PlayerBoardFrame'
import { DelayedBanner, Loading } from '../ui'
import Player from './Player'

// 🏒 PLAYERS / GOALIES, MOONSHOT'S PAGE (2026-09-30, Donovan: "the mlb players
// page is the base ... use those components"). MOONSHOT's PlayerBoard
// (components/players/PlayerBoardFrame.js): search, question chips + 🎲, the
// list with a score chip, and the player's file INLINE on the right -- the
// same LAMP player file every other tap opens (components/lamp/tabs/Player.js,
// built on MOONSHOT's VerdictHero / StatStrip / HitRateBoxes). Was a
// directory table that sent you to a separate page and back.
//
// Every player on every current roster (camp invites included). The chip is
// this season's goals (a goalie: wins) from the league's own season report
// (/api/lamp/seasonstats); a man with no NHL line this season reads "—".
// `goaliesOnly` is the GOALIES tab: the same page opened on goalies.

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Players({ goaliesOnly = false, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useLampPlayers()
  const stats = useLampSeasonStats()
  const tonight = stats.data?.tonight || {}
  const line = useMemo(() => {
    const m = new Map()
    for (const r of stats.data?.skaters || []) m.set(String(r.id), r)
    for (const r of stats.data?.goalies || []) m.set(String(r.id), r)
    return m
  }, [stats.data])
  const chip = (p) => {
    const r = line.get(String(p.id))
    if (!r) return null
    return p.pos === 'G' ? r.w : r.g
  }
  const rows = useMemo(() => (data?.players || [])
    .filter((p) => !goaliesOnly || p.pos === 'G')
    .sort((a, b) => ((chip(b) ?? -1) - (chip(a) ?? -1)) || String(a.name).localeCompare(String(b.name))),
  [data, goaliesOnly, line]) // eslint-disable-line react-hooks/exhaustive-deps

  const asks = [
    { key: 'tonight', label: '🏒 Playing tonight', test: (p) => Boolean(tonight[p.team]), why: 'His club has a game tonight' },
    ...(goaliesOnly ? [] : [
      { key: 'F', label: 'Forwards', test: (p) => ['C', 'L', 'R'].includes(p.pos), why: 'Centres and wingers' },
      { key: 'D', label: 'Defence', test: (p) => p.pos === 'D', why: 'Defencemen' },
      { key: 'G', label: 'Goalies', test: (p) => p.pos === 'G', why: 'Goaltenders' },
    ]),
  ]

  if (loading && !data) return <Loading what="every roster" />
  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
      <DelayedBanner error={error} what="the rosters" />
      {data?.missing?.length ? <div style={{ color: C.text3, fontSize: 11, marginBottom: 6 }}>Roster not answering for: {data.missing.join(', ')}. Everyone else is here.</div> : null}
      <PlayerBoardFrame
        rows={rows}
        idOf={(p) => String(p.id)}
        urlIdOf={(p) => String(p.id)}
        nameOf={(p) => p.name}
        searchText={(p) => norm(`${p.name} ${p.team}`)}
        metaOf={(p) => {
          const t = tonight[p.team]
          return <>{p.team} · {p.pos}{p.number != null ? ` · #${p.number}` : ''}{t ? ` · tonight ${t.home ? 'vs' : '@'} ${t.opp}` : ''}</>
        }}
        scoreOf={chip}
        scoreTitle={(p) => (chip(p) == null ? 'No NHL line this season yet' : `${chip(p)} ${p.pos === 'G' ? 'wins' : 'goals'} this season`)}
        asks={asks}
        placeholder={goaliesOnly ? 'Search a goalie or club…' : 'Search a player or club…'}
        noun={goaliesOnly ? 'goalie' : 'player'}
        nounPlural={goaliesOnly ? 'goalies' : 'players'}
        renderDetail={(p) => <Player id={String(p.id)} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />}
      />
    </SportTheme>
  )
}
