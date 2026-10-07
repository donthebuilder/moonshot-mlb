'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
import { fetchWalls, pullWallFor } from '../lib/walls'
import { tone, alpha } from '../lib/scales'
import DenseTable from './DenseTable'
import { boardRow, boardRowContext, withBoardColumns } from '../lib/boardColumns'

// 🧱🚀 FENCE RIDERS (2026-08-08, Donovan: "I like people who pull in the
// direction and have hit it out or ON THE FENCE LINE in the last 5–15
// games"). Two verified sources, zero invention:
//   fence_board.json   spray_cache's measured landing data — every ball a
//                      hitter put over 375, and every PULLED ball that died
//                      320–374 (the wall-scraper zone), last 15 game dates
//   fieldInfo          the league's own wall dimensions for tonight's park
// The read: a guy stacking 350-ft pulled outs walks into a 315-ft pull
// porch — those same swings clear tonight. All stats, no feel.
//
// MOVED UNDER THE BOARD (2026-08-15). This panel used to sit directly above
// the Power page's board, so it was the second thing you scrolled past to
// reach the table you opened the tab for. It is unchanged and complete — just
// below the board now, with the rest of the supporting reads. Since the fold
// is the only thing most people see, the closed line now carries how many
// riders are inside as well as who leads them: a summary that doesn't say
// what's behind the door is a wall with a door in it.

const FENCE_GROUP = { key: 'fence', label: 'The fence', order: 1 }
const PORCH_GROUP = { key: 'porch', label: 'Tonight\u2019s wall', order: 1.3 }

