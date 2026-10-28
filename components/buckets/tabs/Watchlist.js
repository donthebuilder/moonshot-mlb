'use client'
import { useMemo, useRef, useState, useEffect } from 'react'
import PageHeader from '../../PageHeader'
import BinderLink from '../../binder/BinderLink'
import FollowingStrip from '../../FollowingStrip'
import WatchRecord from '../../watch/WatchRecord'
import AlertsEntry from '../../AlertsEntry'
import BucketsTable from '../BucketsTable'
import { BucketsCards } from '../BucketsCard'
import { boardRows, boardColumns, faceOf } from '../boardTable'
import { PositionRow, PositionNote, PositionEmpty, Segmented, LAYOUT_OPTIONS } from '../../Filters'
import ShareCardButton from '../../card/ShareCardButton'
import CopyListButton from '../../watch/CopyListButton'
import { watchCopyParts } from '../../../lib/watchCopy'
import { shareUrl, stamp } from '../../../lib/cards/saveCard'
import { useIsPhone } from '../../MobileFold'
import usePositionFilter from '../../../lib/usePositionFilter'
import { canonPos } from '../../../lib/positions'
import { useFollowing, follow } from '../../../lib/dash/follow'
import { useBucketsBoardOnce } from '../../../lib/nba/useBuckets'
import { STATUS_WORD } from '../../../lib/callStatus'
import { alpha } from '../../../lib/scales'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { Why } from '../ui'

// ⭐ BUCKETS WATCHLIST. First LAMP's, from the shared Following strip and "Your nights, graded" (2026-10-12). BROUGHT TO PARITY
// 2026-10-13 (the audit: 21 lines against LAMP's 145): the players you watch are a TABLE read off tonight's points board --
// his place on the night, the status word the board already printed (lib/nba/model.js scoreNight: nothing re-derived here),
// his score, his game -- carrying the Rankings' own column set (components/buckets/boardTable.js boardColumns, with the group
// on every column), a position filter (pos= in the address), List | Cards, a removal that can be undone, the Binder link, the
// share picture (kind=ranked with ids=, like LAMP's) and the alerts line. A player is yours by lib/dash/follow ('nba:<id>', the
// same store as before: nothing new is stored); one whose club is not playing tonight stays on the list and reads NO GAME.
const UNDO_MS = 8000

