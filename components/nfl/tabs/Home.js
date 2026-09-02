'use client'

import { useMemo } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import FollowingStrip from '../../FollowingStrip'
import NflTeamMark from '../../fantasy/NflTeamMark'
import TeamPower from '../TeamPower'
import StartSit from '../StartSit'

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

function kickoff(game) {
  if (game.detail) return game.detail
  if (!game.kickoff) return 'TBD'
  try {
    return new Date(game.kickoff).toLocaleString('en-US', {
      weekday: 'short', hour: 'numeric', minute: '2-digit',
    })
  } catch { return 'TBD' }
}

function PanelTitle({ eyebrow, title, action, onAction }) {
  return (
    <div className="tuddy-panel-title">
      <div><small>{eyebrow}</small><h2>{title}</h2></div>
      {action && <button onClick={onAction}>{action} →</button>}
    </div>
  )
}

function SlateStrip({ games }) {
  if (!games.length) return null
  return (
    <div className="tuddy-slate-strip" aria-label="NFL slate">
      {games.map((game) => {
        const live = game.state === 'in'
        const done = game.completed || game.state === 'post'
        return (
          <div key={game.game_id} className={live ? 'is-live' : ''}>
            <span>{live ? '● LIVE' : done ? 'FINAL' : kickoff(game)}</span>
            <b>{game.away} <i>{live || done ? number(game.away_score) : '@'}</i> {game.home}</b>
            {(live || done) && <em>{number(game.home_score)}</em>}
          </div>
        )
      })}
    </div>
  )
}

