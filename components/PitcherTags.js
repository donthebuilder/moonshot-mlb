'use client'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, divTone } from '../lib/scales'
import { pitcherTags } from '../lib/pitcherTags'

// ══ THE TAG ROW ═════════════════════════════════════════════════════════════
// Tags are the finding; the splits below them are the evidence — evidence
// goes under the finding. Every chip prints the number it fired on, so strip
// the colour and the row still says everything (colour is never the message).
//
// Tones through the house scale, no hex literals:
//   leak = warm end (good for the BAT) · wall = cool end (his strength) ·
//   env  = neutral chrome with its own glyph, because a launchpad is a fact
//          about the ballpark, not a weakness of his.

function tone(t) {
  if (t === 'leak') return divTone(1, { anchor: 0, ceiling: 1 })
  if (t === 'wall') return divTone(-1, { anchor: 0, ceiling: 1 })
  return { bg: alpha(C.text3, 0.10), fg: C.text2 }
}

function Tag({ t }) {
  const s = tone(t.tone)
  return (
    <span title={t.why} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5,
      padding: '3px 9px', borderRadius: 7, cursor: 'help',
      background: s.bg, border: `1px solid ${alpha(s.fg === C.text2 ? C.text3 : s.fg, 0.25)}`,
    }}>
      <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.05em', color: s.fg }}>
        {t.tone === 'env' ? '◦ ' : ''}{t.label}
      </span>
      <span style={{ fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, color: C.text2 }}>{t.evidence}</span>
    </span>
  )
}

export default function PitcherTags({ row, extraChips = [] }) {
  const { tags, leaks, blowup } = pitcherTags(row)
  if (!tags.length && !extraChips.length) return null
  return (
    <div style={{ margin: '2px 0 12px' }}>
      {blowup && (
        <div style={{
          display: 'inline-flex', alignItems: 'baseline', gap: 8, marginBottom: 6,
          padding: '4px 11px', borderRadius: 8,
          background: divTone(1, { anchor: 0, ceiling: 1, max: 0.22 }).bg,
          border: `1px solid ${alpha(C.orange, 0.5)}`,
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.06em', color: C.orange }}>⚠ BLOWUP RISK</span>
          <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.text2 }}>
            {leaks} independent alarms — three is a pattern, one is a stat
          </span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map((t) => <Tag key={t.key} t={t} />)}
        {/* The bot's own coarse reads ride here instead of a second chip row
            ten pixels up saying the same thing in a second vocabulary — and
            they are EXCLUDED from the blowup count (attack_tag is three
            coarse buckets; weak_pitcher_flag fired on 37 of 59 measured arms
            — informative, not independent). */}
        {extraChips.filter(Boolean).map((c) => (
          <span key={c.label} title={c.why || ''} style={{
            padding: '3px 9px', borderRadius: 7, fontSize: 9, fontWeight: 800,
            border: `1px solid ${C.border}`, color: C.text3, background: 'transparent',
          }}>{c.label}</span>
        ))}
      </div>
    </div>
  )
}
