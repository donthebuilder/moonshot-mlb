'use client'
import { C, NUM_FONT } from '../lib/theme'

// ⚔️ THE DUEL LADDER (2026-08-29).
//
// Donovan, on the pitcher panels: "when comparing what the pitcher and batter
// doing vs mix and with mix its hard to even make out — that needs to be
// better." The comparison lived as Matchup DNA: ONE 34px stacked strip where
// width was usage and colour was the batter's xwOBA. Two variables crammed
// into one bar meant neither could be read — a 12%-usage segment's colour is
// a sliver, and colour alone can't be ranked by eye.
//
// This unstacks it. One row per pitch, two aligned bars:
//
//   ── usage ──────────▉   how often the arm throws it (top bar, cool)
//   ── damage ──▉          what THIS batter does to it   (bottom bar, warm)
//
// Both bars share the row's full width, each on its own stated scale, with
// the number printed at the end of each bar — the pairing is the read: a long
// top bar over a long bottom bar is a pitch he'll see a lot and hits hard.
// That pitch gets the THE DOOR tag (highest usage × damage with a real
// sample), the same vocabulary the zone map already uses for the same idea.
//
// Thin samples don't get a colour: under MIN_BBE batted balls the damage bar
// is drawn hollow and labelled "no read", because unknown is not average.
//
// The composite DNA number survives unchanged — same weights, same honest
// denominator (only pitches with a real sample count, and the caption says
// how much of the arsenal that covers).

const MIN_BBE = 5
const XW_LO = 0.250   // damage bar scale — league-ish floor for xwOBA
const XW_HI = 0.450   // and a slugger's ceiling; both printed in the caption

export const PITCH_WORDS = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper',
  CU: 'Curve', KC: 'K-Curve', CH: 'Changeup', FS: 'Splitter', FA: 'Fastball',
  SV: 'Slurve', KN: 'Knuckle', EP: 'Eephus', FO: 'Forkball', CS: 'Slow curve',
}

const heat = (xw) => Math.max(0, Math.min(1, (xw - XW_LO) / (XW_HI - XW_LO)))

// rows: [{ pt, use, xw, bbe, hr }] — pt = pitch code, use = usage %,
// xw = this batter's xwOBA vs that pitch (null when unknown), bbe, hr counts.
export default function MixDuel({
  rows = [],
  pitcherName = 'the arm',
  batterName = 'this batter',
  sideNote = null,          // e.g. 'vs LHB — the side he bats from'
}) {
  const segs = rows
    .filter((s) => Number.isFinite(Number(s.use)) && Number(s.use) >= 3)
    .sort((a, b) => Number(b.use) - Number(a.use))
  if (!segs.length) return null

  const known = segs.filter((s) => s.bbe >= MIN_BBE && s.xw != null)
  const knownUse = known.reduce((t, x) => t + x.use, 0)
  const dna = knownUse > 0
    ? known.reduce((t, x) => t + x.use * heat(x.xw), 0) / knownUse
    : null
  const door = known.length
    ? [...known].sort((a, b) => b.use * heat(b.xw) - a.use * heat(a.xw))[0]
    : null
  const doorOn = door && door.use * heat(door.xw) > 0
  const maxUse = Math.max(...segs.map((s) => s.use), 1)

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>⚔️ The duel</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          what he&apos;ll see × what he does to it{sideNote ? ` · ${sideNote}` : ''}
        </span>
        {dna != null && (
          <span
            style={{
              marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
              color: dna >= 0.55 ? C.orange : dna >= 0.35 ? '#FCD34D' : C.blue,
            }}
            title={`Usage-weighted damage across the ${knownUse.toFixed(0)}% of the arsenal where ${batterName} has ${MIN_BBE}+ batted balls of history. Same number the old DNA strip printed.`}
          >{(100 * dna).toFixed(0)}</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {segs.map((s) => {
          const has = s.bbe >= MIN_BBE && s.xw != null
          const h = has ? heat(s.xw) : 0
          const isDoor = doorOn && door && s.pt === door.pt
          return (
            <div
              key={s.pt}
              title={has
                ? `${PITCH_WORDS[s.pt] || s.pt}: ${pitcherName} throws it ${s.use.toFixed(0)}% — ${batterName} ${s.xw.toFixed(3)} xwOBA, ${s.hr} HR on ${s.bbe} batted balls`
                : `${PITCH_WORDS[s.pt] || s.pt}: ${pitcherName} throws it ${s.use.toFixed(0)}% — ${batterName} has under ${MIN_BBE} batted balls against it, so no read (unknown, not average)`}
              style={{
                border: `1px solid ${isDoor ? 'rgba(249,115,22,.55)' : C.border}`,
                background: isDoor ? 'rgba(249,115,22,.05)' : 'transparent',
                borderRadius: 9, padding: '6px 10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, minWidth: 74 }}>
                  {PITCH_WORDS[s.pt] || s.pt}
                </span>
                <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{s.pt}</span>
                {isDoor && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 8, fontWeight: 900, letterSpacing: '.09em',
                    color: C.orange, border: '1px solid rgba(249,115,22,.5)', borderRadius: 99,
                    padding: '1px 7px', fontFamily: NUM_FONT,
                  }}>THE DOOR</span>
                )}
              </div>

              {/* usage — how often he'll see it */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4 }}>
                <span style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT, width: 44, textAlign: 'right', flexShrink: 0, letterSpacing: '.05em' }}>THROWN</span>
                <div style={{ flex: 1, height: 7, borderRadius: 4, background: C.bg3, overflow: 'hidden' }}>
                  <div style={{ width: `${(100 * s.use) / maxUse}%`, height: '100%', borderRadius: 4, background: 'rgba(96,165,250,.75)' }} />
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.text2, width: 40, flexShrink: 0 }}>{s.use.toFixed(0)}%</span>
              </div>

              {/* damage — what this batter does to it */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                <span style={{ fontSize: 7.5, color: C.text3, fontFamily: NUM_FONT, width: 44, textAlign: 'right', flexShrink: 0, letterSpacing: '.05em' }}>HIS BAT</span>
                <div style={{
                  flex: 1, height: 7, borderRadius: 4, overflow: 'hidden',
                  background: C.bg3,
                  ...(has ? {} : { border: `1px dashed ${C.border2}`, background: 'transparent', height: 5 }),
                }}>
                  {has && (
                    <div style={{
                      width: `${(100 * h).toFixed(1)}%`, height: '100%', borderRadius: 4,
                      background: `rgba(249, ${Math.round(163 - 60 * h)}, ${Math.round(90 - 68 * h)}, ${0.45 + 0.55 * h})`,
                    }} />
                  )}
                </div>
                <span style={{ fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT, color: has ? (h >= 0.55 ? C.orange : C.text2) : C.text3, width: 40, flexShrink: 0 }}>
                  {has ? s.xw.toFixed(3) : 'no read'}
                </span>
              </div>

              {has && s.hr > 0 && (
                <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 3, paddingLeft: 51 }}>
                  {s.hr} of his HR came off this pitch · {s.bbe} batted balls
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        Top bar: share of {pitcherName}&apos;s pitches (scaled to his most-used). Bottom bar: {batterName}&apos;s
        xwOBA on that pitch type, drawn {XW_LO.toFixed(3)}–{XW_HI.toFixed(3)}. A long bar over a long bar is
        the matchup — <b style={{ color: C.orange }}>THE DOOR</b> marks the biggest usage×damage product with a
        real sample. A dashed bar is under {MIN_BBE} batted balls of history: unknown, not average.
      </div>
    </div>
  )
}
