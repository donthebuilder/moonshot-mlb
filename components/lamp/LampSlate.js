'use client'
import { Fragment, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { heatOf as heatIn, heatTier, dialInk, leagueHeat } from '../../lib/nhl/slateHeat'
import { useLampBoard, useLampGoalieWeakMany } from '../../lib/nhl/useLamp'
import { useHashFilter } from '../../lib/filterHash'
import { useIsPhone } from '../MobileFold'
import PageHeader from '../PageHeader'
import CalledExport from '../CalledExport'
import Tap from '../Tap'
import GameHeadRow from '../slate/GameHeadRow'
import { Dial } from '../VerdictHero'
import GameSwitcher from '../GameSwitcher'
import { panelPairs, panelSubs, gameSections } from '../../lib/game/sections'
import { ViewPills, GameFilterRail, SlateStrip, GamePanelPills, PanelAnchor, GameFrame, PrevNextGame } from '../slate/SlateParts'
import { CardLockLine } from '../MemberGate'
import { GameBoard, NavBtn, AllGamesTable, spotOf, pct1, restWord, useLampCallGate, lampLocked } from './tabs/Board'
import { overallRanks } from '../../lib/positions'
import LampProjected from './LampProjected'
import LampWeakSpots from './LampWeakSpots'
import NhlH2H from '../h2h/NhlH2H'
import NhlWriteupBlock from './NhlWriteupBlock'
import InjuryOut from '../injuries/InjuryOut'
import { useOutCounts } from '../injuries/InjuryLayer'
import { nameKey } from '../../lib/injuries/lookup'
import BoardTopBar from '../BoardTopBar'
import { LampCards } from './LampCard'
import { expectedClause } from '../../lib/expectedLine'
import { STATUS_WORD } from '../../lib/callStatus'
import { EmptyState, DelayedBanner, Loading, StaleSeasonNote, fmtPuckDrop, zoneAbbrev, shiftDay, fmtDay } from './ui'
import TeamMark from '../TeamMark'
import { nhlNickname } from '../../lib/nhl/teams'
import ShareCardButton from '../card/ShareCardButton'
import GameTotalLine, { GameTotalMark, totalRowFor, useGameTotals } from '../GameTotalLine'
import { shareUrl, slug, stamp } from '../../lib/cards/saveCard'
import { nhlGameAngles, confirmedGoalies } from '../../lib/nhl/gameAngles'
import { pickAngles } from '../../lib/slate/angles'
import { playerHref } from '../../lib/routes'

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

// the pills, their order and their words: lib/game/sections.js (the 'nhl' slate list)
const PANELS = panelPairs('nhl')
const SUBS = panelSubs('nhl')
// The words Donovan asked for. The number is the TEAM model's projected goals (lamp-team-v1, 2026-10-08;
// lib/nhl/teamProj.js, on the board as game.proj): each club's shot volume x shot quality x the other side's
// defence x its goalie, pulled toward the club's own goals a game. A measured projection of a COUNT, never a
// probability; the dial's tooltip says how it is built. It used to be the called skaters' goals a game added up
// (~2.0 a club against ~3.07 scored, correlation with goals 0.02), which is why it was replaced.
const XG_WORDS = 'expected goals' // allow-probability: a projected count of goals from the team model (measured), not a probability
const XG_LABEL = 'Expected goals' // allow-probability: same
const rows1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—')
const sideOf = (g, team) => (g.proj ? (g.game.home.abbrev === team ? g.proj.home : g.proj.away) : null)
const stateOf = (g) => (g.game.state === 'live' ? 'live' : g.game.state === 'final' ? 'final' : 'upcoming')

// each club once and big: logo, score beside it once the game has started
function CardTitle({ g, st }) {
  const a = g.game.away; const h = g.game.home
  const num = (v, dim) => <span style={{ fontSize: 20, fontWeight: 900, color: dim ? C.text3 : C.text }}>{v ?? 0}</span>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <TeamMark sport="nhl" abbr={a.abbrev} variant="logo" px={34} />
      {st === 'upcoming' ? <span style={{ fontSize: 14, color: C.text3, fontWeight: 600 }}>@</span> : <>{num(a.score, (a.score ?? 0) < (h.score ?? 0))}<span style={{ color: C.text3, fontWeight: 600 }}>–</span>{num(h.score, (h.score ?? 0) < (a.score ?? 0))}</>}
      <TeamMark sport="nhl" abbr={h.abbrev} variant="logo" px={34} />
    </span>
  )
}

