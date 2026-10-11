'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import PageHeader from '../../PageHeader'
import FollowingStrip from '../../FollowingStrip'
import WatchRecord from '../../watch/WatchRecord'
import CallStatusBadge from '../../CallStatusBadge'
import LampTable from '../LampTable'
import Hint from '../Hint'
import { PositionRow, PositionNote, PositionEmpty } from '../../Filters'
import usePositionFilter from '../../../lib/usePositionFilter'
import { canonPos } from '../../../lib/positions'
import { useFollowing, follow } from '../../../lib/dash/follow'
import { useLampBoardOnce } from '../../../lib/nhl/useLamp'
import { withNhlFullSet } from '../../../lib/nhl/boardColumns'
import { fmtPuckDrop } from '../ui'
import { STATUS_WORD } from '../../../lib/callStatus'
import { alpha } from '../../../lib/scales'
import { C, NUM_FONT } from '../../../lib/nhl/theme'

// ⭐ LAMP WATCHLIST. First built (2026-09-29, parity item 6) from the pieces MOONSHOT's and TUDDY's watchlists use: the Following
// strip and "Your nights, graded". UPGRADED 2026-10-10 (Donovan: make the watchlists better, tables lead): the skaters you watch are
// now a TABLE, read off tonight's board -- his place in his game, the status word the board already printed (lib/nhl/goalModel
// scoreNight: nothing re-derived here), his score, his game and puck drop -- with the full column set one scroll away, a position
// filter (pos= in the address) and a removal that can be undone. Nothing is stored that was not stored before: a skater is yours
// by lib/dash/follow ('nhl:<id>'); a skater whose club is not playing tonight stays on the list and says so.
const UNDO_MS = 8000

