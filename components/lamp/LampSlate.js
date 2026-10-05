'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nhl/theme'
import { useLampBoard } from '../../lib/nhl/useLamp'
import { useHashFilter } from '../../lib/filterHash'
import { useIsPhone } from '../MobileFold'
import PageHeader from '../PageHeader'
import Tap from '../Tap'
import GameSwitcher from '../GameSwitcher'
import { ViewPills, GameFilterRail, SlateStrip, GamePanelPills, PanelAnchor, GameFrame, GameHeaderLine, PrevNextGame } from '../slate/SlateParts'
import { SubLabel, FactTiles } from '../matchup/MatchupParts'
import { GameBoard, NavBtn, AllGamesTable, spotOf, pct1, ppVsPk, restWord } from './tabs/Board'
import LampProjected from './LampProjected'
import LampWeakSpots from './LampWeakSpots'
import NhlWriteupBlock from './NhlWriteupBlock'
import BoardTopBar from '../BoardTopBar'
import { LampCards } from './LampCard'
import { STATUS_WORD } from '../../lib/callStatus'
import { EmptyState, DelayedBanner, Loading, StaleSeasonNote, fmtPuckDrop, zoneAbbrev, shiftDay, fmtDay } from './ui'
import TeamMark, { MatchLogos } from '../TeamMark'

// LAMP'S SLATE (2026-09-28). MOONSHOT's Slate (components/tabs/Games.js,
// Games view) built from its own pieces -- components/slate/* -- with the
// night's goal board in them (Donovan: "I should be able to see each game and
// get a good breakdown just like mlb"; "MOONSHOT IS THE BASE"):
//   the strip   one SlateCard per game: the game's best LAMP score on the dial,
//               puck drop / live / final, the three CALLED as chips
//   the game    The read (rest, power play against penalty kill, goals
//               allowed, each attack against the other defense), The board
//               (that game's board, GameBoard from the Board tab), The calls
//               (the three as LAMP's cards), and once it starts the box score
//               one tap away (the Game page), prev / next
// Every figure is a field the board already publishes (lib/nhl/boardRead.js);
// the starting goalie is only named once the feed has him (after the game).
// The open game rides the address (#…&game=<id>).

const PANELS = [['read', 'The read'], ['board', 'The board'], ['calls', 'The calls']]
const SUBS = {
  read: 'rest, power play against penalty kill, and each attack against the other defense.',
  board: "this game's whole goal board — the two called (one per team) on top, every scored skater under them.",
  calls: 'the two called in this game (one per team), as cards.',
}
const stateOf = (g) => (g.game.state === 'live' ? 'live' : g.game.state === 'final' ? 'final' : 'upcoming')

