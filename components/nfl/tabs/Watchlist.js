'use client'

import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import { oppLabel } from '../../../lib/nfl/oppLabel'
import { matchupTag } from '../../../lib/nfl/dvpSignal'
import { reasonsFor } from '../../../lib/nfl/streaks'
import MatchupBadge from '../MatchupBadge'
import NflTable from '../NflTable'
import FollowingStrip from '../../FollowingStrip'
import { discordParts } from '../../../lib/discordText'
import PageHeader from '../../PageHeader'
import TuddyRecentAlerts from '../TuddyRecentAlerts'

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
const REASON_WORD = { rising: 'usage rising', bot: 'bot likes him', finisher: 'finishes in the red zone' }

// ── MOVEMENT SINCE YOU SAVED HIM (2026-09-21) ───────────────────────────────
// Compared ON THE MARKET HE WAS PINNED FOR, not on his current best. If a man
// was saved as a TD play and his REC_YDS score has since overtaken it, the
// honest delta is still the TD one — comparing his old TD number to his new
// REC_YDS number would invent a move that never happened.
function movementOf(pin, player) {
  const from = Number(pin?.pinned_score)
  const market = pin?.pinned_market
  if (!Number.isFinite(from) || !market || !player) return null
  const to = Number(player.scores?.[market])
  if (!Number.isFinite(to)) return { market, from, to: null, delta: null }
  return { market, from, to, delta: Math.round((to - from) * 10) / 10 }
}

