'use client'

import NflNote from '../NflNote'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { useNflWatchlist, restoreWatch } from '../../../lib/nfl/watchlist'
import { useFollowing } from '../../../lib/dash/follow'
import { tdPool } from '../../../lib/nfl/tdPool'
import { tdStatusFor } from '../../../lib/nfl/tdStatus'
import { useGameCalls } from '../GameCalls'
import { useRankMove } from '../../../lib/useRankMove'
import { RankMoveNote } from '../../RankMove'
import RankMove from '../../RankMove'
import { roleKeys, ROLE_PILLS } from '../../../lib/nfl/roles'
import { injuryColor, injuryTitle } from '../../../lib/nfl/injury'
import usePositionFilter from '../../../lib/usePositionFilter'
import { useHashFilter } from '../../../lib/filterHash'
import { gameHref, playerHref } from '../../../lib/routes'
import { STATUS_WORD } from '../../../lib/callStatus'
import { alpha } from '../../../lib/scales'
import { buildWatchRows, sortRows, summarize, movedRows, suggestions, gameOptions } from '../../../lib/nfl/watchRows'
import { discordParts } from '../../../lib/discordText'
import { withNflFullSet } from '../../../lib/nfl/boardColumns'
import { Card as TdCard } from './Touchdowns'
import { PositionRow, PositionNote, PositionEmpty } from '../../Filters'
import { SportTheme } from '../../SportTheme'
import CallStatusBadge from '../../CallStatusBadge'
import { useCallGate } from '../../MemberGate'
import PlayerFace from '../../PlayerFace'
import PageHeader from '../../PageHeader'
import ShareCardButton from '../../card/ShareCardButton'
import { shareUrl, stamp } from '../../../lib/cards/saveCard'
import BinderLink from '../../binder/BinderLink'
import NflTable from '../NflTable'
import FollowingStrip from '../../FollowingStrip'
import WatchRecord from '../../watch/WatchRecord'
import AlertsEntry from '../../AlertsEntry'
import TuddyRecentAlerts from '../TuddyRecentAlerts'

// THE WATCHLIST, UPGRADED (2026-10-10, Donovan: "make the NFL watch list page better and more updated, I don't like how it
// looks"). Simple first screen, deep stats one tap away, tables lead:
//   · ONE summary line (N watching, N playing today, N CALLED, N out), then the table: his place on the board with its rank arrow,
//     the status word (lib/nfl/tdStatus -> lib/callStatus), the TD score, the injury tag, his game (logos + kickoff, a link), his
//     usage role, and the move since you saved him. The full column set follows (lib/nfl/boardColumns).
//   · CARDS is the same card the rankings use (components/nfl/tabs/Touchdowns Card -> components/card/RankCard), one tap away.
//   · Position (pos=), game (wg=) and the view (wv=) ride the address, so Back and a shared link reopen the same list view.
//   · The stored list is untouched: key tuddy_watchlist_v1, same shape, same follow/un-follow (lib/nfl/watchlist.js). A removal
//     can be undone (restoreWatch puts the pin back as it was, snapshot included).
//   · Nothing here makes a number: score, rank, status, injury and role are read from the board's own modules.
const UNDO_MS = 8000   // how long the undo line waits

