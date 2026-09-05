'use client'
// 🏈 LIVE — the model grading itself in public, football edition.
//
// The first Live.js (2026-08-24) was retired because Games could carry the
// score. That was the right call for a SCOREBOARD; it was the wrong call for
// the thing MOONSHOT's LiveWire actually is: every designated pick, live,
// against its own bar, while the game is on. Games ranks players by score;
// this page shows, for each rung on the card, where he is RIGHT NOW against
// the number the bot promised, and whether the game has any time left to get
// there. That is the one page a bettor opens on a Sunday.
//
// Everything here is read off the live snapshot (lib/nfl/liveSlate.js) that
// the Wire already polls, overlaid on the slate by lib/nfl/liveMerge.js. The
// bar is the bot's (slate `markets[].bar`), never re-derived. Scoring plays
// come from ESPN's summary, which liveSlate.js was already parsing and no
// page was reading.
//
// Four sections, in the order a Sunday goes: the scoreboard, the card live,
// your names, the plays. When nothing is on it says when something will be
// -- it never shows a wall of dashes.
import { useMemo } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { lineFor, marketValue } from '../../../lib/nfl/liveSlate'
import { nextKickoff } from '../../../lib/nfl/liveMerge'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { useFollowing } from '../../../lib/dash/follow'

const MARKET_SHORT = { TD: 'TD', REC_YDS: 'REC YDS', REC: 'REC', RUSH_YDS: 'RUSH YDS', RUSH_ATT: 'CARRIES', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK PTS' }
const short = (m) => MARKET_SHORT[m] || String(m || '').replace('_', ' ')

const fmtKick = (t) => {
  try { return new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) } catch { return 'TBD' }
}

// Where a rung stands. `state` drives colour and the word; everything else
// is the number and the bar so the row can be read without the word.
function rungStatus(game, line, market, bar) {
  if (!game || game.state === 'pre' || !game.state) return { state: 'pre', word: game?.kickoff ? fmtKick(game.kickoff) : 'pregame' }
  const v = line ? marketValue(line, market) : null
  const over = v !== null && Number.isFinite(bar) && v >= bar
  if (game.completed || game.state === 'post') {
    if (v === null) return { state: 'void', word: 'no line' }
    return over ? { state: 'hit', word: 'CASHED' } : { state: 'miss', word: 'missed' }
  }
  if (v === null) return { state: 'live', word: 'in progress · no stats yet', v: 0 }
  return over ? { state: 'hit', word: 'CLEARED' } : { state: 'live', word: 'live' }
}

const STATE_COLOR = () => ({ hit: C.green, miss: C.red, live: C.cyan, void: C.text3, pre: C.text3 })

