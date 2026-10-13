'use client'
// THE PLAYER NAME CELL (2026-10-13, PLAYER-ROWS; Donovan, on the LAMP rankings on a phone: "make the name area
// better, yes show their picture. make the row sized better."). One cell for every table that lists players:
//
//   [ FACE ]  Name            the face is a round headshot with a thin accent ring (monogram when there is no picture),
//             POS  [logo] vs BOS  CALLED  OUT       the name is one line when it fits, else steps down, else two lines,
//                                                  else initial + surname (lib/nameFit.js); never an "..."
//
// SECOND LINE, in a fixed order: position, club logo + opponent ("@ UTA" / "vs BOS"), the call word (CALLED), the
// injury chip, the watch star. It never wraps: a chip that does not fit is dropped, lowest priority first (the opponent's
// text first, then position), and every dropped piece is still in the table's own columns.
//
// A row is ONE height (css in components/table/v2.js, `.dtv2.pc`): the cell is vertically centred and nothing in it can
// grow the row. The name is a button (keyboard + screen reader) and the whole cell is the row's tap target.
//
// Plain presentational: table/v2.js builds the props (it owns the row, the sport's team door, the injury layer).
import Tap from '../Tap'
import { fitName, planChips, estimateWidth } from '../../lib/nameFit'

// the cell's geometry, the css's twin (v2Css .dtv2.pc): name column width, face, gap, side padding
export const PC_GEOM = {
  phone: { cell: 164, face: 36, gap: 7, pad: 12 },
  desk: { cell: 210, face: 40, gap: 8, pad: 14 },
}
export const pcRoom = (phone) => { const g = phone ? PC_GEOM.phone : PC_GEOM.desk; return g.cell - g.pad - g.face - g.gap }

let _ctx = null
/** a text measure on the page's own fonts; an estimate where there is no document (a server render, a test) */
export function makeMeasure(family) {
  return (text, px, weight = 600) => {
    if (typeof document === 'undefined') return estimateWidth(text, px)
    try {
      if (!_ctx) _ctx = document.createElement('canvas').getContext('2d')
      _ctx.font = `${weight} ${px}px ${family || getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'}`
      return _ctx.measureText(String(text)).width
    } catch { return estimateWidth(text, px) }
  }
}

/**
 * @param {object} p
 * @param {string} p.name
 * @param {import('react').ReactNode} [p.face]
 * @param {Array<{ key:string, prio:number, node:any, text?:string, fixedW?:number, phoneOnly?:boolean }>} [p.chips]
 *        in display order. `text` is measured (10px mono); `fixedW` adds a logo's width; `phoneOnly` is dropped on desktop (its column is on screen there)
 * @param {boolean} p.phone
 * @param {string} p.numFont
 * @param {() => void} [p.onOpen]  the name's own tap (the row's player page)
 * @param {import('react').ReactNode} [p.mark]  the spotlight mark, before the name
 */
export default function PlayerNameCell({ name, face = null, chips = [], phone, numFont, onOpen = null, mark = null, sizes = null }) {
  const fit = fitName(name, { room: pcRoom(phone), measure: makeMeasure(null), sizes: sizes || (phone ? [12, 11] : [13, 12]), maxLines: 2 })
  const g = phone ? PC_GEOM.phone : PC_GEOM.desk
  const room = g.cell - g.pad - g.face - g.gap
  const mono = makeMeasure(numFont)
  const live = chips.filter((c) => c && !(c.phoneOnly && !phone))
  const sized = live.map((c) => ({ key: c.key, prio: c.prio, w: (c.fixedW || 0) + (c.text ? mono(c.text, 10, 800) + c.text.length * 0.4 : 0) }))
  const keep = planChips(sized, room)
  const shown = live.filter((c) => keep.has(c.key))
  return (
    <span className="pc">
      {face ? <span className="pc-face">{face}</span> : null}
      <span className="pc-body">
        <span className="pc-name" data-fit={fit.mode} style={{ fontSize: fit.size }} title={fit.shortened ? name : undefined}>
          {mark}
          {onOpen
            ? <Tap onClick={onOpen} title={fit.shortened ? name : undefined}><span className="pc-nm">{fit.text}</span></Tap>
            : <span className="pc-nm">{fit.text}</span>}
        </span>
        {shown.length > 0 && <span className="pc-chips">{shown.map((c) => <span key={c.key} className="pc-chip">{c.node}</span>)}</span>}
      </span>
    </span>
  )
}
