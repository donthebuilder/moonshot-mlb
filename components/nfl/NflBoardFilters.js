'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { LABELS } from '../../lib/nfl/scoreLabels'
import RangeDual from '../RangeDual'
import { FilterPill, useOutsideClose } from '../Filters'

// ── TUDDY'S BOARD FILTERS ───────────────────────────────────────────────────
//
// Donovan: "tuddy needs filters like moonshot does." MOONSHOT's boards narrow
// the POOL BEFORE the ranking, so a filtered board surfaces names the
// unfiltered one buries rather than just hiding rows off the bottom
// (components/BoardFilters.js). TUDDY had search, team, position and four
// on/off pills — nothing that could say "only the men who actually get the
// ball near the end zone."
//
// WHAT IT FILTERS ON, AND WHY THAT IS NOT INVENTED (rule #16). Every band here
// is a COMPONENT OF THE SCORE THE OPEN BOARD IS RANKING — the same numbers the
// card already shows you under "why". Measured against the live week-2 payload
// (514 players, 406 scored):
//
//   TD        (n=299) f_gl_opp, f_rz_opp, f_xtd, f_touches, f_snap_pct,
//                     implied_total .......................... 100% coverage
//   REC_YDS   (n=299) f_wopr, f_receiving_yards,
//                     f_receiving_air_yards, opp_pass_soft,
//                     implied_total .......................... 100% coverage
//   REC       (n=299) f_target_share, f_receptions, f_targets . 100% coverage
//   RUSH_YDS  (n=132) f_carries, f_rushing_yards, f_rz_car .... 100% coverage
//   RUSH_ATT  (n= 84) + RYOE/att, oppr_rush_soft ............. 100% coverage
//   PASS_YDS  (n= 48) total_line, opp_pass_soft, f_passing_yards,
//                     f_attempts, f_passing_cpoe ............. 100% coverage
//   KICK_PTS  (n= 27) six team/kicking components ............ 100% coverage
//   DEF_TD    (n= 32) def_touchdowns_rate .................... 100% coverage
//
// Components, not the `stats` block, precisely BECAUSE of that coverage. The
// published `stats` map skips exact zeros (nfl_bot.py: a back carries PAYD as
// 0.000 and a wall of zeroes reads as data), so TDoE is on 83.7% of scored
// players and 20+ on 56.9% — a band on those silently drops everyone the
// field does not apply to. A component is present for every player the board
// ranks, or the board could not have ranked him.
//
// MOST COMPONENTS ARE 0–100 PERCENTILES within the week's pool — but NOT all,
// and assuming it was wrong. Swept against the live payload: 25 of the 26
// published component keys run a full 0–100 spread, and `def_touchdowns_rate`
// (DEF_TD) does not. Its entire live range is 0.0 to 0.5, with exactly two
// distinct values across 32 defences. It passes a naive "is it inside 0–100"
// check, which is why the first version of this file called every component a
// percentile and shipped a DEF_TD preset that matched ZERO players — a 0–100
// slider with step 1 cannot move over a 0–0.5 field, the same trap MOONSHOT
// hit with ISO and solved by multiplying by 1000.
//
// So the bounds are MEASURED FROM THE POOL rather than assumed (bandOptionsFor
// below). A band is always "between these two values, out of the values
// actually on this board", whatever scale the bot publishes the component on,
// and it keeps working if a component's scale changes. Where a stat really
// does span 0–100 the chip says "top 25%", because there it is true; where it
// does not, the chip shows the raw range instead of claiming a percentile.
//
// THE BANDS FOLLOW THE OPEN MARKET, which is MOONSHOT's own rule ("a Score
// filter scoped to whichever board is actually open"). Switching TD → REC_YDS
// swaps goal-line and snap share for WOPR and air yards, because those are
// what that score is made of. Bands whose key is not in the new market are
// dropped rather than silently ignored.
//
// Labels come from lib/nfl/scoreLabels.js — the one place a component's name
// is spelled (#21). No second map.

