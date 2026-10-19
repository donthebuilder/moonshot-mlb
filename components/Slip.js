'use client'
// THE SLIP BAR (2026-10-17, Donovan: "make sure the players go to the bet slip so they can see"; the slip is always one tap away).
// One compact chip, on every sport's shell, with the leg count. It opens the SAME BetSlip the Props tab draws (components/props/BetSlip.js,
// unchanged look) over the ONE slip store (lib/slip/store.js), so a leg added from a player card, a Props card or MLB's player modal
// lands in the same place. Inside the panel:
//   ADD TONIGHT'S CALLED PICKS   a member adds every not-started CALLED pick that has a priced market (most six); anyone else sees
//                                'Try an example slip' (the free four's priced ones, most two) and one quiet Join line.
//   HOW OFTEN CALLED PICKS LANDED TOGETHER   the locked, graded record, N = 2..6 (lib/slip/landed.js), sample size always shown.
// MLB's old floating Slip (HR / Hit / HRR / TB legs, no price) is this component now: the same chip, the same slip.
import { useEffect, useRef, useState } from 'react'
import BetSlip from './props/BetSlip'
import { useSlip, useCalls } from '../lib/slip/store'
import { calledLegs } from '../lib/slip/core'
import { landedTogether } from '../lib/slip/landed'
import { useMemberState } from './MemberGate'
import { membersUrl } from '../lib/members'
import { TYPE } from '../lib/theme'
import { DOCK_CLEAR_PHONE } from '../lib/dockClear'


// NEVER OVER A CONTROL (2026-10-17, phone run-through: the chip floated over a card's "The Read" / "Recent form" at some scroll positions). A fixed chip
// cannot avoid every control by CSS, so when the page settles (scroll stops, resize, the DOM changes) it asks where a tap target's CENTRE lies and takes
// the first free place: bottom right (home), bottom left, then each one chip-height up, and last a slim edge tab. It also hides while the on-screen keyboard
// is open (visualViewport shorter than it was) and while another dialog / sheet is open (it is z-index 80: it floated over the Filters drawer). Pure
// DOM reads; it writes one data attribute. `data-pos` / `data-hide` are what the CSS below keys on.
const TAP_SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem]'
const SLOTS = ['right', 'left', 'right-up', 'left-up', 'tab']
function placeChip(chip, fullH) {
  const vv = window.visualViewport
  const ae = document.activeElement
  const typing = Boolean(ae) && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)
  const keyboard = typing && Boolean(vv) && vv.height < fullH.current - 120   // a shorter viewport alone (a phone turned sideways) is not the keyboard
  const sheet = document.querySelector('[role=dialog]:not(.slipSheet), [aria-modal=true], .modal-backdrop')
  const hide = keyboard || Boolean(sheet)
  if (hide) { if (chip.dataset.hide !== '1') chip.dataset.hide = '1'; return }
  if (chip.dataset.hide) delete chip.dataset.hide
  const taps = []
  for (const el of document.querySelectorAll(TAP_SEL)) {
    if (el === chip) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue
    taps.push({ el, cx: Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1), cy: Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1) })
  }
  let best = null
  for (const slot of SLOTS) {
    chip.dataset.pos = slot
    const c = chip.getBoundingClientRect()
    const hit = taps.filter((t) => t.cx >= c.left - 3 && t.cx <= c.right + 3 && t.cy >= c.top - 3 && t.cy <= c.bottom + 3 && (() => { const top = document.elementFromPoint(t.cx, t.cy); return top && (chip.contains(top) || top === t.el || t.el.contains(top) || top.contains(t.el)) })()).length
    if (best == null || hit < best.hit) best = { slot, hit }
    if (!hit) break
  }
  chip.dataset.pos = best.slot
}

const SPORT_WORD = { mlb: 'home-run', nfl: 'touchdown', nhl: 'goal', nba: 'points' }

