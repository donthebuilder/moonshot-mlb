'use client'
// THE ONE "SAVE A PICTURE" BUTTON (2026-10-12, Donovan: "make sure the photo component is good to go site wide and sport side; i don't like
// how the photo button sits on some"). Every share-card download on MOONSHOT, TUDDY, LAMP and BUCKETS is this one button: same icon (the
// camera), same word ("Save"), same size, same states, in the product's own accent. It fetches the SERVER card through
// lib/cards/saveCard.js downloadCard, so what it saves is the 1080 x 1350 baseball-card picture, never a screenshot of the page.
//
// WHERE IT SITS (one rule per kind of surface; the page decides the slot, this file decides everything else):
//   a board / ranking   the right end of the page's view row: after the List | Cards switch, or in the Filters row on a desktop. Never
//                       inside the Filters sheet, never floating beside a sentence: it is visible without opening anything.
//   a game              the right end of the game's title row (to the right of the two clubs, before "Open game").
//   a player            the right end of the player header, beside the flip "Card" button.
//   a list / record     the right end of the list's or the record's own header row.
//
// STATES (the box never changes size, so nothing around it moves): ready "Save"; working a spinner and "Saving"; saved a tick and "Saved"
// for two seconds plus a short notice above the bottom bar; failed "Retry" for four seconds (the reason is the notice saveCard already says).
// SIZE: 44 px tall on a phone or any touch screen, 34 px on a desktop with a mouse (the only place a smaller target is safe). Under 361 px
// wide the word is dropped and the camera stays, still 44 x 44, so a 360 px phone never wraps the row.
// A hidden product (BUCKETS) has no button for a visitor its gate (lib/nba/gate.js) does not let in; an admin or an early-access holder gets it.
import { useEffect, useRef, useState } from 'react'
import { useSportOpen } from '../../lib/useVisibleSports'
import { downloadCard, notice } from '../../lib/cards/saveCard'
import { useSportTheme } from '../SportTheme'

const WORD = { idle: 'Save', busy: 'Saving', done: 'Saved', fail: 'Retry' }

function Spinner({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  )
}

/**
 * @param sport     the product ('mlb' | 'nfl' | 'nhl' | 'nba'); a hidden one draws nothing
 * @param url       the card's address (lib/cards/saveCard.js shareUrl / playerUrl), or a function that returns it when tapped
 * @param filename  the saved file's name
 * @param what      what is being saved, for the screen reader and the tooltip ("this ranking", "this game", "his card")
 * @param icon      true = the camera alone, 44 x 44 (a table row that has no room for the word)
 * @param style     layout-only extras (margin, alignSelf); never colour or size
 */
export default function ShareCardButton({ sport, url, filename, what = 'this card', icon = false, style = null }) {
  const { C, accent } = useSportTheme()
  const [state, setState] = useState('idle')
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  // BUCKETS: only for a visitor its gate lets in (admin, early access, public); the build-time isHiddenSport hid it from holders too (2026-10-12)
  const allowed = useSportOpen(sport)
  if (allowed !== true) return null
  const settle = (next, ms) => { setState(next); clearTimeout(timer.current); timer.current = setTimeout(() => setState('idle'), ms) }
  const go = async (e) => {
    e.stopPropagation()
    if (state === 'busy') return
    setState('busy')
    let ok = false
    try { ok = await downloadCard(typeof url === 'function' ? url() : url, filename) } catch { ok = false }
    if (ok) { notice('Saved to your device'); settle('done', 2000) } else settle('fail', 4000)
  }
  const label = state === 'idle' ? `Save ${what} as a picture` : state === 'busy' ? 'Saving the picture' : state === 'done' ? 'Saved' : 'The picture was not saved. Try again'
  const tone = state === 'fail' ? C.amber || accent : accent
  return (
    <button type="button" className="share-card-btn" onClick={go} disabled={state === 'busy'} title={label} aria-label={label} aria-busy={state === 'busy'} data-state={state}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, flex: '0 0 auto', boxSizing: 'border-box', width: icon ? 44 : 88,
        padding: 0, borderRadius: 8, cursor: state === 'busy' ? 'progress' : 'pointer', fontSize: 13, fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
        border: `1px solid ${state === 'idle' ? C.border2 : tone}`, background: 'transparent', color: tone, ...(style || {}),
      }}>
      {state === 'busy' ? <Spinner color={tone} /> : <span aria-hidden="true" style={{ fontSize: 16 }}>{state === 'done' ? '✓' : '\u{1F4F8}'}</span>}
      {icon ? null : <span className="share-card-word">{WORD[state]}</span>}
    </button>
  )
}