const btn = (on = false) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.ice : C.border}`, background: on ? alpha(C.ice, 0.12) : C.bg2, color: on ? C.ice : C.text2,
  font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em',
})

export default function Watchlist({ onOpenPlayer }) {
  const fol = useFollowing('nhl')
  const { data: board } = useLampBoardOnce()
  const [undo, setUndo] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  // tonight's board row for each followed skater: { r, g } by player id
  const onBoard = useMemo(() => {
    const m = new Map()
    for (const g of board?.games || []) for (const r of g.rows || []) m.set(String(r.playerId), { r, g })
    return m
  }, [board])
  const all = useMemo(() => fol.rows.map((f) => {
    const hit = onBoard.get(String(f.id)) || null
    return { f, r: hit?.r || null, g: hit?.g || null }
  }).sort((a, b) => (b.r?.score ?? -Infinity) - (a.r?.score ?? -Infinity)), [fol.rows, onBoard])

  const pf = usePositionFilter('nhl', all, { posOf: (x) => (x.r?.pos || x.f.position ? canonPos('nhl', x.r?.pos || x.f.position) : null) })
  const rows = useMemo(() => all.filter(pf.test), [all, pf.test])
  const called = all.filter((x) => x.r?.status === 'called').length
  const playing = all.filter((x) => x.g).length

  const remove = (x) => {
    fol.unfollow(x.f.id)
    setUndo(x.f)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  const G = { player: { key: 'player', label: 'Player', order: 0 }, call: { key: 'call', label: 'The call', order: 1 }, game: { key: 'game', label: 'His game', order: 2 } }
  const tableRows = rows.map((x) => {
    const { f, r, g } = x
    const game = g?.game
    return {
      id: f.id, star: 1, rank: r?.rank ?? null, name: r?.name || f.name || f.id, pos: r ? canonPos('nhl', r.pos) : (f.position ? canonPos('nhl', f.position) : ''),
      team: r?.team || f.team || '—', opp: game ? (game.home?.abbrev === (r?.team || f.team) ? game.away?.abbrev : game.home?.abbrev) : '—',
      status: r?.status || '', score: r?.score != null ? Math.round(r.score) : null,
      puck: game?.startUtc ? Date.parse(game.startUtc) : null,
      _row: r || null, _x: x,
    }
  })
  const table = withNhlFullSet(tableRows, [
    { key: 'star', label: '★', action: true, w: 44, group: G.player, mark: '★', markOff: '☆', titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: (row) => { const x = row?._x || rows.find((q) => String(q.f.id) === String(row?.id)); if (x) remove(x) } },
    { key: 'rank', label: '#', w: 32, heat: false, group: G.player, title: 'His place in his game on tonight’s board.' },
    { key: 'name', label: 'Player', w: 160, heat: false, bold: true, sticky: true, group: G.player,
      fmt: (v, r) => <>{v}{r.pos ? <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, marginLeft: 6 }}>{r.pos}</span> : null}</> },
    { key: 'team', label: 'Tm', w: 34, heat: false, teamMark: 'nhl', fold: true, group: G.player },
    { key: 'opp', label: 'Opp', w: 34, heat: false, teamMark: 'nhl', fold: true, subOnly: true, group: G.game },
    { key: 'status', label: 'Status', heat: false, statusCol: true, w: 64, group: G.call,
      fmt: (v) => (v ? <CallStatusBadge status={v} accent={C.ice} short /> : <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>NO GAME</span>) },
    { key: 'score', label: 'Goal score', w: 56, primary: true, scale: 'seq', domain: [0, 100], group: G.call, title: 'His goal score tonight, 0 to 100: a rank against tonight’s skaters, not a percentage.' },
    { key: 'puck', label: 'Puck drop', w: 84, heat: false, group: G.game, title: 'His game, in your time zone.', fmt: (v) => (v == null ? '—' : fmtPuckDrop(new Date(v).toISOString())) },
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <PageHeader eyebrow="LAMP · WATCHLIST" title="Your skaters"
        note={<>Skaters you watch, and every night they played, graded. <Hint label="How watching works" text="Watch a skater from his file and he lands here for his next game; the watch clears after it. Every night you watched him counts below, graded off his own game log." />
          {all.length > 0 && <div data-watch-summary style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 9, font: `800 11px/1.4 ${NUM_FONT}`, letterSpacing: '.04em', color: C.text2 }}>
            <span><b style={{ color: C.text }}>{all.length}</b> watching</span>
            {board && <span><b style={{ color: C.text }}>{playing}</b> playing tonight</span>}
            {called > 0 && <span style={{ color: C.ice }}><b>{called}</b> {STATUS_WORD.called}</span>}
          </div>}</>}
        theme={C} numFont={NUM_FONT} accent={C.ice} style={{ marginBottom: 6 }} />

      {undo && (
        <div role="status" data-watch-undo style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, padding: '0 6px 0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13 }}>
          <span>Removed {undo.name}.</span>
          <button type="button" onClick={() => { follow('nhl', { id: undo.id, name: undo.name, team: undo.team, position: undo.position }); setUndo(null) }} style={{ ...btn(true), minWidth: 64 }}>UNDO</button>
        </div>
      )}

      {all.length === 0 ? (
        <FollowingStrip sport="nhl" accent={C.ice} emptyText="Open any skater’s file and tap ☆ Watch — he lands here for his next game, and that night counts below." onPlayerClick={(row) => onOpenPlayer?.(row.id)} />
      ) : (
        <>
          {pf.control && <PositionRow control={pf.control} accent={C.ice} />}
          {pf.active && rows.length > 0 && <PositionNote control={pf.control} shown={rows.length} total={all.length} />}
          {rows.length === 0 ? <PositionEmpty control={pf.control} onClearAll={pf.clear} /> : (
            <LampTable {...table} onRowClick={(row) => onOpenPlayer?.(row.id)}
              caption="The skaters you watch, on tonight's board. # is his place in his game; the status word is the board's own. A skater whose club is not playing tonight stays on your list and reads NO GAME. Tap a row for his page." />
          )}
        </>
      )}
      <WatchRecord sport="nhl" theme={C} accent={C.ice} onOpen={(r) => onOpenPlayer?.(r.id)} />
    </div>
  )
}
