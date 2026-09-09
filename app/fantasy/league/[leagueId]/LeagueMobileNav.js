'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { FRANCHISE_BAR, FRANCHISE_MORE, FRANCHISE_NAV, franchiseHref } from '../../../../lib/fantasy/nav'

// ── FOUR STOPS AND A SHEET (2026-09-07) ─────────────────────────────────────
//
// Donovan, on draft night: "the navigation is a lot... mobile needs to be more
// fitted in the screen... i like how they are on mlb and nfl."
//
// This bar carried all NINE league pages in one row. On a 390px phone that is
// 43px a tab: the icons touch, the labels clip, and the first stop was Draft --
// which happens once a season and had the best seat all year.
//
// It is MOONSHOT's shape now (components/MobileTabBar.js): four stops you touch
// on a normal week, plus More, which opens a sheet carrying every remaining
// page with a line saying what it is for. Same grammar in both products, so a
// phone that knows one knows the other.
//
// THE THREE-SITE DOCK IS GONE from underneath it (app/fantasy/layout.js). On a
// phone a league room was stacking three navigations: the network switch in the
// room header, a fixed MOONSHOT/TUDDY/FRANCHISE dock, and this bar. The header
// row already does that job on every screen.
//
// Labels and order come from lib/fantasy/nav.js, which the desktop rail reads
// too -- the two navs cannot drift apart again.

