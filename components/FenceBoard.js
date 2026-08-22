'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
import { fetchWalls, pullWallFor } from '../lib/walls'
import { tone, alpha, seqChip } from '../lib/scales'

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
  const topFit = rows.length ? Math.max(...rows.map((r) => r.fit), 1) : 1

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {rows.map((r, i) => (
              <div key={r.player_id} onClick={() => { const p = rowFor.get(String(r.player_id)); if (p) onPlayerClick?.(p) }}
                style={{
                  display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap', cursor: 'pointer',
                  background: r.shortPorch ? alpha(C.orange, 0.07) : C.bg2,
                  border: `1px solid ${r.shortPorch ? alpha(C.orange, 0.4) : C.border}`,
                  borderRadius: 9, padding: '6px 11px',
                }}>
                <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 16 }}>{i + 1}</span>
                {/* FIT, DRAWN. The chip takes its step off the same sequential
                    ramp everything else does, against the top fit in this set
                    — the ten riders are a relative field and the caption says
                    so rather than implying a ceiling. */}
                <span
                  title={`Fit ${r.fit.toFixed(1)} — the number that ordered this list: ${Object.entries(r.fitTerms).filter(([, v]) => v).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(' + ') || 'nothing'}. Relative to tonight's riders, not a score out of anything.`}
                  style={{
                    fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 900, color: C.text,
                    background: alpha(seqChip(r.fit, [0, topFit]) || C.bg3, 0.85),
                    borderRadius: 5, padding: '1px 5px', minWidth: 26, textAlign: 'center',
                  }}
                >{r.fit.toFixed(0)}</span>
                <span style={{ fontSize: 11.5, fontWeight: 800 }}>{r.name}</span>
                <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{r.team}</span>
                <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text2 }}
                  title={`Last ${r.games} games (${r.bbe} tracked balls): ${r.over_ct} over 375ft, ${r.fence_ct} PULLED into the 320–374 wall-scraper zone, ${r.deep_pull_ct} pulled 350+, ${r.hr_ct} actual HR. Longest ${r.longest.toFixed(0)}ft. All measured Statcast landing data.`}>
                  <b style={{ color: tone('green') }}>{r.over_ct}</b> over ·{' '}
                  <b style={{ color: C.orange }}>{r.fence_ct}</b> at the wall ·{' '}
                  <b style={{ color: tone('cyan') }}>{r.deep_pull_ct}</b> deep pull
                  {(r.robbed_ct || 0) > 0 && <> · <b style={{ color: tone('yellow') }}>{r.robbed_ct}</b> robbed</>}
                  {(r.oppo_over_ct || 0) > 0 && <> · <b style={{ color: tone('purple') }}>{r.oppo_over_ct}</b> oppo</>}
                </span>
                {(r.windTail || r.windHalf) && (
                  <span title={`Tonight's wind: ${r.windLbl} — ${r.windTail ? 'blowing out to HIS pull side; the air carries his exact ball flight' : 'blowing out to center; half a tailwind for his shape'}. From the bot's published weather field.`}
                    style={{ fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: r.windTail ? tone('green') : tone('yellow') }}>
                    🌬 {r.windTail ? 'TAIL' : 'CF out'}
                  </span>
                )}
                {r.w && (
                  <span style={{ marginLeft: 'auto', fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800, color: r.shortPorch ? C.orange : C.text3 }}
                    title={`His pull side tonight: ${r.w.side} ${r.w.line}ft line${r.w.gap ? ` / ${r.w.gap}ft gap` : ''} — ${r.w.linePct}% of parks are shorter. ${r.shortPorch ? 'SHORT PORCH: his wall-scrapers clear this one.' : ''}`}>
                    {r.w.side} {r.w.line}′{r.shortPorch ? ' 🎯 SHORT' : ''}
                  </span>
                )}
              </div>
            ))}
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
