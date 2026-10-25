'use client'
// THE SLIP (2026-10-04, Donovan's user review #4: "no stake, no '$X wins $Y',
// no total at risk ... bet slip: stake, win amount, chance, total at risk,
// same-game warning"). Picks added from the props cards ('+ slip'), kept in
// this browser only. Two readings of the same picks:
//   SINGLES  the stake on each: what each wins, the total at risk
//   PARLAY   one stake on all of them: what it pays, and the chance the BOOKS'
//            prices put on every leg landing (their implied %, multiplied --
//            the site's own probability isn't printed until it's calibrated)
// Same-game legs are flagged: they share one game's conditions. For MLB homers our own
// pair evidence (lib/pairEvidence.js) measured that link at 1.05x, about independent; for
// other markets it is unmeasured, and the (?) says so. Math, not advice.
import { useState } from 'react'
import { TYPE } from '../../lib/theme'
import { fmtOdds, impliedPct, profitOn } from '../../lib/odds'
import HelpTip from '../HelpTip'
import CallStatusBadge from '../CallStatusBadge'
import { combined, bySport } from '../../lib/slip/core'
import { BRAND } from '../../lib/routes'
import { SPORT_ACCENT } from '../../lib/sportAccent'

/** "8 of these picks are in the DET · ARI game." (one sentence for the slip and the cards; the (?) holds what we measured). */
export function sameGameLine(list) {
  const top = [...list].sort((a, b) => b.n - a.n)[0]
  const more = list.length > 1 ? ` (and ${list.length - 1} more ${list.length === 2 ? 'game' : 'games'})` : ''
  return `${top.n} of these picks are in the ${top.label} game${more}.`
}
const money = (v) => `$${v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(2).replace(/\.00$/, '')}`

