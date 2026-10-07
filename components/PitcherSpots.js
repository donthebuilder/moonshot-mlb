'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, nameOf, hrScore, hitScore, prodScore, median } from '../lib/player'
import DenseTable from './DenseTable'

// Where this pitcher actually gets hurt, spot by spot.
//
// Ported from streamlit_app.py's spot_answer(). The bot stamps every BATTER
// row with the pitcher's damage in THAT batter's lineup slot
// (pitcher_spot_damage_score / _label / _reason), so walking his opposing
// lineup reconstructs the full nine-spot map — the same structure Streamlit
// builds, assembled from the other side.
//
// The verdict thresholds are copied exactly, including the order they're
// checked in. Sample size is tested FIRST and on purpose: 8 plate appearances
// can't answer anything, and the bot's own HOT/WARM labels get shaky under
// about 15. Getting that order wrong turns a three-PA fluke into "he gets
// hurt here", which is the single most expensive mistake this panel could make.

// ── ONE DIRECTION FOR THE WHOLE MODAL (2026-08-22) ──────────────────────────
//
// This function used to paint "YES — he gets hurt here" in C.red and "NO —
// pitcher's advantage" in C.green, forty pixels above a heatmap whose bright
// end ALSO meant "he gets hurt here". Two encodings of one idea, pointing
// opposite ways, on the same card: red said good-for-the-bat and bright said
// good-for-the-bat, so the reader had to hold two conventions at once.
//
// The whole modal now reads in one direction — WARM IS GOOD FOR THE BAT —
// which is the direction the ramp already had and the direction someone
// reading a hitter's page is thinking in. The words are unchanged; only the
// hue moved, onto the diverging scale's two ends via theme tokens so it
// follows light/dark.
//
// Thresholds are the bot's own and are untouched, including the order they are
// checked in: sample size FIRST, because three PA is the easiest way to talk
// yourself into a bad spot.
function verdictFor({ dmg, pa, label, ownMed }) {
  if (pa < 10) return { text: 'NOT ENOUGH DATA', color: C.text3, rank: 0 }
  if (label === 'HOT' || label === 'WARM' || (dmg >= 50 && dmg > ownMed + 12)) {
    return { text: 'YES — he gets hurt here', color: C.orange, rank: 3 }
  }
  if (dmg <= 15 || label === 'PITCHER ADV') {
    return { text: "NO — pitcher's advantage", color: C.blue, rank: 1 }
  }
  return { text: 'NEUTRAL', color: C.text2, rank: 2 }
}


// "spot #1: 39 PA, 0.324 SLG, 0.088 ISO, HR rate 2.6%, XBH rate 2.6%, HH 27.3%"
function parseReason(reason) {
  const s = clean(reason, '')
  const num = (re) => {
    const m = s.match(re)
    return m ? Number(m[1]) : null
  }
  return {
    pa: num(/([\d.]+)\s*PA/i),
    slg: num(/([\d.]+)\s*SLG/i),
    iso: num(/([\d.]+)\s*ISO/i),
    hrRate: num(/HR rate\s*([\d.]+)%/i),
    xbhRate: num(/XBH rate\s*([\d.]+)%/i),
    hh: num(/HH\s*([\d.]+)%/i),
  }
}

