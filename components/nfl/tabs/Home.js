'use client'

import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import NflYourPlayers from '../NflYourPlayers'
import { useResultsArchive, seasonTotals, grandTotal } from '../../../lib/nfl/resultsArchive'
import { ledgerTotals } from '../../../lib/nfl/myPicks'
import NflTeamMark from '../../fantasy/NflTeamMark'
import TeamPower from '../TeamPower'
import StartSit from '../StartSit'
import Storylines from './Storylines'
import Fold from '../../Fold'
import ScoreRail from '../../ScoreRail'
import { fetchNflLive, lineFor, tdsIn } from '../../../lib/nfl/liveSlate'
import { scheduleFor, slateDay } from '../../../lib/boxscore'
import { setSport } from '../../../lib/sport'
// ONE RAIL, BOTH SPORTS (round 10, 2026-09-17) -- see lib/combinedRail.js's
// own header comment for the full trace. `NflRailTeamMark`/local
// `nflRenderState` (both below, previously) are now `CombinedTeamMark`/
// `combinedRenderState` from there, shared with MOONSHOT's own Home.js
// instead of two copies of the same dispatch logic.
import { toRailGame, toMlbRailGames, mergeGamesSorted, combinedRenderState, CombinedTeamMark } from '../../../lib/combinedRail'
// Shared, sport-agnostic self-scroll hook -- components/Header.js and
// components/nfl/NflHeader.js's ticker both already use it.
// The NFL twin of MOONSHOT Home's buildHeadlines() -- same real signals
// that now also ride TUDDY's own header ticker (2026-09-16).
import NflHeadlineStrip from '../NflHeadlineStrip'
import PageHeader from '../../PageHeader'

const SIX = [
  ['TD', 'ATD', 'Touchdown'],
  ['REC_YDS', 'REC YDS', 'Receiving yards'],
  ['RUSH_YDS', 'RUSH YDS', 'Rushing yards'],
  ['REC', 'REC', 'Receptions'],
  ['PASS_YDS', 'PASS YDS', 'Passing yards'],
  ['KICK_PTS', 'KICK PTS', 'Kicker points'],
]

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const MARKET_COLOR = () => ({
  TD: C.green, REC_YDS: C.cyan, RUSH_YDS: C.blue,
  REC: C.lime, PASS_YDS: C.orange, KICK_PTS: C.yellow,
})

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback

// `kickoff()`, formerly here, was only ever called by the local
// `nflRenderState` this round replaced with the shared `combinedRenderState`
// (lib/combinedRail.js, which carries the exact same weekday/time format) --
// removed rather than left as dead code.

// A SECOND COMPONENT CALLED PanelTitle USED TO LIVE HERE (killed 2026-09-18).
// It took eyebrow/title/action/onAction, while components/ui.js's PanelTitle
// -- the one 18 MOONSHOT pages render -- takes title/sub/right. Two different
// components, one name, one codebase. Both are components/PageHeader.js now;
// `action` is just a button in its `right` slot.
function SectionTitle({ eyebrow, title, action, onAction }) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      theme={C}
      numFont={NUM_FONT}
      accent={C.green}
      right={action ? (
        <button className="tuddy-panel-action" onClick={onAction}>{action} →</button>
      ) : null}
    />
  )
}

