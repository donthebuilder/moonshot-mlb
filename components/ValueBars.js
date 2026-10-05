'use client'
import { alpha, verdictInk, verdictWash } from '../lib/scales'

// THE VALUE BARS (2026-10-05, Donovan on TUDDY's player file: "the props on this page is not showing
// all the bars like on mlb, where is that component"). Lifted out of MOONSHOT's prop grid
// (components/ThresholdGrid.js), which renders through this unchanged: one bar per game, oldest left,
// height = the count, warm when it cleared the line (white rule), the dashed rule his average, an
// optional strip under each bar (MOONSHOT: the opposing staff), and the STREAK BAND welded under the
// bars -- one continuous segment per run, warm for clears, cool for misses, the length printed on
// runs of three or more. Tap a bar to pin that game (the caller draws the pinned game's line).
//
//   games     oldest-left: [{ key, val, title, strip?: css colour }]
//   thr       the count that clears (line + 0.5)
//   avgColor  the average rule's colour (MOONSHOT's orange by default)
//   selected / onSelect   the pinned game's key
export default function ValueBars({ games = [], thr, numFont, avgColor = 'rgba(249,115,22,.6)', selected = null, onSelect = null }) {
  if (!games.length) return null
  const vals = games.map((g) => g.val)
  const avgVal = vals.reduce((a, v) => a + v, 0) / vals.length
  const maxVal = Math.max(thr + 1, ...vals, 1)
  const unit = 42 / maxVal
  const showNums = games.length <= 28
  // the streak, computed on the same oldest-left order the bars are drawn in
  const runMark = (() => {
    const out = new Array(games.length).fill(null)
    let i = 0
    while (i < games.length) {
      const ok = games[i].val >= thr
      let j = i
      while (j < games.length && (games[j].val >= thr) === ok) j++
      const len = j - i
      for (let k = i; k < j; k++) out[k] = { ok, len, first: k === i, last: k === j - 1, mid: k === i + ((len - 1) >> 1) }
      i = j
    }
    return out
  })()
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 10 + Math.min(46, (thr - 0.5) * unit), height: 1,
        background: 'rgba(255,255,255,.35)', pointerEvents: 'none', zIndex: 2,
      }} title={`the ${thr - 0.5} line`} />
      {avgVal != null && (
        <div style={{
          position: 'absolute', left: 0, right: 0,
          bottom: 10 + Math.min(46, avgVal * unit), height: 0,
          borderTop: `1px dashed ${avgColor}`, pointerEvents: 'none', zIndex: 2,
        }} title={`his average: ${avgVal.toFixed(1)} per game in view`} />
      )}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {games.map((g, gi) => {
          const val = g.val
          const ok = val >= thr
          const isSel = selected != null && selected === g.key
          const hgt = Math.max(5, Math.min(48, 5 + val * unit))
          return (
            <div key={g.key} title={g.title}
              onClick={onSelect ? () => onSelect(isSel ? null : g.key) : undefined}
              style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', cursor: onSelect ? 'pointer' : 'default' }}>
              {showNums && val > 0 && (
                <div style={{ fontFamily: numFont, fontSize: 9, fontWeight: 800, color: ok ? verdictInk(true).color : verdictInk(false).color, textAlign: 'center', marginBottom: 1 }}>{val}</div>
              )}
              <div style={{
                height: hgt, borderRadius: '3px 3px 1px 1px',
                background: ok
                  ? `linear-gradient(180deg, ${verdictWash(true, 0.85)}, ${verdictInk(true).color})`
                  : val > 0 ? 'linear-gradient(180deg, rgba(248,113,113,.6), rgba(248,113,113,.35))' : 'rgba(248,113,113,.22)',
                boxShadow: isSel ? '0 0 0 1.5px #fff' : ok && val >= thr + 1 ? '0 0 9px rgba(74,222,128,.45)' : 'none',
              }} />
              <div style={{ height: 4, borderRadius: 2, marginTop: 3, background: isSel ? '#fff' : (g.strip || 'rgba(255,255,255,.08)') }} />
              {/* THE RUN BAND — one continuous segment per streak, bridged across the flex gap so a
                  run of four reads as one bar and not four. The numeral sits on the middle game of
                  runs of three or more; shorter runs are their own label. */}
              {(() => {
                const rm = runMark[gi]
                if (!rm) return null
                const rc = rm.ok ? verdictInk(true).color : verdictInk(false).color
                return (
                  <div style={{ position: 'relative', height: 9, marginTop: 2 }}>
                    <div style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: rm.first ? 0 : -4, right: rm.last ? 0 : -4,
                      background: alpha(rc, rm.ok ? 0.16 + 0.1 * Math.min(4, rm.len) : 0.14),
                      borderTop: `1.5px solid ${alpha(rc, rm.ok ? 0.85 : 0.5)}`,
                      borderLeft: rm.first ? `1px solid ${alpha(rc, 0.5)}` : 'none',
                      borderRight: rm.last ? `1px solid ${alpha(rc, 0.5)}` : 'none',
                      borderRadius: `${rm.first ? 3 : 0}px ${rm.last ? 3 : 0}px ${rm.last ? 3 : 0}px ${rm.first ? 3 : 0}px`,
                    }} />
                    {rm.mid && rm.len >= 3 && (
                      <span style={{
                        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                        fontFamily: numFont, fontSize: 7.5, fontWeight: 900, lineHeight: 1,
                        color: rc, pointerEvents: 'none',
                      }}>{rm.len}</span>
                    )}
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
