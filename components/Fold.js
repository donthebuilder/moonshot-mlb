'use client'

// ── A SECTION YOU CAN SHUT (2026-09-03) ─────────────────────────────────────
//
// Donovan, more than once and from more than one direction: "it's a lot going
// on on this site, they don't know what they're doing"; "we need to dumb
// everything down"; "you can get lost on the site very easily, especially the
// MLB side, and I don't want that to happen when NFL starts."
//
// Home's Tonight view was FIFTEEN stacked blocks and thirteen of them were
// always open. Every one of them earns its place on some night — that is
// exactly the problem. A page where everything is equally present has no
// hierarchy, so the reader has to build one themselves every time they land,
// and the ones who cannot are the ones saying they cannot figure it out.
//
// Nothing is deleted here. Nine sections become a titled row you tap, five
// stay open, and the choice is remembered. A closed section still says what it
// holds and how much of it there is, which is the whole difference between
// folding and hiding: you can decide not to open it, which you cannot do with
// a block you have to scroll past.
//
// WHY THE CHILDREN ARE NOT RENDERED WHEN SHUT. Two reasons, and the second is
// the important one. It is faster -- HomerLedger is 1,900 lines and Storylines
// 880, and neither runs at all now until asked for. And it makes the fold
// honest: a section that keeps fetching, polling and animating behind a closed
// header is still costing you the thing you closed it to stop paying.
//
// PERSISTED FOREVER, per Donovan's call over session-only: a person who never
// opens Weakest arms should stop being shown Weakest arms. The escape hatch is
// that every header still names its section, so nothing folded is unfindable.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

const KEY = (id) => `ms_fold_${id}`

export default function Fold({
  id,
  title,
  meta = '',
  defaultOpen = false,
  children,
}) {
  // Read in an effect, never in the initialiser: this renders on the server,
  // where localStorage does not exist, and a first paint that disagrees with
  // the second is a hydration error.
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY(id))
      if (v === '1') setOpen(true)
      else if (v === '0') setOpen(false)
    } catch { /* private mode */ }
  }, [id])

  const toggle = () => setOpen((v) => {
    const next = !v
    try { localStorage.setItem(KEY(id), next ? '1' : '0') } catch { /* private mode */ }
    return next
  })

  // #93 (a11y): the fold header was a bare <button> holding a <span>, so a
  // screen-reader user landing on Tonight got one <h1> and then nine
  // unlabelled buttons -- no section list, no way to jump. The disclosure
  // pattern the ARIA APG actually specifies is heading-wraps-button: the
  // heading gives the section a name in the outline, the button keeps the
  // aria-expanded state. Nothing changes visually; the h2's own margins and
  // font size are zeroed because the span inside already carries both.
  return (
    <section style={{ marginBottom: open ? 14 : 6 }}>
      <h2 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 9, width: '100%',
          background: open ? 'transparent' : C.bg2,
          border: `1px solid ${open ? 'transparent' : C.border}`,
          borderRadius: 10, padding: open ? '4px 2px' : '9px 12px',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 900, color: C.text, letterSpacing: '.03em' }}>
          {title}
        </span>
        {meta ? (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{meta}</span>
        ) : null}
        <span style={{
          marginLeft: 'auto', fontSize: 10, color: C.orange,
          fontFamily: NUM_FONT, fontWeight: 800, flexShrink: 0,
        }}>{open ? '▴' : '▾'}</span>
      </button>
      </h2>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </section>
  )
}
