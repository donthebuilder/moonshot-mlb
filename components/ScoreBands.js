'use client'
import DenseTable from './DenseTable'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { alpha } from '../lib/scales'
import { useLockedRecord } from '../lib/useLockedRecord'
import { lockedCallsLine } from '../lib/record/lockedRecord'

// 📊 WHAT A SCORE IS WORTH — the band table, on screen.
//
// 2026-08-16, Donovan: "based on the data what band of hr score goes [yard]
// every... like 70 an up, 70-50, 50-30, 40 or lower, unscored... and if you
// can do that for each category too based on hitting a hr, and if you want you
// can do it for hits and hrr, well all the categories."
//
// ── 2026-09-30: THE TABLE IS OFF THE PAGE ───────────────────────────────────
//
// The band table that lived here (SCORE_BANDS from lib/scoreBands.js, seven
// scores x five outcomes, with a "what this says" list under it) was measured
// on post-game graded files: season/L5/L10 HR counts that include that night's
// own home run, and scores from a later re-run. None of its rates can be
// trusted as printed, so the Results tab shows a re-measuring note until the
// bands are rebuilt from the locked pregame record. lib/scoreBands.js keeps
// the old data untouched. bandTint below is still shared with LAMP and TUDDY
// (components/bands/BandTable.js, components/lamp/tabs/Results.js).
//
// ── COLOUR ENCODES LIFT, NOT RATE ───────────────────────────────────────────
//
// What matters is the DEVIATION from an outcome's own base rate, so the ramp
// is diverging and centred on the base, per column. Accent above, grey below, and
// the number is always printed — colour is the second telling, never the only
// one. A cell with no claim is drawn flat.

// The same tint for another sport's theme (2026-09-29, parity: TUDDY's score
// bands are this table now). MOONSHOT (no theme) gets exactly the strings it
// always did; a sport theme gets its own cyan and red at the same alphas.
export function bandTint(lift, claims, T = null, accent = null) {
  const K = T || C
  if (!claims || lift == null) return { bg: 'transparent', fg: K.text3 }
  const t0 = Math.max(-1, Math.min(1, lift / 10))
  if (Math.abs(t0) < 0.08) return { bg: 'transparent', fg: K.text2 }
  if (T) {
    const a0 = Math.abs(t0)
    // ONE ACCENT (2026-10-07 sweep): a lift above the base glows in the product's accent, one below recedes to grey.
    const ac = accent || K.orange || K.green || K.ice
    return { bg: alpha(t0 > 0 ? ac : K.text3, 0.07 + 0.3 * a0), fg: t0 > 0 ? ac : K.text3 }
  }
  return mlbTint(lift, claims)
}

function mlbTint(lift, claims) {
  if (!claims || lift == null) return { bg: 'transparent', fg: C.text3 }
  // Saturate at 10 points, which is roughly the largest honest lift in the
  // table — beyond that the ramp would compress everything real into one hue.
  const t = Math.max(-1, Math.min(1, lift / 10))
  const a = Math.abs(t)
  if (a < 0.08) return { bg: 'transparent', fg: C.text2 }
  // ONE ACCENT (2026-10-07 sweep): above the base glows in the accent, below recedes to grey.
  return {
    bg: alpha(t > 0 ? C.orange : C.text3, 0.07 + 0.3 * a),
    fg: t > 0 ? C.orange : C.text3,
  }
}

// ── 2026-10-01: BACK, FROM THE CLEAN RECORD ─────────────────────────────────
//
// The bands are counted from the locked pregame record by the calibration
// reader (2026-10-06): two scores, every band with its count. Colour is the
// lift against the board's own home-run base, the same ramp as before.
function BandList({ title, bands, base }) {
  // THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): the band and what
  // it homered at, tinted against the base as before.
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.08em', color: C.text2, padding: '0 0 4px', fontFamily: NUM_FONT }}>{title}</div>
      <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={20} caption={`${title}: home-run rate by band`}
        rows={bands.map((b) => ({ ...b, _key: b.band }))}
        columns={[
          { key: 'band', label: 'Band', heat: false, sticky: true, w: 80, fmt: (v) => <b>{v}</b> },
          { key: 'rate', label: 'Homered', heat: false, numeric: false, w: 120, fmt: (v, b) => {
            // under the minimum a band prints its count and no rate (lib/calibration MIN_N)
            if (v == null || b.n < 30) return <span style={{ color: C.text3, fontSize: 11 }}>{b.hits}/{b.n.toLocaleString('en-US')} · too few</span>
            const { bg, fg } = bandTint(v - base, true)
            return <span style={{ background: bg, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}><b style={{ color: fg }}>{Number(v).toFixed(1)}%</b><span style={{ color: C.text3, fontSize: 11 }}> {b.hits}/{b.n.toLocaleString('en-US')}</span></span> } },
        ]} />
    </div>
  )
}

export default function ScoreBands() {
  // 2026-10-06 (ledger audit P0-2): the bands are counted from the LOCKED record -- the same
  // reader as the tier table (lib/calibration), board rows stamped before first pitch --
  // not the hard-coded Sep 9-30 measurement that included nights stamped after first pitch.
  const rec = useLockedRecord()
  const bands = rec?.bands
  const base = rec?.board?.hrRate
  if (!rec || !bands || base == null) {
    return <p style={{ margin: 0, fontSize: 12, lineHeight: 1.72, color: C.text3, maxWidth: 800 }}>Reading the locked record…</p>
  }
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.72, color: C.text2, maxWidth: 800 }}>
        <b style={{ color: C.text }}>What a score has been worth</b>, on the {rec.source}: the board
        as it stood at first pitch, {rec.board.n.toLocaleString('en-US')} hitter-games, a{' '}
        {base.toFixed(1)}% home-run base. Only board rows stamped before first pitch count
        ({lockedCallsLine(rec, rec.board.n).replace('calls', 'hitter-games')}).
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 32px', alignItems: 'flex-start' }}>
        <BandList title="HR SCORE" bands={bands.hr} base={base} />
        <BandList title="HRW" bands={bands.hrw} base={base} />
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.6, color: C.text3, maxWidth: 800 }}>
        {rec.nights} nights is a small sample: read the bands as direction, and a band under 30 hitter-games shows its
        count and no rate. A score is a ranking, not a chance.
      </p>
    </div>
  )
}
