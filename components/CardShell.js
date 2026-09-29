'use client'
import { C as MLB_C } from '../lib/theme'
import { useDialog } from '../lib/useDialog'
import { SportTheme } from './SportTheme'

// THE PLAYER CARD'S SHELL, SHARED (2026-09-29, player cards step 2). Moved
// verbatim out of components/PlayerModal.js so TUDDY's card (and LAMP's
// player page, inline) sit in the same popup: backdrop above the bottom nav,
// the .modal-backdrop / .modal-box / .modal-content classes MobileCSS turns
// into a full-screen sheet on a phone, focus trap and Escape (useDialog).
// MOONSHOT passes exactly what it did before; theme defaults to its own.
// `inline` renders the same content as a plain panel instead of a popup.
// The Player tab needs exactly this view but sitting still on the page --
// a modal is a bad place to read for five minutes.
export default function CardShell({ inline, onClose, width, children: kids, label, theme = MLB_C, accent }) {
  const C = theme
  // TUDDY / LAMP: MOONSHOT's parts inside the card read the sport's theme
  // (components/SportTheme.js). MOONSHOT passes no theme, so nothing changes.
  const children = theme === MLB_C ? kids : <SportTheme theme={theme} accent={accent}>{kids}</SportTheme>
  // A11Y-3 (2026-09-24): role, focus, Escape, Tab kept inside. lib/useDialog.js.
  const { ref, dialogProps } = useDialog({ open: !inline, onClose, label })
  if (inline) {
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 18,
        padding: '18px 20px 22px',
      }}>{children}</div>
    )
  }
  return (
    <div
      onClick={onClose}
      className="modal-backdrop"
      style={{
        // #30: the floating bottom nav sits at z-index 390 and this backdrop
        // sat at 100, so the bar drew ON TOP of an open card -- covering the
        // first row of the Pitch table and the bottom of the Spray chart. The
        // suggested fix was bottom padding on the scroll container, but that
        // treats the symptom: a modal that a global nav can be clicked
        // through is not modal. Above the bar (390) and below the ember
        // signature rail (400), which is 3px of chrome at the very top and
        // has nothing to overlap.
        position: 'fixed', inset: 0, zIndex: 395,
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={ref}
        {...dialogProps}
        onClick={e => e.stopPropagation()}
        className="modal-box"
        style={{
          ...dialogProps.style,
          background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18,
          width, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
          transition: 'width .15s',
        }}
      >
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

