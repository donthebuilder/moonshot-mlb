'use client'
import DenseTable from './DenseTable'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { alpha } from '../lib/scales'
import { CLEAN_SOURCE, CLEAN_NIGHTS, CLEAN_HITTER_GAMES, CLEAN_HR_BASE, CLEAN_HR_BANDS, CLEAN_HRW_BANDS } from '../lib/cleanRecord'

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
// is diverging and centred on the base, per column. Cyan above, red below, and
// the number is always printed — colour is the second telling, never the only
// one. A cell with no claim is drawn flat.

// The same tint for another sport's theme (2026-09-29, parity: TUDDY's score
// bands are this table now). MOONSHOT (no theme) gets exactly the strings it
// always did; a sport theme gets its own cyan and red at the same alphas.
export function bandTint(lift, claims, T = null) {
  const K = T || C
  if (!claims || lift == null) return { bg: 'transparent', fg: K.text3 }
  const t0 = Math.max(-1, Math.min(1, lift / 10))
  if (Math.abs(t0) < 0.08) return { bg: 'transparent', fg: K.text2 }
  if (T) {
    const a0 = Math.abs(t0)
    return { bg: alpha(t0 > 0 ? K.cyan : K.red, 0.07 + 0.3 * a0), fg: t0 > 0 ? K.cyan : K.red }
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
  const hue = t > 0 ? '34,211,238' : '248,113,113'
  return {
    bg: `rgba(${hue},${(0.07 + 0.3 * a).toFixed(3)})`,
    fg: t > 0 ? C.cyan : C.red,
  }
}

// ── 2026-10-01: BACK, FROM THE CLEAN RECORD ─────────────────────────────────
//
// The bands return measured on the locked pregame record (lib/cleanRecord.js,
// 21 nights, Sep 9-30), two scores only, exactly as measured: a band prints
// its count where the measure recorded one and its rate alone where it did
// not. Colour is the lift against the 11.5% base, the same ramp as before.
function BandList({ title, bands }) {
  // THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b): the band and what
  // it homered at, tinted against the base as before.
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.08em', color: C.text2, padding: '0 0 4px', fontFamily: NUM_FONT }}>{title}</div>
      <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={20} caption={`${title}: home-run rate by band`}
        rows={bands.map((b) => ({ ...b, _key: b.band }))}
        columns={[
          { key: 'band', label: 'Band', heat: false, sticky: true, w: 80, fmt: (v) => <b>{v}</b> },
          { key: 'pct', label: 'Homered', heat: false, numeric: false, w: 120, fmt: (v, b) => {
            const { bg, fg } = bandTint(v - CLEAN_HR_BASE, true)
            return <span style={{ background: bg, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}><b style={{ color: fg }}>{Number(v).toFixed(1)}%</b>{b.ok != null ? <span style={{ color: C.text3, fontSize: 11 }}> {b.ok}/{b.n.toLocaleString('en-US')}</span> : null}</span> } },
        ]} />
    </div>
  )
}

export default function ScoreBands() {
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, lineHeight: 1.72, color: C.text2, maxWidth: 800 }}>
        <b style={{ color: C.text }}>What a score has been worth</b>, on the {CLEAN_SOURCE}: the board
        as it stood at first pitch, {CLEAN_HITTER_GAMES.toLocaleString('en-US')} hitter-games, an{' '}
        {CLEAN_HR_BASE}% home-run base. The older bands were measured on post-game files and are gone.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 32px', alignItems: 'flex-start' }}>
        <BandList title="HR SCORE" bands={CLEAN_HR_BANDS} />
        <BandList title="HRW" bands={CLEAN_HRW_BANDS} />
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.6, color: C.text3, maxWidth: 800 }}>
        {CLEAN_NIGHTS} nights is a small sample, and the middle bands carry no count in the measure, so read
        them as direction. HRW&apos;s middle bands do not step down in order. A score is a ranking, not a chance.
      </p>
    </div>
  )
}