function TheSix({ picks, playersById, onPlayerClick, onPicks }) {
  const calls = SIX.map(([key, short, label]) => {
    const block = picks?.card?.[key]
    const call = block?.rungs?.[0]
    return { key, short, label, block, call, player: call ? playersById[String(call.player_id)] : null }
  })

  // THE HEADLINER (Phase 2 parity pass, 2026-09-11). MLB pulls its #1 ranked
  // player out of the board into its own hero treatment everywhere it shows a
  // ranked list -- Home.js's "TONIGHT'S HEADLINER" panel and shareCard.js's
  // ghost-numeral share card both do it. The Six had no equivalent: six equal
  // grid tiles, nothing telling you which of the six is actually the best
  // call tonight. Same language, ported to TUDDY's own palette (green/cyan,
  // not MLB's orange -- see lib/nfl/theme.js) and TUDDY's own ranking unit
  // (best call across six MARKETS, not best player on a board): the single
  // highest-scored call gets pulled out into a hero row with the ghost
  // numeral watermark, the other five stay exactly as the grid below.
  const ranked = calls.filter((c) => c.call).sort((a, b) => (b.call.score || 0) - (a.call.score || 0))
  const headliner = ranked[0]
  const rest = calls.filter((c) => c !== headliner)

  return (
    <section className="tuddy-six">
      <div className="tuddy-six-head">
        <div><small>THE HEADLINE CARD</small><h2>The Six</h2><p>Six points. Six markets. One called shot in each. Scores are league rankings, 0–100 — not probabilities.</p></div>
        <button onClick={onPicks}>Full card →</button>
      </div>
      {headliner && (() => {
        const { key, short, block, call, player } = headliner
        const color = MARKET_COLOR()[key]
        const grade = gradeFor(call.score)
        return (
          <button className="tuddy-six-headliner" onClick={() => player && onPlayerClick?.(player, key)} disabled={!player}
                  style={{ '--market': color }}>
            <span className="tuddy-six-ghost" aria-hidden="true">1</span>
            <span className="tuddy-six-pulse" aria-hidden="true" />
            <div className="tuddy-six-headliner-body">
              <small><span className="tuddy-six-dot" aria-hidden="true" />THE HEADLINER · {short} · BAR {block?.bar ?? '—'}</small>
              <strong>{call.name}</strong>
              <em>{call.team} vs {call.opp} · {call.position}</em>
            </div>
            <div className="tuddy-six-headliner-score">
              <b style={{ color: grade.color }}>{Math.round(call.score)}</b>
              <span style={{ color: grade.color }}>{grade.label}</span>
            </div>
          </button>
        )
      })()}
      <div className="tuddy-six-grid">
        {rest.map(({ key, short, label, block, call, player }) => {
          const color = MARKET_COLOR()[key]
          const grade = gradeFor(call?.score)
          const num = SIX.findIndex((s) => s[0] === key) + 1
          return (
            <button key={key} onClick={() => player && onPlayerClick?.(player, key)} disabled={!player}
                    style={{ '--market': color }}>
              <span className="tuddy-six-number">0{num}</span>
              <div><small>{short} · BAR {block?.bar ?? '—'}</small><strong>{call?.name || 'Awaiting call'}</strong><em>{call ? `${call.team} vs ${call.opp} · ${call.position}` : label}</em></div>
              <div className="tuddy-six-score"><b style={{ color: grade.color }}>{call ? Math.round(call.score) : '—'}</b><span style={{ color: grade.color }}>{call ? grade.label : ''}</span></div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TouchdownLedger({ results, playersById }) {
  const scorers = useMemo(() => Object.entries(results?.lines || {})
    .map(([playerId, line]) => ({ playerId, touchdowns: number(line?.TD), player: playersById[playerId] }))
    .filter((row) => row.touchdowns > 0)
    .sort((a, b) => b.touchdowns - a.touchdowns), [results, playersById])
  const total = scorers.reduce((sum, row) => sum + row.touchdowns, 0)

  return (
    <section className="tuddy-panel">
      <SectionTitle eyebrow="BUILDS AS GAMES PLAY" title="Touchdown ledger" />
      <div className="tuddy-ledger-total"><strong>{total}</strong><span>touchdowns recorded<br/>in the latest graded feed</span></div>
      <div className="tuddy-ledger-list">
        {scorers.slice(0, 8).map((row) => <div key={row.playerId}><NflTeamMark size={26} team={row.player?.team || 'FA'}/><b>{row.player?.name || results?.names?.[row.playerId] || row.playerId}</b><em>{row.touchdowns} TD{row.touchdowns === 1 ? '' : 's'}</em></div>)}
        {!scorers.length && <p>Kickoff hasn’t produced a graded touchdown yet. This ledger fills from the public results feed.</p>}
      </div>
    </section>
  )
}

function defenseLeaks(matchup, games) {
  const slateTeams = new Set(games.flatMap((game) => [game.away, game.home]))
  const season = matchup?.dvp?.season || {}
  return Object.entries(season).filter(([team]) => slateTeams.has(team)).map(([team, roles]) => {
    const vulnerable = Object.entries(roles || {})
      .filter(([, row]) => number(row?.td_rank, 99) <= 8 && number(row?.td) > 0)
      .sort((a, b) => number(a[1].td_rank, 99) - number(b[1].td_rank, 99))[0]
    return vulnerable ? { team, role: vulnerable[0], ...vulnerable[1] } : null
  }).filter(Boolean).sort((a, b) => a.td_rank - b.td_rank).slice(0, 5)
}

function milestoneRows(logs, players) {
  const candidates = []
  players.forEach((player) => {
    const rows = logs?.logs?.[String(player.player_id)]?.log || []
    if (!rows.length) return
    const season = Math.max(...rows.map((row) => number(row.s)))
    const current = rows.filter((row) => number(row.s) === season)
    const totals = current.reduce((out, row) => ({
      td: out.td + number(row.g_td), rec: out.rec + number(row.g_rec),
      recyd: out.recyd + number(row.g_recyd), rushyd: out.rushyd + number(row.g_ruyd),
    }), { td: 0, rec: 0, recyd: 0, rushyd: 0 })
    const options = [
      { value: totals.td, step: 5, max: 2, label: 'touchdowns' },
      { value: totals.rec, step: 50, max: 8, label: 'receptions' },
      { value: totals.recyd, step: 500, max: 75, label: 'receiving yards' },
      { value: totals.rushyd, step: 500, max: 75, label: 'rushing yards' },
    ].map((item) => ({ ...item, next: Math.ceil((item.value + .001) / item.step) * item.step }))
      .map((item) => ({ ...item, away: item.next - item.value }))
      .filter((item) => item.next > 0 && item.away > 0 && item.away <= item.max)
      .sort((a, b) => a.away / a.max - b.away / b.max)[0]
    if (options) candidates.push({ player, season, ...options })
  })
  return candidates.sort((a, b) => a.away / a.max - b.away / b.max).slice(0, 4)
}

function LookOut({ matchup, games, logs, players }) {
  const leaks = useMemo(() => defenseLeaks(matchup, games), [matchup, games])
  const milestones = useMemo(() => milestoneRows(logs, players), [logs, players])
  return (
    <section className="tuddy-panel tuddy-lookout">
      <SectionTitle eyebrow="BEFORE IT HAPPENS" title="The Look-Out" />
      <h3>Defenses leaking touchdowns</h3>
      <div className="tuddy-leaks">
        {leaks.map((row) => <div key={`${row.team}-${row.role}`}><b>{row.team}</b><span>{row.role}</span><em>#{row.td_rank} TD matchup · {number(row.td).toFixed(0)} allowed</em></div>)}
        {!leaks.length && <p>The slate has no top-eight TD matchup flagged in the published defense table.</p>}
      </div>
      <h3>Who needs what</h3>
      <div className="tuddy-milestones">
        {milestones.map((row) => <div key={`${row.player.player_id}-${row.label}`}><b>{row.player.name}</b><span>{Math.round(row.away)} {row.label} from {row.next}</span><em>published {row.season} logs</em></div>)}
        {!milestones.length && <p>Milestones appear when a slate player is close enough to a round number in the published logs.</p>}
      </div>
    </section>
  )
}

function Angles({ players, matchup }) {
  const eligible = players.filter((player) => !player.low_sample)
  const best = (field, label, suffix = '') => eligible
    .filter((player) => Number.isFinite(Number(player.stats?.[field])))
    .sort((a, b) => number(b.stats[field]) - number(a.stats[field]))[0]
    ? ((player) => ({ label, player, value: `${number(player.stats[field]).toFixed(field.includes('%') || field === 'WOPR' ? 3 : 1)}${suffix}` }))
      (eligible.filter((player) => Number.isFinite(Number(player.stats?.[field]))).sort((a, b) => number(b.stats[field]) - number(a.stats[field]))[0])
    : null
  const rows = [
    best('GL', 'Goal-line work'), best('RZ', 'Red-zone volume'),
    best('WOPR', 'Passing-game gravity'), best('AIRYD', 'Air-yards pressure'),
  ].filter(Boolean)
  void matchup
  return (
    <section className="tuddy-angles">
      <SectionTitle eyebrow="FROM THIS SLATE'S DATA" title="Angles worth opening" />
      <div>{rows.map((row, index) => <article key={row.label}><span>0{index + 1}</span><div><small>{row.label}</small><b>{row.player.name}</b><p>{row.player.team} vs {row.player.opp} · published rate {row.value}</p></div></article>)}</div>
    </section>
  )
}

function MiniBoard({ market, title, players, onPlayerClick, onBoards }) {
  const rows = [...players].filter((player) => Number.isFinite(player.scores?.[market]) && !player.low_sample)
    .sort((a, b) => b.scores[market] - a.scores[market]).slice(0, 10)
  return (
    <section className="tuddy-mini-board">
      <SectionTitle eyebrow="POWER RANKINGS" title={title} action="Full board" onAction={onBoards} />
      {rows.map((player, index) => {
        const grade = gradeFor(player.scores[market])
        return <button key={player.player_id} onClick={() => onPlayerClick?.(player, market)}><span>{index + 1}</span><NflTeamMark size={22} team={player.team}/><b>{player.name}</b><em>{player.team} · {player.position}</em><strong style={{ color: grade.color }}>{Math.round(player.scores[market])}</strong></button>
      })}
    </section>
  )
}

export default function Home({ data, picks, results, matchup, logs, onPlayerClick, setTab }) {
  // THE RECORD, ON THE FRONT PAGE (2026-09-05). MOONSHOT's Home leads with
  // "graded x% over N nights"; TUDDY's had a player-pool count in that slot,
  // which nobody bets on. Season to date from the harvested weekly files,
  // and your own week against the bot from the device-local ledger.
  const { archive, keys } = useResultsArchive(results, data?.season)
  const record = grandTotal(seasonTotals(keys.map((k) => archive[k])))
  const [mine, setMine] = useState(null)
  useEffect(() => { try { setMine(ledgerTotals()) } catch { setMine(null) } }, [results?.graded_at])
  const games = data?.games || []
  const players = data?.players || []
  const playersById = useMemo(() => Object.fromEntries(players.map((player) => [String(player.player_id), player])), [players])

  // ── THE SCORE RAIL, FOR REAL (round 5, "shell it out," 2026-09-16) ────────
  // Donovan: "would it be best to full delete the nfl side, or shell it out
  // so we have the same exact components... just branded for nfl and tuddy."
  // ScoreRail (components/ScoreRail.js) is now the ONE score rail both
  // products render -- SlateStrip (removed) was a 20-line placeholder with
  // none of the "does it matter to me" column MOONSHOT's rail has always had.
  //
  // Game list/scores/state come from `games` above (data.games) -- the exact
  // same live-refreshing source the snapshot tiles below already trust for
  // "live"/"final". Whether a designated pick actually CLEARED needs the
  // live per-player STAT LINE, which data.games/data.players don't carry --
  // fetchNflLive() is the shared, TTL-cached snapshot NflYourPlayers and the
  // header ticker already poll on this exact page, so this adds no new
  // fetch, it just reads the same one again.
  const gamesRef = useRef(games)
  useEffect(() => { gamesRef.current = games })
  const nflSnapRef = useRef(null)

  // ONE RAIL, BOTH SPORTS (round 10, 2026-09-17). The NFL half is exactly
  // what this function always built (now via the shared `toRailGame`
  // instead of an inline copy of the same mapping -- lib/combinedRail.js);
  // the MLB half is new, additive, and degrades to an empty list on its own
  // if the fetch fails, same as the NFL half already did -- neither can
  // break the other. `nflSnapRef`'s stash for `nflComputeByGame` below is
  // untouched.
  const nflFetchGames = useCallback(() => {
    const nflList = (gamesRef.current || []).map(toRailGame)
    const nflPromise = fetchNflLive().then((snap) => { nflSnapRef.current = snap; return nflList }).catch(() => nflList)
    const mlbPromise = scheduleFor(slateDay(0)).then(toMlbRailGames).catch(() => [])
    return Promise.all([nflPromise, mlbPromise]).then(mergeGamesSorted)
  }, [])

  // "The bot's picks in that game" -- TUDDY's designated calls are the TD
  // market's rungs (the same ladder Picks/TheSix read), each already carrying
  // its own team, so no name/id join is needed to place one in a game. Real,
  // per-game touchdown clearance from the live snapshot (lineFor/tdsIn), the
  // same rule NflYourPlayers uses for "did he clear a bar" -- not invented
  // here a second time.
  const nflComputeByGame = useCallback(() => {
    const out = new Map()
    const rungs = picks?.card?.TD?.rungs || []
    const rawGames = gamesRef.current || []
    const snap = nflSnapRef.current
    rungs.forEach((r) => {
      const g = rawGames.find((gm) => gm.away === r.team || gm.home === r.team)
      if (!g) return
      const key = g.game_id
      const rec = out.get(key) || { n: 0, ok: 0, live: 0, names: [] }
      rec.n += 1
      const line = snap ? lineFor(snap, { name: r.name, team: r.team }) : null
      const tds = line ? tdsIn(line) : 0
      if (tds > 0) { rec.ok += 1; rec.names.push(`${r.name} TD ✓`) }
      else if (!(g.completed || g.state === 'post')) rec.live += 1
      out.set(key, rec)
    })
    return out
  }, [picks])
  const live = games.filter((game) => game.state === 'in').length
  const final = games.filter((game) => game.completed || game.state === 'post').length
  const topTd = [...players].filter((player) => Number.isFinite(player.scores?.TD)).sort((a, b) => b.scores.TD - a.scores.TD)[0]
  const greeting = new Date().getHours() < 12 ? 'Good morning.' : new Date().getHours() < 18 ? 'Good afternoon.' : 'Good evening.'

  // ── THREE DOORS, TUDDY'S OWN (parity pass, 2026-09-16) ────────────────────
  // MOONSHOT's own Scoreboard/Games/Results triad, same idea, TUDDY's own
  // destinations: lib/routes.js's 2026-09-13 note already establishes
  // Touchdowns as TUDDY's actual "the board" -- the tab that leads the rail
  // the same way MOONSHOT's HR board does -- not the demoted Boards tab.
  const TUDDY_DOORS = [
    { tab: 'touchdowns', icon: '\u{1F3C8}', title: 'The Touchdown Board', color: C.green,
      body: 'Every player on the slate, ranked by anytime-TD score, live once kickoffs land -- the same board Home draws its calls from.' },
    { tab: 'games', icon: '\u{1F3DF}️', title: 'Game by game', color: C.cyan,
      body: "Tonight matchup by matchup: the script, the matchup pressure, and each side's own touchdown board." },
    { tab: 'accountability', icon: '✅', title: 'The record', color: C.purple,
      body: 'Every call graded against its own bar, every week, wins and losses alike -- the record the claim above is drawn from.' },
  ]

  return (
    <div className="tuddy-home">
      <section className="tuddy-hero">
        <div><small>DASH NETWORK · TUDDY</small><h1>{greeting} Football is on the board.</h1><p>{data?.label || `${data?.mode || 'NFL'} slate`} · every call ranked, every result kept public.</p></div>
        <div className="tuddy-hero-mark"><span>6</span><small>POINTS<br/>ONE TUDDY</small></div>
      </section>

      <NflHeadlineStrip players={players} games={games} markets={data?.markets} matchup={matchup}
        onPlayerClick={onPlayerClick} setTab={setTab} />

      {/* ONE RAIL, BOTH SPORTS (round 10, 2026-09-17) -- see lib/combinedRail.js's
          own header comment for the full trace. `computeByGame` stays TUDDY's
          own reducer: this page only has NFL picks data, so an MLB tile here
          shows its real score/state and nothing invented in the picks column. */}
      <ScoreRail
        sport="nfl"
        theme={{ C, NUM_FONT }}
        TeamMark={CombinedTeamMark}
        players={players}
        results={results}
        fetchGames={nflFetchGames}
        computeByGame={nflComputeByGame}
        renderState={combinedRenderState}
        label="This week"
        moreLabel="full box scores →"
        moreTarget="boxscores"
        onNavigate={setTab}
        onSwitchSport={setSport}
      />
      <section className="tuddy-snapshot">
        <div><small>SLATE</small><strong>{games.length}</strong><span>games</span></div>
        <div><small>STATE</small><strong>{live || final}</strong><span>{live ? 'live now' : final ? 'final' : 'awaiting kickoff'}</span></div>
        <button onClick={() => setTab('accountability')}><small>THE RECORD</small><strong style={{ color: record.pct == null ? C.text3 : record.pct >= 55 ? C.green : record.pct < 45 ? C.red : C.text }}>{record.pct == null ? '—' : `${record.pct}%`}</strong><span>{record.n ? `${record.hit}/${record.n} · ${keys.length} wk${keys.length === 1 ? '' : 's'}` : 'nothing graded yet'}</span></button>
        <button onClick={() => topTd && onPlayerClick?.(topTd, 'TD')}><small>TOP TD SCORE</small><strong>{topTd ? Math.round(topTd.scores.TD) : '—'}</strong><span>{topTd?.name || 'awaiting slate'}</span></button>
      </section>
      <TheSix picks={picks} playersById={playersById} onPlayerClick={onPlayerClick} onPicks={() => setTab('picks')} />

      {/* ── STORYLINES, ON THE FRONT PAGE (parity pass, 2026-09-16) ───────
          MOONSHOT's Home embeds Storylines directly, right after The Four —
          not just a tab you have to remember exists. TUDDY had the same
          full Storylines page (components/nfl/tabs/Storylines.js) built
          09-12, never mounted here. Same props Home already has in scope
          (data/logs/results/onPlayerClick/setTab) — nothing new fetched. */}
      <Storylines data={data} logs={logs} results={results} onPlayerClick={onPlayerClick} setTab={setTab} />

      {/* ⭐ YOUR PLAYERS (2026-09-16, parity pass) -- replaces the old
          FollowingStrip mount, and moves to MOONSHOT's own shelf for it:
          right after Storylines, ahead of the accountability claim below.
          Same reason MOONSHOT gave for the same move on 2026-09-03: a
          followed player used to be a name and nothing else; this says what
          he actually did this week. See NflYourPlayers.js's own header for
          why TUDDY only needs ONE store here, not MOONSHOT's two. */}
      <NflYourPlayers players={players} onPlayerClick={onPlayerClick} />

      {/* —— THE MONEY-ANSWER SLOT (parity pass, 2026-09-16) ————————————
          MOONSHOT puts a compact MoneyAnswer right here -- one bordered
          claim, one button through to the full page -- reading a real
          odds_history.json archive of $-return by market. TUDDY keeps no
          NFL equivalent of that archive, and project rule #16 is never
          invent the number that would go in that slot. What TUDDY already
          has for this exact job is this section: a REAL, already-computed
          accuracy record (grandTotal over the harvested weekly files)
          making the same claim -- "here's the receipt for what we said
          would happen" -- measured in hit rate instead of ROI. Repositioned
          into MOONSHOT's slot rather than left at the bottom of the page,
          where it read as an afterthought instead of the answer to the
          claim the hero makes. */}
      <section className="tuddy-receipts"><div><small>ACCOUNTABILITY IS THE PRODUCT</small><h2>Every call gets a receipt.</h2><p>The public record keeps the hits, the misses, the voids, and the bar each market had to clear.{mine?.n ? <> <b style={{ color: C.text2 }}>Your week:</b> {mine.w}–{mine.l}{mine.t ? `–${mine.t}` : ''} on {mine.n} calls{mine.overrides ? `, ${mine.overrides} override${mine.overrides === 1 ? '' : 's'}` : ''} — you {mine.minePct != null && mine.botPct != null ? (mine.minePct > mine.botPct ? 'beat' : mine.minePct < mine.botPct ? 'trail' : 'match') : 'vs'} the bot.</> : null}</p></div><button onClick={() => setTab('accountability')}>Receipts →</button></section>

      {/* —— THREE DOORS (parity pass, 2026-09-16) ————————————————————
          MOONSHOT's own three nav cards, same slot: right after the money
          claim, right before the deep-dive fold. */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {TUDDY_DOORS.map((d) => (
          <button type="button" key={d.tab} onClick={() => setTab(d.tab)} style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            flex: '1 1 240px', minWidth: 0, font: 'inherit', color: 'inherit',
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 13, padding: '13px 15px',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 15 }}>{d.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: d.color }}>{d.title}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: d.color }}>→</span>
            </span>
            <span style={{ display: 'block', fontSize: 12, color: C.text2, lineHeight: 1.55 }}>{d.body}</span>
          </button>
        ))}
      </div>

      {/* —— EVERYTHING ELSE, BEHIND ONE FOLD (parity pass, 2026-09-16;
          moved again the same day to sit after Doors, not before it --
          MOONSHOT's own order is Doors then the "More on tonight" fold, the
          deepest tools last). Donovan, building Fold.js for MOONSHOT: "it's
          a lot going on on this site... I don't want that to happen when
          NFL starts." It happened anyway -- every one of these five
          sections rendered, unconditionally, on every visit, with no
          MLB-side equivalent of "closed by default, still says what it
          holds." Same component (components/Fold.js, sport-agnostic --
          only reads lib/theme's neutral chrome colors, not a sport accent),
          same nested-Fold-inside-a-parent-Fold shape MOONSHOT's own "More
          on tonight" drawer uses. Nothing removed, nothing recomputed
          differently -- every section below is byte-identical to what
          rendered inline before, just closed until tapped open. */}
      <Fold id="tuddy-more" title="••• More on this slate" meta="team power · start/sit · touchdown ledger · the look-out · angles · top 10s">
        <Fold id="tuddy-power" title="📊 Team power rankings" meta="all 32 teams, ranked">
          <TeamPower players={players} statSeason={data?.stat_season} onPlayerClick={onPlayerClick} />
        </Fold>
        <Fold id="tuddy-startsit" title="⚖️ Start/Sit compare" meta="pick two names, see the case for each">
          <StartSit players={players} onPlayerClick={onPlayerClick} />
        </Fold>
        <Fold id="tuddy-lookout" title="🩹 The Look-Out" meta="who's scored · defenses leaking touchdowns · who needs what">
          <div className="tuddy-home-split"><TouchdownLedger results={results} playersById={playersById}/><LookOut matchup={matchup} games={games} logs={logs} players={players}/></div>
        </Fold>
        <Fold id="tuddy-angles" title="📖 Tonight's angles" meta="every line from this slate's own data">
          <Angles players={players} matchup={matchup}/>
        </Fold>
        <Fold id="tuddy-top10" title="📊 Tonight's top 10s" meta="anytime TD · receiving">
          <div className="tuddy-board-split"><MiniBoard market="TD" title="Top 10 · Anytime TD" players={players} onPlayerClick={onPlayerClick} onBoards={() => setTab('boards')}/><MiniBoard market="REC_YDS" title="Top 10 · Receiving" players={players} onPlayerClick={onPlayerClick} onBoards={() => setTab('boards')}/></div>
        </Fold>
      </Fold>

      <style>{`
        .tuddy-home{display:flex;flex-direction:column;gap:12px}.tuddy-hero{position:relative;display:flex;align-items:center;justify-content:space-between;min-height:220px;padding:28px;border:1px solid rgba(0,245,173,.32);border-radius:18px;overflow:hidden;background:radial-gradient(circle at 82% 18%,rgba(53,205,255,.16),transparent 30%),radial-gradient(circle at 8% 100%,rgba(0,245,173,.14),transparent 38%),${C.bg2}}.tuddy-hero:after{content:'';position:absolute;inset:auto -8% -44% 42%;height:190px;border:1px solid rgba(53,205,255,.18);border-radius:50%}.tuddy-hero>div:first-child{position:relative;z-index:1}.tuddy-hero small,.tuddy-six-head small{font:900 8px/1 ${NUM_FONT};letter-spacing:.14em;color:${C.green}}.tuddy-hero h1{max-width:760px;margin:10px 0 9px;font-size:clamp(34px,6vw,67px);line-height:.95;letter-spacing:-.06em}.tuddy-hero p{margin:0;color:${C.text2};font-size:12px}.tuddy-hero-mark{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:15px 19px;border:1px solid rgba(53,205,255,.28);border-radius:18px;background:rgba(7,13,12,.66)}.tuddy-hero-mark span{font:900 58px/.8 ${NUM_FONT};color:${C.cyan}}.tuddy-hero-mark small{color:${C.text2};line-height:1.35}.tuddy-slate-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}.tuddy-slate-strip>div{flex:0 0 150px;padding:9px 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2}}.tuddy-slate-strip>div.is-live{border-color:rgba(53,205,255,.45);box-shadow:inset 0 0 22px rgba(53,205,255,.05)}.tuddy-slate-strip span{display:block;color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-slate-strip .is-live span{color:${C.cyan}}.tuddy-slate-strip b{display:inline-block;margin-top:6px;color:${C.text};font:900 10px/1 ${NUM_FONT}}.tuddy-slate-strip b i{color:${C.text3};font-style:normal}.tuddy-slate-strip em{margin-left:5px;color:${C.text};font:900 10px/1 ${NUM_FONT};font-style:normal}.tuddy-snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tuddy-snapshot>div,.tuddy-snapshot>button{display:flex;flex-direction:column;align-items:flex-start;min-height:84px;padding:12px 14px;border:1px solid ${C.border};border-radius:11px;background:${C.bg2};color:inherit;text-align:left}.tuddy-snapshot>button{cursor:pointer}.tuddy-snapshot small{color:${C.text3};font:900 8px/1 ${NUM_FONT};letter-spacing:.08em}.tuddy-snapshot strong{margin-top:7px;color:${C.green};font:900 24px/1 ${NUM_FONT}}.tuddy-snapshot span{margin-top:5px;color:${C.text2};font-size:10px}.tuddy-six{overflow:hidden;border:1px solid rgba(0,245,173,.25);border-radius:16px;background:linear-gradient(155deg,rgba(0,245,173,.06),rgba(53,205,255,.025)),${C.bg2}}.tuddy-six-head{display:flex;align-items:flex-end;justify-content:space-between;padding:19px 20px;border-bottom:1px solid ${C.border}}.tuddy-six-head h2{margin:5px 0 2px;font-size:30px;letter-spacing:-.04em}.tuddy-six-head p{margin:0;color:${C.text3};font-size:10px}.tuddy-six-head button,.tuddy-panel-action,.tuddy-receipts button{border:0;background:transparent;padding:8px 6px;margin:-8px -6px;color:${C.green};font:900 9px/1 ${NUM_FONT};cursor:pointer}.tuddy-six-grid{display:grid;grid-template-columns:repeat(3,1fr)}.tuddy-six-grid>button{position:relative;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:9px;min-height:94px;padding:14px;border:0;border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-six-grid>button:disabled{cursor:default}.tuddy-six-grid>button:hover:not(:disabled){background:color-mix(in srgb,var(--market) 7%,transparent)}.tuddy-six-number{color:var(--market);font:900 10px/1 ${NUM_FONT}}.tuddy-six-grid small{display:block;color:var(--market);font:900 8px/1 ${NUM_FONT}}.tuddy-six-grid strong{display:block;margin-top:6px;font-size:13px}.tuddy-six-grid em{display:block;margin-top:4px;color:${C.text3};font-size:9px;font-style:normal}.tuddy-six-score{text-align:center}.tuddy-six-score b{display:block;font:900 20px/1 ${NUM_FONT}}.tuddy-six-score span{font:900 8px/1 ${NUM_FONT}}.tuddy-six-headliner{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;gap:16px;width:calc(100% - 40px);margin:14px 20px 0;padding:16px 20px;overflow:hidden;border:1px solid color-mix(in srgb,var(--market) 40%,transparent);border-radius:13px;background:linear-gradient(155deg,color-mix(in srgb,var(--market) 12%,transparent),${C.bg2} 62%);color:inherit;text-align:left;cursor:pointer}.tuddy-six-headliner:disabled{cursor:default}.tuddy-six-ghost{position:absolute;right:6px;top:50%;transform:translateY(-50%);font:900 96px/1 ${NUM_FONT};color:color-mix(in srgb,var(--market) 10%,transparent);pointer-events:none;z-index:0}.tuddy-six-headliner-body{position:relative;z-index:1;min-width:0}.tuddy-six-headliner-body small{display:block;color:var(--market);font:900 9px/1 ${NUM_FONT};letter-spacing:.1em}.tuddy-six-headliner-body strong{display:block;margin-top:6px;font-size:20px;font-weight:900;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tuddy-six-headliner-body em{display:block;margin-top:4px;color:${C.text3};font-size:10.5px;font-style:normal}.tuddy-six-headliner-score{position:relative;z-index:1;text-align:right;flex-shrink:0}.tuddy-six-headliner-score b{display:block;font:900 34px/1 ${NUM_FONT}}.tuddy-six-headliner-score span{font:900 9px/1 ${NUM_FONT}}.tuddy-home-split,.tuddy-board-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tuddy-panel,.tuddy-angles,.tuddy-mini-board{padding:15px;border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.tuddy-ledger-total{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(53,205,255,.18);border-radius:10px;background:rgba(53,205,255,.04)}.tuddy-ledger-total strong{color:${C.cyan};font:900 36px/1 ${NUM_FONT}}.tuddy-ledger-total span{color:${C.text3};font-size:9px;line-height:1.4}.tuddy-ledger-list{margin-top:8px}.tuddy-ledger-list>div{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:8px;padding:7px 3px;border-bottom:1px solid ${C.border}}.tuddy-ledger-list span,.tuddy-ledger-list em{color:${C.text3};font:800 8px/1 ${NUM_FONT};font-style:normal}.tuddy-ledger-list b{font-size:11px}.tuddy-ledger-list p,.tuddy-leaks p,.tuddy-milestones p{color:${C.text3};font-size:10px;line-height:1.5}.tuddy-lookout h3{margin:13px 0 6px;color:${C.text2};font:900 9px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase}.tuddy-leaks>div,.tuddy-milestones>div{display:grid;grid-template-columns:44px 1fr auto;gap:7px;padding:6px 0;border-bottom:1px solid ${C.border};align-items:center}.tuddy-leaks b{color:${C.red};font:900 10px/1 ${NUM_FONT}}.tuddy-leaks span,.tuddy-milestones b{font-size:10px}.tuddy-leaks em,.tuddy-milestones em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-milestones>div{grid-template-columns:1fr auto auto}.tuddy-milestones span{color:${C.yellow};font-size:9px}.tuddy-angles>div:last-child{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tuddy-angles article{display:flex;gap:9px;padding:12px;border:1px solid ${C.border};border-radius:10px;background:rgba(255,255,255,.025)}.tuddy-angles article>span{color:${C.green};font:900 9px/1 ${NUM_FONT}}.tuddy-angles article small{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-angles article b{display:block;margin-top:7px;font-size:11px}.tuddy-angles article p{margin:4px 0 0;color:${C.text3};font-size:9px}.tuddy-mini-board>button{display:grid;grid-template-columns:20px 24px 1fr auto 34px;align-items:center;gap:8px;width:100%;padding:7px 4px;border:0;border-top:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-mini-board>button>span{color:${C.text3};font:800 9px/1 ${NUM_FONT}}.tuddy-mini-board>button>b{font-size:11px}.tuddy-mini-board>button>em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-mini-board>button>strong{text-align:right;font:900 13px/1 ${NUM_FONT}}.tuddy-receipts{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border:1px solid rgba(167,139,250,.28);border-radius:14px;background:radial-gradient(circle at 90% 20%,rgba(167,139,250,.11),transparent 35%),${C.bg2}}.tuddy-receipts small{color:${C.purple};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.tuddy-receipts h2{margin:6px 0 4px;font-size:21px}.tuddy-receipts p{margin:0;color:${C.text3};font-size:10px}.tuddy-receipts button{color:${C.purple}};color:var(--card-col);white-space:nowrap;border:1px solid color-mix(in srgb,var(--card-col) 30%,transparent);background:color-mix(in srgb,var(--card-col) 8%,transparent);border-radius:4px;padding:2px 6px;flex-shrink:0}
        @media(max-width:800px){.tuddy-hero{min-height:190px;padding:22px}.tuddy-six-ghost{font-size:72px}.tuddy-hero-mark{display:none}.tuddy-snapshot{grid-template-columns:1fr 1fr}.tuddy-six-grid{grid-template-columns:1fr 1fr}.tuddy-home-split,.tuddy-board-split{grid-template-columns:1fr}.tuddy-angles>div:last-child{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.tuddy-hero h1{font-size:36px}.tuddy-six-headliner{grid-template-columns:1fr;width:calc(100% - 24px);margin:12px 12px 0;padding:14px}.tuddy-six-headliner-score{text-align:left}.tuddy-six-ghost{display:none}.tuddy-six-grid{grid-template-columns:1fr}.tuddy-six-head{align-items:flex-start;gap:12px}.tuddy-six-head button{max-width:90px}.tuddy-angles>div:last-child{grid-template-columns:1fr}.tuddy-receipts{align-items:flex-start;gap:16px}.tuddy-receipts button{max-width:90px}.tuddy-leaks>div,.tuddy-milestones>div{grid-template-columns:42px 1fr}.tuddy-leaks em,.tuddy-milestones em{grid-column:2}}

        .tuddy-six-dot{display:inline-block;width:6px;height:6px;margin-right:6px;border-radius:50%;background:var(--market);vertical-align:middle;animation:tuddyPulseDot 2s infinite}
        .tuddy-six-pulse{position:absolute;right:38px;top:50%;width:64px;height:64px;margin-top:-32px;border-radius:50%;border:1.5px solid var(--market);opacity:0;pointer-events:none;z-index:0;animation:tuddyPulseRing 2.6s ease-out infinite}
        @keyframes tuddyPulseDot{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes tuddyPulseRing{0%{transform:scale(.55);opacity:.55}100%{transform:scale(1.25);opacity:0}}
        @media(prefers-reduced-motion:reduce){.tuddy-six-dot{animation:none}.tuddy-six-pulse{display:none}}
        @media(max-width:520px){.tuddy-six-pulse{display:none}.tuddy-headline-card{width:200px}}
      `}</style>
    </div>
  )
}