function TheSix({ picks, playersById, onPlayerClick, onPicks }) {
  const calls = SIX.map(([key, short, label]) => {
    const block = picks?.card?.[key]
    const call = block?.rungs?.[0]
    return { key, short, label, block, call, player: call ? playersById[String(call.player_id)] : null }
  })

  return (
    <section className="tuddy-six">
      <div className="tuddy-six-head">
        <div><small>THE HEADLINE CARD</small><h2>The Six</h2><p>Six points. Six markets. One called shot in each. Scores are league rankings, 0–100 — not probabilities.</p></div>
        <button onClick={onPicks}>Open the full card →</button>
      </div>
      <div className="tuddy-six-grid">
        {calls.map(({ key, short, label, block, call, player }, index) => {
          const color = MARKET_COLOR()[key]
          const grade = gradeFor(call?.score)
          return (
            <button key={key} onClick={() => player && onPlayerClick?.(player, key)} disabled={!player}
                    style={{ '--market': color }}>
              <span className="tuddy-six-number">0{index + 1}</span>
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
      <PanelTitle eyebrow="BUILDS AS GAMES PLAY" title="Touchdown ledger" />
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
      <PanelTitle eyebrow="BEFORE IT HAPPENS" title="The Look-Out" />
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
      <PanelTitle eyebrow="FROM THIS SLATE'S DATA" title="Angles worth opening" />
      <div>{rows.map((row, index) => <article key={row.label}><span>0{index + 1}</span><div><small>{row.label}</small><b>{row.player.name}</b><p>{row.player.team} vs {row.player.opp} · published rate {row.value}</p></div></article>)}</div>
    </section>
  )
}

function MiniBoard({ market, title, players, onPlayerClick, onBoards }) {
  const rows = [...players].filter((player) => Number.isFinite(player.scores?.[market]) && !player.low_sample)
    .sort((a, b) => b.scores[market] - a.scores[market]).slice(0, 10)
  return (
    <section className="tuddy-mini-board">
      <PanelTitle eyebrow="POWER RANKINGS" title={title} action="Full board" onAction={onBoards} />
      {rows.map((player, index) => {
        const grade = gradeFor(player.scores[market])
        return <button key={player.player_id} onClick={() => onPlayerClick?.(player, market)}><span>{index + 1}</span><NflTeamMark size={22} team={player.team}/><b>{player.name}</b><em>{player.team} · {player.position}</em><strong style={{ color: grade.color }}>{Math.round(player.scores[market])}</strong></button>
      })}
    </section>
  )
}

export default function Home({ data, picks, results, matchup, logs, onPlayerClick, setTab }) {
  const games = data?.games || []
  const players = data?.players || []
  const playersById = useMemo(() => Object.fromEntries(players.map((player) => [String(player.player_id), player])), [players])
  const live = games.filter((game) => game.state === 'in').length
  const final = games.filter((game) => game.completed || game.state === 'post').length
  const topTd = [...players].filter((player) => Number.isFinite(player.scores?.TD)).sort((a, b) => b.scores.TD - a.scores.TD)[0]
  const greeting = new Date().getHours() < 12 ? 'Good morning.' : new Date().getHours() < 18 ? 'Good afternoon.' : 'Good evening.'

  return (
    <div className="tuddy-home">
      <section className="tuddy-hero">
        <div><small>DASH NETWORK · TUDDY</small><h1>{greeting} Football is on the board.</h1><p>{data?.label || `${data?.mode || 'NFL'} slate`} · every call ranked, every result kept public.</p></div>
        <div className="tuddy-hero-mark"><span>6</span><small>POINTS<br/>ONE TUDDY</small></div>
      </section>

      {/* Following, on the page the week starts on — same reasoning as
          MOONSHOT's Home. A list that outlives the slate should meet you
          rather than wait on a tab you have to remember to open. */}
      <FollowingStrip
        sport="nfl"
        liveIds={new Set(Object.keys(playersById))}
        onPlayerClick={(row) => {
          const player = playersById[String(row.id)]
          if (player) onPlayerClick?.(player, 'TD')
        }}
      />
      <SlateStrip games={games} />
      <section className="tuddy-snapshot">
        <div><small>SLATE</small><strong>{games.length}</strong><span>games</span></div>
        <div><small>STATE</small><strong>{live || final}</strong><span>{live ? 'live now' : final ? 'final' : 'awaiting kickoff'}</span></div>
        <div><small>PLAYER POOL</small><strong>{players.length}</strong><span>scored names</span></div>
        <button onClick={() => topTd && onPlayerClick?.(topTd, 'TD')}><small>TOP TD SCORE</small><strong>{topTd ? Math.round(topTd.scores.TD) : '—'}</strong><span>{topTd?.name || 'awaiting slate'}</span></button>
      </section>
      <TheSix picks={picks} playersById={playersById} onPlayerClick={onPlayerClick} onPicks={() => setTab('picks')} />
      {/* ── POWER RANKINGS + START/SIT (2026-09-01) ─────────────────────
          The two things a fresh football user asked for and the site did
          not have as such: the 32 TEAMS ranked, and a two-name compare.
          Both on this page, no new tab — see components/nfl/TeamPower.js
          and StartSit.js. */}
      <TeamPower players={players} statSeason={data?.stat_season} onPlayerClick={onPlayerClick} />
      <StartSit players={players} onPlayerClick={onPlayerClick} />
      <div className="tuddy-home-split"><TouchdownLedger results={results} playersById={playersById}/><LookOut matchup={matchup} games={games} logs={logs} players={players}/></div>
      <Angles players={players} matchup={matchup}/>
      <div className="tuddy-board-split"><MiniBoard market="TD" title="Top 10 · Anytime TD" players={players} onPlayerClick={onPlayerClick} onBoards={() => setTab('boards')}/><MiniBoard market="REC_YDS" title="Top 10 · Receiving" players={players} onPlayerClick={onPlayerClick} onBoards={() => setTab('boards')}/></div>
      <section className="tuddy-receipts"><div><small>ACCOUNTABILITY IS THE PRODUCT</small><h2>Every call gets a receipt.</h2><p>The public record keeps the hits, the misses, the voids, and the bar each market had to clear.</p></div><button onClick={() => setTab('accountability')}>Open the receipts →</button></section>
      <style>{`
        .tuddy-home{display:flex;flex-direction:column;gap:12px}.tuddy-hero{position:relative;display:flex;align-items:center;justify-content:space-between;min-height:220px;padding:28px;border:1px solid rgba(34,197,94,.32);border-radius:18px;overflow:hidden;background:radial-gradient(circle at 82% 18%,rgba(34,211,238,.16),transparent 30%),radial-gradient(circle at 8% 100%,rgba(34,197,94,.14),transparent 38%),#101314}.tuddy-hero:after{content:'';position:absolute;inset:auto -8% -44% 42%;height:190px;border:1px solid rgba(34,211,238,.18);border-radius:50%}.tuddy-hero>div:first-child{position:relative;z-index:1}.tuddy-hero small,.tuddy-panel-title small,.tuddy-six-head small{font:900 8px/1 ${NUM_FONT};letter-spacing:.14em;color:${C.green}}.tuddy-hero h1{max-width:760px;margin:10px 0 9px;font-size:clamp(34px,6vw,67px);line-height:.95;letter-spacing:-.06em}.tuddy-hero p{margin:0;color:${C.text2};font-size:12px}.tuddy-hero-mark{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:15px 19px;border:1px solid rgba(34,211,238,.28);border-radius:18px;background:rgba(7,13,12,.66)}.tuddy-hero-mark span{font:900 58px/.8 ${NUM_FONT};color:${C.cyan}}.tuddy-hero-mark small{color:${C.text2};line-height:1.35}.tuddy-slate-strip{display:flex;gap:6px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}.tuddy-slate-strip>div{flex:0 0 150px;padding:9px 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2}}.tuddy-slate-strip>div.is-live{border-color:rgba(34,211,238,.45);box-shadow:inset 0 0 22px rgba(34,211,238,.05)}.tuddy-slate-strip span{display:block;color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-slate-strip .is-live span{color:${C.cyan}}.tuddy-slate-strip b{display:inline-block;margin-top:6px;color:${C.text};font:900 10px/1 ${NUM_FONT}}.tuddy-slate-strip b i{color:${C.text3};font-style:normal}.tuddy-slate-strip em{margin-left:5px;color:${C.text};font:900 10px/1 ${NUM_FONT};font-style:normal}.tuddy-snapshot{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tuddy-snapshot>div,.tuddy-snapshot>button{display:flex;flex-direction:column;align-items:flex-start;min-height:84px;padding:12px 14px;border:1px solid ${C.border};border-radius:11px;background:${C.bg2};color:inherit;text-align:left}.tuddy-snapshot>button{cursor:pointer}.tuddy-snapshot small{color:${C.text3};font:900 8px/1 ${NUM_FONT};letter-spacing:.08em}.tuddy-snapshot strong{margin-top:7px;color:${C.green};font:900 24px/1 ${NUM_FONT}}.tuddy-snapshot span{margin-top:5px;color:${C.text2};font-size:10px}.tuddy-six{overflow:hidden;border:1px solid rgba(34,197,94,.25);border-radius:16px;background:linear-gradient(155deg,rgba(34,197,94,.06),rgba(34,211,238,.025)),${C.bg2}}.tuddy-six-head{display:flex;align-items:flex-end;justify-content:space-between;padding:19px 20px;border-bottom:1px solid ${C.border}}.tuddy-six-head h2{margin:5px 0 2px;font-size:30px;letter-spacing:-.04em}.tuddy-six-head p{margin:0;color:${C.text3};font-size:10px}.tuddy-six-head button,.tuddy-panel-title button,.tuddy-receipts button{border:0;background:transparent;color:${C.green};font:900 9px/1 ${NUM_FONT};cursor:pointer}.tuddy-six-grid{display:grid;grid-template-columns:repeat(3,1fr)}.tuddy-six-grid>button{position:relative;display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:9px;min-height:94px;padding:14px;border:0;border-right:1px solid ${C.border};border-bottom:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-six-grid>button:disabled{cursor:default}.tuddy-six-grid>button:hover:not(:disabled){background:color-mix(in srgb,var(--market) 7%,transparent)}.tuddy-six-number{color:var(--market);font:900 10px/1 ${NUM_FONT}}.tuddy-six-grid small{display:block;color:var(--market);font:900 8px/1 ${NUM_FONT}}.tuddy-six-grid strong{display:block;margin-top:6px;font-size:13px}.tuddy-six-grid em{display:block;margin-top:4px;color:${C.text3};font-size:9px;font-style:normal}.tuddy-six-score{text-align:center}.tuddy-six-score b{display:block;font:900 20px/1 ${NUM_FONT}}.tuddy-six-score span{font:900 8px/1 ${NUM_FONT}}.tuddy-home-split,.tuddy-board-split{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tuddy-panel,.tuddy-angles,.tuddy-mini-board{padding:15px;border:1px solid ${C.border};border-radius:13px;background:${C.bg2}}.tuddy-panel-title{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px}.tuddy-panel-title h2{margin:5px 0 0;font-size:17px}.tuddy-ledger-total{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(34,211,238,.18);border-radius:10px;background:rgba(34,211,238,.04)}.tuddy-ledger-total strong{color:${C.cyan};font:900 36px/1 ${NUM_FONT}}.tuddy-ledger-total span{color:${C.text3};font-size:9px;line-height:1.4}.tuddy-ledger-list{margin-top:8px}.tuddy-ledger-list>div{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:8px;padding:7px 3px;border-bottom:1px solid ${C.border}}.tuddy-ledger-list span,.tuddy-ledger-list em{color:${C.text3};font:800 8px/1 ${NUM_FONT};font-style:normal}.tuddy-ledger-list b{font-size:11px}.tuddy-ledger-list p,.tuddy-leaks p,.tuddy-milestones p{color:${C.text3};font-size:10px;line-height:1.5}.tuddy-lookout h3{margin:13px 0 6px;color:${C.text2};font:900 9px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase}.tuddy-leaks>div,.tuddy-milestones>div{display:grid;grid-template-columns:44px 1fr auto;gap:7px;padding:6px 0;border-bottom:1px solid ${C.border};align-items:center}.tuddy-leaks b{color:${C.red};font:900 10px/1 ${NUM_FONT}}.tuddy-leaks span,.tuddy-milestones b{font-size:10px}.tuddy-leaks em,.tuddy-milestones em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-milestones>div{grid-template-columns:1fr auto auto}.tuddy-milestones span{color:${C.yellow};font-size:9px}.tuddy-angles>div:last-child{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.tuddy-angles article{display:flex;gap:9px;padding:12px;border:1px solid ${C.border};border-radius:10px;background:rgba(255,255,255,.025)}.tuddy-angles article>span{color:${C.green};font:900 9px/1 ${NUM_FONT}}.tuddy-angles article small{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.tuddy-angles article b{display:block;margin-top:7px;font-size:11px}.tuddy-angles article p{margin:4px 0 0;color:${C.text3};font-size:9px}.tuddy-mini-board>button{display:grid;grid-template-columns:20px 24px 1fr auto 34px;align-items:center;gap:8px;width:100%;padding:7px 4px;border:0;border-top:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}.tuddy-mini-board>button>span{color:${C.text3};font:800 9px/1 ${NUM_FONT}}.tuddy-mini-board>button>b{font-size:11px}.tuddy-mini-board>button>em{color:${C.text3};font:700 8px/1 ${NUM_FONT};font-style:normal}.tuddy-mini-board>button>strong{text-align:right;font:900 13px/1 ${NUM_FONT}}.tuddy-receipts{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border:1px solid rgba(167,139,250,.28);border-radius:14px;background:radial-gradient(circle at 90% 20%,rgba(167,139,250,.11),transparent 35%),${C.bg2}}.tuddy-receipts small{color:${C.purple};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em}.tuddy-receipts h2{margin:6px 0 4px;font-size:21px}.tuddy-receipts p{margin:0;color:${C.text3};font-size:10px}.tuddy-receipts button{color:${C.purple}}
        @media(max-width:800px){.tuddy-hero{min-height:190px;padding:22px}.tuddy-hero-mark{display:none}.tuddy-snapshot{grid-template-columns:1fr 1fr}.tuddy-six-grid{grid-template-columns:1fr 1fr}.tuddy-home-split,.tuddy-board-split{grid-template-columns:1fr}.tuddy-angles>div:last-child{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.tuddy-hero h1{font-size:36px}.tuddy-six-grid{grid-template-columns:1fr}.tuddy-six-head{align-items:flex-start;gap:12px}.tuddy-six-head button{max-width:90px}.tuddy-angles>div:last-child{grid-template-columns:1fr}.tuddy-receipts{align-items:flex-start;gap:16px}.tuddy-receipts button{max-width:90px}.tuddy-leaks>div,.tuddy-milestones>div{grid-template-columns:42px 1fr}.tuddy-leaks em,.tuddy-milestones em{grid-column:2}}
      `}</style>
    </div>
  )
}
