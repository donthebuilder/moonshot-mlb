'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// 📱 MOBILE FOLD (2026-08-09) — "tonight's parks could be a drop down on
// mobile, it's too long to scroll — same with games".
//
// Fifteen park cards and a dozen game cards are a WALL on a phone: at one
// card per row that is fifteen screens of scrolling before you reach anything
// else on the page. On a desktop the same fifteen cards are three tidy rows,
// which is why this has never been a desktop problem and must not become a
// desktop change.
//
// So this is a phone-only fold: below the breakpoint the section collapses to
// one summary line you tap to open; at any wider width it renders its children
// and nothing else — no wrapper, no summary, not one pixel different.
//
// WHY JS AND NOT CSS. A CSS-only fold (a <details> forced open by a media
// query) does not work: the browser hides a closed <details>'s content itself,
// and no media query can override that. A matchMedia hook is the honest tool.
//
// HYDRATION. useState starts false — i.e. "desktop" — on both the server and
// the first client render, and the match is applied in an effect afterwards.
// So the server HTML and the first client HTML always agree, and the fold
// closes a frame later on a phone. Starting from matchMedia directly would
// mismatch server and client and React would throw it away.

export function useIsPhone(maxWidth = 560) {
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const apply = () => setIsPhone(mq.matches)
    apply()
    // Safari < 14 only has the deprecated listener API.
    if (mq.addEventListener) { mq.addEventListener('change', apply); return () => mq.removeEventListener('change', apply) }
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [maxWidth])
  return isPhone
}

/**
 * MobileFold
 *
 *   title   — "🏟 Tonight's parks"
 *   summary — the one line that has to justify NOT opening it, e.g.
 *             "15 parks · best air +11% Citizens Bank". Write it so the
 *             headline fact survives the fold; a summary that only says
 *             "15 parks" makes the fold a wall with a door in it.
 *   count   — optional badge number
 *   accent  — colour of the summary chrome
 *
 * Desktop (or any width above `maxWidth`) renders `children` bare.
 *
 *   always     — fold at EVERY width, not only on a phone (2026-08-23,
 *                Donovan: "games chip need to be able to be hidden just like
 *                on mobile"). The phone-only default stays the default,
 *                because the original argument still holds for most sections:
 *                fifteen cards are a wall on a phone and three tidy rows on a
 *                desktop. It stops holding the moment a section is a SELECTOR
 *                rather than a board — you pick a game once and then read for
 *                several screens, and the grid you already used is just in the
 *                way. That is a per-caller judgement, so it is a per-caller
 *                prop rather than a new global rule.
 *   rememberKey — localStorage key for the open/closed state. Only worth it
 *                where the fold is a standing preference ("I don't want to see
 *                the grid") rather than a momentary one; without it the fold
 *                reopens on every visit, which is right for a phone wall and
 *                wrong for a control someone deliberately closed.
 */
export default function MobileFold({
  title, summary = '', count = null, accent = C.orange,
  maxWidth = 560, defaultOpen = false, always = false, rememberKey = null, children,
}) {
  const isPhone = useIsPhone(maxWidth)
  const [open, setOpen] = useState(defaultOpen)

  // Same hydration rule as useIsPhone: never read storage during render. The
  // server has none, so a stored `false` would produce markup React throws
  // away on the first client pass.
  useEffect(() => {
    if (!rememberKey) return
    try {
      const v = window.localStorage.getItem(rememberKey)
      if (v === '0' || v === '1') setOpen(v === '1')
    } catch { /* private mode */ }
  }, [rememberKey])

  const toggle = () => setOpen((v) => {
    const next = !v
    if (rememberKey) { try { window.localStorage.setItem(rememberKey, next ? '1' : '0') } catch { /* private mode */ } }
    return next
  })

  if (!isPhone && !always) return <>{children}</>

  return (
    <div style={{ marginBottom: open ? 0 : 10 }}>
      <button
        onClick={toggle}
        className="tap-row"
        style={{
          display: 'flex', width: '100%', gap: 8, alignItems: 'center',
          textAlign: 'left', cursor: 'pointer', minWidth: 0,
          // WAS rgba(17,17,19,1) — ember's bg2, baked in. In LIGHT mode that
          // painted a black bar across a white page (caught rendering the
          // Games tab's folded strip at 430px in light, 2026-08-23). C.bg2 is
          // the same colour under ember and the right one everywhere else.
          background: `linear-gradient(160deg, ${accent}14, ${C.bg2} 70%)`,
          border: `1px solid ${open ? accent : `${accent}40`}`,
          borderRadius: 11, padding: '9px 12px',
          marginBottom: open ? 9 : 0,
        }}
      >
        <span style={{ fontSize: 11.5, fontWeight: 900, color: C.text, flexShrink: 0 }}>{title}</span>
        {count != null && (
          <span style={{
            fontSize: 9, fontWeight: 900, fontFamily: NUM_FONT, color: accent,
            border: `1px solid ${accent}45`, background: `${accent}12`,
            borderRadius: 999, padding: '1px 6px', flexShrink: 0,
          }}>{count}</span>
        )}
        {summary && (
          <span style={{
            fontSize: 10, color: C.text3, fontFamily: NUM_FONT, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{summary}</span>
        )}
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, fontWeight: 900, color: accent }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && children}
    </div>
  )
}
