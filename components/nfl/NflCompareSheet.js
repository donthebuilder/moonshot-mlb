'use client'
// ⚖ COMPARE, FROM THE PLAYER CARD (2026-10-17, player-portal mirror pass). MOONSHOT's card has a ⚖ button that opens
// components/PlayerCompare.js over it (him against another hitter on the slate). That component reads MLB-only fields, so TUDDY's
// twin is the same sheet (same backdrop and box classes, same scroll lock, same close) around TUDDY's own compare, TdCompare, which
// is built on CompareTwo and starts with the open player already in the first picker. Every row is a published field or a book price.
// z-index 400: above CardShell's 395 (MOONSHOT's PlayerCompare is 110, under the card it opens from; not touched here). It is drawn into document.body: the Players page shows the card inline in a pane whose own stacking context would clip a fixed sheet.
import { createPortal } from 'react-dom'
import useScrollLock from '../../lib/useScrollLock'
import { C } from '../../lib/nfl/theme'
import TdCompare from './TdCompare'

export default function NflCompareSheet({ anchor, peers = [], matchup, odds, onClose }) {
  useScrollLock(true)
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Compare" className="modal-box"
        style={{ background: C.bg2, border: `1px solid ${C.border2}`, borderRadius: 18, width: 620, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
        <div className="modal-content" style={{ padding: '18px 20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: C.text2 }}>⚖ Compare</div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: C.text3, fontSize: 20, cursor: 'pointer', lineHeight: 1, minWidth: 44, minHeight: 44, margin: '-10px -12px 0 0' }}>✕</button>
          </div>
          <TdCompare rows={peers} matchup={matchup} odds={odds} anchor={anchor} />
        </div>
      </div>
    </div>,
    document.body,
  )
}
