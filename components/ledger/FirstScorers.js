'use client'
import { useEffect, useState } from 'react'
import LedgerSection from './LedgerSection'
import Tap from '../Tap'
import { MatchLogos } from '../TeamMark'
import CallStatusBadge from '../CallStatusBadge'
import { FaceWallByGame } from '../openings/OpeningViz'

// 🥇 FIRST SCORERS (ledger plan step 2): who scored first in each recent game,
// when, and whether the board had him -- plus the season line. Tracking only:
// there is no first-scorer pick yet (it needs its own model and a graded
// archive, which this is the start of). /api/ledger/first.
const WORD = {
  mlb: { event: 'homer', first: 'first homer', title: 'FIRST HOMER OF EACH GAME', note: 'The first home run, not the first run.' },
  nfl: { event: 'TD', first: 'first touchdown', title: 'FIRST TOUCHDOWN OF EACH GAME', note: null, wall: 'First TD · by game', scored: 'Scored the first TD', other: 'They scored it' },
  nhl: { event: 'goal', first: 'first goal', title: 'FIRST GOAL OF EACH GAME', note: null, wall: 'First goal · by game', scored: 'Scored the first goal', other: 'They scored it',
    ring: 'faceoff', both: 'First goal + opening faceoff', wasted: 'Won the faceoff, not the goal', none: 'Neither' },
  nba: { event: 'basket', first: 'first basket', title: 'FIRST BASKET OF EACH GAME', note: 'The first made field goal — the shot the first-basket board is graded on.' },
}
// lib/callStatus.js, the one set of words (R2)

// `games` (LAMP / TUDDY, 10-26): tonight's / this week's games [{ away, home }] -- the section then also draws the face wall,
// each club's first scorers this season (components/openings/OpeningViz.js; BUCKETS' and MOONSHOT's sit on their Openings).
// `floor`: the product's own surface under the wall (LAMP's ice).
export default function FirstScorers({ sport, C, numFont, accent, day = null, emptyWhy, onOpenPlayer, onOpenGame = null, games = null, floor = null }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(false)
  // FRESH WHEN YOU COME BACK (10-18: the list still showed Thursday's game hours into Sunday, though nfl_td_feed had the
  // London game's first TD at 13:59 UTC, ~10 minutes after the play). It was read once, at mount; an app tab opened before
  // kickoff kept it all day. Now it is read again when the tab comes back into view. No timer, no polling.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const back = () => { if (document.visibilityState === 'visible') setTick((n) => n + 1) }
    document.addEventListener('visibilitychange', back)
    return () => document.removeEventListener('visibilitychange', back)
  }, [])
  useEffect(() => {
    let alive = true
    fetch(`/api/ledger/first?sport=${sport}${day ? `&day=${day}` : ''}${games ? '&walls=1' : ''}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (alive) { setData(j); setErr(false) } }).catch(() => { if (alive && !data) setErr(true) })
    return () => { alive = false }
  }, [sport, day, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const w = WORD[sport]
  const s = data?.season
  const walls = data?.walls
  const wallGames = (games || []).filter((g) => g?.away && g?.home).map((g) => ({ key: `${g.away}-${g.home}`, away: g.away, home: g.home, label: `${g.away} @ ${g.home}` }))
  const names = walls ? new Map(Object.entries(walls.names || {})) : null
  return (
    <>
    <LedgerSection C={C} numFont={numFont} accent={accent} title={`🥇 ${w.title}`}
      blurb={`who scored first, when, and whether the board had him${w.note ? ` · ${w.note}` : ''}`}
      rows={(data?.games || []).map((g, i) => ({ ...g, key: `${g.day}|${g.gameId}|${i}` }))}
      empty={err ? 'First scorers are delayed.' : !data ? 'Loading…' : emptyWhy || `No ${w.event} on file in the last few days.`}
      render={(g) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 12, flexWrap: 'wrap' }}>
          {/* 2026-10-03: the matchup as the two clubs' logos (was "VGK v ANA"), the
              name a step up, the status the shared stamp (CallStatusBadge) */}
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 11, minWidth: 74 }}><Tap onClick={onOpenGame && (() => onOpenGame(g.gameId, g))}>{(() => {
            // 10-18: "DEN v SEA" is the SCORER's club first (NFL / NHL / NBA feeds carry no home flag), so it draws as "DEN v SEA",
            // never "DEN @ SEA" (Thursday's SEA @ DEN read backwards). Only MLB's "away @ home" keeps the @.
            const m = /^(.+?)\s+(v|vs|@)\s+(.+)$/.exec(String(g.game || ''))
            return m ? <MatchLogos sport={sport} away={m[1]} home={m[3]} sep={m[2] === '@' ? '@' : 'v'} px={18} gap={5} /> : g.game
          })()}</Tap></span>
          <button type="button" onClick={() => g.playerId && onOpenPlayer?.(g.playerId, g)} style={{ background: 'transparent', border: 'none', padding: 0, cursor: g.playerId ? 'pointer' : 'default', color: C.text, fontWeight: 800, font: 'inherit', fontSize: 13.5 }}>{g.name}</button>
          <span style={{ color: C.text3, fontFamily: numFont, fontSize: 11 }}>{g.when}</span>
          <span style={{ marginLeft: 'auto' }}><CallStatusBadge status={g.status} accent={accent} theme={C} numFont={numFont} /></span>
        </div>
      )}
      footer={s && s.games > 0 ? (
        <div style={{ marginTop: 8, fontSize: 11.5, lineHeight: 1.55, color: C.text2 }}>
          This season, <b style={{ color: C.text }}>{s.games}</b> games: <b style={{ color: accent }}>{s.called}</b> called, {s.board} on the board, {s.off} not on it
          ({Math.round(((s.called + s.board) / (s.known || s.games)) * 100)}% on the board{s.known != null && s.known < s.games ? `, of the ${s.known} with the board on file` : ''}).
          {s.top.length ? <> Most: {s.top.slice(0, 3).map((t) => `${t.name} ${t.n}`).join(', ')}.</> : null}
          <span style={{ color: C.text3 }}> No pick on this yet.</span>
        </div>
      ) : null}
    />
    {walls && wallGames.length ? (
      <FaceWallByGame title={w.wall} games={wallGames} logOf={(t) => walls.teams?.[t]} sport={sport} C={C} NUM_FONT={numFont} accent={accent}
        nameOf={names} urlOf={(id) => walls.faces?.[id] || null} floor={floor} words={{ ring: w.ring || null, first: w.scored, other: w.other, both: w.both, wasted: w.wasted, none: w.none }} />
    ) : null}
    </>
  )
}
