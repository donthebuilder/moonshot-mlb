'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore, n, clean, arr } from '../lib/player'

// 🔗 PAIR TRAY (2026-08-09, Donovan: "from this view I should be able to
// visually pair a TOP pick or HR pick / alt pick from each game").
//
// WHAT THIS ANSWERS: if I take THESE two, what am I holding? Tap a pick chip
// on one game card, tap another on a different card, and this sits at the
// bottom of the Games page with both legs, their scores, and the honest
// read on the combination.
//
// Everything here is already-published: the two slate rows, and the season
// co-HR history from pair_history_summary when the pair has any. No new
// math beyond the same both-must-land framing the Pools builder uses:
//
//   THE WEAKER LEG DECIDES. A pair is never better than its worse half —
//   both have to land, so the tray leads with the weaker score rather than
//   the average, which is the number that flatters a bad second leg.
//
//   SAME GAME IS FLAGGED, NEVER HIDDEN. Two bats in one park rise and fall
//   together — measured at +12% relative on same-game co-HR, which cuts
//   both ways. It's a choice, and the tray says so out loud.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const MARKETS = [
  ['hr', 'Home run', hrScore, 'each leg needs 1+ HR'],
  ['hit', '1+ hit', hitScore, 'each leg needs 1+ hit'],
  ['hrr', 'HRR', prodScore, 'each leg needs 2+ H+R+RBI'],
  ['tb', '2+ bases', tbScore, 'each leg needs 2+ total bases'],
]

export default function PairTray({ legs = [], market = 'hr', onMarket, onRemove, onClear, pairHistorySummary, onPlayerClick }) {
  const [, label, scoreFn, needs] = MARKETS.find((m) => m[0] === market) || MARKETS[0]

  const hist = useMemo(() => {
    if (legs.length !== 2) return null
    const a = norm(nameOf(legs[0])), b = norm(nameOf(legs[1]))
    const idA = Number(legs[0]?.player_id), idB = Number(legs[1]?.player_id)
    return arr(pairHistorySummary?.top_pairs).find((pr) => {
      const ids = arr(pr?.players).map((x) => Number(x?.player_id)).filter(Boolean)
      if (ids.length === 2) return ids.includes(idA) && ids.includes(idB)
      const nm = [norm(pr?.player_1), norm(pr?.player_2)]
      return nm.includes(a) && nm.includes(b)
    }) || null
  }, [legs, pairHistorySummary])

  if (!legs.length) return null

  const scores = legs.map((p) => scoreFn(p))
  const weaker = legs.length === 2 ? Math.min(...scores) : null
  const sameGame = legs.length === 2 && legs[0]?.game_pk && legs[0].game_pk === legs[1]?.game_pk
  const together = n(hist?.repeat_count, 0)

  return (
    // .pair-tray (2026-08-23): the Games tab now has a fixed game switcher
    // welded to the bottom edge on phones, and this tray sticks to the same
    // edge. MobileCSS lifts it clear of the rail there; the class exists only
    // so that rule has something to aim at.
    <div className="pair-tray" style={{
      position: 'sticky', bottom: 8, zIndex: 30,
      background: `linear-gradient(155deg, ${C.scrim}, ${C.bg2})`,
      border: `1px solid ${legs.length === 2 ? 'rgba(34,211,238,.5)' : C.border2}`,
      borderRadius: 12, padding: '10px 14px', marginTop: 14,
      boxShadow: '0 8px 30px rgba(0,0,0,.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>🔗 Pair tray</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          {legs.length === 2 ? needs : 'tap a TOP, HR or alt chip on another game to complete the pair'}
        </span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {MARKETS.map(([k, lb]) => (
            <button key={k} onClick={() => onMarket?.(k)} style={{
              fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer',
              borderRadius: 999, padding: '2px 9px',
              border: `1px solid ${market === k ? '#22d3ee' : C.border}`,
              background: market === k ? 'rgba(34,211,238,.14)' : 'transparent',
              color: market === k ? '#22d3ee' : C.text3,
            }}>{lb}</button>
          ))}
          <button onClick={onClear} style={{
            fontSize: 9, fontWeight: 700, fontFamily: NUM_FONT, cursor: 'pointer',
            borderRadius: 999, padding: '2px 9px', border: `1px dashed ${C.border2}`,
            background: 'transparent', color: C.text3,
          }}>clear</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }}>
        {legs.map((p, i) => (
          <div key={`${p?.player_id}-${i}`} style={{
            flex: '1 1 200px', minWidth: 0, background: C.bg2,
            border: `1px solid ${C.border}`, borderLeft: '3px solid #22d3ee',
            borderRadius: 9, padding: '6px 11px',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span onClick={() => onPlayerClick?.(p)} style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nameOf(p)}
              </span>
              <b style={{ marginLeft: 'auto', fontSize: 13, fontFamily: NUM_FONT, color: scores[i] === weaker && legs.length === 2 ? '#FCD34D' : '#22d3ee' }}>
                {scores[i].toFixed(0)}
              </b>
              <button onClick={() => onRemove?.(p)} title="drop this leg" style={{
                fontSize: 11, cursor: 'pointer', background: 'transparent', border: 'none', color: C.text3, padding: 0,
              }}>✕</button>
            </div>
            <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
              {teamOf(p)} vs {oppOf(p)} · {clean(p?.pitcher_name, 'TBD')}
              {n(p?.pitcher_hr9, 0) > 0 && ` · ${n(p.pitcher_hr9, 0).toFixed(2)} HR/9`}
            </div>
          </div>
        ))}
        {legs.length === 1 && (
          <div style={{
            flex: '1 1 200px', minWidth: 0, border: `1px dashed ${C.border2}`, borderRadius: 9,
            padding: '6px 11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: C.text3, textAlign: 'center',
          }}>
            tap a chip on another game →
          </div>
        )}
      </div>

      {legs.length === 2 && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 7 }}>
          <b style={{ color: '#FCD34D' }}>Weaker leg {weaker.toFixed(0)}</b> — both have to land, so that
          side decides this pair, not the average.
          {sameGame
            ? <> <b style={{ color: C.orange }}>⚡ Same game</b> — they rise and fall together (co-HR runs
              ~12% more likely in one park, which cuts both ways). A choice, not a mistake.</>
            : <> Different games — independent legs.</>}
          {together >= 2
            ? <> They&apos;ve homered on the same day <b style={{ color: '#22d3ee' }}>{together}×</b> this
              season{hist?.last_hit_date ? ` (last ${String(hist.last_hit_date).slice(5)})` : ''} — history,
              not a forecast: the measured lift is ~1.3× and unproven.</>
            : <> No co-HR history on file for these two — most good pairs don&apos;t have any.</>}
        </div>
      )}
    </div>
  )
}