function useLanded(sport, open) {
  const [state, setState] = useState({ status: 'idle', data: null })
  useEffect(() => {
    if (!open || state.status !== 'idle') return undefined
    let alive = true
    setState({ status: 'loading', data: null })
    fetch(`/api/record/calls?sport=${sport}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive) return
      setState(j && Array.isArray(j.calls) ? { status: 'ok', data: landedTogether(j.calls, { today: j.meta?.today || '' }) } : { status: 'down', data: null })
    }).catch(() => { if (alive) setState({ status: 'down', data: null }) })
    return () => { alive = false }
  }, [open, sport, state.status])
  return state
}

export default function Slip({ sport = 'mlb', C, NUM_FONT, accent, onOpenProps = null }) {
  const [open, setOpen] = useState(false)
  const { legs, remove, clear, addMany } = useSlip(sport)
  const pub = useCalls(sport)
  const memberState = useMemberState()
  const landed = useLanded(sport, open)
  const [note, setNote] = useState('')
  const chipRef = useRef(null)
  const fullH = useRef(0)
  useEffect(() => {
    const chip = chipRef.current
    if (!chip) return undefined
    const vv = window.visualViewport
    fullH.current = Math.max(fullH.current, vv ? vv.height : 0, window.innerHeight)
    let t = null
    // while the chip slides with the bar (or is tucked away with it) its box is not where it will rest: place it after
    const run = () => { t = null; if (document.querySelector('.mobileTabBar.tucked')) return; if (chip.getAnimations?.().length) { later(120); return } if (!document.hidden) { const h = vv ? vv.height : window.innerHeight; if (h > fullH.current) fullH.current = h; placeChip(chip, fullH) } }
    const later = (ms = 160) => { if (t) clearTimeout(t); t = setTimeout(run, ms) }
    // OUT OF THE WAY WITH THE BAR (Donovan 10-18: "hide just like the nav does when scrolling"): no listener of its own.
    // The bottom bar (components/MobileTabBar.js, every sport) tucks on a scroll down and comes back on a scroll up, near
    // the top and at the bottom; the chip follows its .tucked class in the CSS below, same distance, same .22s.
    const kb = () => { if (!document.hidden) placeChip(chip, fullH) }   // the keyboard opening or closing: no wait, the chip must not sit on the input
    // the page's own scroll and a scroll box a person moves (a table), never the NFL score ticker, which scrolls itself ~60
    // times a second and kept placement from ever settling (10-18)
    const onScroll = (e) => { const tg = e?.target; if (tg?.closest?.('.nfl-ticker-shell') || tg?.classList?.contains?.('nfl-ticker-shell')) return; later() }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    window.addEventListener('resize', later)
    window.addEventListener('hashchange', () => later(400))
    window.addEventListener('focusin', kb); window.addEventListener('focusout', () => later(120))
    window.addEventListener('orientationchange', () => { fullH.current = 0; later(400) })
    vv?.addEventListener('resize', kb)
    const mo = new MutationObserver(() => later(300))
    mo.observe(document.body, { childList: true, subtree: true })
    later(300)
    return () => { if (t) clearTimeout(t); window.removeEventListener('scroll', onScroll, { capture: true }); window.removeEventListener('resize', later); window.removeEventListener('focusin', kb); vv?.removeEventListener('resize', kb); mo.disconnect() }
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  const member = memberState === 'member'
  const plan = pub ? calledLegs(pub.cands, memberState) : null
  const addCalled = () => {
    if (!plan) { onOpenProps?.(); setOpen(false); return }
    const fresh = plan.legs.filter((l) => !legs.some((x) => x.key === l.key))
    addMany(plan.legs)
    setNote(plan.legs.length ? `${fresh.length} added${fresh.length < plan.legs.length ? `, ${plan.legs.length - fresh.length} already on your slip` : ''}.` : '')
  }
  const btn = { minHeight: 44, padding: '0 14px', borderRadius: 10, border: `1px solid ${accent}`, background: 'transparent', color: accent, fontSize: 13, fontWeight: 800, cursor: 'pointer', textAlign: 'left' }
  const quiet = { fontSize: 12, lineHeight: 1.5, color: C.text2 }
  return (
    <>
      <style>{`
        .slipChip{position:fixed;z-index:80;right:max(12px,env(safe-area-inset-right));bottom:max(16px,env(safe-area-inset-bottom))}
        .slipChip[data-pos=left],.slipChip[data-pos=left-up]{right:auto;left:max(12px,env(safe-area-inset-left))}
        .slipChip[data-pos=right-up],.slipChip[data-pos=left-up]{margin-bottom:52px}
        .slipChip[data-pos=tab]{right:0;border-radius:22px 0 0 22px!important;transform:translateX(calc(100% - 24px))}
        .slipChip[data-hide]{visibility:hidden;pointer-events:none}
        .slipChip{transition:translate .22s ease,opacity .22s ease}
        body:has(.mobileTabBar.tucked:not(:focus-within)) .slipChip{translate:0 calc(100% + 140px);opacity:0;pointer-events:none}
        @media(prefers-reduced-motion:reduce){.slipChip{transition:none}}
        .slipSheet{position:fixed;z-index:420;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain}
        @media(max-width:760px){
          .slipChip{bottom:${DOCK_CLEAR_PHONE}}
          /* EMPTY SLIP, ON A PHONE (Donovan 10-18: "it needs to show up when it's being used and go away when it's not"): no chip
             until a leg is added. Every pick's "+ slip" still adds one; the chip appears with it. */
          .slipChip[data-empty="1"]{display:none!important}
          body:has([role=note].account-nudge) .slipChip{bottom:calc(${DOCK_CLEAR_PHONE} + 62px)}   /* the free-account line sits at the dock too: stack above it, never under it */
          .slipSheet{left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));width:auto;max-height:calc(100dvh - 16px - env(safe-area-inset-top))}
          main.dashboard-main{padding-bottom:156px!important}
        }
        @media(orientation:landscape) and (max-height:500px){main.dashboard-main{padding-bottom:132px!important}}   /* a phone on its side: the last row scrolls clear of the dock and the chip */
      `}</style>
      <button type="button" className="slipChip" ref={chipRef} data-empty={legs.length ? undefined : '1'} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Your slip, ${legs.length} ${legs.length === 1 ? 'pick' : 'picks'}. Open it.`}
        style={{ minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 14px', background: C.bg2, color: C.text, border: `1px solid ${legs.length ? accent : C.border2}`, borderRadius: 22, boxShadow: '0 8px 28px rgba(0,0,0,.6)', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: NUM_FONT }}>
        <span aria-hidden="true">🧾</span>
        <span>Slip · {legs.length}</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close the slip" onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 415, border: 0, background: 'rgba(0,0,0,.55)', cursor: 'default' }} />
          <section className="slipSheet" role="dialog" aria-label="Your slip" style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 16, padding: '4px 12px 14px', color: C.text }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48 }}>
              <b style={{ fontSize: 14 }}>🧾 Slip · {legs.length}</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close the slip" style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'transparent', color: C.text2, fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            {legs.length === 0 && <div style={{ ...quiet, margin: '2px 0 8px' }}>Nothing on your slip yet. Tap + slip on a prop or a player page to add it.</div>}
            <BetSlip legs={legs} onRemove={remove} onClear={clear} C={C} NUM_FONT={NUM_FONT} accent={accent} />

            <div style={{ display: 'grid', gap: 6, margin: '6px 0 12px' }}>
              <button type="button" onClick={addCalled} style={btn}>{member ? 'Add tonight’s called picks' : 'Try an example slip'}</button>
              {plan && plan.legs.length === 0 && <div style={quiet}>No called pick with a posted price is still to play tonight.</div>}
              {!plan && <div style={quiet}>Opens the Props board, which lists tonight&apos;s called picks.</div>}
              {note && <div role="status" style={quiet}>{note}</div>}
              {!member && (
                <div data-pm="slip-join" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0 10px', ...quiet }}>
                  <span>Members add all of tonight&apos;s called picks{plan && plan.total > 0 ? ` (${plan.total})` : ''}.</span>
                  <a href={membersUrl()} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, padding: '0 8px', fontWeight: 900, color: C.text, textDecoration: 'underline' }}>Join</a>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <b style={{ fontSize: 13 }}>How often called picks landed together</b>
              <div style={{ ...quiet, marginTop: 2 }}>The night&apos;s top N {SPORT_WORD[sport] || ''} calls, as locked before the first game, all landing. n = nights.</div>
              {landed.status === 'loading' && <div style={{ ...quiet, marginTop: 6 }}>Loading the record.</div>}
              {landed.status === 'down' && <div style={{ ...quiet, marginTop: 6 }}>The record is not available right now.</div>}
              {landed.data && (
                <div style={{ marginTop: 6 }}>
                  {landed.data.rows.map((r) => (
                    <div key={r.n} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, padding: '8px 0', fontSize: 12.5 }}>
                      <b style={{ minWidth: 48, color: C.text }}>{r.n} picks</b>
                      <span style={{ color: r.enough ? C.text : C.text2, fontFamily: NUM_FONT }}>{r.message}</span>
                      <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro || 11 }}>{r.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </>
  )
}
