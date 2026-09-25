'use client'
import { useEffect, useRef } from 'react'

// ── A CARD IS A DIALOG (2026-09-24 audit, A11Y-3) ───────────────────────────
// The player, pitcher and TUDDY cards are fixed overlays with a backdrop and
// a close button, and nothing told a screen reader or a keyboard that. No
// role, no focus move, no Escape on the MLB side. One hook, three modals:
//
//   - moves focus INTO the card when it opens (so Tab starts inside it and a
//     reader announces it), and back to whatever had focus when it closes
//   - Escape closes it, unless you are typing in a field inside it
//   - keeps Tab inside the card while it is open
//
// Spread `dialogProps` onto the card box; put `ref` on the same element.
export function useDialog({ open, onClose, label }) {
  const ref = useRef(null)
  const restore = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    restore.current = typeof document !== 'undefined' ? document.activeElement : null
    const box = ref.current
    // A tick later: the card's own effects may still be mounting children.
    const t = setTimeout(() => { try { box?.focus({ preventScroll: true }) } catch { /* ignore */ } }, 20)
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const el = e.target
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !box) return
      const focusables = box.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      const back = restore.current
      restore.current = null
      try { if (back && typeof back.focus === 'function' && document.contains(back)) back.focus({ preventScroll: true }) } catch { /* ignore */ }
    }
  }, [open, onClose])

  return {
    ref,
    dialogProps: { role: 'dialog', 'aria-modal': 'true', 'aria-label': label || 'Player card', tabIndex: -1, style: { outline: 'none' } },
  }
}
