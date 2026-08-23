'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { useIsPhone } from './MobileFold'
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
  // ── THE CHIPS FOLD ON A PHONE (2026-08-23) ───────────────────────────────
  // Donovan: "too much on mobile", of a pitcher modal that put ten of these
  // between the hero and the first number.
  //
  // The BLOWUP RISK line above them already states the finding AND its count
  // — "4 independent alarms" — so the chips are its evidence, not a second
  // headline. Evidence one tap behind a verdict is the right shape; a verdict
  // buried under ten chips is not.
  //
  // Phone only, and it opens on tap rather than on hover, because the chips'
  // whole value is the `why` in each title and a phone cannot hover. Desktop
  // is untouched: there they cost one row and nothing is gained by hiding them.
  const isPhone = useIsPhone(700)
  const [open, setOpen] = useState(false)
  const extras = extraChips.filter(Boolean)
  const total = tags.length + extras.length
  if (!tags.length && !extras.length) return null
  const chipRow = (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
      {tags.map((t) => <Tag key={t.key} t={t} />)}
      {/* The bot's own coarse reads ride here instead of a second chip row
          ten pixels up saying the same thing in a second vocabulary — and
          they are EXCLUDED from the blowup count (attack_tag is three coarse
          buckets; weak_pitcher_flag fired on 37 of 59 measured arms —
          informative, not independent). */}
      {extras.map((c) => (
        <span key={c.label} title={c.why || ''} style={{
          padding: '3px 9px', borderRadius: 7, fontSize: 9, fontWeight: 800,
          border: `1px solid ${C.border}`, color: C.text3, background: 'transparent',
        }}>{c.label}</span>
      ))}
    </div>
  )

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
      {isPhone && !open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${C.border2}`,
            borderRadius: 9, padding: '6px 10px',
            fontSize: 9.5, fontWeight: 700, color: C.text3, fontFamily: NUM_FONT,
          }}
        >▸ {total} mark{total === 1 ? '' : 's'} on this arm{leaks ? ` · ${leaks} of them independent alarms` : ''}</button>
      ) : chipRow}
    </div>
  )
}