function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function buildCsv(rows) {
  const head = ['Player', 'Pos', 'Team', 'Opp', 'Game', 'Kickoff', 'Status', 'Board rank', 'TD score', 'Best market', 'Score', 'Pinned market', 'Pinned score', 'Move', 'Pinned at']
  const lines = [head.join(',')]
  for (const r of rows) {
    const m = r.move
    lines.push([
      r.pin.name, r.pin.position, r.pin.team, r.pin.opp,
      r.pin.away && r.pin.home ? `${r.pin.away} @ ${r.pin.home}` : '',
      r.pin.kickoff || '', r.status ? STATUS_WORD[r.status] : '', r.rank ?? '', Number.isFinite(r.td) ? Math.round(r.td) : '',
      r.best || '', Number.isFinite(r.score) ? Math.round(r.score) : '',
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
const kickLabel = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '')

const btn = (on = false) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.green : C.border}`, background: on ? alpha(C.green, 0.12) : C.bg2, color: on ? C.green : C.text2,
  font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em',
})

export default function Watchlist({ data, matchup, logs, picks = null, onPlayerClick }) {
  const wl = useNflWatchlist(data)
  const { pins, toggle } = wl
  const following = useFollowing('nfl')
  const [gameId, setGameId] = useHashFilter('wg')
  const [viewKey, setViewKey] = useHashFilter('wv')
  const view = viewKey === 'cards' ? 'cards' : 'list'
  const [undo, setUndo] = useState(null)
  const [showMoved, setShowMoved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyPart, setCopyPart] = useState(0)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const pool = useMemo(() => tdPool(data), [data])
  const rankOf = useMemo(() => new Map(pool.rows.map((p, i) => [String(p.player_id), i + 1])), [pool])
  const slateDay = useMemo(() => { const k = (data?.games || []).map((g) => g.kickoff).filter(Boolean).sort()[0]; return k ? String(k).slice(0, 10) : '' }, [data?.games])
  // the same board, the same memory as the rankings page: his arrow here is the arrow he wears there
  const rankMv = useRankMove({ sport: 'nfl', board: 'TD', date: slateDay || null, ranks: rankOf, rows: data?.players, idOf: (p) => p?.player_id })
  const gameCalls = useGameCalls()
  const status = useMemo(() => tdStatusFor({ picksCard: picks?.card, gameCalls, games: data?.games, board: pool.rows }), [picks, gameCalls, data, pool])
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])

  const all = useMemo(() => sortRows(buildWatchRows({ pins, byId, statusOf: status.statusOf, rankOf, moveOf: (id) => rankMv.cell(id) })), [pins, byId, status, rankOf, rankMv])
  // MEMBERS LOCK (components/MemberGate.js): his pin's status word, keyed as the TD board keys him, with his game's kickoff; null for everyone but a free viewer
  const gateOf = useCallGate({ rows: all, statusOf: (r) => r.status, keyOf: (r) => String(r.pin.player_id), timeOf: (r) => (Number.isFinite(r.kickoffMs) ? r.kickoffMs : null) })
  const posPool = useMemo(() => all.map((r) => r.player).filter(Boolean), [all])
  const gameFiltered = useMemo(() => (gameId ? all.filter((r) => r.pin.game_id === gameId) : all), [all, gameId])
  const pf = usePositionFilter('nfl', posPool, { posOf: (p) => p.position, extraOf: roleKeys, extraOrder: ROLE_PILLS, countRows: gameFiltered.map((r) => r.player).filter(Boolean) })
  const rows = useMemo(() => gameFiltered.filter((r) => pf.test(r.player || { position: r.pin.position })), [gameFiltered, pf.test])   // eslint-disable-line react-hooks/exhaustive-deps
  const games = useMemo(() => gameOptions(data?.games || [], pins), [data, pins])
  const sum = useMemo(() => summarize(all), [all])
  const moved = useMemo(() => movedRows(all), [all])
  const liveGames = useMemo(() => (data?.games || []).filter((g) => g.state === 'in' && pins.some((p) => p.game_id === g.game_id)), [data, pins])
  const offFollows = useMemo(() => following.rows.filter((f) => !pins.some((p) => String(p.player_id) === String(f.id))), [following.rows, pins])

  const open = (r, market) => { if (r.player) onPlayerClick?.(r.player, market || 'TD', rows.map((x) => x.player).filter(Boolean)) }
  const remove = (r) => {
    toggle(r.player || { player_id: r.pin.player_id, name: r.pin.name })
    setUndo({ pin: r.pin, name: r.pin.name || 'Player' })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }
  const copyParts = discordParts(
    `**TUDDY watchlist · ${data?.label || 'this week'}**`,
    rows.map((r, i) => `${i + 1}. ${r.pin.name}${r.pin.team ? ` (${r.pin.team})` : ''}${r.status ? ` ${STATUS_WORD[r.status]}` : ''}${Number.isFinite(r.td) ? ` TD ${Math.round(r.td)}` : ''}`),
  )

  const summaryLine = pins.length > 0 && (
    <div data-watch-summary style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', marginTop: 9, font: `800 11px/1.4 ${NUM_FONT}`, letterSpacing: '.04em', color: C.text2 }}>
      <span><b style={{ color: C.text }}>{sum.count}</b> watching</span>
      {sum.playingToday > 0 ? <span><b style={{ color: C.text }}>{sum.playingToday}</b> playing today</span> : sum.thisWeek > 0 ? <span><b style={{ color: C.text }}>{sum.thisWeek}</b> this week</span> : null}
      {sum.called > 0 && <span style={{ color: C.green }}><b>{sum.called}</b> {STATUS_WORD.called}</span>}
      {sum.out > 0 && <span><b style={{ color: C.red }}>{sum.out}</b> out</span>}
      {sum.questionable > 0 && <span><b style={{ color: C.yellow }}>{sum.questionable}</b> questionable</span>}
      {liveGames.length > 0 && <span style={{ color: C.green }}><span className="tuddy-live-dot-sm" aria-hidden="true" />{liveGames.length} game{liveGames.length === 1 ? '' : 's'} live</span>}
    </div>
  )

  const header = (
    <PageHeader eyebrow="YOUR TUDDY BOARD" title="Watchlist" theme={C} numFont={NUM_FONT} accent={C.green} style={{ marginBottom: 6 }}
      note={<><NflNote tab="watchlist" />{summaryLine}</>} />
  )
  const binderLink = <div style={{ margin: '0 0 10px' }}><BinderLink sport="nfl" /></div>

  // ── EMPTY: say how to add, offer real names from this week's board ──
  if (!pins.length) {
    const sug = suggestions(pool.rows, new Set(), 3)
    return (
      <div className="nfl-watch">
        {header}
        {binderLink}
        <section style={{ border: `1px dashed ${C.border2}`, borderRadius: 14, padding: '18px 14px', background: C.bg2 }}>
          <div style={{ font: `900 15px/1.3 ${NUM_FONT}`, color: C.text }}>Nobody on your list yet.</div>
          <p style={{ margin: '6px 0 0', color: C.text2, fontSize: 13, lineHeight: 1.5 }}>Tap <b style={{ color: C.yellow }}>☆</b> on any player and he lands here, with his status, injury tag and game for the week.</p>
          {sug.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
              <div style={{ font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.text3 }}>TOP OF THIS WEEK&apos;S BOARD</div>
              {sug.map((p) => (
                <div key={p.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48, borderTop: `1px solid ${C.border}` }}>
                  <button type="button" onClick={() => onPlayerClick?.(p, 'TD')} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, border: 0, background: 'transparent', color: C.text, textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                    <PlayerFace sport="nfl" espnId={p.espn_id} team={p.team} name={p.name} size={28} />
                    <span style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{p.name}</b><span style={{ color: C.text3, font: `700 10px/1 ${NUM_FONT}`, marginLeft: 6 }}>{p.team} · {p.position} · TD {Math.round(p.scores.TD)}</span></span>
                  </button>
                  <button type="button" onClick={() => toggle(p)} aria-label={`Add ${p.name} to watchlist`} style={{ ...btn(), minWidth: 44, padding: '0 12px', color: C.yellow }}>☆ Watch</button>
                </div>
              ))}
            </div>
          )}
        </section>
        <FollowingStrip sport="nfl" liveIds={new Set(byId.keys())} onPlayerClick={(row) => { const p = byId.get(String(row.id)); if (p) onPlayerClick?.(p, 'TD') }} />
        <WatchRecord sport="nfl" theme={C} accent={C.green} onOpen={(r) => { const p = byId.get(String(r.id)); if (p) onPlayerClick?.(p, 'TD') }} />
        <TuddyRecentAlerts />
        <Style />
      </div>
    )
  }

  const byRow = new Map(rows.map((r) => [r.id, r]))
  const tableRows = rows.map((r) => ({
    player_id: r.pin.player_id,
    star: 1,   // lit: every row here is watched
    rankMove: r.rankMove,
    rank: r.rank ?? null,
    name: r.pin.name || r.pin.player_id,
    pos: r.role || r.pin.position || '—',
    team: r.pin.team || '—',
    opp: r.pin.stale ? '—' : (r.pin.opp || '—'),
    status: r.status || '',
    td: Number.isFinite(r.td) ? Math.round(r.td) : null,
    inj: r.inj || '',
    kick: Number.isFinite(r.kickoffMs) && !r.pin.stale ? r.kickoffMs : null,
    best: r.best || '—',
    score: Number.isFinite(r.score) ? Math.round(r.score) : null,
    since: Number.isFinite(r.move?.from) ? Math.round(r.move.from) : null,
    moved: Number.isFinite(r.move?.delta) ? r.move.delta : null,
    ago: r.ago || '—',
    _row: r, _player: r.player, _raw: r.player, _market: 'TD', _id: r.pin.player_id,
  }))
  const G = { player: { key: 'player', label: 'Player', order: 0 }, call: { key: 'call', label: 'The call', order: 1 }, game: { key: 'game', label: 'His game', order: 2 }, pin: { key: 'pin', label: 'Your pin', order: 2.5 } }
  const table = withNflFullSet(tableRows, [
    { key: 'star', label: '★', action: true, w: 44, group: G.player, mark: '★', markOff: '☆', titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: (row) => { const r = byRow.get(String(row?.player_id ?? row?._id)); if (r) remove(r) } },
    { key: 'rank', label: '#', w: 34, heat: false, group: G.player, title: 'His place on this week’s anytime-TD board. The arrow is places moved since the last update.' },
    { key: 'name', label: 'Player', w: 158, heat: false, bold: true, sticky: true, group: G.player },   // the shared player name cell draws the face, the name and the chips
    { key: 'pos', label: 'Role', w: 44, heat: false, fold: true, group: G.player, title: 'His usage role this week (RB1, WR2 ...), from snaps and touches.' },
    { key: 'team', label: 'Tm', w: 34, heat: false, teamMark: 'nfl', fold: true, group: G.player },
    { key: 'opp', label: 'Opp', w: 34, heat: false, teamMark: 'nfl', fold: true, subOnly: true, group: G.game },
    { key: 'status', label: 'Status', heat: false, statusCol: true, w: 64, group: G.call, fmt: (v, r) => (v ? <CallStatusBadge status={v} accent={C.green} short gate={gateOf ? gateOf(r._row) : null} /> : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'td', label: 'TD score', w: 56, primary: true, scale: 'seq', domain: [0, 100], group: G.call, title: 'His anytime-TD score, 0 to 100: a rank against the league, not a percentage.' },
    { key: 'inj', label: 'Inj', w: 44, heat: false, group: G.call, title: 'The injury report, if he is on it. Blank means he is not listed.',
      fmt: (v) => (v ? <span title={injuryTitle(v)} style={{ color: injuryColor(v, C), fontWeight: 900 }}>{v}</span> : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'kick', label: 'Kickoff', w: 96, heat: false, group: G.game, title: 'His game: tap to open it.',
      fmt: (v, r) => (v == null ? '—' : (r._row.pin.game_id
        ? <a href={gameHref('nfl', r._row.pin.game_id)} style={{ color: 'inherit', textDecoration: 'none' }}>{kickLabel(v)}</a>
        : kickLabel(v))) },
    { key: 'best', label: 'Best mkt', group: G.call, heat: false, w: 72, mono: true, dim: true, title: 'His highest-scoring market this week.' },
    { key: 'score', label: 'Best score', group: G.call, w: 56, dp: 0 },
    { key: 'since', label: 'Saved at', group: G.pin, w: 56, dp: 0, heat: false, dim: true, title: 'What the board said for the market he was pinned for when you pinned him. Blank for pins made before it was recorded; nothing is back-filled.' },
    { key: 'moved', label: 'Move', group: G.pin, w: 52, dp: 1, title: 'Score now minus score when saved, on the market he was pinned for.' },
    { key: 'ago', label: 'Pinned', group: G.pin, heat: false, w: 64, mono: true, dim: true, title: 'How long he has been on your list.' },
  ], { skip: ['sc_TD'] })

  return (
    <div className="nfl-watch">
      {header}
      {binderLink}

      {moved.length > 0 && (
        <section data-watch-moved aria-label="Moved" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 4px' }}>
          <span style={{ font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: C.text3, marginRight: 6 }}>MOVED</span>
          {(showMoved ? moved : moved.slice(0, 2)).map((r) => {
            const d = r.move?.delta
            const parts = String(r.pin.name || '').trim().split(/\s+/)
            const short = parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : parts[0]
            return (
              <button key={r.id} type="button" onClick={() => open(r)} title={`${r.pin.name}: moved since the last update or since you saved him`} style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 6px', border: 0, background: 'transparent', color: C.text, cursor: 'pointer', font: `700 13px/1 inherit` }}>
                <span>{short}</span>
                {r.rankMove?.move && <RankMove move={r.rankMove.move} prevAt={r.rankMove.prevAt} source={r.rankMove.source} up={C.green} down={C.text3} size={11} />}
                {Number.isFinite(d) && Math.abs(d) >= 3 && <span style={{ font: `800 11px/1 ${NUM_FONT}`, color: d > 0 ? C.green : C.text3 }}>{d > 0 ? '+' : ''}{d}</span>}
              </button>
            )
          })}
          {moved.length > 2 && <button type="button" onClick={() => setShowMoved(!showMoved)} style={{ minHeight: 44, padding: '0 8px', border: 0, background: 'transparent', color: C.text3, cursor: 'pointer', font: `800 11px/1 ${NUM_FONT}` }}>{showMoved ? 'less' : `+${moved.length - 2} more`}</button>}
        </section>
      )}

      {undo && (
        <div role="status" data-watch-undo style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, padding: '0 6px 0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13 }}>
          <span>Removed {undo.name}.</span>
          <button type="button" onClick={() => { restoreWatch(undo.pin); setUndo(null) }} style={{ ...btn(true), minWidth: 64 }}>UNDO</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div role="group" aria-label="View" style={{ display: 'flex', gap: 6 }}>
          <button type="button" aria-pressed={view === 'list'} style={btn(view === 'list')} onClick={() => setViewKey('')}>☰ List</button>
          <button type="button" aria-pressed={view === 'cards'} style={btn(view === 'cards')} onClick={() => setViewKey('cards')}>▦ Cards</button>
          {/* 📸 the list as a baseball card: the pinned players on this week's board, in board order */}
          <ShareCardButton icon sport="nfl" what="this watchlist" url={shareUrl({ kind: 'ranked', sport: 'nfl', ids: pins.map((p) => p.player_id).filter(Boolean).slice(0, 40).join(',') })} filename={`watchlist_${stamp('')}.png`} />
        </div>
        {games.length > 1 && (
          <div role="group" aria-label="Game" className="nfl-watch-games">
            <button type="button" aria-pressed={!gameId} className={!gameId ? 'active' : ''} onClick={() => setGameId('')}>ALL {pins.length}</button>
            {games.map(({ game, count }) => (
              <button key={game.game_id} type="button" aria-pressed={gameId === game.game_id} className={gameId === game.game_id ? 'active' : ''} onClick={() => setGameId(gameId === game.game_id ? '' : game.game_id)}>{game.away} @ {game.home} {count}</button>
            ))}
          </div>
        )}
      </div>
      {pf.control && <PositionRow control={pf.control} accent={C.green} />}
      {pf.active && rows.length > 0 && <PositionNote control={pf.control} shown={rows.length} total={gameFiltered.length} />}

      {rows.length === 0 ? (
        pf.active ? <PositionEmpty control={pf.control} othersActive={Boolean(gameId)} onClearAll={() => { pf.clear(); setGameId('') }} />
          : <div style={{ color: C.text3, fontSize: 13, padding: '10px 2px' }}>No pins in this game. <button type="button" onClick={() => setGameId('')} style={{ ...btn(), minHeight: 44 }}>Show all {pins.length}</button></div>
      ) : view === 'list' ? (
        <NflTable
          nameCell="player" faceOf={(r) => (r._player ? { sport: 'nfl', espnId: r._player.espn_id, team: r._player.team, name: r._player.name } : null)}
          {...table}
          onRowClick={(row) => { if (row?._player) onPlayerClick?.(row._player, 'TD', rows.map((x) => x.player).filter(Boolean)) }}
          caption="Your saved players, by this week's anytime-TD score. # is his place on the TD board; the arrow is places moved since the board's last update. Move is measured against the score showing when you saved him, on that same market. Tap a row for his card."
        />
      ) : (
        <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}>
            {rows.map((r) => r.player ? (
              <div key={r.id}>
                <TdCard p={r.player} rank={r.rank ?? 0} matchup={matchup} odds={null} status={r.status} rankMove={r.rankMove} weights={pool.weights} base={pool.base} pool={pool.rows}
                  watchlist={{ isPinned: () => true, toggle: () => remove(r) }} onPlayerClick={(p, m) => onPlayerClick?.(p, m, rows.map((x) => x.player).filter(Boolean))} />
              </div>
            ) : (
              <div key={r.id} style={{ border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 12, color: C.text3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span><b style={{ color: C.text }}>{r.pin.name || r.id}</b> · {r.pin.team || ''} · not on this week&apos;s slate</span>
                <button type="button" onClick={() => remove(r)} style={btn()}>REMOVE</button>
              </div>
            ))}
          </div>
        </SportTheme>
      )}
      <RankMoveNote show={rankMv.any} color={C.text3} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" style={btn()} onClick={() => {
          const text = copyParts[copyPart % copyParts.length]
          navigator.clipboard.writeText(text).then(() => { setCopied(true); setCopyPart((copyPart % copyParts.length) + 1); setTimeout(() => setCopied(false), 1600) }).catch(() => {})
        }}>{copied ? 'COPIED' : copyParts.length > 1 ? `COPY ${copyPart % copyParts.length + 1}/${copyParts.length}` : 'COPY LIST'}</button>
        <button type="button" style={btn()} onClick={() => download(`tuddy-watchlist-${(data?.label || 'slate').replace(/\s+/g, '-').toLowerCase()}.csv`, buildCsv(rows), 'text/csv;charset=utf-8')}>CSV</button>
      </div>

      {offFollows.length > 0 && (
        <FollowingStrip sport="nfl" liveIds={new Set(byId.keys())} onPlayerClick={(row) => { const p = byId.get(String(row.id)); if (p) onPlayerClick?.(p, 'TD') }} />
      )}

      {/* MOONSHOT's "Your nights, graded" (components/watch/WatchRecord.js), TUDDY's bars. */}
      <WatchRecord sport="nfl" theme={C} accent={C.green} onOpen={(r) => { const p = byId.get(String(r.id)); if (p) onPlayerClick?.(p, 'TD') }} />
      {/* ALERTS (2026-10-13): where alerts stand, one tap from the list they are about; at the END, so the first row is where it was. */}
      <AlertsEntry C={C} accent={C.green} NUM_FONT={NUM_FONT} />
      <TuddyRecentAlerts />
      <Style />
    </div>
  )
}

function Style() {
  return <style>{`
    .nfl-watch{display:flex;flex-direction:column;gap:11px}
    .nfl-watch-games{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;max-width:100%}
    .nfl-watch-games button{flex:0 0 auto;min-height:44px;padding:0 11px;border:1px solid ${C.border};border-radius:10px;background:${C.bg2};color:${C.text3};font:800 10px/1 ${NUM_FONT};cursor:pointer;white-space:nowrap}
    .nfl-watch-games button.active{border-color:${C.green};color:${C.green};background:${alpha(C.green, 0.1)}}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .tuddy-live-dot-sm{display:inline-block;width:5px;height:5px;margin-right:6px;border-radius:50%;background:${C.green};box-shadow:0 0 6px ${C.green};animation:pulse 2s infinite}
    @media(prefers-reduced-motion:reduce){.tuddy-live-dot-sm{animation:none}}
  `}</style>
}
