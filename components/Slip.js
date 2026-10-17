'use client'
// THE SLIP BAR (2026-10-17, Donovan: "make sure the players go to the bet slip so they can see"; the slip is always one tap away).
// One compact chip, on every sport's shell, with the leg count. It opens the SAME BetSlip the Props tab draws (components/props/BetSlip.js,
// unchanged look) over the ONE slip store (lib/slip/store.js), so a leg added from a player card, a Props card or MLB's player modal
// lands in the same place. Inside the panel:
//   ADD TONIGHT'S CALLED PICKS   a member adds every not-started CALLED pick that has a priced market (most six); anyone else sees
//                                'Try an example slip' (the free four's priced ones, most two) and one quiet Join line.
//   HOW OFTEN CALLED PICKS LANDED TOGETHER   the locked, graded record, N = 2..6 (lib/slip/landed.js), sample size always shown.
// MLB's old floating Slip (HR / Hit / HRR / TB legs, no price) is this component now: the same chip, the same slip.
import { useEffect, useState } from 'react'
import BetSlip from './props/BetSlip'
import { useSlip, useCalls } from '../lib/slip/store'
import { calledLegs } from '../lib/slip/core'
import { landedTogether } from '../lib/slip/landed'
import { useMemberState } from './MemberGate'
import { membersUrl } from '../lib/members'
import { TYPE } from '../lib/theme'
import { DOCK_CLEAR_PHONE } from '../lib/dockClear'

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
        .slipSheet{position:fixed;z-index:420;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));width:min(440px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain}
        @media(max-width:760px){
          .slipChip{bottom:${DOCK_CLEAR_PHONE}}
          body:has([role=note].account-nudge) .slipChip{bottom:calc(${DOCK_CLEAR_PHONE} + 62px)}   /* the free-account line sits at the dock too: stack above it, never under it */
          .slipSheet{left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));width:auto;max-height:calc(100dvh - 16px - env(safe-area-inset-top))}
          main.dashboard-main{padding-bottom:156px!important}
        }
      `}</style>
      <button type="button" className="slipChip" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
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
