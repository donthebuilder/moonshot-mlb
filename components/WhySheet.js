'use client'
// WHY IS HE RANKED HERE? (2026-10-06, the Rankings merge). One tap from any
// ranked row: the plain sentence the board already prints, the numbers behind
// it, and where to look next. Same sheet on every sport; the caller hands in
// its own words, theme and links, nothing is computed here.
//
//   PLAYER -> Why? -> the evidence -> research next
//
//   useWhySheet(theme)      -> { open(item), sheet }   render `sheet` once
//   whyColumn({...})        -> a table column whose cell is the sentence, tapping opens the sheet
//
// item: { name, rank, lead, watch?, parts: [{ label, text, pct? }], links: [{ label, href?, onClick? }] }
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import useScrollLock from '../lib/useScrollLock'
import { alpha } from '../lib/scales'

export function WhySheet({ item, onClose, theme: C, accent, numFont }) {
  useScrollLock(Boolean(item))
  useEffect(() => {
    if (!item) return undefined
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [item, onClose])
  if (!item || typeof document === 'undefined') return null
  const label = { color: C.text3, font: `800 11px/1 ${numFont}`, letterSpacing: '.12em', margin: '16px 0 8px' }
  const linkStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border2}`, background: C.bg, color: C.text, font: `800 13px/1.2 ${numFont}`, textDecoration: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }
  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: alpha(C.bg, 0.78), display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label={`Why ${item.name} is ranked here`} onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(100%, 560px)', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', background: C.bg2, color: C.text, border: `1px solid ${C.border2}`, borderRadius: '16px 16px 0 0', padding: '16px 16px calc(16px + env(safe-area-inset-bottom))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: accent, font: `800 11px/1 ${numFont}`, letterSpacing: '.12em' }}>WHY HE IS RANKED{item.rank != null ? ` #${item.rank}` : ''}</div>
            <div style={{ marginTop: 6, font: `900 20px/1.2 ${numFont}` }}>{item.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: C.text3, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 14, lineHeight: 1.5, color: C.text }}>{item.lead || 'The model has no single standout number for him tonight.'}</p>
        {item.watch && <p style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>Against him: {item.watch}</p>}
        {item.parts?.length > 0 && (<>
          <div style={label}>THE NUMBERS BEHIND IT</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {item.parts.map((p) => (
              <div key={p.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, lineHeight: 1.3 }}>
                  <span style={{ color: C.text2 }}>{p.label}</span>
                  <span style={{ color: C.text, fontFamily: numFont, fontWeight: 800 }}>{p.text}</span>
                </div>
                {Number.isFinite(p.pct) && (
                  <div aria-hidden="true" style={{ marginTop: 4, height: 5, borderRadius: 3, background: C.border }}>
                    <div style={{ width: `${Math.max(2, Math.min(100, p.pct))}%`, height: '100%', borderRadius: 3, background: accent }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>)}
        {item.links?.length > 0 && (<>
          <div style={label}>RESEARCH NEXT</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {item.links.map((l) => (l.href
              ? <a key={l.label} href={l.href} onClick={onClose} style={linkStyle}><span>{l.label}</span><span aria-hidden="true">›</span></a>
              : <button key={l.label} type="button" onClick={() => { onClose(); l.onClick?.() }} style={linkStyle}><span>{l.label}</span><span aria-hidden="true">›</span></button>))}
          </div>
        </>)}
      </div>
    </div>,
    document.body,
  )
}

export function useWhySheet({ theme, accent, numFont }) {
  const [item, setItem] = useState(null)
  const sheet = <WhySheet item={item} onClose={() => setItem(null)} theme={theme} accent={accent} numFont={numFont} />
  return { open: setItem, sheet }
}

/** A column: the plain sentence (two lines at most) and a ›; a tap opens the sheet for that row.
 *  textOf(row) -> sentence or ''; itemOf(row) -> the sheet's item. */
export function whyColumn({ textOf, itemOf, open, theme: C, numFont, group, w = 230 }) {
  return {
    key: 'why', label: 'Why', w, heat: false, numeric: false, ...(group ? { group } : {}),
    title: 'Why he is ranked here, in one line. Tap it for the numbers behind it and where to look next.',
    fmt: (v, r) => {
      const t = textOf(r)
      return (
        <button type="button" onClick={(e) => { e.stopPropagation(); open(itemOf(r)) }} aria-label={`Why ${r.name || 'he'} is ranked here`}
          style={{ display: 'block', width: w, minWidth: w, minHeight: 44, padding: '4px 0', border: 0, background: 'transparent', color: C.text2, fontFamily: 'inherit', fontSize: 12, fontWeight: 600, lineHeight: 1.35, textAlign: 'left', cursor: 'pointer', whiteSpace: 'normal' }}>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{t || 'Why? '}</span>
          <span aria-hidden="true" style={{ color: C.text3 }}> ›</span>
        </button>
      )
    },
  }
}