export default function LeagueMobileNav({ leagueId, role }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [pendingHref, setPendingHref] = useState(null)
  const sheetRef = useRef(null)

  // Without this the tapped item could stay stuck on "Opening…" after a Back.
  useEffect(() => { setPendingHref(null); setOpen(false) }, [pathname])

  // `inert` is the one attribute that hides a closed sheet from BOTH the
  // screen reader and the keyboard. React 18 drops an unknown prop silently,
  // so it is set on the node rather than passed as one -- the same trap
  // MobileTabBar documents.
  useEffect(() => {
    const el = sheetRef.current
    if (!el) return
    if (open) el.removeAttribute('inert')
    else el.setAttribute('inert', '')
  }, [open])

  const moreKeys = [...FRANCHISE_MORE, ...(role === 'commissioner' ? ['settings'] : [])]
  const barHrefs = new Set(FRANCHISE_BAR.map((k) => franchiseHref(leagueId, k)))
  const moreActive = !barHrefs.has(pathname)

  const item = (key, inSheet) => {
    const href = franchiseHref(leagueId, key)
    const { icon, label, blurb } = FRANCHISE_NAV[key]
    const active = pathname === href
    const pending = pendingHref === href && !active
    return (
      <Link
        key={key}
        href={href}
        prefetch
        aria-busy={pending || undefined}
        aria-current={active ? 'page' : undefined}
        className={active ? 'active' : ''}
        tabIndex={inSheet && !open ? -1 : undefined}
        onClick={() => { if (!active) setPendingHref(href) }}
      >
        {inSheet
          ? <><span>{label}</span><small>{blurb}</small></>
          : <><i>{pending ? '•' : icon}</i><span>{pending ? 'Opening…' : label}</span></>}
      </Link>
    )
  }

  return (
    <>
      {open && <button className="fxScrim" aria-label="Close the menu" onClick={() => setOpen(false)} />}

      <aside ref={sheetRef} className={`fxSheet ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="fxSheetHead">
          <div>
            <small>FRANCHISE · THE MAP</small>
            <strong>Everything in this league</strong>
          </div>
          <button tabIndex={open ? undefined : -1} onClick={() => setOpen(false)} aria-label="Close the menu">×</button>
        </div>
        <div className="fxSheetGrid">{moreKeys.map((k) => item(k, true))}</div>
      </aside>

      <nav className="fxBar" aria-label="League sections">
        {FRANCHISE_BAR.map((k) => item(k, false))}
        <button
          type="button"
          className={moreActive || open ? 'active' : ''}
          aria-expanded={open}
          aria-label="More — every page in this league"
          onClick={() => setOpen((v) => !v)}
        >
          <i>•••</i><span>More</span>
        </button>
      </nav>

      <style jsx>{`
        .fxBar, .fxSheet, .fxScrim { display: none }
        /* 760px, matching fantasy.module.css exactly: that is where the room's
           desktop rail hides and where .roomBody adds its bottom padding. A
           different number here would show this bar over content that had
           reserved no room for it, between the two breakpoints. */
        @media (max-width: 760px) {
          .fxBar {
            position: fixed; z-index: 390; left: 10px; right: 10px;
            bottom: max(9px, env(safe-area-inset-bottom));
            display: grid; grid-template-columns: repeat(5, 1fr);
            height: 62px; padding: 5px;
            border: 1px solid var(--fx-line-2); border-radius: 17px;
            background: color-mix(in srgb, var(--fx-panel-2) 92%, transparent);
            box-shadow: 0 18px 55px #000b, inset 0 1px 0 #ffffff0a;
            backdrop-filter: blur(18px) saturate(140%);
          }
          .fxBar :global(a), .fxBar button {
            position: relative; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 3px;
            min-width: 0; border: 0; border-radius: 12px; background: transparent;
            color: var(--fx-muted-3); font: 900 8px/1 monospace; letter-spacing: .02em;
            text-decoration: none; cursor: pointer;
          }
          .fxBar :global(a i), .fxBar button i {
            height: 20px; color: var(--fx-ink-2); font: 16px/20px system-ui; font-style: normal;
          }
          .fxBar :global(a span), .fxBar button span {
            max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          }
          .fxBar :global(a.active), .fxBar button.active {
            background: linear-gradient(145deg, color-mix(in srgb, var(--fx-accent-hot) 16%, transparent), color-mix(in srgb, var(--fx-gold) 4%, transparent)); color: var(--fx-accent);
          }
          .fxBar :global(a.active i), .fxBar button.active i {
            color: var(--fx-accent); text-shadow: 0 0 14px color-mix(in srgb, var(--fx-accent-hot) 53%, transparent);
          }
          .fxBar :global(a.active):after, .fxBar button.active:after {
            content: ''; position: absolute; left: 28%; right: 28%; bottom: 2px;
            height: 2px; border-radius: 9px; background: var(--fx-accent-hot);
          }
          .fxScrim { position: fixed; z-index: 380; inset: 0; display: block; border: 0; background: #0009; backdrop-filter: blur(2px) }
          .fxSheet {
            position: fixed; z-index: 385; left: 10px; right: 10px; bottom: 78px;
            display: block; max-height: min(68vh, 520px); overflow: auto; padding: 13px;
            border: 1px solid var(--fx-line-2); border-radius: 17px;
            background: var(--fx-panel-2); box-shadow: 0 25px 80px #000d;
            transform: translateY(18px); opacity: 0; pointer-events: none;
            transition: transform .18s ease, opacity .18s ease;
          }
          .fxSheet.open { transform: none; opacity: 1; pointer-events: auto }
          .fxSheetHead { display: flex; align-items: center; justify-content: space-between; padding: 2px 3px 11px }
          .fxSheetHead small { display: block; color: var(--fx-accent-hot); font: 900 8px/1 monospace; letter-spacing: .14em }
          .fxSheetHead strong { display: block; margin-top: 3px; font-size: 18px; color: var(--fx-ink) }
          .fxSheetHead button { width: 32px; height: 32px; border: 1px solid var(--fx-line); border-radius: 9px; background: var(--fx-bg); color: var(--fx-ink-2); font-size: 20px; cursor: pointer }
          .fxSheetGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px }
          .fxSheetGrid :global(a) {
            display: block; text-align: left; min-height: 59px; padding: 9px 10px;
            border: 1px solid var(--fx-line); border-radius: 10px;
            background: var(--fx-bg); color: var(--fx-ink-2); text-decoration: none;
          }
          .fxSheetGrid :global(a.active) { border-color: color-mix(in srgb, var(--fx-accent-hot) 44%, transparent); background: color-mix(in srgb, var(--fx-accent-hot) 8%, transparent) }
          .fxSheetGrid :global(a span) { display: block; font-size: 11px; font-weight: 900 }
          .fxSheetGrid :global(a small) { display: block; margin-top: 4px; color: var(--fx-muted-3); font-size: 8px; line-height: 1.25 }
        }
      `}</style>
    </>
  )
}
