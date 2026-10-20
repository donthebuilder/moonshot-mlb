'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, RAMP } from '../../../lib/nhl/theme'
import { useLampPlayers, useLampSeasonStats, useLampBoardOnce } from '../../../lib/nhl/useLamp'
import { byScore } from '../../../lib/nhl/goalModel'
import { alpha } from '../../../lib/scales'
import CallStatusBadge from '../../CallStatusBadge'
import { useCallGate } from '../../MemberGate'
import { lockedFor } from '../../../lib/members/gate'
import { SportTheme } from '../../SportTheme'
import PlayerBoardFrame from '../../players/PlayerBoardFrame'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import { nhlGoalLeg } from '../../../lib/slip/rowLegs'
import { DelayedBanner, Loading, TeamMark, readHashParam, writeHashParam } from '../ui'
import Player from './Player'

// 🏒 PLAYERS / GOALIES, MOONSHOT'S PAGE (2026-09-30, Donovan: "the mlb players
// page is the base ... use those components"). MOONSHOT's PlayerBoard
// (components/players/PlayerBoardFrame.js): search, question chips + 🎲, the
// list with a score chip, and the player's file INLINE on the right -- the
// same LAMP player file every other tap opens (components/lamp/tabs/Player.js,
// built on MOONSHOT's VerdictHero / StatStrip / HitRateBoxes). Was a
// directory table that sent you to a separate page and back.
//
// THE ORDER IS THE GOAL SCORE (2026-10-08, Donovan: "I'd rather them be ranked by
// their goal score, you know, by their ranking"). The score, the # and the word
// (CALLED / ON THE BOARD / NOT ON THE BOARD) are the Rankings board's own rows
// (/api/lamp/board, built by lib/nhl/goalModel.js scoreNight); nothing is scored or
// labelled here. The # is the night rank, #1 to #n by score across every game, the
// same comparator (byScore) the board sorts with. A man with no score tonight (his
// club is off, or he is unrated) reads "--" and sorts after the rated, by season
// goals. Season goals stay on the row as the quiet second number and as the other
// sort (Score | Goals). GOALIES have no goal score: they are ordered by games
// started (the starter first), then wins; the chip is his starts, the quiet line his
// save %. `goaliesOnly` is the Goalies pill (hash gk=1; #tab=goalies is an alias that opens it, lib/routes.js ALIAS_PARAMS).

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export default function Players({ onOpenTeam, onOpenGame }) {
  const [goaliesOnly, setGoalies] = useState(false)
  useEffect(() => {   // the address owns the pill: a link or Back can flip it
    const read = () => setGoalies(readHashParam('gk') === '1')
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  const flipGoalies = () => { const on = !goaliesOnly; setGoalies(on); writeHashParam('gk', on ? '1' : null) }
  const { data, error, loading } = useLampPlayers()
  const stats = useLampSeasonStats()
  const board = useLampBoardOnce()
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nhl')   // the books' goal price (the same read the player page's + slip uses)
  const [sort, setSort] = useState('score')
  const tonight = stats.data?.tonight || {}
  const line = useMemo(() => {
    const m = new Map()
    for (const r of stats.data?.skaters || []) m.set(String(r.id), r)
    for (const r of stats.data?.goalies || []) m.set(String(r.id), r)
    return m
  }, [stats.data])
  // playerId -> { score, status, rank, of } from tonight's board response
  const scored = useMemo(() => {
    const all = []
    const gameOfRow = new Map()
    for (const g of board.data?.games || []) {
      if (g.noMarketLock) continue
      for (const r of g.rows || []) if (r.score != null) { all.push(r); gameOfRow.set(r, g) }
    }
    all.sort(byScore)
    const m = new Map()
    all.forEach((r, i) => m.set(String(r.playerId), { score: r.score, status: r.status, rank: i + 1, of: all.length, key: `${gameOfRow.get(r).game?.id}|${r.playerId}`, time: gameOfRow.get(r).game?.startUtc ?? null, graded: Boolean(gameOfRow.get(r).graded) }))
    return m
  }, [board.data])
  // MEMBERS LOCK (components/MemberGate.js): the board's own key, puck drop and grade per skater; null for everyone but a free viewer
  const gateOf = useCallGate({ rows: () => [...scored.values()], source: scored, statusOf: (e) => e.status, keyOf: (e) => e.key, timeOf: (e) => e.time, gradedOf: (e) => e.graded, rankOf: (e) => e.rank })
  const goals = (p) => { const r = line.get(String(p.id)); return r ? (p.pos === 'G' ? r.w : r.g) : null }
  const starts = (p) => { const r = line.get(String(p.id)); return r ? (r.gs ?? r.gp ?? null) : null }
  const sc = (p) => (p.pos === 'G' ? null : scored.get(String(p.id)) || null)
  // a CALLED, not-started skater the viewer may not see: the stamp is the lock (metaOf) and his score and place are not printed (sorting still uses the real score)
  const lockedP = (p) => { const e = p.pos === 'G' ? null : sc(p); const g = e && gateOf ? gateOf(e) : null; return Boolean(g) && lockedFor({ status: e.status, started: g.started, graded: g.graded, key: g.key, free: g.free, memberState: 'free' }) }
  const chip = (p) => (p.pos === 'G' ? (goaliesOnly ? starts(p) : null) : lockedP(p) ? null : sc(p)?.score ?? null)
  const rows = useMemo(() => (data?.players || [])
    .filter((p) => !goaliesOnly || p.pos === 'G')
    .sort((a, b) => {
      const ag = a.pos === 'G', bg = b.pos === 'G'
      if (ag !== bg) return ag ? 1 : -1                    // goalies after skaters
      if (ag) return ((starts(b) ?? -1) - (starts(a) ?? -1)) || ((goals(b) ?? -1) - (goals(a) ?? -1)) || String(a.name).localeCompare(String(b.name))
      if (sort === 'score') {
        const as = sc(a)?.score, bs = sc(b)?.score
        if ((as != null) !== (bs != null)) return as != null ? -1 : 1   // rated first
        if (as != null && bs != null && bs !== as) return bs - as
        if (as != null) return sc(a).rank - sc(b).rank
      }
      return ((goals(b) ?? -1) - (goals(a) ?? -1)) || String(a.name).localeCompare(String(b.name))
    }),
  [data, goaliesOnly, line, scored, sort]) // eslint-disable-line react-hooks/exhaustive-deps
  const noBoard = !board.loading && !board.error && scored.size === 0

  const asks = [
    { key: 'tonight', label: '🏒 Playing tonight', test: (p) => Boolean(tonight[p.team]), why: 'His club has a game tonight' },
    ...(goaliesOnly ? [] : [
      { key: 'F', label: 'Forwards', test: (p) => ['C', 'L', 'R'].includes(p.pos), why: 'Centres and wingers' },
      { key: 'D', label: 'Defense', test: (p) => p.pos === 'D', why: 'Defensemen' },
    ]),
  ]

  if (loading && !data) return <Loading what="every roster" />
  return (
    <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
      <DelayedBanner error={error} what="the rosters" />
      {data?.missing?.length ? <div style={{ color: C.text3, fontSize: 11, marginBottom: 6 }}>Roster not answering for: {data.missing.join(', ')}. Everyone else is here.</div> : null}
      {noBoard && !goaliesOnly ? <div style={{ color: C.text3, fontSize: 11, marginBottom: 6 }}>Tonight&apos;s goal scores aren&apos;t out yet, so the list is in season goals.</div> : null}
      <PlayerBoardFrame
        ramp={RAMP}
        sideTop={(
          <div role="group" aria-label="Sort and filter" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {goaliesOnly || noBoard ? null : (<>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: C.text3, letterSpacing: '.06em' }}>SORT</span>
              {[['score', 'Score'], ['goals', 'Goals']].map(([k, label]) => (
                <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
                  style={{ minHeight: 44, minWidth: 64, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT,
                    border: `1px solid ${sort === k ? C.ice : C.border}`, background: sort === k ? alpha(C.ice, 0.14) : 'transparent', color: sort === k ? C.ice : C.text3 }}>{label}</button>
              ))}
            </>)}
            <button type="button" aria-pressed={goaliesOnly} onClick={flipGoalies} title="Goaltenders only, in order of starts"
              style={{ minHeight: 44, minWidth: 64, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${goaliesOnly ? C.ice : C.border}`, background: goaliesOnly ? alpha(C.ice, 0.14) : 'transparent', color: goaliesOnly ? C.ice : C.text3 }}>Goalies</button>
          </div>
        )}
        rows={rows}
        slipSport="nhl"
        slipOf={(p) => (p.pos === 'G' ? null : nhlGoalLeg(odds, { id: p.id, name: p.name, team: p.team, opp: tonight[p.team]?.opp ?? null }))}
        idOf={(p) => String(p.id)}
        urlIdOf={(p) => String(p.id)}
        nameOf={(p) => p.name}
        searchText={(p) => norm(`${p.name} ${p.team}`)}
        metaOf={(p) => {
          const t = tonight[p.team]
          const r = sc(p)
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
              <TeamMark abbrev={p.team} size={16} />
              <span>{p.pos}{p.pos === 'G' && goaliesOnly && starts(p) != null ? ` · ${starts(p)} GS` : ''}{t ? ` · ${t.home ? 'vs' : '@'} ${t.opp}` : ''}</span>
              {r ? <CallStatusBadge status={r.status} theme={C} accent={C.ice} numFont={NUM_FONT} size={11} gate={gateOf ? gateOf(r) : null} />
                : p.pos !== 'G' ? <span style={{ color: C.text3 }}>{t ? '· unrated' : '· no game'}</span> : null}
            </span>
          )
        }}
        scoreOf={chip}
        rankOf={(p) => (lockedP(p) ? null : sc(p)?.rank ?? null)}
        scoreExtra={(p) => {
          if (p.pos === 'G') { const r = line.get(String(p.id)); return r?.svPct != null ? `${(r.svPct).toFixed(3).replace(/^0/, '')} SV` : '—' }
          const g = goals(p)
          return g == null ? '—' : `${g} G`
        }}
        scoreTitle={(p) => {
          if (p.pos === 'G') return starts(p) == null ? 'No NHL line this season yet' : `${starts(p)} starts, ${goals(p) ?? 0} wins this season`
          const r = sc(p)
          const g = goals(p)
          if (g == null) return `${r ? `Goal score ${r.score}, #${r.rank} of ${r.of} tonight · ` : ''}${stats.data ? 'No game in the league’s season report yet, so no goals to show' : 'Season goals are still loading'}`
          return `${r ? `Goal score ${r.score}, #${r.rank} of ${r.of} tonight` : 'No goal score tonight'}${g == null ? '' : ` · ${g} goals this season`}`
        }}
        asks={asks}
        placeholder={goaliesOnly ? 'Search a goalie or club…' : 'Search a player or club…'}
        noun={goaliesOnly ? 'goalie' : 'player'}
        nounPlural={goaliesOnly ? 'goalies' : 'players'}
        renderDetail={(p) => <Player id={String(p.id)} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />}
      />
    </SportTheme>
  )
}