const COLUMNS = [
  { key: 'spot', group: 'Spot',    label: 'Spot',   heat: false, w: 40, mono: true, bold: true, sticky: true },
  { key: 'batter', group: 'Spot',  label: 'Batter', heat: false, w: 146, bold: true },
  { key: 'bats', group: 'Spot',    label: 'B',      heat: false, w: 22, mono: true, dim: true },
  { key: 'label', group: 'Bot call',   label: 'Bot call', heat: false, w: 96, dim: true },
  { key: 'verdict', group: 'Bot call', label: 'Verdict', heat: false, w: 168,
    fmt: (v, r) => v,
  },
  { key: 'weak', group: 'Bot call',    label: '★',      flag: true, mark: '★', w: 30 },
  // 2026-08-12: "Damage" here was matching the GLOSSARY entry written for a
  // HITTER's own damage-conversion rate ("when HE hits it hard..."). This is
  // the opposite side of the ball — how much damage HITTERS have done TO
  // THIS PITCHER in this lineup spot.
  // THE ONE SCORE TABLE THAT DOES NOT DIVERGE AGAINST ITS FIELD (2026-08-22).
  // Every other 0-100 score on the site is now anchored on the middle of the
  // rows on screen. This table has NINE rows — a pitcher's nine lineup spots —
  // and nine is not a field: the tenth and ninetieth percentile are the min
  // and max, so the "ceiling" would be the range and the scale would be a
  // min/max stretch wearing a diverging coat. lib/scales.js refuses anything
  // under twelve for exactly that reason. The diverging read this table wants
  // already exists and is honest: `vs own`, below, against his other eight.
  { key: 'damage', group: 'Damage in spot',  label: 'Damage', w: 52, dp: 1, scale: 'seq', domain: [0, 100], primary: true,
    explain: 'How much damage hitters have done against this pitcher specifically in this lineup spot — his vulnerability here, not a hitter\'s own damage-conversion rate.' },
  { key: 'vsOwn', group: 'Damage in spot',   label: 'vs own', w: 52, dp: 1, scale: 'div', anchor: 0, ceiling: 40, anchorLabel: 'his other eight spots',
    title: 'Damage in this spot minus the median across his other eight. ▲ he is worse here than he is elsewhere; ▼ better.' },
  { key: 'pa', group: 'Damage in spot',      label: 'PA',     w: 40, heat: false, mono: true,
    title: 'The denominator under every rate in this row. A count, so it prints as a count.' },
  { key: 'slg', group: 'Allowed in spot',     label: 'SLG ag', w: 50, dp: 3, scale: 'div', anchor: 0.400, ceiling: 0.30, anchorLabel: 'league .400',
    title: 'Slugging allowed in this spot, against what league-average pitching allows' },
  { key: 'iso', group: 'Allowed in spot',     label: 'ISO ag', w: 50, dp: 3, scale: 'div', anchor: 0.160, ceiling: 0.25, anchorLabel: 'league .160',
    title: 'Isolated power allowed in this spot, against league' },
  // Same GLOSSARY['hr'] score-collision fix as MatchupPitcher.js's tables.
  { key: 'hrRate', group: 'Allowed in spot',  label: 'HR%',    w: 44, dp: 1,
    explain: 'Home runs as a share of plate appearances against hitters in this lineup spot.' },
  { key: 'xbhRate', group: 'Allowed in spot', label: 'XBH%',   w: 46, dp: 1 },
  { key: 'hh', group: 'Allowed in spot',      label: 'HH%',    w: 44, dp: 1 },
  { key: 'zone', group: 'Tonight',    label: 'Zone',   w: 44, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'hr', group: 'Tonight',      label: 'HR scr', w: 48, dp: 1, scale: 'seq', domain: [0, 100] },
  { key: 'hit', group: 'Tonight',     label: 'Hit',    w: 44, dp: 1 },
  { key: 'hrr', group: 'Tonight',     label: 'HRR',    w: 44, dp: 1 },
]

