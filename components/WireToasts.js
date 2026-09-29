'use client'

// THE ON-SCREEN NOTICE STACK (2026-09-28, lifted out of MiniWire.js).
// MOONSHOT's live toasts, drawn here so TUDDY's wire can use the same ones
// instead of its own bottom-corner stack -- which sat under the bottom dock
// (z 300 vs 390) and was covered by it on desktop and on a notched phone.
// MOONSHOT renders through this unchanged: the markup, sizes and offsets are
// MiniWire's, and its colours arrive through `look` exactly as they were.
//
//   toasts   [{ key, icon, text, pri }]  pri 0 = the loud one (a homer, a TD)
//   look     { hiBg, bg, hiBorder, warnBorder, border, shadow, text, text2 }
//   narrow   the phone layout (MiniWire's media query)
//   onOpen   tap on a card body; onDismiss the X
export default function WireToasts({ toasts, look, narrow, onOpen, onDismiss }) {
  if (!toasts?.length) return null
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Live wire"
      style={{
      // TOP-right (2026-08-06, on request) — where the eye actually goes
      // for news. Offset clears the sticky header.
      position: 'fixed', right: narrow ? 8 : 14, top: narrow ? 122 : 74, zIndex: 300,
      display: 'flex', flexDirection: 'column', gap: 7,
      maxWidth: narrow ? 'calc(100vw - 16px)' : 'min(340px, 90vw)',
    }}>
      {toasts.map((t) => (
        <div key={t.key}
          onClick={() => onOpen?.(t)}
          style={{
            display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer',
            background: t.pri === 0 ? look.hiBg : look.bg,
            border: `1px solid ${t.pri === 0 ? look.hiBorder : t.pri === 2 ? look.warnBorder : look.border}`,
            borderRadius: 10, padding: '8px 12px',
            boxShadow: `0 8px 28px ${look.shadow}`,
            animation: 'wireToastIn .18s ease-out',
          }}>
          <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{t.icon}</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: look.text, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{t.text}</span>
          {/* ── AN X (2026-09-03) ────────────────────────────────────
              "they need a little X button and can disappear faster."
              The card body still opens the player, which is the reason
              most of these get clicked -- so the dismiss has to be its
              own target and has to stopPropagation, or closing a toast
              would open a modal on the way out. 28px is the smallest
              square a thumb hits reliably; it is a bigger hit area than
              it looks, deliberately, because a control you miss twice is
              worse than no control. */}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={(e) => { e.stopPropagation(); onDismiss?.(t) }}
            style={{
              flexShrink: 0, width: 28, height: 28, marginTop: -4, marginRight: -6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 0, borderRadius: 8,
              color: look.text2, fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: 0,
            }}
          >×</button>
        </div>
      ))}
      <style>{'@keyframes wireToastIn { from { transform: translateY(-8px); opacity: 0 } to { transform: none; opacity: 1 } }'}</style>
    </div>
  )
}
