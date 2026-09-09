'use client'
import { C, NUM_FONT } from '../lib/theme'
import { statLineFor, hrRateBoxes, useSlateScale, toneFor, toneTitle, TONE_COLOR, marketKey } from '../lib/statline'

// 📊 The stat row that now leads every card. See lib/statline.js for why.
//
// Design rules, all of them learned from staring at the two sites people find
// easier to read than ours:
//
//   1. LABEL ABOVE, NUMBER BELOW. Not "Barrel 24.3%" on one line — the eye
//      scans a column of numbers far faster than it parses label-value pairs,
//      and the label only has to be read once.
//   2. COLOUR IS THE WHOLE POINT. Green helps this bat tonight, red doesn't,
//      grey is middling. Ranked against tonight's slate, never against an
//      invented league baseline. Every chip's tooltip says so.
//   3. NOTHING RENDERS EMPTY. A stat with no published value is dropped, not
//      dashed. Four dashes in a row is worse than three stats.

export default function StatStrip({ p, type = 'hr', count = 4, size = 'md', style }) {
  const scale = useSlateScale()
  const stats = statLineFor(p, type, count)
  if (!stats.length) return null

  const sm = size === 'sm'
  return (
    <div
      className="stat-strip"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
        gap: sm ? 4 : 6,
        ...style,
      }}
    >
      {stats.map((s) => {
        const tone = toneFor(scale, s)
        const col = tone ? TONE_COLOR[tone] : C.text2
        return (
          <div
            key={s.id}
            title={toneTitle(tone, scale, s)}
            style={{
              minWidth: 0, textAlign: 'center', cursor: 'default',
              background: tone === 'mid' || !tone ? 'rgba(255,255,255,.03)' : `${col}12`,
              border: `1px solid ${tone === 'mid' || !tone ? C.border : `${col}44`}`,
              borderRadius: 7, padding: sm ? '3px 2px 4px' : '4px 3px 5px',
            }}
          >
            <div style={{
              fontSize: sm ? 7.5 : 8, letterSpacing: '.05em', textTransform: 'uppercase',
              color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
              overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3,
            }}>{s.label}</div>
            <div style={{
              fontSize: sm ? 11 : 12.5, fontWeight: 800, color: col,
              fontFamily: NUM_FONT, lineHeight: 1.2, whiteSpace: 'nowrap',
            }}>{s.text}</div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * ⚾ THE SLASH LINE (2026-08-09, Donovan: "BA 0.242 · HR 22 · K 24% · BABIP
 * 0.267 · HR/9 1.3 — that row can be cooler. also add like rbi, milestones,
 * runs, bases.")
 *
 * It was five unrelated numbers in grey, separated by dots, in the colour this
 * site uses for things that don't matter — and two of them (BABIP, the arm's
 * HR/9) aren't even about the hitter's season.
 *
 * Baseball already has the right answer and has had it for a century: the
 * SLASH LINE. .242 / .312 / .460 is three numbers in a fixed order that
 * anybody who watches ball reads without stopping, and anybody who doesn't can
 * learn once from the three labels under it. Then his counting stats — homers,
 * RBI, runs, extra-base hits — which is what "add RBI, runs, bases" is asking
 * for and what the old row never had room to say.
 *
 * FIELDS: season_avg / season_obp / season_slg are on every slate row. The
 * counting stats are NOT published season-wide in the slim payload — only
 * season_hr is — so R, RBI and XBH come from the last-5 window that IS
 * published (last5_runs / last5_rbi / last5_xbh) and the row LABELS ITSELF as
 * such. Mixing a season HR total into a row of five-game counts without saying
 * so is exactly the kind of quiet unit-mixing worth avoiding.
 */
// WHICH COUNTS A MARKET CARES ABOUT (2026-08-09, Donovan: "on the four it
// needs to be for the HRR pick last with runs and RBI — so last 5 hits, runs,
// RBI").
//
// The first version printed the same four counts on every card, led by season
// homers. That's right for an HR pick and wrong for the others: an HRR pick is
// graded on hits + runs + RBI, so those three ARE the pick, and showing him
// season homers instead is showing the wrong market's evidence on his card.
// Each market now leads with the counts it is actually graded on.
const COUNTS = {
  hr:      ['hrSeason', 'rbi', 'runs', 'xbh'],
  top:     ['hrSeason', 'rbi', 'runs', 'xbh'],
  // graded on 2+ of (hits + runs + RBI) — so those three, in that order
  hrr:     ['hits', 'runs', 'rbi'],
  hit:     ['hits', 'xbh', 'runs'],
  contact: ['xbh', 'hits', 'rbi'],
}

export function SlashLine({ p, type = 'hr', style }) {
  const val = (k) => {
    const v = Number(p?.[k])
    return Number.isFinite(v) ? v : null
  }
  const avg = val('season_avg'); const obp = val('season_obp'); const slg = val('season_slg')
  const three = [['AVG', avg], ['OBP', obp], ['SLG', slg]].filter(([, v]) => v != null)
  const fmt = (v) => v.toFixed(3).replace(/^0/, '')

  const POOL = {
    hrSeason: ['HR', val('season_hr'), 'Home runs this season.', true],
    hits: ['H', val('last5_hits'), 'Hits over his last 5 games.', false],
    runs: ['R', val('last5_runs'), 'Runs scored over his last 5 games.', false],
    rbi: ['RBI', val('last5_rbi'), 'Runs batted in over his last 5 games.', false],
    xbh: ['XBH', val('last5_xbh'), 'Extra-base hits — doubles, triples and homers — over his last 5 games.', false],
  }
  const order = COUNTS[marketKey(type)] || COUNTS.hr
  const counts = order.map((k) => POOL[k]).filter(([, v]) => v != null)
  // The L5 marker only earns its place when a five-game count is on screen —
  // an HR-only row is a season number and shouldn't wear a window label.
  const anyWindowed = counts.some(([, , , season]) => !season)

  if (!three.length && !counts.length) return null

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', ...style }}>
      {three.length === 3 && (
        <div title="His season slash line: batting average / on-base percentage / slugging percentage.">
          <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 800, color: C.text, letterSpacing: '-.01em', lineHeight: 1.15 }}>
            {fmt(avg)}<span style={{ color: C.text3, fontWeight: 400 }}>/</span>{fmt(obp)}<span style={{ color: C.text3, fontWeight: 400 }}>/</span>{fmt(slg)}
          </div>
          <div style={{ fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3, letterSpacing: '.06em', display: 'flex', justifyContent: 'space-between' }}>
            <span>AVG</span><span>OBP</span><span>SLG</span>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
        {counts.map(([lab, v, tip], i) => (
          <span key={lab} title={tip} style={{ fontFamily: NUM_FONT, fontSize: 10.5, color: C.text2, cursor: 'default', whiteSpace: 'nowrap' }}>
            <b style={{ color: i === 0 ? C.orange : C.text, fontWeight: 800 }}>{v}</b>
            <span style={{ color: C.text3, fontSize: 8.5 }}> {lab}</span>
          </span>
        ))}
        {anyWindowed && (
          <span style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}
            title="Hits, runs, RBI and extra-base hits are his LAST 5 GAMES — the slate publishes those as a five-game window, not a season count. Home runs, where shown, are the season total.">
            L5 ⓘ
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * HR rate over the published windows.
 *
 * The competitors' most-copied element, built honestly: L5 and L10 are per
 * GAME, season is per PLATE APPEARANCE, and each box prints its own
 * denominator underneath so the two units are never silently compared.
 */
export function HitRateBoxes({ p, style }) {
  const boxes = hrRateBoxes(p)
  if (!boxes.length) return null
  return (
    <div className="stat-strip" style={{
      display: 'grid', gridTemplateColumns: `repeat(${boxes.length}, minmax(0, 1fr))`,
      gap: 5, ...style,
    }}>
      {boxes.map((b) => {
        // Colour is on the COUNT, not the rate: "he has gone deep recently" is
        // the fact. No thresholds pretending to be a probability.
        const hot = b.num > 0
        const col = hot ? C.orange : C.text3
        return (
          <div key={b.id}
            title={`${b.num} home run${b.num === 1 ? '' : 's'} in his last ${b.den} ${b.unit === 'G' ? 'games' : 'plate appearances'}.`}
            style={{
              minWidth: 0, textAlign: 'center', cursor: 'default',
              background: hot ? `${C.orange}12` : 'rgba(255,255,255,.03)',
              border: `1px solid ${hot ? `${C.orange}44` : C.border}`,
              borderRadius: 7, padding: '4px 3px 5px',
            }}>
            <div style={{
              fontSize: 8, letterSpacing: '.05em', textTransform: 'uppercase',
              color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.3,
            }}>{b.label}</div>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: col, fontFamily: NUM_FONT, lineHeight: 1.2 }}>
              {b.num} HR
            </div>
            <div style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT, lineHeight: 1.3 }}>
              in {b.den} {b.unit}
            </div>
          </div>
        )
      })}
    </div>
  )
}
