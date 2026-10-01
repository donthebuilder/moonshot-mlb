'use client'
import { explain } from '../lib/explain'

// WHY / WATCH ON A PLAYER CARD (2026-09-30, BATCH-SIGNAL-WHY S3a). One block
// for every product's card: up to three WHY lines (the reasons in numbers,
// each ranked against tonight) and one WATCH line (the number against him).
// The whole block is one button: a tap sends `explain` -- every reason at
// full length, with its definition -- to the app's ExplainToast
// (lib/explain.js), so an ellipsis on a phone never hides anything for good.
// The caller computes the words (lib/mlb/boardReason.js, lib/nhl/goalWhy.js);
// this file only draws them, in the product's theme.
export default function WhyLines({ theme: C, numFont, accent, why = [], watch = null, explain: ex = null, label = 'Why' }) {
  if (!why.length && !watch) return null
  const row = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const tag = { display: 'inline-block', width: 46, fontWeight: 900, letterSpacing: '.06em' }
  return (
    <button type="button" onClick={() => explain(ex?.label || label, ex?.text || [...why, watch && `Watch: ${watch}`].filter(Boolean).join('  '))}
      aria-label={`${ex?.label || label}: ${[...why, watch && `watch: ${watch}`].filter(Boolean).join('; ')}`}
      style={{
        display: 'block', width: '100%', maxWidth: 520, minHeight: 44, margin: '0 0 10px', padding: '6px 10px',
        textAlign: 'left', cursor: 'pointer', fontFamily: numFont, fontSize: 11, lineHeight: 1.55,
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text2,
      }}>
      {why.map((t, i) => (
        <span key={t} style={row}><b style={{ ...tag, color: i === 0 ? accent : 'transparent' }}>WHY</b>{t}</span>
      ))}
      {watch && <span style={{ ...row, color: C.text3 }}><b style={tag}>WATCH</b>{watch}</span>}
    </button>
  )
}