// ONE SLIP, EVERY SPORT (2026-10-25): legs from more than one sport sit under the product's name in its own accent. A leg's price can be set to
// the user's own (their book's number, marked "yours"): the slip holds one price per leg, so this is how a different book is used. Never invented.
export default function BetSlip({ legs, onRemove, onClear, onSetPrice = null, statusOf = null, pairNotes = [], partners = [], onAdd = null, C, NUM_FONT, accent }) {
  const [stake, setStake] = useState(10)
  const [editing, setEditing] = useState(null)   // `${sport}|${key}` of the leg whose price is being typed
  const [draft, setDraft] = useState('')
  if (!legs.length) return null
  const s = Number.isFinite(Number(stake)) && Number(stake) > 0 ? Number(stake) : 0
  // A leg with no real book price shows without one and adds nothing to the money lines; a combined price needs EVERY leg priced.
  const pr = combined(legs)
  const singlesWin = legs.reduce((t, l) => t + (l.price != null ? profitOn(l.price, s) || 0 : 0), 0)
  const parlayDec = pr.decimal ?? 1
  const parlayChance = pr.allPriced ? legs.reduce((t, l) => t * ((impliedPct(l.price) || 0) / 100), 1) : 0
  const games = new Map()
  for (const l of legs) if (l.game?.key) games.set(l.game.key, { label: l.game.label, n: (games.get(l.game.key)?.n || 0) + 1 })
  const shared = [...games.values()].filter((g) => g.n >= 2)
  const box = { border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px', margin: '6px 0 12px' }
  return (
    <section aria-label="Your slip" style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 12.5, color: C.text }}>🧾 Your slip · {legs.length} {legs.length === 1 ? 'pick' : 'picks'}</b>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text2, marginLeft: 'auto' }}>
          stake $
          <input type="number" inputMode="decimal" min="0" step="1" value={stake} onChange={(e) => setStake(e.target.value)}
            aria-label="Stake per bet, in dollars"
            style={{ width: 64, minHeight: 44, fontSize: 16, fontFamily: NUM_FONT, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0 8px' }} />
        </label>
        <button type="button" onClick={onClear} style={{ minHeight: 44, padding: '0 10px', border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Clear</button>
      </div>
      <div style={{ marginTop: 6 }}>
        {(() => {
          const groups = bySport(legs)
          const loose = legs.filter((l) => !l.sport)   // a leg saved before legs carried a sport
          const rows = (ls, sp) => ls.map((l) => {
            const ek = `${l.sport || sp || ''}|${l.key}`
            const isEd = editing === ek
            const commit = () => { if (draft.trim() && onSetPrice) onSetPrice(l.key, draft.trim().replace(/[^0-9+-]/g, ''), l.sport || sp); setEditing(null) }
            return (
              <div key={ek} style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.border}`, minHeight: 44, fontSize: 12.5 }}>
                <b style={{ color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</b>
                <span style={{ color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>{l.market}</span>
                {statusOf && statusOf(l) === 'called' ? <CallStatusBadge status="called" accent={SPORT_ACCENT[l.sport] || accent} theme={C} numFont={NUM_FONT} /> : null}
                {isEd ? (
                  <input autoFocus type="text" inputMode="text" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(null) }}
                    aria-label={`Your price for ${l.name}, American, like +250 or -120`} placeholder="+250"
                    style={{ marginLeft: 'auto', width: 72, minHeight: 44, fontSize: 16, fontFamily: NUM_FONT, background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '0 8px' }} />
                ) : onSetPrice ? (
                  <button type="button" onClick={() => { setEditing(ek); setDraft(l.price != null ? String(l.price > 0 ? `+${l.price}` : l.price) : '') }}
                    aria-label={`${l.name}: ${l.price != null ? `price ${fmtOdds(l.price)}${l.priceEdited ? ', yours' : ''}` : 'no price'}. Tap to set your own price.`}
                    style={{ marginLeft: 'auto', minHeight: 44, minWidth: 44, padding: '0 6px', border: 'none', background: 'transparent', color: l.priceEdited ? accent : C.text, fontFamily: NUM_FONT, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {l.price != null ? fmtOdds(l.price) : 'no price'}{l.priceEdited ? ' yours' : ''}
                  </button>
                ) : (
                  <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, color: C.text, whiteSpace: 'nowrap' }}>{l.price != null ? fmtOdds(l.price) : 'no price'}</span>
                )}
                <span style={{ fontFamily: NUM_FONT, color: C.text3, whiteSpace: 'nowrap' }}>{s && l.price != null ? `wins ${money(profitOn(l.price, s))}` : ''}</span>
                <button type="button" onClick={() => onRemove(l.key, l.sport)} aria-label={`Remove ${l.name} from the slip`}
                  style={{ minHeight: 44, minWidth: 44, border: 'none', background: 'transparent', color: C.text3, fontSize: 16, cursor: 'pointer' }}>×</button>
              </div>
            )
          })
          const many = groups.length + (loose.length ? 1 : 0) > 1
          return (<>
            {groups.map(([sp, ls]) => (
              <div key={sp}>
                {many && <div style={{ padding: '8px 0 2px', font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: SPORT_ACCENT[sp] || accent }}>{BRAND[sp]?.name || sp.toUpperCase()}</div>}
                {rows(ls, sp)}
              </div>
            ))}
            {rows(loose, null)}
          </>)
        })()}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, fontSize: 12.5, lineHeight: 1.6, color: C.text2 }}>
        {pr.priced > 0 && <div><b style={{ color: C.text }}>As singles:</b> {money(s * pr.priced)} at risk · {money(singlesWin)} profit if every one hits</div>}
        {legs.length >= 2 && !pr.allPriced && (
          <div><b style={{ color: C.text }}>Combined price, if every leg is priced:</b> {pr.priced} of {legs.length} legs have a posted price, so there is no combined price yet.</div>
        )}
        {legs.length >= 2 && pr.allPriced && (
          <div><b style={{ color: C.text }}>As one parlay (an estimate from the leg prices, not a real parlay price):</b> {money(s)} wins about {money(s * (parlayDec - 1))} · the books' prices put all {legs.length} landing at {(100 * parlayChance) < 1 ? '<1' : (100 * parlayChance).toFixed(1)}% (implied, so it includes the book's margin and reads high)</div>
        )}
        {shared.length > 0 && (
          <div style={{ color: C.text }}>{sameGameLine(shared)}<HelpTip label="Same game" color={C.text3} text="Picks from one game share the weather, starters and game flow. For MLB home runs we measured that link: two hitters in the same game homered together 1.05x as often as two unrelated hitters, which is about independent. We have not measured it for other markets. The parlay chance above treats every pick as separate." /></div>
        )}
        {/* PAIRING HELP (2026-10-07: what the deleted Parlay Builder had that helps people pair players; lib/slipPairs.js).
            Measured rates and real history only, for home-run legs; a product without the rules passes nothing. */}
        {pairNotes.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <b style={{ color: C.text }}>How these pair</b>
            {pairNotes.map((p) => (
              <div key={p.id} style={{ marginTop: 3, color: C.text2 }}>
                <b style={{ color: C.text }}>{p.a} + {p.b}.</b> {p.text}
              </div>
            ))}
          </div>
        )}
        {partners.length > 0 && onAdd && (
          <div style={{ marginTop: 6 }}>
            <b style={{ color: C.text }}>Pairs well with</b>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {partners.map((p) => (
                <button key={p.r.player_id ?? p.name} type="button" onClick={() => onAdd(p)}
                  aria-label={`Add ${p.name} to the slip: ${p.why}, ${p.rate.toFixed(1)} percent of such pairs both homered`}
                  style={{ minHeight: 44, padding: '0 12px', border: `1px solid ${accent}`, background: 'transparent', color: accent, borderRadius: 8, fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}>
                  + {p.name} <span style={{ color: C.text3, fontFamily: NUM_FONT }}>{p.why} · {p.rate.toFixed(1)}%</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: TYPE.micro || 11, color: C.text3 }}>Prices are the best book's, as shown on the cards. Math, not advice. 21+ where legal; play within limits.</div>
      </div>
    </section>
  )
}
