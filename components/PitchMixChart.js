'use client'
import { C, NUM_FONT } from '../lib/theme'

// 🥧 THE PITCH MIX, DRAWN TO BE READ (2026-08-29).
//
// Donovan: "the pitch mix looks on the modal — the chart is bad and hard to
// read and understand, please make better." The arsenal lived only as a
// ten-column heat table: complete, but the first question — WHAT DOES THIS
// GUY ACTUALLY THROW, and which of it is dangerous — took real decoding.
//
// This is the readable layer that sits ABOVE that table (the table stays;
// nothing is deleted, per the house rule). One row per pitch:
//   · the pitch's NAME, in words, big enough to read on a phone
//   · a thick usage bar on a shared 0-100% scale with the number ON the bar
//   · a damage tag on the right — HR allowed per batted ball against that
//     pitch, tinted by how bad it is, with the count so the sample is honest
// Sorted by usage, because "what does he throw" is a usage question first.
// One summary sentence up top so the answer exists in words too.

const DMG_HOT = 12   // HR/BBE% at/above this reads red — getting hurt
const DMG_WARM = 6   // and this reads amber — worth a look

function damageTone(rate, seen) {
  if (!Number.isFinite(rate) || !seen) return { color: C.text3, label: null }
  if (rate >= DMG_HOT) return { color: '#f87171', label: 'gets hurt' }
  if (rate >= DMG_WARM) return { color: '#fbbf24', label: 'leaks' }
  return { color: C.text3, label: null }
}

export default function PitchMixChart({
  rows = [],            // [{ code, pitch, usage, hr, bbe, hrRate }]
  accent = C.orange,    // bar color
  title = 'What he throws',
  sub = null,           // small caption next to the title
}) {
  const usable = rows
    .filter((r) => Number.isFinite(Number(r.usage)) && Number(r.usage) > 0)
    .sort((a, b) => Number(b.usage) - Number(a.usage))
  if (!usable.length) return null

  const maxUsage = Math.max(...usable.map((r) => Number(r.usage)), 1e-9)
  const topTwo = usable.slice(0, 2)
  const topShare = topTwo.reduce((a, r) => a + Number(r.usage), 0)

  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
      padding: '11px 14px', marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.07em', textTransform: 'uppercase', color: C.text2, fontFamily: NUM_FONT }}>
          {title}
        </span>
        {sub && <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{sub}</span>}
      </div>

      {/* The answer in one sentence, before any bar. */}
      <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.5, marginBottom: 9 }}>
        Mostly <b style={{ color: C.text }}>{topTwo.map((r) => r.pitch).join(' + ')}</b> —{' '}
        {topShare.toFixed(0)}% of everything he throws
        {(() => {
          const hot = usable.filter((r) => damageTone(Number(r.hrRate), Number(r.bbe)).label && Number(r.bbe) >= 10)
            .sort((a, b) => Number(b.hrRate) - Number(a.hrRate))[0]
          if (!hot) return <>. Nothing in the mix is getting hit out at a notable rate.</>
          return (
            <>
              . The one to watch is the <b style={{ color: '#f87171' }}>{hot.pitch}</b>:{' '}
              {Number(hot.hr)} HR on {Number(hot.bbe)} balls in play against it.
            </>
          )
        })()}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {usable.map((r) => {
          const usage = Math.min(100, Number(r.usage))
          // Bars scale to his MOST-USED pitch so the shape reads at a glance;
          // the printed % is the absolute truth.
          const barW = Math.max(2, (100 * usage) / maxUsage)
          const tone = damageTone(Number(r.hrRate), Number(r.bbe))
          const thin = Number(r.bbe) > 0 && Number(r.bbe) < 10
          return (
            <div key={r.code || r.pitch} style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: C.text, width: 96, flexShrink: 0,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.pitch}</span>
              <div style={{ flex: 1, height: 16, background: 'rgba(255,255,255,.05)', borderRadius: 5, position: 'relative', minWidth: 0 }}>
                <div style={{
                  width: `${barW}%`, height: '100%', borderRadius: 5,
                  background: `linear-gradient(90deg, ${accent}66, ${accent})`,
                }} />
                <span style={{
                  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                  // The number rides just past the bar when the bar is short,
                  // and inside it when it's long — always readable either way.
                  ...(barW >= 26
                    ? { left: 6, color: '#0d0c0b' }
                    : { left: `calc(${barW}% + 6px)`, color: C.text2 }),
                  fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, whiteSpace: 'nowrap',
                }}>{usage.toFixed(0)}%</span>
              </div>
              <span
                title={[
                  Number(r.bbe) > 0 ? `${Number(r.hr) || 0} HR on ${Number(r.bbe)} balls in play against it` : 'No balls in play tracked',
                  tone.label ? `— ${tone.label}` : '',
                  thin ? '(under 10 balls in play — mostly noise)' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  width: 84, flexShrink: 0, textAlign: 'right', fontFamily: NUM_FONT,
                  fontSize: 10, fontWeight: 800, color: tone.color, opacity: thin ? 0.55 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {Number(r.bbe) > 0
                  ? <>{Number(r.hr) || 0} HR · {Number(r.hrRate || 0).toFixed(1)}%</>
                  : '—'}
              </span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
        Bar = how often he throws it, scaled to his most-used pitch — the printed % is the real share.
        Right column = HR allowed per batted ball against that pitch:{' '}
        <span style={{ color: '#f87171' }}>red</span> is getting hit out ({DMG_HOT}%+),{' '}
        <span style={{ color: '#fbbf24' }}>amber</span> leaks ({DMG_WARM}%+), dimmed means under 10
        balls in play. The full table below has every number behind this.
      </div>
    </div>
  )
}