export default function FenceBoard({ onPlayerClick, players = [] }) {
  const [board, setBoard] = useState(null)
  const [walls, setWalls] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(bust(dataUrl('current/fence_board.json')))
      .then((r) => (r.ok ? r.json() : null)).then(setBoard).catch(() => {})
    fetchWalls().then(setWalls).catch(() => {})
  }, [])

  const slateIds = useMemo(() => new Set(players.map((p) => String(p?.player_id ?? p?.id))), [players])
  const rowFor = useMemo(() => {
    const m = new Map()
    players.forEach((p) => m.set(String(p?.player_id ?? p?.id), p))
    return m
  }, [players])

  const [rows, setRows] = useState([])
  const [pool, setPool] = useState(0)
  useEffect(() => {
    let alive = true
    if (!board?.rows) return undefined
    ;(async () => {
      const out = []
      for (const r of board.rows.slice(0, 40)) {
        if (slateIds.size && !slateIds.has(String(r.player_id))) continue
        const w = await pullWallFor(r.bats, r.venue)
        const shortPorch = w?.linePct != null && w.linePct <= 25
        // 🌬 WIND LANE (stack-on): the slate's own wind label vs HIS pull
        // side. "Out To RF" for a lefty's pull = the air is carrying his
        // exact ball flight. CF counts half. From the bot's published
        // weather field — no forecast invented here.
        const sp = rowFor.get(String(r.player_id))
        const windLbl = String(sp?.wind_direction_label || '').toLowerCase()
        const pullSide = r.bats === 'L' ? 'rf' : r.bats === 'R' ? 'lf' : (w?.side || '').toLowerCase()
        const windTail = /out/.test(windLbl) && windLbl.includes(pullSide)
        const windHalf = !windTail && /out/.test(windLbl) && windLbl.includes('cf')
        // fit: fence contact × tonight's wall, wind lane on top, robbed
        // counts extra (those were HRs somewhere), oppo power a nudge
        // ── THE NUMBER THIS PANEL RANKS BY, WRITTEN DOWN ───────────────
        // Seven weighted terms decided who the ten riders are, and none of
        // them appeared on screen: the panel showed the raw counts and then
        // ordered the rows by something else. The terms are kept so the row
        // can print its own arithmetic, and `fit` itself is now drawn.
        const fitTerms = {
          'deep pull ×3': r.deep_pull_ct * 3,
          'at the wall ×1.5': r.fence_ct * 1.5,
          'over 375 ×1': r.over_ct,
          'robbed ×1.5': (r.robbed_ct || 0) * 1.5,
          'oppo ×0.5': (r.oppo_over_ct || 0) * 0.5,
          'short porch tonight': shortPorch ? (r.deep_pull_ct + r.fence_ct) * 1.5 : 0,
          'wind lane': windTail ? (r.deep_pull_ct + r.fence_ct) * 1.0
            : windHalf ? (r.deep_pull_ct + r.fence_ct) * 0.4 : 0,
        }
        const fit = Object.values(fitTerms).reduce((a, b) => a + b, 0)
        out.push({ ...r, w, shortPorch, windTail, windHalf, windLbl: sp?.wind_direction_label || '', fit, fitTerms })
      }
      // THE CUT IS NAMED, NOT SILENT. `pool` is what the caption prints, so a
      // reader can see that this is the top ten of a bigger field rather than
      // the whole of a small one.
      const ranked = out.sort((a, b) => b.fit - a.fit)
      if (alive) { setPool(ranked.length); setRows(ranked.slice(0, 10)) }
    })()
    return () => { alive = false }
  }, [board, slateIds])

  // The chip ramp is relative to the strongest rider on screen, which is the
  // honest domain for a top-ten list: there is no absolute fit of 100.
  // THE RIDERS AS ONE TABLE (2026-10-07: the card rows are a dense table; same riders, same numbers, the full
  // Rankings column set behind them when he is on tonight's slate).
  const bctx = useMemo(() => boardRowContext(players), [players])
  const tableRows = useMemo(() => rows.map((r, i) => {
    const sp = rowFor.get(String(r.player_id))
    return {
      ...(sp ? boardRow(sp, i, bctx) : {}),
      _key: String(r.player_id),
      _raw: sp || null,
      rank: i + 1,
      name: r.name,
      team: r.team,
      fit: r.fit,
      over: r.over_ct,
      wall: r.fence_ct,
      deep: r.deep_pull_ct,
      robbed: r.robbed_ct || 0,
      oppo: r.oppo_over_ct || 0,
      porch: r.w ? r.w.line : null,
      porchTxt: r.w ? `${r.w.side} ${r.w.line}\u2032` : '',
      short: r.shortPorch ? 1 : 0,
      wind: r.windTail ? 2 : r.windHalf ? 1 : 0,
      terms: Object.entries(r.fitTerms).filter(([, v]) => v).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' \u00b7 '),
    }
  }), [rows, rowFor, bctx])
  const columns = useMemo(() => withBoardColumns([
    { key: 'fit', group: FENCE_GROUP, label: 'Fit', w: 52, dp: 0, bar: 'primary', primary: true,
      title: 'The number that ordered this list: deep pull x3, at the wall x1.5, over 375 x1, robbed x1.5, oppo x0.5, plus a bonus for a short porch or a wind lane tonight.' },
    { key: 'over', group: FENCE_GROUP, label: 'Over 375', w: 58, dp: 0, title: 'Balls over 375 ft in his last 15 game dates' },
    { key: 'wall', group: FENCE_GROUP, label: 'At wall', w: 54, dp: 0, title: 'Pulled 320-374 ft: outs in most parks, homers over a short porch' },
    { key: 'deep', group: FENCE_GROUP, label: 'Deep pull', w: 58, dp: 0, title: 'Deep pulled balls' },
    { key: 'robbed', group: FENCE_GROUP, label: 'Robbed', w: 54, dp: 0, title: 'Wall balls recorded as OUTS (homers somewhere else)' },
    { key: 'oppo', group: FENCE_GROUP, label: 'Oppo', w: 48, dp: 0, title: '375+ the other way: all-fields power' },
    { key: 'porchTxt', group: PORCH_GROUP, label: 'His porch', heat: false, w: 72, mono: true, title: 'His pull side tonight and the line in feet' },
    { key: 'porch', group: PORCH_GROUP, label: 'Line ft', w: 54, dp: 0, invert: true, title: 'The pull-side line in feet; shorter helps' },
    { key: 'short', group: PORCH_GROUP, label: '\ud83c\udfaf', flag: true, mark: '\ud83c\udfaf', w: 34, title: 'Bottom-25% pull wall tonight: a short porch' },
    { key: 'wind', group: PORCH_GROUP, label: 'Wind', w: 48, dp: 0, fmt: (v) => (v === 2 ? 'TAIL' : v === 1 ? 'CF out' : '\u2014'), title: 'Tonight\u2019s wind out to his pull side (TAIL) or to center (CF out)' },
  ], {}), [])

  if (!board?.rows?.length || !rows.length) return null

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${alpha(C.orange, 0.04)})`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🧱 Fence riders {open ? '▾' : '▸'}</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          pulled balls dying at the wall, last 15 games — vs the wall they actually face tonight
        </span>
        {!open && rows[0] && (
          <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.orange, fontWeight: 800 }}>
            {rows.length} riders · #1 {rows[0].name.split(' ').slice(-1)[0]}{rows[0].shortPorch ? ' → short porch tonight' : ''}
          </span>
        )}
      </div>

      {open && (
        <>
          <div style={{ marginTop: 8 }}>
            <DenseTable
              rows={tableRows}
              columns={columns}
              onRowClick={(raw) => { if (raw && raw.player_id != null) onPlayerClick?.(raw) }}
              initialSort="fit"
              maxHeight={440}
              maxRows={Math.max(tableRows.length, 1)}
              bare
            />
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
            <b style={{ color: C.text2 }}>Ranked by fit</b> — the number in the chip beside each
            rank, and the only thing that decided this order: deep pull ×3, at the wall ×1.5, over
            375 ×1, robbed ×1.5, oppo ×0.5, plus a bonus for a short porch or a wind lane tonight.
            Tap a chip for that hitter&apos;s own terms. Showing the{' '}
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>top {rows.length}</b> of{' '}
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{pool}</b> riders with tracked
            contact tonight; the chip is shaded against the strongest rider on screen, not against 100.{' '}
            Distances are Statcast landing measurements, pull is Savant&apos;s own pull-air flag, wall
            dimensions are the league&apos;s fieldInfo, wind is the bot&apos;s published label. &quot;At the
            wall&quot; = pulled 320–374 ft — outs in most parks, homers over a short porch.
            <b style={{ color: tone('yellow') }}> Robbed</b> = those wall balls recorded as OUTS (homers
            somewhere else). <b style={{ color: tone('purple') }}>Oppo</b> = 375+ the other way — all-fields
            power. 🎯 = bottom-25% pull wall tonight · 🌬 TAIL = wind out to his pull side.
            Window: last 15 game dates. <b style={{ color: C.text2 }}>Stats and analysis only — not
            financial or betting advice.</b>
          </div>
        </>
      )}
    </div>
  )
}