// A shortcut row, not a second mechanism: each preset is exactly one band, so
// what it applied is visible as a removable chip and undoing it is the same
// gesture as undoing a hand-dragged band. The percentile is in the label
// because a filter that will not say what it did is not evidence.
const QUICK = {
  TD: [
    { key: 'gl', label: 'Goal-line role', stat: 'f_gl_opp', min: 75 },
    { key: 'rz', label: 'Red-zone role', stat: 'f_rz_opp', min: 75 },
    { key: 'everydown', label: 'Every-down', stat: 'f_snap_pct', min: 75 },
    { key: 'shootout', label: 'High total', stat: 'implied_total', min: 70 },
  ],
  REC_YDS: [
    { key: 'wopr', label: 'Opportunity', stat: 'f_wopr', min: 75 },
    { key: 'deep', label: 'Deep role', stat: 'f_receiving_air_yards', min: 75 },
    { key: 'softpass', label: 'Soft pass D', stat: 'opp_pass_soft', min: 70 },
  ],
  REC: [
    { key: 'share', label: 'Target share', stat: 'f_target_share', min: 75 },
    { key: 'vol', label: 'Target volume', stat: 'f_targets', min: 75 },
  ],
  RUSH_YDS: [
    { key: 'work', label: 'Workhorse', stat: 'f_carries', min: 75 },
    { key: 'rzcar', label: 'Red-zone carries', stat: 'f_rz_car', min: 75 },
  ],
  RUSH_ATT: [
    { key: 'work', label: 'Workhorse', stat: 'f_carries', min: 75 },
    { key: 'softrun', label: 'Soft run D', stat: 'oppr_rush_soft', min: 70 },
  ],
  PASS_YDS: [
    { key: 'vol', label: 'Volume', stat: 'f_attempts', min: 75 },
    { key: 'total', label: 'High total', stat: 'total_line', min: 70 },
  ],
  KICK_PTS: [
    { key: 'att', label: 'FG volume', stat: 'f_fg_att', min: 75 },
    { key: 'drives', label: 'Team drives', stat: 'f_tm_drives', min: 75 },
  ],
  // DEF_TD deliberately has no preset. Its only component is a raw rate with
  // two distinct values in the live pool, so "top 30%" is meaningless and the
  // preset matched nobody. The band itself still works off measured bounds.
}

const comp = (player, market, key) => {
  const v = player?.components?.[market]?.[key]
  return Number.isFinite(v) ? Number(v) : null
}

/** The component keys the open market actually publishes, in payload order. */
export function bandOptionsFor(players, market) {
  const seen = new Map()
  for (const p of players || []) {
    const c = p?.components?.[market]
    if (!c) continue
    for (const [k, raw] of Object.entries(c)) {
      if (!Number.isFinite(raw)) continue
      const v = Number(raw)
      const hit = seen.get(k)
      if (!hit) seen.set(k, { key: k, label: LABELS[k] || k, lo: v, hi: v })
      else { if (v < hit.lo) hit.lo = v; if (v > hit.hi) hit.hi = v }
    }
  }
  // Rounded outward so the thumbs can always reach the real extremes, and a
  // step that gives a flat field usable travel instead of one notch.
  return [...seen.values()].map((b) => {
    const lo = Math.floor(b.lo)
    const hi = Math.ceil(b.hi)
    // A PERCENTILE IS NOT "EXACTLY 0 TO 100". f_rz_opp runs 6–100 in a given
    // week simply because nobody bottomed out that stat that week; it is still
    // a percentile rank and "top 25%" is still the true sentence for it.
    // Testing for an exact 0–100 range called 25 of 26 components raw and
    // threw the useful label away. The real separator is the SPAN: every
    // percentile component covers 77–99 points of the scale, while
    // def_touchdowns_rate covers 1. Fifty is nowhere near either edge.
    const isPct = lo >= 0 && hi <= 100 && hi - lo >= 50
    // A percentile gets its canonical 0–100 axis rather than this week's
    // observed ends, so "top 25%" means the same thing every week. Anything
    // else gets the bounds actually measured, which is the only honest axis
    // for a scale nobody here defined.
    const min = isPct ? 0 : lo
    const max = isPct ? 100 : hi
    const span = Math.max(1, max - min)
    return { ...b, min, max, step: span >= 20 ? 1 : span / 100, pct: isPct }
  })
}