function Scoreboard({ games }) {
  const sorted = useMemo(() => {
    const rank = (g) => (g.state === 'in' ? 0 : g.completed || g.state === 'post' ? 2 : 1)
    return [...games].sort((a, b) => rank(a) - rank(b) || Date.parse(a.kickoff || 0) - Date.parse(b.kickoff || 0))
  }, [games])
  return (
    <div className="tl-board">
      {sorted.map((g) => {
        const live = g.state === 'in'
        const done = g.completed || g.state === 'post'
        const pos = g.possession
        return (
          <div key={g.game_id} className={`tl-game${live ? ' is-live' : ''}${g.redZone ? ' is-rz' : ''}`}>
            <div className="tl-game-top">
              <span className="tl-state">{live ? <><i />{g.detail || 'LIVE'}</> : done ? 'FINAL' : fmtKick(g.kickoff)}</span>
              {live && pos && <span className="tl-pos">{pos} ball{g.downDistance ? ` · ${g.downDistance}` : ''}{g.redZone ? ' · RED ZONE' : ''}</span>}
            </div>
            <div className="tl-score">
              <span className={pos === g.away ? 'has-ball' : ''}>{g.away}</span>
              <b>{live || done ? (g.away_score ?? 0) : ''}</b>
              <em>{live || done ? '–' : '@'}</em>
              <b>{live || done ? (g.home_score ?? 0) : ''}</b>
              <span className={pos === g.home ? 'has-ball' : ''}>{g.home}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RungRow({ rung, player, game, line, market, bar, onPlayerClick }) {
  const st = rungStatus(game, line, market, bar)
  const col = STATE_COLOR()[st.state]
  const v = line ? marketValue(line, market) : null
  const pct = Number.isFinite(bar) && bar > 0 && v !== null ? Math.min(1, v / bar) : 0
  const grade = gradeFor(rung.score)
  return (
    <button type="button" className={`tl-rung is-${st.state}`} onClick={() => player && onPlayerClick?.(player, market)} disabled={!player}>
      <span className="tl-rung-rank">{rung.rank}</span>
      <span className="tl-rung-who"><b>{rung.name}</b><small>{rung.team} · {rung.position}{game ? ` · ${game.away} @ ${game.home}` : ''}</small></span>
      <span className="tl-rung-num" style={{ color: col }}>{v === null ? '—' : v}<small>/ {Number.isFinite(bar) ? bar : '?'}</small></span>
      <span className="tl-rung-bar"><i style={{ width: `${pct * 100}%`, background: col }} /></span>
      <span className="tl-rung-word" style={{ color: col }}>{st.word}</span>
      <span className="tl-rung-score" style={{ color: grade.color }}>{Math.round(rung.score)}</span>
    </button>
  )
}

export default function Live({ data, picks, live, onPlayerClick, setTab }) {
  const games = data?.games || []
  const players = data?.players || []
  const byId = useMemo(() => new Map(players.map((p) => [String(p.player_id), p])), [players])
  const bars = useMemo(() => Object.fromEntries((data?.markets || []).map((m) => [m.key, Number(m.bar)])), [data])
  const gameByTeam = useMemo(() => {
    const m = new Map()
    games.forEach((g) => { m.set(g.home, g); m.set(g.away, g) })
    return m
  }, [games])

  const { pins } = useNflWatchlist(data)
  const { rows: followed } = useFollowing('nfl')
  const yours = useMemo(() => {
    const seen = new Map()
    pins.forEach((pin) => { const p = byId.get(String(pin.player_id)); if (p) seen.set(String(p.player_id), p) })
    followed.forEach((row) => { const p = byId.get(String(row.id)); if (p) seen.set(String(p.player_id), p) })
    return [...seen.values()]
  }, [pins, followed, byId])

  const anyLive = games.some((g) => g.state === 'in')
  const anyDone = games.some((g) => g.completed || g.state === 'post')
  const next = nextKickoff(games)
  const card = Object.values(picks?.card || {})
  const depth = Number(picks?.depth) || 5

  const tally = useMemo(() => {
    let hit = 0, miss = 0, liveN = 0
    for (const block of card) {
      for (const rung of (block.rungs || []).slice(0, depth)) {
        const game = gameByTeam.get(rung.team)
        const line = live ? lineFor(live, rung) : null
        const st = rungStatus(game, line, block.key, bars[block.key]).state
        if (st === 'hit') hit++
        else if (st === 'miss') miss++
        else if (st === 'live') liveN++
      }
    }
    return { hit, miss, live: liveN }
  }, [card, depth, gameByTeam, live, bars])

  const plays = useMemo(() => {
    const names = new Set([...card.flatMap((b) => (b.rungs || []).slice(0, depth).map((r) => r.name)), ...yours.map((p) => p.name)])
    return [...(live?.plays || [])].reverse().map((p) => ({ ...p, mine: [...names].some((n) => n && p.text && p.text.includes(n.split(' ').slice(-1)[0])) }))
  }, [live, card, depth, yours])

  return (
    <div className="tl">
      <section className="tl-hero">
        <div>
          <small>TUDDY · LIVE</small>
          <h1>{anyLive ? 'The card, live' : anyDone && !next ? 'The week is in' : 'Nothing kicked off yet'}</h1>
          <p>{anyLive
            ? 'Every rung on the card against the bar the bot promised, updated from the league feed every 30 seconds while a game is on.'
            : next ? `Next kickoff ${fmtKick(next.t)} — ${next.game.away} @ ${next.game.home}. The scoreboard wakes up twenty minutes before.`
              : 'Every game on the slate is final. The graded record is on The record; the scores below are the last the feed sent.'}</p>
        </div>
        <div className="tl-tally">
          <span style={{ color: C.green }}><b>{tally.hit}</b>cleared</span>
          <span style={{ color: C.cyan }}><b>{tally.live}</b>live</span>
          <span style={{ color: C.red }}><b>{tally.miss}</b>missed</span>
        </div>
      </section>

      {games.length ? <Scoreboard games={games} /> : <div className="tl-empty">No games on the slate yet.</div>}

      <section>
        <div className="tl-title"><div><small>THE CARD</small><h2>Every rung, against its bar</h2></div>{setTab && <button onClick={() => setTab('picks')}>Picks →</button>}</div>
        {!card.length && <div className="tl-empty">The bot hasn't published a card for this week.</div>}
        <div className="tl-blocks">
          {card.map((block) => (
            <div key={block.key} className="tl-block">
              <header><b>{block.label || short(block.key)}</b><small>bar {Number.isFinite(bars[block.key]) ? bars[block.key] : block.bar}</small></header>
              {(block.rungs || []).slice(0, depth).map((rung) => (
                <RungRow key={`${block.key}:${rung.player_id}`} rung={rung} player={byId.get(String(rung.player_id))}
                  game={gameByTeam.get(rung.team)} line={live ? lineFor(live, rung) : null}
                  market={block.key} bar={bars[block.key]} onPlayerClick={onPlayerClick} />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="tl-title"><div><small>YOUR NAMES</small><h2>Pinned and followed</h2></div>{setTab && <button onClick={() => setTab('watchlist')}>Watchlist →</button>}</div>
        {!yours.length && <div className="tl-empty">Star a player from any card and his live line shows here.</div>}
        <div className="tl-yours">
          {yours.map((p) => {
            const game = gameByTeam.get(p.team)
            const line = live ? lineFor(live, p) : null
            const markets = Object.keys(p.scores || {}).filter((m) => Number.isFinite(bars[m]))
            return (
              <button type="button" key={p.player_id} className="tl-you" onClick={() => onPlayerClick?.(p, markets[0] || 'TD')}>
                <div><b>{p.name}</b><small>{p.team} · {p.position}{game ? ` · ${game.state === 'in' ? game.detail || 'LIVE' : game.completed ? 'FINAL' : fmtKick(game.kickoff)}` : ''}</small></div>
                <div className="tl-you-mk">
                  {markets.map((m) => {
                    const st = rungStatus(game, line, m, bars[m])
                    const v = line ? marketValue(line, m) : null
                    return <span key={m} style={{ color: STATE_COLOR()[st.state] }}><small>{short(m)}</small><b>{v === null ? '—' : v}</b><i>/{bars[m]}</i></span>
                  })}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section>
        <div className="tl-title"><div><small>JUST NOW</small><h2>Scoring plays</h2></div></div>
        {!plays.length && <div className="tl-empty">{anyLive ? 'No scores yet.' : 'Plays show here while games are on.'}</div>}
        <ol className="tl-plays">
          {plays.slice(0, 40).map((p, i) => (
            <li key={`${p.game_id}:${i}`} className={p.mine ? 'is-mine' : ''}>
              <span>{p.team}</span><em>Q{p.quarter ?? '?'} {p.clock || ''}</em><b>{p.type}</b><p>{p.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <style>{`
      .tl{display:flex;flex-direction:column;gap:14px}
      .tl-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;border:1px solid rgba(34,211,238,.28);border-radius:16px;background:radial-gradient(circle at 88% 8%,rgba(34,211,238,.16),transparent 36%),radial-gradient(circle at 6% 100%,rgba(34,197,94,.12),transparent 40%),${C.bg2}}
      .tl-hero small{color:${C.cyan};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}
      .tl-hero h1{margin:7px 0 5px;font-size:clamp(26px,4.5vw,44px);letter-spacing:-.04em}
      .tl-hero p{max-width:620px;margin:0;color:${C.text3};font-size:10.5px;line-height:1.5}
      .tl-tally{display:flex;gap:14px;flex-shrink:0}
      .tl-tally span{display:flex;flex-direction:column;align-items:center;font:800 8px/1 ${NUM_FONT};letter-spacing:.08em;text-transform:uppercase}
      .tl-tally b{font-size:30px;margin-bottom:5px}
      .tl-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
      .tl-game{padding:10px 12px;border:1px solid ${C.border};border-radius:12px;background:${C.bg2}}
      .tl-game.is-live{border-color:rgba(34,211,238,.45);background:linear-gradient(155deg,rgba(34,211,238,.09),${C.bg2} 60%)}
      .tl-game.is-rz{border-color:${C.yellow};box-shadow:0 0 0 1px rgba(250,204,21,.25)}
      .tl-game-top{display:flex;justify-content:space-between;gap:6px;margin-bottom:6px;font:800 9px/1 ${NUM_FONT};color:${C.text3}}
      .tl-state{display:inline-flex;align-items:center;gap:5px}.tl-game.is-live .tl-state{color:${C.cyan}}
      .tl-state i{width:6px;height:6px;border-radius:99px;background:${C.cyan};box-shadow:0 0 6px ${C.cyan}}
      .tl-pos{color:${C.yellow};text-align:right}
      .tl-score{display:grid;grid-template-columns:1fr auto auto auto 1fr;align-items:baseline;gap:8px;font-family:${NUM_FONT}}
      .tl-score span{font-size:12px;font-weight:800;color:${C.text2}}.tl-score span:last-child{text-align:right}
      .tl-score span.has-ball{color:${C.yellow}}
      .tl-score b{font-size:22px;font-weight:900;color:${C.text};min-width:26px;text-align:center}.tl-score em{font-style:normal;color:${C.text3}}
      .tl-title{display:flex;align-items:flex-end;justify-content:space-between;margin:4px 2px 8px}
      .tl-title small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}.tl-title h2{margin:5px 0 0;font-size:17px;letter-spacing:-.02em}
      .tl-title button{border:1px solid ${C.border};border-radius:8px;background:transparent;color:${C.text2};padding:6px 10px;font:800 9px/1 ${NUM_FONT};cursor:pointer}
      .tl-blocks{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:9px}
      .tl-block{border:1px solid ${C.border};border-radius:12px;background:${C.bg2};overflow:hidden}
      .tl-block header{display:flex;justify-content:space-between;align-items:baseline;padding:9px 11px;border-bottom:1px solid ${C.border}}
      .tl-block header b{font-size:12px}.tl-block header small{color:${C.text3};font:800 9px/1 ${NUM_FONT}}
      .tl-rung{display:grid;grid-template-columns:18px 1fr 64px 60px 78px 30px;align-items:center;gap:8px;width:100%;padding:7px 11px;border:0;border-bottom:1px solid ${C.border};background:transparent;color:inherit;text-align:left;cursor:pointer}
      .tl-rung:last-child{border-bottom:0}.tl-rung:disabled{cursor:default;opacity:.7}
      .tl-rung.is-hit{background:rgba(34,197,94,.06)}.tl-rung.is-miss{background:rgba(248,113,113,.05)}
      .tl-rung-rank{color:${C.text3};font:900 10px/1 ${NUM_FONT}}
      .tl-rung-who b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tl-rung-who small{display:block;margin-top:2px;color:${C.text3};font:700 8px/1 ${NUM_FONT}}
      .tl-rung-num{font:900 15px/1 ${NUM_FONT};text-align:right}.tl-rung-num small{margin-left:3px;font-size:9px;color:${C.text3};font-weight:700}
      .tl-rung-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}.tl-rung-bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease}
      .tl-rung-word{font:800 8px/1.2 ${NUM_FONT};letter-spacing:.04em;text-transform:uppercase;text-align:right}
      .tl-rung-score{font:900 11px/1 ${NUM_FONT};text-align:right}
      .tl-yours{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
      .tl-you{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid ${C.border};border-radius:12px;background:${C.bg2};color:inherit;text-align:left;cursor:pointer}
      .tl-you b{font-size:12.5px}.tl-you>div>small{display:block;margin-top:2px;color:${C.text3};font:700 8px/1 ${NUM_FONT}}
      .tl-you-mk{display:flex;flex-wrap:wrap;gap:6px}.tl-you-mk span{display:flex;align-items:baseline;gap:3px;padding:4px 7px;border:1px solid ${C.border};border-radius:7px;font-family:${NUM_FONT}}
      .tl-you-mk small{font-size:7px;font-weight:800;color:${C.text3}}.tl-you-mk b{font-size:12px}.tl-you-mk i{font-style:normal;font-size:8px;color:${C.text3}}
      .tl-plays{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
      .tl-plays li{display:grid;grid-template-columns:38px 62px 70px 1fr;gap:8px;align-items:baseline;padding:8px 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};font-family:${NUM_FONT}}
      .tl-plays li.is-mine{border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.06)}
      .tl-plays span{font-weight:900;font-size:10px;color:${C.green}}.tl-plays em{font-style:normal;font-size:9px;color:${C.text3}}.tl-plays b{font-size:9px;color:${C.cyan}}.tl-plays p{margin:0;font-family:inherit;font-size:11px;color:${C.text2};line-height:1.35}
      .tl-empty{padding:22px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      @media(max-width:640px){.tl-hero{flex-direction:column;align-items:flex-start}.tl-tally b{font-size:22px}.tl-rung{grid-template-columns:16px 1fr 56px 44px 30px;}.tl-rung-word{display:none}.tl-plays li{grid-template-columns:34px 54px 1fr;}.tl-plays b{display:none}}
      `}</style>
    </div>
  )
}
