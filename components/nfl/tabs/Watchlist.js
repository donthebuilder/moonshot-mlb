'use client'

import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { oppLabel } from '../../../lib/nfl/oppLabel'
import { matchupTag } from '../../../lib/nfl/dvpSignal'
import { reasonsFor } from '../../../lib/nfl/streaks'
import MatchupBadge from '../MatchupBadge'
import FollowingStrip from '../../FollowingStrip'

// Upgrade prompt, Phase 2: "Watchlist page — needs a real upgrade pass, not
// a refresh — treat as under-built." What was here before was a correct but
// inert grid: pins in whatever order you happened to save them, no sense of
// which one is still worth caring about THIS week. Two signals already exist
// elsewhere on the site and just weren't wired in here:
//   · the TARGET/AVOID matchup tag (lib/nfl/dvpSignal.js, item 40) — is the
//     defense he's about to see actually soft or hard at his role/market.
//   · the streak-board "why look anyway" reason (lib/nfl/streaks.js,
//     reasonsFor) — usage rising, or the bot rating him this week.
// Both were built for other tabs and read straight off data already fetched
// at the dashboard level (matchup, logs) — no new fetch, just new props.
const REASON_WORD = { rising: 'usage rising', bot: 'bot likes him' }

export default function Watchlist({ data, matchup, logs, onPlayerClick }) {
  const { pins, toggle } = useNflWatchlist(data)
  const [gameId, setGameId] = useState('all')
  const byId = useMemo(() => Object.fromEntries((data?.players || []).map((player) => [String(player.player_id), player])), [data])
  const games = useMemo(() => (data?.games || [])
    .filter((game) => pins.some((pin) => pin.game_id === game.game_id))
    .sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0)), [data, pins])
  const liveGames = useMemo(() => games.filter((game) => game.state === 'in'), [games])

  // A pin whose player left the slate used to be dropped here -- so it had
  // no card, so it had no ★, so it could never be removed, while the hero
  // still counted it. It renders now, says it is off the slate, and can go.
  //
  // Real players now also carry their best market, this week's matchup tag
  // for it, and any streak-board reason -- and the whole list sorts by that
  // best score, highest first, instead of pin order. A watchlist someone
  // works through game by game should open on the best play in it, not
  // whichever name happened to get saved first.
  const rows = pins
    .map((pin) => ({ pin, player: byId[String(pin.player_id)] || null }))
    .filter((row) => gameId === 'all' || row.pin.game_id === gameId)
    .map((row) => {
      if (!row.player) return { ...row, markets: [], best: null, score: undefined, sortScore: -Infinity, tag: null, why: null }
      const markets = Object.entries(row.player.scores || {}).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1])
      const [best, raw] = markets[0] || []
      const score = Number.isFinite(raw) ? raw : undefined
      const tag = matchup && best ? matchupTag(matchup, row.player, best) : null
      const reasons = logs && best ? reasonsFor(logs, row.player, best)?.reasons : null
      return { ...row, markets, best, score, sortScore: Number.isFinite(raw) ? raw : -Infinity, tag, why: reasons?.length ? reasons : null }
    })
    .sort((a, b) => b.sortScore - a.sortScore)

  const targetCount = rows.filter((row) => row.tag?.tag === 'TARGET').length

  return <div className="nfl-watch"><section className="nfl-watch-hero"><div><small>YOUR TUDDY BOARD</small><h1>Watchlist</h1><p>Save a player from any card, then work one game at a time. Pins are rebuilt from the fresh slate row, including the game id.</p>{liveGames.length > 0 && <div className="nfl-watch-live"><span className="tuddy-live-dot-sm" aria-hidden="true" />{liveGames.length} pinned game{liveGames.length === 1 ? "" : "s"} live right now</div>}</div><div className="nfl-watch-stats"><strong>{pins.length}<span>PINNED</span></strong>{matchup && <strong className="is-target">{targetCount}<span>TARGET NOW</span></strong>}</div></section><FollowingStrip sport="nfl" liveIds={new Set(Object.keys(byId))} onPlayerClick={(row) => { const player = byId[String(row.id)]; if (player) onPlayerClick?.(player, 'TD') }} />{pins.length > 0 && <div className="nfl-watch-games"><button className={gameId === 'all' ? 'active' : ''} onClick={() => setGameId('all')}>ALL · {pins.length}</button>{games.map((game) => { const count = pins.filter((pin) => pin.game_id === game.game_id).length; return <button key={game.game_id} className={gameId === game.game_id ? 'active' : ''} onClick={() => setGameId(game.game_id)}>{game.away} @ {game.home} · {count}</button>})}</div>}<section className="nfl-watch-grid">{rows.map((row) => { const { pin, player } = row; if (!player) return <article key={pin.player_id} className="is-stale"><div className="nfl-watch-top"><span>{pin.team || '—'}</span><button onClick={() => toggle({ player_id: pin.player_id, name: pin.name })} aria-label={`Remove ${pin.name || 'player'} from watchlist`}>★</button></div><div className="nfl-watch-player" style={{ cursor: 'default' }}><small>{pin.position || ''}{pin.opp ? ` · was vs ${pin.opp}` : ''}</small><h2>{pin.name || pin.player_id}</h2><div><strong style={{ color: C.text3 }}>—</strong><span>NOT ON THIS SLATE</span></div></div><footer>pinned from an earlier slate<span>tap ★ to let him go</span></footer></article>; const grade = gradeFor(row.score); return <article key={player.player_id}><div className="nfl-watch-top"><span>{player.team}</span><button onClick={() => toggle(player)} aria-label={`Remove ${player.name} from watchlist`}>★</button></div><button className="nfl-watch-player" onClick={() => onPlayerClick?.(player, row.best || 'TD')}><small>{player.position} · {oppLabel(player)}</small><h2>{player.name}</h2><div><strong style={{ color: grade.color }}>{Number.isFinite(row.score) ? Math.round(row.score) : '—'}</strong><span>{row.best || 'UNSCORED'} · {grade.label}</span>{row.tag && row.tag.tag !== 'EVEN' && <MatchupBadge matchup={matchup} player={player} market={row.best} />}</div>{row.why && <p className="nfl-watch-why">{row.why.map((r) => REASON_WORD[r]).join(' · ')}</p>}</button><div className="nfl-watch-scores">{row.markets.slice(0, 4).map(([market, value]) => <button key={market} onClick={() => onPlayerClick?.(player, market)}><small>{market}</small><b>{Math.round(value)}</b></button>)}</div><footer>{pin.stale ? 'NOT ON THIS SLATE' : pin.away && pin.home ? `${pin.away} @ ${pin.home}` : 'GAME PENDING'}<span>{pin.stale ? 'pinned from an earlier slate' : pin.kickoff ? new Date(pin.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span></footer></article>})}{!rows.length && <div className="nfl-watch-empty"><span>☆</span><h2>{pins.length ? 'No pins in this game.' : 'Your watchlist is empty.'}</h2><p>Open any player card and tap SAVE TO WATCHLIST. The player will stay attached to this slate and game.</p></div>}</section><style>{`
    .nfl-watch{display:flex;flex-direction:column;gap:11px}.nfl-watch-hero{display:flex;align-items:center;justify-content:space-between;min-height:170px;padding:25px;border:1px solid rgba(45,200,255,.28);border-radius:16px;background:radial-gradient(circle at 85% 10%,rgba(45,200,255,.15),transparent 35%),radial-gradient(circle at 8% 100%,rgba(0,224,164,.12),transparent 38%),${C.bg2}}.nfl-watch-hero small{color:${C.cyan};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}.nfl-watch-hero h1{margin:7px 0 5px;font-size:clamp(32px,5vw,52px);letter-spacing:-.05em}.nfl-watch-hero p{max-width:650px;margin:0;color:${C.text3};font-size:10px;line-height:1.5}.nfl-watch-stats{display:flex;align-items:center;gap:18px}.nfl-watch-stats>strong{display:flex;flex-direction:column;align-items:center;color:${C.green};font:900 46px/1 ${NUM_FONT}}.nfl-watch-stats>strong span{margin-top:5px;color:${C.text3};font-size:8px;letter-spacing:.04em}.nfl-watch-stats>strong.is-target{color:${C.cyan}}.nfl-watch-games{display:flex;gap:5px;overflow-x:auto}.nfl-watch-games button{flex:0 0 auto;padding:8px 11px;border:1px solid ${C.border};border-radius:8px;background:${C.bg2};color:${C.text3};font:800 8px/1 ${NUM_FONT};cursor:pointer}.nfl-watch-games button.active{border-color:${C.green};color:${C.green};background:rgba(0,224,164,.08)}.nfl-watch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:9px}.nfl-watch-grid>article{overflow:hidden;border:1px solid ${C.border};border-radius:12px;background:${C.bg2}}.nfl-watch-grid>article.is-stale{opacity:.7;border-style:dashed}.nfl-watch-top{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid ${C.border}}.nfl-watch-top span{color:${C.green};font:900 9px/1 ${NUM_FONT}}.nfl-watch-top button{border:0;background:transparent;color:${C.yellow};font-size:15px;cursor:pointer}.nfl-watch-player{width:100%;padding:13px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.nfl-watch-player>small{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.nfl-watch-player h2{margin:5px 0 10px;font-size:18px}.nfl-watch-player>div{display:flex;align-items:baseline;gap:7px}.nfl-watch-player strong{font:900 28px/1 ${NUM_FONT}}.nfl-watch-player span{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.nfl-watch-why{margin:0;padding:0 13px 11px;color:${C.cyan};font:800 8px/1.3 ${NUM_FONT}}.nfl-watch-scores{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid ${C.border}}.nfl-watch-scores button{min-height:49px;border:0;border-right:1px solid ${C.border};background:rgba(255,255,255,.02);color:inherit;cursor:pointer}.nfl-watch-scores small,.nfl-watch-scores b{display:block}.nfl-watch-scores small{color:${C.text3};font:700 7px/1 ${NUM_FONT}}.nfl-watch-scores b{margin-top:5px;font:900 11px/1 ${NUM_FONT}}.nfl-watch-grid footer{display:flex;justify-content:space-between;padding:8px 10px;color:${C.text3};font:700 8px/1 ${NUM_FONT};border-top:1px solid ${C.border}}.nfl-watch-empty{grid-column:1/-1;padding:45px 20px;border:1px dashed ${C.border2};border-radius:13px;text-align:center}.nfl-watch-empty span{color:${C.yellow};font-size:30px}.nfl-watch-empty h2{margin:8px 0 5px}.nfl-watch-empty p{margin:0;color:${C.text3};font-size:10px}
    .nfl-watch-live{display:flex;align-items:center;margin-top:9px;color:${C.cyan};font:900 9px/1 ${NUM_FONT};letter-spacing:.04em}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .tuddy-live-dot-sm{display:inline-block;width:5px;height:5px;margin-right:6px;border-radius:50%;background:${C.cyan};box-shadow:0 0 6px ${C.cyan};animation:pulse 2s infinite}
    @media(prefers-reduced-motion:reduce){.tuddy-live-dot-sm{animation:none}}
    @media(max-width:560px){.nfl-watch-hero{align-items:flex-start}.nfl-watch-stats{gap:12px}.nfl-watch-stats>strong{font-size:30px}.nfl-watch-grid{grid-template-columns:1fr}}
  `}</style></div>
}