export function useNflBoardFilter(players, market) {
  const [bands, setBands] = useState([]) // [{ key, min, max }]
  const bandOptions = useMemo(() => bandOptionsFor(players, market), [players, market])

  // A band on a key the new board does not publish would filter on null for
  // every row and empty the board with no way to see why. Dropped on switch.
  const live = useMemo(() => {
    const ok = new Set(bandOptions.map((b) => b.key))
    return bands.filter((b) => ok.has(b.key))
  }, [bands, bandOptions])

  const toggleBand = (key) => setBands((bs) => {
    if (bs.some((b) => b.key === key)) return bs.filter((b) => b.key !== key)
    const o = bandOptions.find((x) => x.key === key)
    // Opens at the stat's own full range, so switching it on never hides
    // anybody until a thumb is actually moved.
    return [...bs, { key, min: o ? o.min : 0, max: o ? o.max : 100 }]
  })
  const removeBand = (key) => setBands((bs) => bs.filter((b) => b.key !== key))
  const setBandRange = (key, min, max) =>
    setBands((bs) => bs.map((b) => (b.key === key ? { ...b, min, max } : b)))
  const applyQuick = (q) => setBands((bs) => {
    const rest = bs.filter((b) => b.key !== q.stat)
    const on = bs.some((b) => b.key === q.stat && b.min === q.min && b.max === 100)
    return on ? rest : [...rest, { key: q.stat, min: q.min, max: 100 }]
  })
  const reset = () => setBands([])

  const filtered = useMemo(() => (players || []).filter((p) => {
    for (const b of live) {
      const v = comp(p, market, b.key)
      // A row the open market does not score has no components for it and is
      // not a zero — it is absent, and an absent value clears no band.
      if (v === null) return false
      if (v < b.min || v > b.max) return false
    }
    return true
  }), [players, live, market])

  const quick = QUICK[market] || []
  const quickOn = (q) => live.some((b) => b.key === q.stat && b.min === q.min && b.max === 100)

  // The chip claims a percentile ONLY for a stat that actually spans 0-100
  // (bandOptionsFor sets `pct`). On any other scale it shows the raw numbers,
  // because "top 25%" of a two-value rate is not a true sentence.
  const activeFilters = useMemo(() => live.map((b) => {
    const o = bandOptions.find((x) => x.key === b.key)
    const lo = o ? o.min : 0
    const hi = o ? o.max : 100
    const num = (v) => (Math.abs(v) >= 10 || Number.isInteger(v) ? Math.round(v) : Number(v.toFixed(2)))
    const range = b.min <= lo && b.max >= hi ? 'any'
      : o?.pct && b.max >= hi ? `top ${100 - b.min}%`
      : o?.pct && b.min <= lo ? `bottom ${b.max}%`
      : `${num(b.min)}–${num(b.max)}`
    return { key: `band-${b.key}`, label: `${LABELS[b.key] || b.key} · ${range}`, onClear: () => removeBand(b.key) }
  }), [live, bandOptions])

  return {
    filtered,
    state: {
      bands: live, bandOptions, toggleBand, setBandRange, removeBand,
      quick, quickOn, applyQuick, reset,
      active: live.length > 0, activeFilters, activeCount: live.length,
    },
  }
}

const lbl = () => ({ fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 })