export default function LampSlate({ date = null, setDate = () => {}, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useLampBoard(date, 'GOAL')
  const isPhone = useIsPhone()
  const [gfilter, setGfilter] = useState('all')
  const [panel, setPanel] = useState('read')
  const [hashGame, setHashGame] = useHashFilter('game')
  const shown = data?.date || date
  // TABLE | GAMES and the boards' top bar (2026-09-28): cards first, like
  // MOONSHOT's Slate; search / team / game over both views (fteam / fgame).
  const [view, setView] = useState('games')
  const [query, setQuery] = useState('')
  const [fteam, setFteam] = useHashFilter('fteam')
  const [fgame, setFgame] = useHashFilter('fgame')
  const needle = query.trim().toLowerCase()
  const allGames = useMemo(() => [...(data?.games || [])].sort((a, b) => Date.parse(a.game.startUtc || 0) - Date.parse(b.game.startUtc || 0)), [data])
  const all = allGames.filter((g) => (!fgame || String(g.game.id) === fgame) && (!fteam || g.game.away.abbrev === fteam || g.game.home.abbrev === fteam))
  const items = useMemo(() => all.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.filter((r) => r.status !== 'off').map((r) => ({ r, g })))
    .filter(({ r }) => (!fteam || r.team === fteam) && (!needle || `${r.name} ${r.team}`.toLowerCase().includes(needle))), [all, fteam, needle])
  const counts = useMemo(() => {
    const c = { all: all.length, live: 0, upcoming: 0, final: 0 }
    for (const g of all) c[stateOf(g)] += 1
    return c
  }, [all])
  const games = all.filter((g) => gfilter === 'all' || stateOf(g) === gfilter)
  const lead = games.find((g) => stateOf(g) === 'live') || games.find((g) => stateOf(g) === 'upcoming') || games[0] || null
  const activeId = games.some((g) => String(g.game.id) === hashGame) ? hashGame : (lead ? String(lead.game.id) : null)
  const select = (id) => {
    setHashGame(String(id))
    if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('lamp-slate-game')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const bestOf = (g) => Math.max(0, ...g.rows.map((r) => Number(r.score) || 0))
  const bests = games.map(bestOf)
  const lo = Math.min(...bests, 100); const hi = Math.max(...bests, 0)
  const heatOf = (v) => (hi > lo ? (v - lo) / (hi - lo) : 0)
  const topId = games.reduce((a, g) => (bestOf(g) > (a ? bestOf(a) : -1) ? g : a), null)?.game.id
  const timeOf = (g) => `${fmtPuckDrop(g.game.startUtc)} ${zoneAbbrev()}`

  const cards = games.map((g) => {
    const best = bestOf(g)
    const heat = heatOf(best)
    const st = stateOf(g)
    const called = g.rows.filter((r) => r.status === 'called').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    const b2b = [g.game.away.abbrev, g.game.home.abbrev].filter((t) => spotOf(g, t, true)?.b2b)
    return {
      id: String(g.game.id), title: <MatchLogos sport="nhl" away={g.game.away.abbrev} home={g.game.home.abbrev} px={26} gap={5} />, past: st === 'final', heat,
      tooltip: `${g.game.away.abbrev} @ ${g.game.home.abbrev}`,
      dial: { value: best || null, pct: best, title: `The best LAMP score in this game: ${best ? best.toFixed(0) : '—'} of 100.` },
      band: topId === g.game.id && games.length > 1 ? { icon: '🌋', word: 'MAIN EVENT' } : heat >= 0.62 ? { icon: '🔥', word: '' } : heat < 0.3 && games.length > 2 ? { icon: '🧊', word: '' } : null,
      lead: <span title={g.locked ? 'The board locked before puck drop' : g.setting ? 'Setting: the calls can still change until puck drop' : 'A preview until the board locks'}>{g.locked ? '🔒' : '◻'}</span>,
      status: st === 'live' ? { kind: 'live', text: g.game.statusLine || 'LIVE' } : st === 'final' ? { kind: 'final', text: 'FINAL' } : { kind: 'time', text: timeOf(g) },
      extra: b2b.length ? <span>{b2b.join(' & ')} on a back-to-back</span> : null,
      score: st !== 'upcoming' ? { away: g.game.away.abbrev, home: g.game.home.abbrev, awayScore: g.game.away.score, homeScore: g.game.home.score, live: st === 'live' } : null,
      chips: called.map((r) => ({
        key: String(r.playerId), tag: 'CALL', color: C.ice, name: r.name, score: Math.round(r.score ?? 0),
        title: `${STATUS_WORD.called} — #${r.rank} in this game${g.graded ? (r.hit ? ', scored' : ', did not score') : ''}`,
        onClick: (e) => { e.stopPropagation(); onOpenPlayer?.(r.playerId) },
      })),
    }
  })

  const g = games.find((x) => String(x.game.id) === activeId) || null
  // the club's logo (Donovan 10-02, logos site-wide); the code rides its title / alt
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={t}><span style={{ display: 'inline-flex', alignItems: 'center' }}><TeamMark sport="nhl" abbr={t} variant="logo" px={18} /></span></Tap>
  const switcherGames = games.map((x) => ({ game_pk: String(x.game.id), away: x.game.away.abbrev, home: x.game.home.abbrev, game_time: x.game.startUtc }))
  const switcherLive = Object.fromEntries(games.filter((x) => stateOf(x) !== 'upcoming').map((x) => [String(x.game.id), { away_score: x.game.away.score, home_score: x.game.home.score }]))

  return (
    <div>
      <PageHeader eyebrow="LAMP · SLATE" title="Slate" theme={C} numFont={NUM_FONT} accent={C.ice}
        note="Every game on the night. Open one for its read, its whole goal board and its two calls." />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading}>‹ Previous day</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading}>Next day ›</NavBtn>
        {shown ? <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11 }}>{fmtDay(shown)}</span> : null}
      </div>
      {data?.season?.stale && <StaleSeasonNote label={data.season.label} opens={data.season.opens} what="per-game stats" />}
      {allGames.length > 0 && (
        <>
          <BoardTopBar query={query} setQuery={setQuery} placeholder="Search skater or team…"
            team={fteam} setTeam={setFteam} teams={[...new Set([...allGames.flatMap((g) => [g.game.away.abbrev, g.game.home.abbrev]), ...(fteam && data ? [fteam] : [])])].sort()} teamLabel="🏒 All teams"
            game={fgame} setGame={setFgame} games={[...(fgame && data && !allGames.some((g) => String(g.game.id) === fgame) ? [{ key: fgame, label: 'Game not on this slate' }] : []), ...allGames.map((g) => ({ key: String(g.game.id), label: `${g.game.away.abbrev} @ ${g.game.home.abbrev}` }))]} gameLabel="All games" />
          <div style={{ height: 10 }} />
          <ViewPills views={[['table', '📊 Table'], ['games', '🏟 Games']]} view={view} setView={setView} accent={C.ice} />
        </>
      )}
      {view === 'table' && all.length > 0 && (
        <>
          <LampProjected items={items} games={all} stale={Boolean(data?.season?.stale)} onOpenTeam={onOpenTeam}
            onOpenGame={(id) => { setHashGame(String(id)); setView('games') }} />
          {/* WEAK SPOTS, MOONSHOT's "★ Weak spots" cards (00Q step 2). */}
          <LampWeakSpots items={items} games={all} onOpenPlayer={onOpenPlayer} />
          <AllGamesTable kept={items} market="GOAL" onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} />
        </>
      )}
      <DelayedBanner error={error} what="the slate" />
      {loading && !data ? <Loading what="the slate" /> : null}
      {data && !allGames.length && <EmptyState title="NO GAMES" note={`No NHL games on ${fmtDay(shown)}. Try the next day.`} />}
      {allGames.length > 0 && !all.length && <EmptyState title="NO GAMES CLEAR THIS FILTER" note="Clear the team or game above." />}

      {view === 'games' && all.length > 0 && (
        <>
          <GameFilterRail value={gfilter} onChange={setGfilter} counts={counts} />
          <SlateStrip sport="nhl" isPhone={isPhone} rememberKey="lamp_games_fold_v1" accent={C.ice} theme={C}
            open={g ? { away: g.game.away.abbrev, home: g.game.home.abbrev } : null} cards={cards} activeId={activeId} onSelect={select}
            legend={<>Puck-drop order. The dial is the game&apos;s best LAMP score; 🔒 locked before puck drop, ◻ still a preview.</>} />
          <GameSwitcher sport="nhl" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.ice} stickyTop="0px" />
        </>
      )}

      {view === 'games' && g && (() => {
        const st = stateOf(g)
        const away = g.game.away.abbrev; const home = g.game.home.abbrev
        const called = g.rows.filter((r) => r.status === 'called').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        const gaOf = (team) => g.rows.find((r) => r.team === team)?.context?.oppGaPg ?? null   // what THIS team's opponent allows
        return (
          <div id="lamp-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.ice} past={st === 'final'}>
              <div style={{ padding: '11px 14px 10px' }}>
                <GameHeaderLine away={teamLink(away)} home={teamLink(home)} past={st === 'final'}>
                  <span style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, color: st === 'live' ? C.ice : C.text3, fontWeight: 800 }}>
                    {st === 'live' ? (g.game.statusLine || 'LIVE') : st === 'final' ? 'FINAL' : timeOf(g)}
                  </span>
                  {st !== 'upcoming' && <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: st === 'live' ? C.ice : C.text2 }}>{teamLink(away)} {g.game.away.score ?? 0}–{g.game.home.score ?? 0} {teamLink(home)}</span>}
                  {st !== 'upcoming' && onOpenGame && <Tap onClick={() => onOpenGame(g.game.id)}><span style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, color: C.ice, fontWeight: 800 }}>box score ›</span></Tap>}
                </GameHeaderLine>
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.game.id} isPhone={isPhone} accent={C.ice} stickyTop="var(--gsw-h, 0px)"
                  badges={{ calls: called.length ? String(called.length) : '' }} />

                <PanelAnchor id="read" gamePk={g.game.id}>
                  {/* THE CALL (2026-10-05): the game's write-up, from this same board game */}
                  <NhlWriteupBlock game={g} onOpenPlayer={onOpenPlayer} />
                  {/* tiles, not sentences (2026-10-04, Donovan: "all these words give me anxiety") */}
                  <FactTiles theme={C} numFont={NUM_FONT} min={104} tiles={[
                    { k: 'THE BOARD', v: g.graded ? 'Graded' : g.locked ? 'Locked' : 'Preview', sub: g.graded ? null : g.locked ? new Date(g.lockedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'not a call yet', tone: g.locked && !g.graded ? C.ice : undefined },
                    { k: 'LINEUPS', v: g.lineupKnown ? 'Posted' : 'Not yet', sub: g.lineupKnown ? 'dressed only' : 'full roster scored' },
                    { k: 'DAYS REST', v: [away, home].map((t) => { const sp = spotOf(g, t, true); return sp?.b2b ? 'B2B' : sp?.rest ?? '—' }).join(' · '), sub: `${away} · ${home}` },
                  ]} note={g.net ? `In net: ${g.net}` : null} />
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', marginBottom: 6 }}>
                    {[[away, home], [home, away]].map(([att, def]) => {
                      const us = spotOf(g, att, true); const them = spotOf(g, def, true)
                      const side = g.rows.filter((r) => r.team === att && r.status !== 'off').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).slice(0, 3)
                      const ga = gaOf(att)
                      return (
                        <div key={att} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '11px 13px', minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>{teamLink(att)} attack <span style={{ color: C.text3, fontWeight: 600, fontFamily: NUM_FONT, fontSize: 11 }}>vs {teamLink(def)} defense</span></div>
                          <FactTiles theme={C} numFont={NUM_FONT} tiles={[
                            { k: `${def} ALLOW`, v: ga != null ? ga.toFixed(2) : null, sub: 'goals a game' },
                            { k: `${att} PP`, v: pct1(us?.ppPct) ? `${pct1(us.ppPct)}%` : null, sub: 'power play' },
                            { k: `${def} PK`, v: pct1(them?.pkPct) ? `${pct1(them.pkPct)}%` : null, sub: 'penalty kill' },
                          ]} />
                          {side.length > 0 && <SubLabel theme={C} numFont={NUM_FONT}>TOP OF THE BOARD</SubLabel>}
                          <div style={{ display: 'grid', gap: 4 }}>
                            {side.map((r) => (
                              <button key={r.playerId} onClick={() => onOpenPlayer?.(r.playerId)} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '6px 9px', borderRadius: 10, border: `1px solid ${r.status === 'called' ? C.ice : C.border}`, background: C.glass, color: C.text, cursor: 'pointer', textAlign: 'left' }}>
                                <b style={{ fontFamily: NUM_FONT, color: r.status === 'called' ? C.ice : C.text2, minWidth: 26 }}>{Math.round(r.score ?? 0)}</b>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                                <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, color: r.status === 'called' ? C.ice : C.text3 }}>{r.status === 'called' ? STATUS_WORD.called : r.pos}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </PanelAnchor>

                <PanelAnchor id="board" gamePk={g.game.id} style={{ marginTop: 14 }}>
                  <GameBoard g={g} market="GOAL" onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />
                </PanelAnchor>

                <PanelAnchor id="calls" gamePk={g.game.id} style={{ marginTop: 14 }}>
                  <SubLabel theme={C} numFont={NUM_FONT}>THE TWO {STATUS_WORD.called} IN THIS GAME · ONE PER TEAM</SubLabel>
                  {called.length
                    ? <LampCards market="GOAL" onOpen={onOpenPlayer} items={called.map((r) => ({ key: String(r.playerId), r, g, rank: r.rank, facts: { ppvpk: ppVsPk(spotOf(g, r.team, true), spotOf(g, r.team, false)), rest: restWord(spotOf(g, r.team, true)) } }))} />
                    : <p style={{ margin: 0, fontSize: 12.5, color: C.text3 }}>No skater in this game has enough NHL games on file to call.</p>}
                </PanelAnchor>
              </div>
            </GameFrame>
          </div>
        )
      })()}
      {view === 'games' && <PrevNextGame sport="nhl" games={games.map((x) => ({ id: String(x.game.id), away: x.game.away.abbrev, home: x.game.home.abbrev }))} activeId={activeId} idOf={(x) => x.id} onGo={select} accent={C.ice} />}
    </div>
  )
}
