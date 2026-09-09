'use client'

// Every deep link ever posted still lands where it meant to.
//
// The board moved from `/` to `/app` when the front door took the root
// (2026-08-28). Thousands of links exist in the shape `/#sport=nfl&tab=home`
// or `/#tab=power&p=660271` — Discord posts, bookmarks, share cards — and a
// URL fragment is NEVER sent to the server, so no redirect, rewrite or
// middleware rule can see one. It has to be read in the browser, which means
// it has to be read here.
//
// FORWARDS ONLY WHAT IS ACTUALLY A BOARD LINK. The front door has its own
// anchors (#tonight, #products, #alerts, #sign-in, #create-account) and those
// must stay anchors. The test is whether the hash parses to something carrying
// `sport` or `tab` — the two parameters lib/sport.js and Dashboard actually
// read — so an anchor can never be mistaken for a deep link.
//
// REPLACE, NOT PUSH: the back button should leave the site the way it always
// did, not bounce between the front door and the board.
//
// Runs in an effect rather than during render because it touches
// window.location; the front door paints first and is replaced within a frame.
// If JavaScript never runs, the visitor gets the front door with working
// product links — a worse landing than they asked for, not a broken one.

import { useEffect } from 'react'

export default function LegacyHashRedirect() {
  useEffect(() => {
    // ON hashchange TOO, not only on mount. A hash-only navigation does not
    // reload the document or remount React — so someone already sitting on
    // the front door who follows an old `/#sport=nfl&tab=home` link (pasted
    // into the same tab, or clicked from anywhere on this page) would get a
    // silently changed address bar and no board. Caught by the routing test,
    // which navigated between two hashes on the same document and stayed put.
    const forward = () => {
      try {
        const raw = String(window.location.hash || '').replace(/^#/, '')
        if (!raw) return
        const params = new URLSearchParams(raw)
        if (!params.get('sport') && !params.get('tab')) return
        window.location.replace(`/app#${raw}`)
      } catch { /* a malformed hash is not a reason to fail the front door */ }
    }
    forward()
    window.addEventListener('hashchange', forward)
    return () => window.removeEventListener('hashchange', forward)
  }, [])
  return null
}