export default function NflBoardFilters({ state, total, shown }) {
  const { bands, bandOptions, toggleBand, setBandRange, quick, quickOn, applyQuick, reset, active, activeCount } = state
  const [open, setOpen] = useState(false)
  // NOTE THE ARGUMENT ORDER. BoardFilters.js calls useOutsideClose(open,
  // setOpen) -- but that is its OWN local copy, declared at the bottom of that
  // file, which happens to take (open, setOpen). The shared one exported from
  // components/Filters.js takes (onClose, active), so copying MOONSHOT's call
  // shape here would have registered `open` as the close handler and never
  // closed the panel. Two functions, one name, opposite arguments.
  const wrap = useOutsideClose(() => setOpen(false), open)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {/* The trigger stays one button at every width. The panel is what would
          otherwise be a permanently-expanded bar eating a phone screen before
          a single ranked row is visible — the exact thing MOONSHOT's own
          filter header says it fixed. */}
      <div ref={wrap} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            minHeight: 40, padding: '6px 12px', borderRadius: 8,
            border: `1px solid ${open || active ? C.orange : C.border}`,
            background: open ? C.bg3 : 'transparent',
            color: active ? C.orange : C.text2,
            fontSize: 11.5, fontWeight: 800, fontFamily: NUM_FONT,
          }}
        >
          ▤ Filters
          {activeCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 16, height: 16, borderRadius: 999, padding: '0 4px',
              background: C.orange, color: '#1a0f00', fontSize: 10, fontWeight: 900,
            }}>{activeCount}</span>
          )}
        </button>

        {open && (
          <div style={{
            position: 'absolute', zIndex: 60, top: 'calc(100% + 6px)', left: 0,
            width: 300, maxWidth: 'calc(100vw - 28px)', maxHeight: '65vh', overflowY: 'auto',
            padding: 12, borderRadius: 12, border: `1px solid ${C.border}`,
            background: C.bg2, boxShadow: '0 18px 40px rgba(0,0,0,.5)',
          }}>
            {Boolean(quick.length) && <>
              <div style={lbl()}>Quick</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 13px' }}>
                {quick.map((q) => (
                  <FilterPill key={q.key} active={quickOn(q)} onClick={() => applyQuick(q)}
                    title={`${LABELS[q.stat] || q.stat} in the top ${100 - q.min}% of this week's board`}>
                    {q.label}
                  </FilterPill>
                ))}
              </div>
            </>}

            <div style={lbl()}>Bands · what this score is made of</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 4px' }}>
              {bandOptions.map((b) => (
                <FilterPill key={b.key} active={bands.some((x) => x.key === b.key)} onClick={() => toggleBand(b.key)}>
                  {b.label}
                </FilterPill>
              ))}
            </div>
            {!bandOptions.length && (
              <p style={{ margin: '6px 0 0', color: C.text3, fontSize: TYPE.micro, lineHeight: 1.5 }}>
                This board has not published its score components yet, so there is nothing to band on.
              </p>
            )}

            {bands.map((b) => {
              const opt = bandOptions.find((x) => x.key === b.key)
              return (
              <div key={b.key} style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ fontSize: 10.5, color: C.text, fontWeight: 700 }}>{LABELS[b.key] || b.key}</span>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text2 }}>{b.min}–{b.max}</span>
                </div>
                <RangeDual
                  min={opt ? opt.min : 0} max={opt ? opt.max : 100} step={opt ? opt.step : 1}
                  low={b.min} high={b.max}
                  onLow={(v) => setBandRange(b.key, Math.min(v, b.max), b.max)}
                  onHigh={(v) => setBandRange(b.key, b.min, Math.max(v, b.min))}
                />
              </div>
              )
            })}

            <p style={{ margin: '13px 0 0', color: C.text3, fontSize: TYPE.micro, lineHeight: 1.5 }}>
              Each band runs over the values actually on this board — for the percentile
              components, 75–100 is the top quarter on that input. A player must clear
              every band at once.
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text2 }}>
                {shown != null && total != null ? `${shown} of ${total}` : ''}
              </span>
              <button type="button" onClick={reset} disabled={!active}
                style={{
                  minHeight: 40, padding: '6px 14px', borderRadius: 8, cursor: active ? 'pointer' : 'default',
                  border: `1px solid ${C.border}`, background: 'transparent',
                  color: active ? C.text : C.text3, fontSize: 10.5, fontWeight: 800,
                }}>Reset</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
