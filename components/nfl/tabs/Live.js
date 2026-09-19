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
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { lineFor, marketValue } from '../../../lib/nfl/liveSlate'
import { nextKickoff } from '../../../lib/nfl/liveMerge'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { useFollowing } from '../../../lib/dash/follow'
import SlateRibbon from '../SlateRibbon'
import PageHeader from '../../PageHeader'
import DenseTable from '../../DenseTable'
import { FilterBar, FilterPill, FilterSearch, FilterSelect } from '../../Filters'

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
      <span className="tl-rung-num" style={{ color: col }}>{v === null ? '—' : <>{v}<small>/ {Number.isFinite(bar) ? bar : '?'}</small></>}</span>
      <span className={`tl-rung-bar${v === null ? ' is-idle' : ''}`}>{v !== null && <i style={{ width: `${pct * 100}%`, background: col }} />}</span>
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

  // One watchlist hook for the whole page -- YOUR NAMES reads its pins, the
  // full board below reads isPinned/toggle off the same instance.
  const watch = useNflWatchlist(data)
  const { pins } = watch
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

  // ── THE FULL BOARD (2026-09-19) ────────────────────────────────────────
  // MOONSHOT's Live page has always ended with a sortable table of every
  // hitter on the slate, not just the ones on the card -- that is where you
  // look when the name you care about was never a designated pick. TUDDY's
  // Live had game tiles and the card's own rungs and nothing else, so a
  // player off the card was invisible here however live his game was.
  //
  // Nothing new is fetched: the score comes from the same slate payload every
  // other board reads, and the live value comes from lineFor()/marketValue()
  // on the same snapshot the rungs above already use. Same rungStatus() too,
  // so a row on this table and a rung on the card can never disagree about
  // whether something cleared.
  const boardWatch = watch
  const marketList = useMemo(
    () => (data?.markets || []).filter((m) => Number.isFinite(Number(m.bar))),
    [data],
  )
  const [boardMarket, setBoardMarket] = useState('TD')
  const [boardQuery, setBoardQuery] = useState('')
  const [boardTeam, setBoardTeam] = useState('all')
  const [boardWatched, setBoardWatched] = useState(false)

  const boardTeams = useMemo(() => {
    const counts = {}
    for (const p of players) if (p.team) counts[p.team] = (counts[p.team] || 0) + 1
    return [
      { key: 'all', label: 'All teams', count: players.length },
      ...Object.keys(counts).sort().map((k) => ({ key: k, label: k, count: counts[k] })),
    ]
  }, [players])

  const boardRows = useMemo(() => {
    const needle = boardQuery.trim().toLowerCase()
    const bar = bars[boardMarket]
    return players
      .filter((p) => Number.isFinite(p.scores?.[boardMarket]))
      .filter((p) => boardTeam === 'all' || p.team === boardTeam)
      .filter((p) => !needle || String(p.name || '').toLowerCase().includes(needle))
      .filter((p) => !boardWatched || boardWatch.isPinned(p.player_id))
      .map((p) => {
        const game = gameByTeam.get(p.team)
        const line = live ? lineFor(live, p) : null
        const st = rungStatus(game, line, boardMarket, bar)
        const v = line ? marketValue(line, boardMarket) : null
        return {
          _raw: p,
          watched: boardWatch.isPinned(p.player_id) ? 1 : 0,
          name: p.name,
          pos: p.position,
          team: p.team,
          opp: p.opp || '—',
          score: Math.round(p.scores[boardMarket]),
          live: v === null ? null : v,
          bar: Number.isFinite(bar) ? bar : null,
          status: st.word,
          _state: st.state,
        }
      })
      .sort((a, b) => (b.live ?? -1) - (a.live ?? -1) || b.score - a.score)
  }, [players, boardMarket, boardTeam, boardQuery, boardWatched, boardWatch, gameByTeam, live, bars])

  const boardColumns = useMemo(() => ([
    { key: 'watched', label: '☆', action: true, w: 28, mark: '★', markOff: '☆',
      titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist',
      onAction: (row) => boardWatch.toggle(row) },
    { key: 'name', label: 'Player', w: 150, heat: false, sticky: true },
    { key: 'pos', label: 'POS', w: 40, heat: false },
    { key: 'team', label: 'TM', w: 40, heat: false },
    { key: 'opp', label: 'OPP', w: 46, heat: false },
    { key: 'score', label: 'SCORE', w: 56, dp: 0 },
    { key: 'live', label: 'LIVE', w: 52, dp: 1, heat: false,
      fmt: (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(Number.isInteger(Number(v)) ? 0 : 1)) },
    { key: 'bar', label: 'BAR', w: 46, dp: 1, heat: false, fmt: (v) => (v === null ? '—' : v) },
    { key: 'status', label: 'STATUS', w: 96, heat: false },
  ]), [boardWatch])

  const plays = useMemo(() => {
    const names = new Set([...card.flatMap((b) => (b.rungs || []).slice(0, depth).map((r) => r.name)), ...yours.map((p) => p.name)])
    return [...(live?.plays || [])].reverse().map((p) => ({ ...p, mine: [...names].some((n) => n && p.text && p.text.includes(n.split(' ').slice(-1)[0])) }))
  }, [live, card, depth, yours])

  return (
    <div className="tl">
      <PageHeader
        eyebrow="TUDDY · LIVE"
        title={anyLive ? 'The card, live' : anyDone && !next ? 'The week is in' : 'Nothing kicked off yet'}
        note={anyLive
          ? 'Every rung on the card against the bar the bot promised, updated from the league feed every 30 seconds while a game is on.'
          : next ? `Next kickoff ${fmtKick(next.t)} — ${next.game.away} @ ${next.game.home}. The scoreboard wakes up twenty minutes before.`
            : 'Every game on the slate is final. The graded record is on The record; the scores below are the last the feed sent.'}
        theme={C}
        numFont={NUM_FONT}
        accent={C.cyan}
        stats={[
          { value: tally.hit, label: 'CLEARED', tone: C.green },
          { value: tally.live, label: 'LIVE', tone: C.cyan },
          { value: tally.miss, label: 'MISSED', tone: C.red },
        ]}
      />

      {/* The clock first, then the tiles. The ribbon answers when and how
          exposed; the tiles answer what the score is. */}
      {games.length > 0 && <SlateRibbon games={games} picks={picks} onGame={undefined} />}
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
        <div className="tl-title"><div><small>EVERY PLAYER</small><h2>The full board, live</h2></div></div>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          {marketList.map((m) => (
            <FilterPill key={m.key} active={boardMarket === m.key} onClick={() => setBoardMarket(m.key)}
              title={`Bar ${m.bar}`}>
              {m.label}
            </FilterPill>
          ))}
        </div>
        <FilterBar>
          <FilterSearch value={boardQuery} onChange={setBoardQuery} placeholder="Search player…" width={165} />
          <FilterSelect label="Team" value={boardTeam} options={boardTeams} onChange={setBoardTeam} />
        </FilterBar>
        <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }}>Only</span>
          <FilterPill active={boardWatched} onClick={() => setBoardWatched(!boardWatched)} title="Only names on your watchlist.">
            ★ Watchlist
          </FilterPill>
        </div>
        <div style={{ fontSize: 12, color: C.text3, margin: '8px 0 6px', lineHeight: 1.55 }}>
          {boardRows.length} player{boardRows.length === 1 ? '' : 's'} scored in this market — live number against the bar, whether or not he was ever a call.
        </div>
        {boardRows.length > 0 ? (
          <DenseTable
            rows={boardRows}
            columns={boardColumns}
            initialSort="score"
            maxHeight={620}
            maxRows={300}
            onRowClick={(r) => onPlayerClick?.(r._raw, boardMarket)}
            dimRow={(r) => r._raw?.low_sample}
          />
        ) : (
          <div className="tl-empty">
            {boardWatched ? 'None of your starred players are scored in this market.' : 'Nobody is scored in this market on this slate.'}
          </div>
        )}
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
            .tl-board{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
      .tl-game{padding:10px 12px;border:1px solid ${C.border};border-radius:12px;background:${C.bg2}}
      .tl-game.is-live{border-color:rgba(53,205,255,.45);background:linear-gradient(155deg,rgba(53,205,255,.09),${C.bg2} 60%)}
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
      .tl-rung.is-hit{background:rgba(0,245,173,.06)}.tl-rung.is-miss{background:rgba(248,113,113,.05)}
      .tl-rung-rank{color:${C.text3};font:900 10px/1 ${NUM_FONT}}
      .tl-rung-who b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tl-rung-who small{display:block;margin-top:2px;color:${C.text3};font:700 8px/1 ${NUM_FONT}}
      .tl-rung-num{font:900 15px/1 ${NUM_FONT};text-align:right}.tl-rung-num small{margin-left:3px;font-size:9px;color:${C.text3};font-weight:700}
      .tl-rung-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}.tl-rung-bar.is-idle{background:rgba(255,255,255,.02)}.tl-rung-bar i{display:block;height:100%;border-radius:99px;transition:width .4s ease}
      .tl-rung-word{font:800 8px/1.2 ${NUM_FONT};letter-spacing:.04em;text-transform:uppercase;text-align:right}
      .tl-rung-score{font:900 11px/1 ${NUM_FONT};text-align:right}
      .tl-yours{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
      .tl-you{display:flex;flex-direction:column;gap:8px;padding:10px 12px;border:1px solid ${C.border};border-radius:12px;background:${C.bg2};color:inherit;text-align:left;cursor:pointer}
      .tl-you b{font-size:12.5px}.tl-you>div>small{display:block;margin-top:2px;color:${C.text3};font:700 8px/1 ${NUM_FONT}}
      .tl-you-mk{display:flex;flex-wrap:wrap;gap:6px}.tl-you-mk span{display:flex;align-items:baseline;gap:3px;padding:4px 7px;border:1px solid ${C.border};border-radius:7px;font-family:${NUM_FONT}}
      .tl-you-mk small{font-size:7px;font-weight:800;color:${C.text3}}.tl-you-mk b{font-size:12px}.tl-you-mk i{font-style:normal;font-size:8px;color:${C.text3}}
      .tl-plays{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
      .tl-plays li{display:grid;grid-template-columns:38px 62px 70px 1fr;gap:8px;align-items:baseline;padding:8px 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};font-family:${NUM_FONT}}
      .tl-plays li.is-mine{border-color:rgba(0,245,173,.45);background:rgba(0,245,173,.06)}
      .tl-plays span{font-weight:900;font-size:10px;color:${C.green}}.tl-plays em{font-style:normal;font-size:9px;color:${C.text3}}.tl-plays b{font-size:9px;color:${C.cyan}}.tl-plays p{margin:0;font-family:inherit;font-size:11px;color:${C.text2};line-height:1.35}
      .tl-empty{padding:22px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      @media(max-width:640px){.tl-rung{grid-template-columns:16px 1fr 56px 44px 30px;}.tl-rung-word{display:none}.tl-plays li{grid-template-columns:34px 54px 1fr;}.tl-plays b{display:none}}
      `}</style>
    </div>
  )
}