const btn = (on = false) => ({
  minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? C.purple : C.border}`, background: on ? alpha(C.purple, 0.12) : C.bg2, color: on ? C.purple : C.text2,
  font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em',
})

export default function Watchlist({ onOpenPlayer, onOpenTeam, onOpenGame }) {
  const fol = useFollowing('nba')
  const { data: board } = useBucketsBoardOnce()
  const [undo, setUndo] = useState(null)
  const [layout, setLayout] = useState('list')
  const phone = useIsPhone()
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  // tonight's board rows, in the Rankings' own shape, by player id
  const onBoard = useMemo(() => new Map(boardRows(board).map((r) => [String(r.playerId), r])), [board])
  const all = useMemo(() => fol.rows.map((f) => ({ f, r: onBoard.get(String(f.id)) || null }))
    .sort((a, b) => (b.r?.score ?? -Infinity) - (a.r?.score ?? -Infinity)), [fol.rows, onBoard])

  const pf = usePositionFilter('nba', all, { posOf: (x) => (x.r?.pos || x.f.position ? canonPos('nba', x.r?.pos || x.f.position) : null) })
  const rows = useMemo(() => all.filter(pf.test), [all, pf.test])
  const called = all.filter((x) => x.r?.status === 'called').length
  // COPY LIST: the list as shown, as text (lib/watchCopy.js): by game, earliest tip first, a star on a CALLED player
  const copyParts = useMemo(() => watchCopyParts({ brand: 'BUCKETS', starWord: STATUS_WORD.called, items: rows.map((x) => {
    const r = x.r
    return { name: r?.name || x.f.name || String(x.f.id), team: r?.team || x.f.team || null, score: r?.score, star: r?.status === 'called',
      gameKey: r ? String(r.gameId) : null, gameLabel: r ? (r.home ? `${r.opp} @ ${r.team}` : `${r.team} @ ${r.opp}`) : '', startMs: r?.tip ? Date.parse(r.tip) : NaN }
  }) }), [rows])
  const playing = all.filter((x) => x.r).length

  const remove = (x) => {
    fol.unfollow(x.f.id)
    setUndo(x.f)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(null), UNDO_MS)
  }

  const tableRows = rows.map((x) => {
    const { f, r } = x
    return r
      ? { ...r, star: 1, _x: x }
      : { _id: `w-${f.id}`, playerId: String(f.id), name: f.name || String(f.id), pos: f.position ? canonPos('nba', f.position) : '', team: f.team || '—', oppTxt: '—', status: '', score: null, nightRank: null, star: 1, _x: x }
  })
  const columns = [
    { key: 'star', label: '★', action: true, w: 44, group: 'Player', mark: '★', markOff: '☆', titleOn: 'Remove from watchlist', titleOff: 'Add to watchlist', onAction: (row) => { const x = row?._x || rows.find((q) => String(q.f.id) === String(row?.playerId)); if (x) remove(x) } },
    ...boardColumns('pts', { onOpenTeam, onOpenGame }).map((c) => (c.key === 'status'
      ? { ...c, fmt: (v, r) => (v ? c.fmt(v, r) : <span style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}` }}>NO GAME</span>) } : c)),
  ]
  const ids = rows.filter((x) => x.r).map((x) => x.f.id).slice(0, 40).join(',')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <PageHeader eyebrow="BUCKETS · WATCHLIST" title="Your players" theme={C} numFont={NUM_FONT} accent={C.purple} style={{ marginBottom: 6 }}
        note={<>Players you watch, and every night you watched them. <Why label="Watchlist" text="Watch a player from his file and he lands here for his next game; the watch clears after it. Every night you watched him counts below, graded off his own game log." />
          {all.length > 0 && <div data-watch-summary style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 9, font: `800 11px/1.4 ${NUM_FONT}`, letterSpacing: '.04em', color: C.text2 }}>
            <span><b style={{ color: C.text }}>{all.length}</b> watching</span>
            {board && <span><b style={{ color: C.text }}>{playing}</b> playing tonight</span>}
            {called > 0 && <span style={{ color: C.purple }}><b>{called}</b> {STATUS_WORD.called}</span>}
          </div>}</>} />
      <div><BinderLink sport="nba" /></div>

      {undo && (
        <div role="status" data-watch-undo style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, padding: '0 6px 0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg3, color: C.text, fontSize: 13 }}>
          <span>Removed {undo.name}.</span>
          <button type="button" onClick={() => { follow('nba', { id: undo.id, name: undo.name, team: undo.team, position: undo.position }); setUndo(null) }} style={{ ...btn(true), minWidth: 64 }}>UNDO</button>
        </div>
      )}

      {all.length === 0 ? (
        <FollowingStrip sport="nba" accent={C.purple} emptyText="Open any player’s file and tap ☆ Watch — he lands here for his next game, and that night counts below." onPlayerClick={(row) => onOpenPlayer?.(row.id)} />
      ) : (
        <>
          {pf.control && <PositionRow control={pf.control} accent={C.purple} />}
          {pf.active && rows.length > 0 && <PositionNote control={pf.control} shown={rows.length} total={all.length} />}
          {rows.length > 0 && (
            // THE VIEW ROW: List | Cards on the left, the share picture (the list, in board order) at the right end
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Segmented tall={phone} value={layout} onChange={setLayout} options={LAYOUT_OPTIONS} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <CopyListButton parts={copyParts} C={C} NUM_FONT={NUM_FONT} accent={C.purple} />
                {ids && <ShareCardButton sport="nba" what="this watchlist" url={shareUrl({ kind: 'ranked', sport: 'nba', market: 'pts', ids })} filename={`watchlist_${stamp('')}.png`} />}
              </span>
            </div>
          )}
          {rows.length === 0 ? <PositionEmpty control={pf.control} onClearAll={pf.clear} /> : layout === 'cards' ? (
            rows.some((x) => x.r)
              ? <BucketsCards market="pts" onOpen={onOpenPlayer} rows={rows.filter((x) => x.r && x.r.score != null).map((x) => x.r)} />
              : <div style={{ color: C.text3, fontSize: 13, lineHeight: 1.5 }}>None of the players you watch is on tonight's board, so there is no card to show. The list view keeps them.</div>
          ) : (
            <BucketsTable rows={tableRows} columns={columns} compactPhoneRow statusOf={(r) => r.status || null} nameCell="player" faceOf={faceOf}
              onRowClick={(r) => onOpenPlayer?.((r?._raw ?? r).playerId)} initialSort={{ key: 'score', dir: 'desc' }} heatMode="sorted" maxRows={Math.max(tableRows.length, 1)}
              caption="The players you watch, on tonight's points board. # is his place on the night; the status word is the board's own. A player whose club is not playing tonight stays on your list and reads NO GAME. Tap a row for his page." />
          )}
        </>
      )}
      <WatchRecord sport="nba" theme={C} accent={C.purple} onOpen={(r) => onOpenPlayer?.(r.id)} />
      {all.length > 0 && <AlertsEntry C={C} accent={C.purple} NUM_FONT={NUM_FONT} />}
    </div>
  )
}
