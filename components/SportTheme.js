'use client'
import { createContext, useContext } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../lib/theme'

// THE SPORT'S THEME FOR MOONSHOT'S PARTS (2026-09-29, player cards step 5).
// MOONSHOT's card parts (StatStrip, HitRateBoxes, FollowButton, PlayerNotes,
// PickVerdictStamp, ListPreview ...) import lib/theme's C directly, so on
// TUDDY and LAMP they drew MOONSHOT's orange and cyan. CardShell and
// VerdictHero already take a `theme`; they now also provide it here, and the
// parts read it with useSportTheme(). Nothing provides it on MOONSHOT, so the
// parts get lib/theme's live C (the object applyTheme mutates) and render
// exactly as before.
//
// `accent` is the sport's primary: MOONSHOT orange, TUDDY jade, LAMP ice.
// C.orange exists on all three themes as a fallback, so a part that means
// "the product's colour" must read accent, not C.orange. `themed` is false on
// MOONSHOT, for the few parts that keep a literal so its markup stays byte-identical.
const Ctx = createContext(null)

export function SportTheme({ theme, accent, numFont, children }) {
  if (!theme) return children
  return (
    <Ctx.Provider value={{ C: theme, NUM_FONT: numFont || MLB_NUM, accent: accent || theme.orange, themed: true }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSportTheme() {
  return useContext(Ctx) || { C: MLB_C, NUM_FONT: MLB_NUM, accent: MLB_C.orange, themed: false }
}