export default function LampSlate({ date = null, setDate = () => {}, onOpenPlayer, onOpenTeam, onOpenGame }) {
  const { data, error, loading } = useLampBoard(date, 'GOAL')
  const isPhone = useIsPhone()
  const outCounts = useOutCounts('nhl')   // lib/injuries: "3 out" on the game row and the Out pill
  const gameTotals = useGameTotals('nhl')   // each game's own Top Totals row, said on its own game (components/GameTotalLine.js)
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
  // MEMBERS LOCK (components/MemberGate.js): the board's own free taste over every game tonight; null for everyone but a free viewer, and then nothing below changes
  const flatAll = useMemo(() => allGames.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.map((r) => ({ r, g }))), [allGames])
  const gateOf = useLampCallGate(flatAll, overallRanks(flatAll, ({ r, g }) => `${g.game.id}|${r.playerId}`, ({ r }) => r.score ?? 0))
  // THE GAME SURFACES (2026-10-17, Donovan: "the games on the slate page are showing the called picks"): a CALLED skater the viewer may not read is an ordinary ON THE BOARD
  // skater in everything that is about a GAME (the Projected goals "called only" lens and "called goals" sum, the weak-spot flags, the calls list and its count). The
  // tables and boards below keep the raw rows: they carry the gate themselves. null gateOf (members, unknown): the very same arrays.
  const hideRow = (r, g) => r.status === 'called' && lampLocked(gateOf, { _row: r, _g: g })
  const gamesM = gateOf ? all.map((g) => (g.rows.some((r) => hideRow(r, g)) ? { ...g, rows: g.rows.map((r) => (hideRow(r, g) ? { ...r, status: 'board' } : r)) } : g)) : all
  const itemsM = gateOf ? gamesM.filter((g) => !g.noMarketLock).flatMap((g) => g.rows.filter((r) => r.status !== 'off').map((r) => ({ r, g })))
    .filter(({ r }) => (!fteam || r.team === fteam) && (!needle || `${r.name} ${r.team}`.toLowerCase().includes(needle))) : items
  const lead = games.find((g) => stateOf(g) === 'live') || games.find((g) => stateOf(g) === 'upcoming') || games[0] || null
  const activeId = games.some((g) => String(g.game.id) === hashGame) ? hashGame : (lead ? String(lead.game.id) : null)
  const select = (id) => {
    setHashGame(String(id))
    if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('lamp-slate-game')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const bestOf = (g) => (Number.isFinite(g.proj?.total) ? g.proj.total : 0)
  // HEAT against the LEAGUE's spread of game totals (lib/nhl/slateHeat.js leagueHeat; the spread of the model that
  // made the number), not tonight's range: the top quarter of games is hot on any night. Tonight's range only
  // when the board carries no spread; a game with no number reads the middle (no light, no ice).
  const bests = games.map(bestOf).filter((v) => v > 0)
  const lo = Math.min(...bests, Infinity); const hi = Math.max(...bests, 0)
  const heatFor = (g) => {
    const v = bestOf(g)
    if (!(v > 0)) return 0.5
    const dist = data?.projModel?.dist?.[g.proj.source]
    return dist ? leagueHeat(v, dist) ?? 0.5 : heatIn(v, lo, hi)
  }
  const topId = games.reduce((a, g) => (bestOf(g) > (a ? bestOf(a) : -1) ? g : a), null)?.game.id
  const timeOf = (g) => `${fmtPuckDrop(g.game.startUtc)} ${zoneAbbrev()}`

  const dialTitle = (g) => {
    const p = g.proj
    if (!p) return `No ${XG_WORDS} number for this game yet.`
    return `${p.total.toFixed(1)} ${XG_WORDS} in this game: ${g.game.away.abbrev} ${p.away.goals.toFixed(1)} + ${g.game.home.abbrev} ${p.home.goals.toFixed(1)}. `
      + (p.source === 'xg'
        ? "Each club's shots, how good they are, the other side's defense and goalie, pulled toward its goals a game. "
        : "Each club's goals a game and what the other side lets in (the shot history is not in yet). ")
      + 'The ring fills against all games, not just tonight.'
  }
  // BEST ANGLES (Donovan 2026-10-17): one read of the confirmed starters' weak zones for the whole slate (lib/nhl/goalieWeak.js, the write-up's source); no poll.
  // The rows are chosen by matchup and form (lib/nhl/gameAngles.js + lib/slate/angles.js), never by call status; a CALLED skater a non-member may not read is skipped.
  const weakIds = useMemo(() => (view === 'games' ? allGames.flatMap((g) => confirmedGoalies(g).map((x) => x.id)) : []), [allGames, view])
  const weakQ = useLampGoalieWeakMany(weakIds, allGames.find((g) => g.game?.season)?.game?.season || null, view === 'games')
  // one goalie answers as his own block, several as { goalies } (app/api/lamp/goalieweak)
  const goalieWeak = weakQ.data?.goalies || (weakQ.data?.goalie != null ? { [String(weakQ.data.goalie)]: weakQ.data } : null)
  const cards = games.map((g) => {
    const best = bestOf(g)
    const ang = nhlGameAngles({ bg: g, goalieWeak, hrefOf: (id) => playerHref('nhl', id) })
    const angles = pickAngles({ matchup: ang.matchup, form: ang.form, hiddenOf: (c) => c.row?.status === 'called' && lampLocked(gateOf, { _row: c.row, _g: g }) })
      .map((a) => ({ ...a, onClick: () => onOpenPlayer?.(a.pid) }))
    const heat = heatFor(g)
    const st = stateOf(g)
    return {
      large: true,
      id: String(g.game.id), title: <CardTitle g={g} st={st} />, past: st === 'final', heat,
      tooltip: `${g.game.away.abbrev} @ ${g.game.home.abbrev}`,
      dial: { value: best || null, dp: 1, pct: 100 * heat, col: dialInk(heat, C), title: dialTitle(g) },
      band: topId === g.game.id && games.length > 1 ? { icon: '🌋', word: 'MAIN EVENT' } : heatTier(heat) === 'hot' ? { icon: '🔥', word: '' } : heatTier(heat) === 'cold' && games.length > 2 ? { icon: '🧊', word: '' } : null,
      lead: <span title={g.locked ? 'The board locked before puck drop' : g.setting ? 'Setting: the calls can still change until puck drop' : 'A preview until the board locks'}>{g.locked ? '🔒' : '◻'}</span>,
      status: st === 'live' ? { kind: 'live', text: g.game.statusLine || 'LIVE' } : st === 'final' ? { kind: 'final', text: 'FINAL' } : { kind: 'time', text: timeOf(g) },
      extra: (() => {
        const oc = outCounts([g.game.away.abbrev, g.game.home.abbrev]); const base = <span>{expectedClause(XG_WORDS, [[g.game.away.abbrev, g.proj?.away?.goals], [g.game.home.abbrev, g.proj?.home?.goals]])}{oc?.out ? ` · ${oc.out} out` : ''}</span>
        const tr = totalRowFor(gameTotals, g.game.id)
        return tr ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>{base}<GameTotalMark row={tr} /></span> : base
      })(),
      score: null,   // the title carries it: each club once, with its score beside it
      weak: ang.weak, angles,
    }
  })

  const g = games.find((x) => String(x.game.id) === activeId) || null
  // the club's logo (Donovan 10-02, logos site-wide); the code rides its title / alt
  const teamLink = (t) => <Tap onClick={onOpenTeam && (() => onOpenTeam(t))} title={t}><span style={{ display: 'inline-flex', alignItems: 'center' }}><TeamMark sport="nhl" abbr={t} variant="logo" px={40} /></span></Tap>
  const switcherGames = games.map((x) => ({ game_pk: String(x.game.id), away: x.game.away.abbrev, home: x.game.home.abbrev, game_time: x.game.startUtc }))
  const switcherLive = Object.fromEntries(games.filter((x) => stateOf(x) !== 'upcoming').map((x) => [String(x.game.id), { away_score: x.game.away.score, home_score: x.game.home.score }]))

  return (
    <div className="slate-tight phone-slate">
      <PageHeader eyebrow="LAMP · SLATE" title="Slate" theme={C} numFont={NUM_FONT} accent={C.ice}
        note="Tonight’s games, puck drop first." right={<CalledExport sport="nhl" date={shown || null} C={C} NUM_FONT={NUM_FONT} accent={C.ice} />} />
      {/* desktop: day nav + search + team + game + Table|Games on ONE row (app/globals.css .slate-tight); phone: a plain block, unchanged */}
      <div className="slate-bar">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <NavBtn onClick={() => setDate(shiftDay(shown, -1))} disabled={loading} aria-label="Previous day">{isPhone ? '‹' : '‹ Previous day'}</NavBtn>
        <NavBtn onClick={() => setDate(null)} disabled={loading || !date} strong>Tonight</NavBtn>
        <NavBtn onClick={() => setDate(shiftDay(shown, 1))} disabled={loading} aria-label="Next day">{isPhone ? '›' : 'Next day ›'}</NavBtn>
        {shown ? <span className="slate-date" style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 11 }}>{fmtDay(shown)}</span> : null}
      </div>
      {data?.season?.stale && <div className="slate-note"><StaleSeasonNote label={data.season.label} opens={data.season.opens} what="per-game stats" /></div>}
      {allGames.length > 0 && (
        <>
          <BoardTopBar query={query} setQuery={setQuery} placeholder="Search skater or team…"
            team={fteam} setTeam={setFteam} teams={[...new Set([...allGames.flatMap((g) => [g.game.away.abbrev, g.game.home.abbrev]), ...(fteam && data ? [fteam] : [])])].sort()} teamLabel="🏒 All teams"
            game={fgame} setGame={setFgame} games={[...(fgame && data && !allGames.some((g) => String(g.game.id) === fgame) ? [{ key: fgame, label: 'Game not on this slate' }] : []), ...allGames.map((g) => ({ key: String(g.game.id), label: `${g.game.away.abbrev} @ ${g.game.home.abbrev}` }))]} gameLabel="All games" />
          <div style={{ height: 10 }} />
          <ViewPills views={[['table', '📊 Table'], ['games', '🏟 Games']]} view={view} setView={setView} accent={C.ice} />
        </>
      )}
      </div>
      {view === 'table' && all.length > 0 && (
        <>
          <LampProjected items={itemsM} games={gamesM} stale={Boolean(data?.season?.stale)} onOpenTeam={onOpenTeam}
            onOpenGame={(id) => { setHashGame(String(id)); setView('games') }} />
          {/* WEAK SPOTS, MOONSHOT's "★ Weak spots" cards (00Q step 2). */}
          <LampWeakSpots items={itemsM} games={gamesM} onOpenPlayer={onOpenPlayer} />
          <AllGamesTable kept={items} market="GOAL" gateOf={gateOf} onOpenPlayer={onOpenPlayer} onOpenTeam={onOpenTeam} onOpenGame={onOpenGame} />
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
            legend={<>Ring = {XG_WORDS}, from each club&apos;s shots. Best angles: the best matchup against the weak spot, and the hottest shooter. 🔒 locked, ◻ preview.</>} />
          <GameSwitcher sport="nhl" games={switcherGames} activeGame={activeId} onSelect={select} live={switcherLive} accent={C.ice} stickyTop="0px" />
        </>
      )}

      {view === 'games' && g && (() => {
        const st = stateOf(g)
        const away = g.game.away.abbrev; const home = g.game.home.abbrev
        const called = g.rows.filter((r) => r.status === 'called').sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        // the calls a free viewer may read (the free four); the rest are not listed, not counted, and the header says nothing of how many there are
        const shownCalled = called.filter((r) => !hideRow(r, g))
        const gaOf = (team) => g.rows.find((r) => r.team === team)?.context?.oppGaPg ?? null   // what THIS team's opponent allows
        // THE SECTIONS OF THE OPEN GAME, in the registry's order (lib/game/sections.js 'nhl' slate); each id's renderer is below,
        // unchanged from when they were written in place. A section is added with one registry line and one entry here.
        const SECTIONS = {
          read: () => (
                <PanelAnchor id="read" gamePk={g.game.id}>
                  {/* THE CALL (2026-10-05): the game's write-up, from this same board game */}
                  <NhlWriteupBlock game={g} onOpenPlayer={onOpenPlayer} />
                  {/* THE MATCHUP, ONE SMALL TABLE (2026-10-20, Donovan: "make that shorter, especially for the phone"): was a Calls /
                      Lineups tile row and two tall tile blocks per club. Same numbers: each club's xG, its power play
                      against the other's kill, what the other allows a game, its rest; the lock and lineups ride one line. */}
                  <div style={{ fontSize: 12, color: C.text3, fontFamily: NUM_FONT, margin: '0 0 6px' }}>
                    {g.graded ? 'Calls graded' : g.locked ? `Calls locked at ${new Date(g.lockedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Calls not locked, can still change'}
                    {' · '}{g.lineupKnown ? 'lineups posted' : 'lineups not posted'}{g.net ? ` · in net: ${g.net}` : ''}
                  </div>
                  <div style={{ overflowX: 'auto', marginBottom: 6 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, fontFamily: NUM_FONT }}>
                      <thead><tr>{['CLUB', 'xG', 'PP', 'VS PK', 'OPP GA', 'REST'].map((h) => <th key={h} style={{ textAlign: h === 'CLUB' ? 'left' : 'right', padding: '6px 6px', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: C.text3, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                      <tbody>
                        {[[away, home], [home, away]].map(([att, def]) => {
                          const us = spotOf(g, att, true); const them = spotOf(g, def, true)
                          const ga = gaOf(att)
                          const rest = us?.b2b ? 'B2B' : us?.rest != null ? `${us.rest}d` : '—'
                          const td = { textAlign: 'right', padding: '8px 6px', borderBottom: `1px solid ${C.border}`, color: C.text, whiteSpace: 'nowrap' }
                          return (
                            <tr key={att}>
                              <td style={{ ...td, textAlign: 'left' }}><Tap onClick={onOpenTeam && (() => onOpenTeam(att))} title={att}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 900 }}><TeamMark sport="nhl" abbr={att} variant="logo" px={20} />{nhlNickname(att)}</span></Tap></td>
                              <td style={{ ...td, fontWeight: 900 }}>{rows1(sideOf(g, att)?.goals) ?? '—'}</td>
                              <td style={td}>{pct1(us?.ppPct) ? `${pct1(us.ppPct)}%` : '—'}</td>
                              <td style={td}>{pct1(them?.pkPct) ? `${pct1(them.pkPct)}%` : '—'}</td>
                              <td style={td}>{ga != null ? ga.toFixed(2) : '—'}</td>
                              <td style={{ ...td, color: us?.b2b ? C.ice : C.text2 }}>{rest}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </PanelAnchor>
          ),
          board: () => (
                <PanelAnchor id="board" gamePk={g.game.id} style={{ marginTop: 14 }}>
                  <GameBoard g={g} market="GOAL" slate gateOf={gateOf} onOpenPlayer={onOpenPlayer} onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} />
                </PanelAnchor>
          ),
          calls: () => (
                <PanelAnchor id="calls" gamePk={g.game.id} style={{ marginTop: 14 }}>
                  {(shownCalled.length > 0 || called.length === 0) && <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: NUM_FONT, margin: '4px 0 10px' }}>{STATUS_WORD.called} IN THIS GAME{shownCalled.length === called.length ? ' · ONE PER TEAM' : ''}</div>}
                  {shownCalled.length
                    ? <LampCards market="GOAL" onOpen={onOpenPlayer} items={shownCalled.map((r) => ({ key: String(r.playerId), r, g, rank: r.rank, facts: { pp: pct1(spotOf(g, r.team, true)?.ppPct), pk: pct1(spotOf(g, r.team, false)?.pkPct), rest: restWord(spotOf(g, r.team, true)) } }))} />
                    : called.length ? null : <p style={{ margin: 0, fontSize: 13, color: C.text3 }}>No skater in this game has played enough NHL games to be called.</p>}
                  {shownCalled.length < called.length && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 8 }} />}
                </PanelAnchor>
          ),
          out: () => (
                <PanelAnchor id="out" gamePk={g.game.id}>
                  {(() => {
                    const board = new Map(g.rows.map((r) => [`${r.team}|${nameKey(r.name)}`, r]))
                    const find = (e) => board.get(`${e.team}|${nameKey(e.name)}`) || null
                    return (
                      <InjuryOut sport="nhl" clubs={[away, home]} theme={{ C, NUM_FONT, accent: C.ice }} title="Out tonight" openSignal={panel === 'out'}
                        isOurs={(e) => { const r = find(e); return Boolean(r && r.status !== 'off') }}
                        openPlayer={(e) => { const r = find(e); return r && onOpenPlayer ? () => onOpenPlayer(r.playerId) : null }}
                        onOpenTeam={onOpenTeam} />
                    )
                  })()}
                </PanelAnchor>
          ),
          // THE CLUBS' HEAD TO HEAD (2026-10-13, lib/h2h): record, margin, total and meetings of the two clubs over three seasons
          clubs: () => (
                <PanelAnchor id="clubs" gamePk={g.game.id} style={{ marginTop: 14 }}>
                  <NhlH2H a={away} b={home} onOpenTeam={onOpenTeam} />
                </PanelAnchor>
          ),
        }
        return (
          <div id="lamp-slate-game" style={{ scrollMarginTop: 'calc(var(--hdr-h, 0px) + var(--gsw-h, 0px) + 8px)', marginBottom: 20 }}>
            <GameFrame accent={C.ice} past={st === 'final'}>
              {/* ONE ROW (2026-10-21): components/slate/GameHeadRow.js, shared with TUDDY and BUCKETS */}
              <GameHeadRow sport="nhl" away={away} home={home} state={st} score={[g.game.away.score, g.game.home.score]} onOpenTeam={onOpenTeam}
                status={st === 'live' ? (g.game.statusLine || 'LIVE') : st === 'final' ? 'FINAL' : timeOf(g)}
                link={st !== 'upcoming' && onOpenGame ? <Tap onClick={() => onOpenGame(g.game.id)}><span style={{ color: C.ice }}>Box score ›</span></Tap> : null}
                dial={{ value: bestOf(g) || null, dp: 1, pct: 100 * heatFor(g), col: dialInk(heatFor(g), C), title: dialTitle(g), label: 'xG' }}
                share={<ShareCardButton sport="nhl" what="this game" icon url={shareUrl({ kind: 'game', sport: 'nhl', game: g.game.id, date: shown || g.game.date })} filename={`game-${slug(g.game.away.abbrev)}-${slug(g.game.home.abbrev)}_${stamp(shown || g.game.date)}.png`} />} />
              <div style={{ padding: '0 12px' }}>
                {/* THIS GAME'S TOTAL (2026-10-10): the Top Totals row the lock stored for it (the projected goals are the same number) */}
                <GameTotalLine sport="nhl" row={gameTotals?.[String(g.game.id)]} style={{ marginTop: 2, paddingBottom: 6 }} />
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 14px 14px', background: 'rgba(0,0,0,.15)' }}>
                <GamePanelPills panels={PANELS} subs={SUBS} panel={panel} setPanel={setPanel} gamePk={g.game.id} isPhone={isPhone} accent={C.ice} stickyTop="var(--gsw-h, 0px)"
                  badges={{ calls: shownCalled.length && shownCalled.length === called.length ? String(called.length) : '', out: (() => { const oc = outCounts([away, home]); return oc?.out ? String(oc.out) : '' })() }} />

                {gameSections('nhl', 'slate').map((sec) => <Fragment key={sec.id}>{SECTIONS[sec.id]?.()}</Fragment>)}
              </div>
            </GameFrame>
          </div>
        )
      })()}
      {view === 'games' && <PrevNextGame sport="nhl" games={games.map((x) => ({ id: String(x.game.id), away: x.game.away.abbrev, home: x.game.home.abbrev }))} activeId={activeId} idOf={(x) => x.id} onGo={select} accent={C.ice} />}
    </div>
  )
}