const DAY = 86400000
function agoOf(iso) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const days = Math.floor((Date.now() - t) / DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// Export is MOONSHOT's (buildCsv/downloadCsv on its own Watchlist tab) and
// TUDDY never had it. Same idea, football columns, and the movement snapshot
// goes in the file because it is the part you cannot rebuild later.
function buildCsv(rows) {
  const head = ['Player', 'Pos', 'Team', 'Opp', 'Game', 'Kickoff', 'Best market', 'Score', 'Pinned market', 'Pinned score', 'Move', 'Pinned at']
  const lines = [head.join(',')]
  for (const r of rows) {
    const m = r.move
    lines.push([
      r.pin.name, r.pin.position, r.pin.team, r.pin.opp,
      r.pin.away && r.pin.home ? `${r.pin.away} @ ${r.pin.home}` : '',
      r.pin.kickoff || '', r.best || '', Number.isFinite(r.score) ? Math.round(r.score) : '',
      m?.market || '', Number.isFinite(m?.from) ? Math.round(m.from) : '',
      Number.isFinite(m?.delta) ? (m.delta > 0 ? `+${m.delta}` : m.delta) : '',
      r.pin.pinned_at || '',
    ].map(csvCell).join(','))
  }
  return lines.join('\n')
}

function download(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {}
}

export default function Watchlist({ data, matchup, logs, onPlayerClick }) {
  const { pins, toggle } = useNflWatchlist(data)
  const [gameId, setGameId] = useState('all')
  // Cards or table. MOONSHOT's watchlist demoted its cards to a second view in
  // 2026-08-08 because a dense table is what you actually compare a saved list
  // in; TUDDY only ever had cards. Cards stay the default here — this list is
  // usually short and the card carries the matchup badge and the reason line.
  const [view, setView] = useState('cards')
  const [copied, setCopied] = useState(false)
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
      if (!row.player) return { ...row, markets: [], best: null, score: undefined, sortScore: -Infinity, tag: null, why: null, move: null, ago: agoOf(row.pin.pinned_at) }
      const markets = Object.entries(row.player.scores || {}).filter(([, value]) => Number.isFinite(value)).sort((a, b) => b[1] - a[1])
      const [best, raw] = markets[0] || []
      const score = Number.isFinite(raw) ? raw : undefined
      const tag = matchup && best ? matchupTag(matchup, row.player, best) : null
      const reasons = logs && best ? reasonsFor(logs, row.player, best, matchup)?.reasons : null
      return {
        ...row, markets, best, score, sortScore: Number.isFinite(raw) ? raw : -Infinity, tag,
        why: reasons?.length ? reasons : null,
        move: movementOf(row.pin, row.player),
        ago: agoOf(row.pin.pinned_at),
      }
    })
    .sort((a, b) => b.sortScore - a.sortScore)

  const targetCount = rows.filter((row) => row.tag?.tag === 'TARGET').length
  const [copyPart, setCopyPart] = useState(0)
  const copyParts = discordParts(
    `**TUDDY watchlist · ${data?.label || 'this week'}**`,
    rows.map((r, i) => `${i + 1}. ${r.pin.name}${r.pin.team ? ` (${r.pin.team})` : ''}${r.best ? ` ${r.best} ${Number.isFinite(r.score) ? Math.round(r.score) : ''}`.trimEnd() : ''}`),
  )

  return <div className="nfl-watch"><PageHeader
      eyebrow="YOUR TUDDY BOARD"
      title="Watchlist"
      note={<>Save a player from any card, then work one game at a time. Pins are rebuilt from the fresh slate row, including the game id.{liveGames.length > 0 && <div className="nfl-watch-live"><span className="tuddy-live-dot-sm" aria-hidden="true" />{liveGames.length} pinned game{liveGames.length === 1 ? '' : 's'} live right now</div>}</>}
      theme={C}
      numFont={NUM_FONT}
      accent={C.cyan}
      stats={[
        { value: pins.length, label: 'PINNED', tone: C.green },
        matchup && { value: targetCount, label: 'TARGET NOW', tone: C.cyan },
      ]}
    /><FollowingStrip sport="nfl" liveIds={new Set(Object.keys(byId))} onPlayerClick={(row) => { const player = byId[String(row.id)]; if (player) onPlayerClick?.(player, 'TD') }} />{pins.length > 0 && <div className="nfl-watch-games"><button className={gameId === 'all' ? 'active' : ''} onClick={() => setGameId('all')}>ALL · {pins.length}</button>{games.map((game) => { const count = pins.filter((pin) => pin.game_id === game.game_id).length; return <button key={game.game_id} className={gameId === game.game_id ? 'active' : ''} onClick={() => setGameId(game.game_id)}>{game.away} @ {game.home} · {count}</button>})}</div>}{pins.length > 0 && <div className="nfl-watch-bar">
      <div className="nfl-watch-views">
        <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>CARDS</button>
        <button className={view === 'table' ? 'active' : ''} onClick={() => setView('table')}>TABLE</button>
      </div>
      <div className="nfl-watch-exports">
        <button onClick={() => {
          // Discord-sized, in parts when it will not fit one message (2026-09-23).
          const text = copyParts[copyPart % copyParts.length]
          navigator.clipboard.writeText(text).then(() => {
            setCopied(true); setCopyPart((copyPart % copyParts.length) + 1); setTimeout(() => setCopied(false), 1600)
          }).catch(() => {})
        }}>{copied ? (copyParts.length > 1 ? `COPIED ${copyPart % copyParts.length || copyParts.length}/${copyParts.length}` : 'COPIED') : copyParts.length > 1 ? `COPY ${copyPart % copyParts.length + 1}/${copyParts.length}` : 'COPY LIST'}</button>
        <button onClick={() => download(`tuddy-watchlist-${(data?.label || 'slate').replace(/\s+/g, '-').toLowerCase()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8')}>CSV</button>
      </div>
    </div>}

    {/* THE TABLE (2026-09-21). MOONSHOT's watchlist has been table-first since
        2026-08-08 and TUDDY was cards-only, so a saved list could not be read
        down a column. Move is the part cards cannot do well: a signed delta
        against the score the board showed when you saved him. */}
    {view === 'table' && Boolean(rows.length) && <NflTable
      rows={rows.map((r) => ({
        player_id: r.pin.player_id,
        name: r.pin.name || r.pin.player_id,
        position: r.pin.position || '—',
        team: r.pin.team || '—',
        opp: r.pin.stale ? '—' : (r.pin.opp || '—'),
        best: r.best || '—',
        score: Number.isFinite(r.score) ? r.score : null,
        moved: Number.isFinite(r.move?.delta) ? r.move.delta : null,
        since: Number.isFinite(r.move?.from) ? r.move.from : null,
        ago: r.ago || '—',
        _player: r.player,
        _market: r.best,
      }))}
      columns={[
        { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
        { key: 'position', label: 'Pos', heat: false, w: 36, mono: true, dim: true },
        { key: 'team', label: 'Tm', heat: false, w: 36, mono: true, dim: true },
        { key: 'opp', label: 'Opp', heat: false, w: 56, mono: true, dim: true },
        { key: 'best', label: 'Market', heat: false, w: 68, mono: true, dim: true,
          title: 'His highest-scoring market on this slate — the one the card leads with.' },
        { key: 'score', label: 'Score', w: 50, dp: 0,
          title: "The model's score for that market right now." },
        { key: 'since', label: 'Saved at', w: 56, dp: 0, heat: false, dim: true,
          title: 'What the board said for the market he was pinned for, at the moment you pinned him. Blank for pins made before the watchlist started recording it — nothing is back-filled.' },
        { key: 'moved', label: 'Move', w: 52, dp: 1,
          title: 'Score now minus score when saved, on the market he was pinned for. Compared on that market and not on his current best, so a man whose best market changed does not show a move he never made.' },
        { key: 'ago', label: 'Pinned', heat: false, w: 64, mono: true, dim: true,
          title: 'How long he has been on your list.' },
      ]}
      onRowClick={onPlayerClick ? (row) => { if (row?._player) onPlayerClick(row._player, row._market || 'TD') } : undefined}
      caption="Your saved players. Move is measured against the score showing when you saved him, on that same market — pins made before the watchlist recorded a snapshot leave Saved at and Move blank rather than guessing one."
    />}

    <section className="nfl-watch-grid" style={view === 'table' ? { display: 'none' } : undefined}>{rows.map((row) => { const { pin, player } = row; if (!player) return <article key={pin.player_id} className="is-stale"><div className="nfl-watch-top"><span>{pin.team || '—'}</span><button onClick={() => toggle({ player_id: pin.player_id, name: pin.name })} aria-label={`Remove ${pin.name || 'player'} from watchlist`}>★</button></div><div className="nfl-watch-player" style={{ cursor: 'default' }}><small>{pin.position || ''}{pin.opp ? ` · was vs ${pin.opp}` : ''}</small><h2>{pin.name || pin.player_id}</h2><div><strong style={{ color: C.text3 }}>—</strong><span>NOT ON THIS SLATE</span></div></div><footer>pinned from an earlier slate<span>tap ★ to let him go</span></footer></article>; const grade = gradeFor(row.score); return <article key={player.player_id}><div className="nfl-watch-top"><span>{player.team}</span><button onClick={() => toggle(player)} aria-label={`Remove ${player.name} from watchlist`}>★</button></div><button className="nfl-watch-player" onClick={() => onPlayerClick?.(player, row.best || 'TD')}><small>{player.position} · {oppLabel(player)}</small><h2>{player.name}</h2><div><strong style={{ color: grade.color }}>{Number.isFinite(row.score) ? Math.round(row.score) : '—'}</strong><span>{row.best || 'UNSCORED'} · {grade.label}</span>{row.tag && row.tag.tag !== 'EVEN' && <MatchupBadge matchup={matchup} player={player} market={row.best} />}</div>{Number.isFinite(row.move?.delta) && row.move.delta !== 0 && <p className="nfl-watch-move" data-dir={row.move.delta > 0 ? 'up' : 'down'}>{row.move.delta > 0 ? '▲' : '▼'} {Math.abs(row.move.delta)} on {row.move.market} since you saved him{row.ago ? ` · ${row.ago}` : ''}</p>}{row.why && <p className="nfl-watch-why">{row.why.map((r) => REASON_WORD[r]).join(' · ')}</p>}</button><div className="nfl-watch-scores">{row.markets.slice(0, 4).map(([market, value]) => <button key={market} onClick={() => onPlayerClick?.(player, market)}><small>{market}</small><b>{Math.round(value)}</b></button>)}</div><footer>{pin.stale ? 'NOT ON THIS SLATE' : pin.away && pin.home ? `${pin.away} @ ${pin.home}` : 'GAME PENDING'}<span>{pin.stale ? 'pinned from an earlier slate' : pin.kickoff ? new Date(pin.kickoff).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span></footer></article>})}{!rows.length && <div className="nfl-watch-empty"><span>☆</span><h2>{pins.length ? 'No pins in this game.' : 'Your watchlist is empty.'}</h2><p>Open any player card and tap SAVE TO WATCHLIST. The player will stay attached to this slate and game.</p></div>}</section><TuddyRecentAlerts /><style>{`
    .nfl-watch{display:flex;flex-direction:column;gap:11px}.nfl-watch-games{display:flex;gap:5px;overflow-x:auto}.nfl-watch-games button{flex:0 0 auto;padding:8px 11px;border:1px solid ${C.border};border-radius:8px;background:${C.bg2};color:${C.text3};font:800 8px/1 ${NUM_FONT};cursor:pointer}.nfl-watch-games button.active{border-color:${C.green};color:${C.green};background:rgba(0,245,173,.08)}.nfl-watch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:9px}.nfl-watch-grid>article{overflow:hidden;border:1px solid ${C.border};border-radius:12px;background:${C.bg2}}.nfl-watch-grid>article.is-stale{opacity:.7;border-style:dashed}.nfl-watch-top{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-bottom:1px solid ${C.border}}.nfl-watch-top span{color:${C.green};font:900 9px/1 ${NUM_FONT}}.nfl-watch-top button{border:0;background:transparent;color:${C.yellow};font-size:15px;cursor:pointer}.nfl-watch-player{width:100%;padding:13px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.nfl-watch-player>small{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.nfl-watch-player h2{margin:5px 0 10px;font-size:18px}.nfl-watch-player>div{display:flex;align-items:baseline;gap:7px}.nfl-watch-player strong{font:900 28px/1 ${NUM_FONT}}.nfl-watch-player span{color:${C.text3};font:800 8px/1 ${NUM_FONT}}.nfl-watch-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.nfl-watch-views,.nfl-watch-exports{display:flex;gap:5px}.nfl-watch-bar button{min-height:40px;padding:0 12px;border:1px solid ${C.border};border-radius:8px;background:${C.bg2};color:${C.text3};font:800 8px/1 ${NUM_FONT};letter-spacing:.08em;cursor:pointer}.nfl-watch-bar .nfl-watch-views button.active{border-color:${C.cyan};color:${C.cyan}}.nfl-watch-move{margin:0;padding:0 13px 4px;font:800 8px/1.3 ${NUM_FONT}}.nfl-watch-move[data-dir="up"]{color:${C.green}}.nfl-watch-move[data-dir="down"]{color:${C.text3}}.nfl-watch-why{margin:0;padding:0 13px 11px;color:${C.cyan};font:800 8px/1.3 ${NUM_FONT}}.nfl-watch-scores{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid ${C.border}}.nfl-watch-scores button{min-height:49px;border:0;border-right:1px solid ${C.border};background:rgba(255,255,255,.02);color:inherit;cursor:pointer}.nfl-watch-scores small,.nfl-watch-scores b{display:block}.nfl-watch-scores small{color:${C.text3};font:700 7px/1 ${NUM_FONT}}.nfl-watch-scores b{margin-top:5px;font:900 11px/1 ${NUM_FONT}}.nfl-watch-grid footer{display:flex;justify-content:space-between;padding:8px 10px;color:${C.text3};font:700 8px/1 ${NUM_FONT};border-top:1px solid ${C.border}}.nfl-watch-empty{grid-column:1/-1;padding:45px 20px;border:1px dashed ${C.border2};border-radius:13px;text-align:center}.nfl-watch-empty span{color:${C.yellow};font-size:30px}.nfl-watch-empty h2{margin:8px 0 5px}.nfl-watch-empty p{margin:0;color:${C.text3};font-size:10px}
    .nfl-watch-live{display:flex;align-items:center;margin-top:9px;color:${C.cyan};font:900 9px/1 ${NUM_FONT};letter-spacing:.04em}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .tuddy-live-dot-sm{display:inline-block;width:5px;height:5px;margin-right:6px;border-radius:50%;background:${C.cyan};box-shadow:0 0 6px ${C.cyan};animation:pulse 2s infinite}
    @media(prefers-reduced-motion:reduce){.tuddy-live-dot-sm{animation:none}}
    @media(max-width:560px){.nfl-watch-grid{grid-template-columns:1fr}}
  `}</style></div>
}