// VISUAL PASS (2026-10-07, Donovan: the lineup / history section is "big boxes"): the verdict callout,
// the four tiles, the nine accordion cards and the heatmap are gone. What stays is the question and its
// answer in one line, the spot pills, and ONE DenseTable (skin v2, columns in groups) of the nine spots:
// every number the tiles, cards and heatmap carried is a column of it. One accent: the bot's HOT / WARM
// verdict and the starred weak spots are the warm ones; everything else is quiet text.
export default function PitcherSpots({ pitcher, onPlayerClick }) {
  const lineup = useMemo(() => (pitcher?.lineup || []).filter(Boolean), [pitcher])

  const spots = useMemo(() => {
    const built = lineup.map((b) => {
      const raw = b.raw || {}
      const parsed = parseReason(raw.pitcher_spot_damage_reason)
      return {
        _key: b.player_id ?? b.name,
        _raw: raw,
        spot: b.lineup_spot ?? null,
        batter: clean(b.name, nameOf(raw)),
        bats: clean(b.bats, '?'),
        label: clean(raw.pitcher_spot_damage_label, '—'),
        weak: b.weak_spot_flag ? 1 : 0,
        weakReason: clean(raw.weak_spot_reason, ''),
        damage: n(raw.pitcher_spot_damage_score, 0),
        zone: n(raw.pitcher_zone_damage_score, 0),
        pa: parsed.pa ?? 0,
        slg: parsed.slg ?? 0,
        iso: parsed.iso ?? 0,
        hrRate: parsed.hrRate ?? 0,
        xbhRate: parsed.xbhRate ?? 0,
        hh: parsed.hh ?? 0,
        hr: n(b.hr_score, hrScore(raw)),
        hit: hitScore(raw),
        hrr: prodScore(raw),
      }
    })
    // Median across his OTHER spots, per spot -- the comparison Streamlit makes.
    return built.map((r) => {
      const others = built.filter((o) => o.spot !== r.spot).map((o) => o.damage)
      const ownMed = median(others)
      const v = verdictFor({ dmg: r.damage, pa: r.pa, label: r.label, ownMed })
      return { ...r, ownMed, vsOwn: r.damage - ownMed, verdict: v.text, verdictColor: v.color, severity: v.rank }
    })
  }, [lineup])

  const [pick, setPick] = useState(null)
  if (!spots.length) return null

  const ranked = [...spots].sort((a, b) => b.damage - a.damage)
  // Default to his worst spot rather than the 1-hole: opening on #1 every time makes you click through nine pills.
  const sel = spots.find((r) => String(r.spot) === String(pick)) || ranked[0]
  const hurtCount = spots.filter((s) => s.severity === 3).length
  const thinCount = spots.filter((s) => s.pa < 10).length

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 5 }}>
        Does {clean(pitcher?.pitcher_name, 'he')} get hurt in the …
      </div>
      <div className="chip-row" style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
        {spots.map((r) => {
          const on = String(r.spot) === String(sel.spot)
          return (
            <button
              key={r.spot ?? r.batter}
              onClick={(e) => { e.stopPropagation(); setPick(r.spot) }}
              title={`${r.batter} · ${r.verdict}`}
              style={{
                minHeight: 44, minWidth: 44, padding: '0 10px', borderRadius: 7, cursor: 'pointer', flexShrink: 0,
                fontSize: 12, fontWeight: 700, fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >{r.spot ?? '?'}{r.weak ? ' ★' : ''}</button>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.55, marginBottom: 8, paddingLeft: 10, borderLeft: `2px solid ${sel.severity === 3 ? C.orange : C.border2}` }}>
        <b style={{ color: sel.severity === 3 ? C.orange : C.text }}>{sel.spot ?? '?'}-hole: {sel.verdict}</b>
        <span style={{ fontFamily: NUM_FONT, color: C.text3 }}> · damage {sel.damage.toFixed(1)} ({sel.label}) · {sel.pa} PA · #{ranked.findIndex((r) => r.spot === sel.spot) + 1} of {spots.length} of his spots</span>
        <div>Batting {sel.spot ?? '?'} today: <b style={{ color: C.text }}>{sel.batter}</b> ({sel.bats}HB) · HR {sel.hr.toFixed(0)} · HRR {sel.hrr.toFixed(0)}</div>
        {sel.weakReason && <div style={{ color: C.text2 }}>★ {sel.weakReason}</div>}
        <div style={{ fontSize: 11, color: C.text3 }}>
          {clean(sel._raw?.pitcher_spot_damage_reason, '')}
        </div>
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>
        {hurtCount} of {spots.length} spots read as live{thinCount > 0 && ` · ${thinCount} on under 10 PA`}
      </div>
      <DenseTable
        rows={spots}
        columns={COLUMNS}
        onRowClick={onPlayerClick}
        dimRow={(r) => r.pa < 10}
        maxHeight={9999}
        bare
        caption="Lineup slot by damage, in batting order: click Damage to rank. Verdict thresholds are the bot's own: under 10 PA is NOT ENOUGH DATA regardless of how the damage reads, because a three-PA fluke is the easiest way to talk yourself into a bad spot. SLG ag and ISO ag are drawn against what league pitching allows; vs own is against his other eight spots."
      />
    </div>
  )
}
