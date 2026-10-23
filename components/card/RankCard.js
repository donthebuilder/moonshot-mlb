'use client'
import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { alpha } from '../../lib/scales'
import { STATUS_WORD } from '../../lib/callStatus'
import { useSportTheme, SportTheme } from '../SportTheme'
import TeamMark from '../TeamMark'
import { ExplainStrip } from './CardParts'
import { RankMoveCell } from '../RankMove'
import useStamps from './useStamps'
import { explain as explainTap } from '../../lib/explain'
import { useCardLock, useMemberState, CardLockLine } from '../MemberGate'
import CallStatusBadge from '../CallStatusBadge'

// THE RANKING CARD, IN THE BASEBALL-CARD LANGUAGE (2026-10-10). Donovan: "whatever has the new baseball cards, that's what I like."
// One HTML card for every product's ranked list, drawn the way the player card images are drawn (lib/cards/playerCard.js, the FRONT,
// and lib/cards/playerBack.js, the stat-table BACK; the same model words as lib/cards/model.js): a thin accent frame, a foil strip on
// CALLED only, the status word letter-spaced on a rule with the position, the face over a faded club mark with the rank as a quiet tag
// and the score in a box (big, slanted), the name in slanted capitals, the club logo and the matchup, one reason line, equal stat
// boxes in the standout rule (top 20% glow in the accent, bottom 20% recede), and the back one tap away: the cream stat table.
// Nothing here names a sport: the product's theme (SportTheme), words and numbers arrive as props. MOONSHOT passes its chips and boxes
// in the `chips` / `statsNode` slots and its Add to Slip in `foot`, so its card keeps everything it showed.
//
// The image cards use Big Shoulders for the name; the site's rule is no new fonts, so the name takes the system sans in heavy italic caps.
//
// COMPACT (2026-10-12, the game page's pick cards; Donovan: "this looks ass"): the same card drawn for a 216-340px column, where the
// ranking layout collided (the score box sat over the face, the grade tag under it, the action row wrapped into a sliver). Compact lays
// the top band out as a ROW (face | score over its tags), so nothing is positioned over anything; puts the pick label in the status
// slot; holds the chips to two rows with "+N"; keeps Flip | the foot's buttons on one nowrap line of 44px targets; reserves two lines
// for the name so a row of cards lines up; and lets `wide` lay one card across a full row. Not compact = the ranking card, unchanged.

export default function RankCard({
  accent: accentProp = null, status = null, pos = '', rank = null, face = null, sport, club = null, name, opp = null, home = true, role = '',
  score = null, scoreWord = 'SCORE', explain = null, reason = null, chips = null, stats = [], statsNode = null, back = null, foot = null, onClick = null,
  dim = false, extraLine = null, rankTags = [], extraNotes = [], style = null, title = undefined, rankMove = null,
  compact = false, wide = false, kicker = null, kickerPills = [], chipRows = 2, stampFor = null, lockIn = null,
}) {
  const { C, NUM_FONT, accent: themeAccent } = useSportTheme()
  const accent = accentProp || themeAccent
  // THE MEMBERS LOCK (2026-10-16, Donovan: lock the rest of the cards too). lockIn = { key, time, graded?, slateDate? } is the SAME key and game time the sport's
  // table gate uses (components/MemberGate.js useCardLock). Locked = a confirmed non-member's tonight, not-started, not-graded CALLED pick outside the free four:
  // the stamp becomes the plain ON THE BOARD word (Donovan: "just show them as ON THE BOARD") and the rank, score, grade, why, chips and notes are dropped. Name, club, matchup, role and the stat boxes stay.
  // No lockIn, or any viewer who is not a confirmed non-member: this draws exactly as before.
  const cardLock = useCardLock({ status: lockIn ? status : null, key: lockIn?.key, time: lockIn?.time, graded: Boolean(lockIn?.graded), slateDate: lockIn?.slateDate || null })
  const locked = cardLock.locked
  const nonMember = useMemberState() === 'free'   // every non-member card carries the one generic join line, so the line never says who is called
  if (locked) { score = null; rank = null; rankMove = null; rankTags = []; extraNotes = []; extraLine = null; reason = null; chips = null; explain = null; back = null; stats = [] }
  const called = status === 'called' && !locked
  const [flip, setFlip] = useState(false)
  const [info, setInfo] = useState(false)
  // SITUATION STAMPS (lib/cards/situations.js): fact-only chips ("Division Series", "1 HR from 40"); fetched only when the caller passes stampFor = { sport, id, day }; tap explains
  const stamps = useStamps(stampFor)
  const n = String(name || '')
  const heat = (pct) => (pct == null ? { c: C.text, hot: false } : pct >= 80 ? { c: accent, hot: true } : pct <= 20 ? { c: C.text3, hot: false } : { c: C.text, hot: false })
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const tag = (t) => (
    <span key={t} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: C.text, background: alpha(C.bg, 0.7), border: `1px solid ${alpha(C.text, 0.22)}`, borderLeft: `3px solid ${called ? accent : alpha(C.text, 0.4)}`, padding: '2px 7px', whiteSpace: 'nowrap' }}>{t}</span>
  )

  // the foil strip, CALLED only (lib/cards/cardKit.js foil)
  const foil = <div style={{ height: 5, background: called ? `linear-gradient(100deg, ${accent} 0%, ${alpha(C.text, 0.95)} 22%, ${accent} 44%, ${alpha(C.text, 0.7)} 66%, ${accent} 84%, ${alpha(C.text, 0.9)} 100%)` : 'transparent' }} />
  const stripWord = locked ? STATUS_WORD.board : status ? STATUS_WORD[status] : (compact ? kicker : '')
  const strip = (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 10, padding: '6px 12px 0' }}>
      <span style={compact
        ? { fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', lineHeight: 1.25, color: called || kicker ? accent : C.text2, textTransform: 'uppercase', whiteSpace: 'nowrap', flex: '0 0 auto' }
        : { fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.28em', color: called ? accent : C.text2, whiteSpace: 'nowrap' }}>{stripWord}</span>
      {/* a card that holds more than one slot: the others as small pills in their own colours, on the same line (two, then "+N") */}
      {compact && kickerPills.length > 0 && (
        <span title={kickerPills.map((k) => k.label).join(' · ')} style={{ display: 'inline-flex', gap: 3, minWidth: 0, overflow: 'hidden', flex: '0 1 auto' }}>
          {kickerPills.slice(0, 2).map((k) => <span key={k.label} style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.04em', lineHeight: 1.2, color: k.color, border: `1px solid ${alpha(k.color, 0.55)}`, borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>{k.label}</span>)}
          {kickerPills.length > 2 && <span style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, lineHeight: 1.2, color: C.text2, border: `1px solid ${C.border2}`, borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>+{kickerPills.length - 2}</span>}
        </span>
      )}
      <span style={{ flex: 1, height: 1, minWidth: 4, background: alpha(accent, called ? 0.5 : 0.2) }} />
      <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: C.text2 }}>{pos}</span>
    </div>
  )
  // the portrait over the faded club mark, the rank tag and the score box
  const bandBox = { position: 'relative', borderTop: `1px solid ${alpha(accent, 0.2)}`, borderBottom: `1px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(accent, 0.32)} 0%, ${alpha(accent, 0.06)} 64%, ${alpha(C.bg, 0.3)} 100%)`, overflow: 'hidden', margin: '6px 0 0' }
  const mark = club && sport && <div style={{ position: 'absolute', right: -24, top: 4, opacity: 0.16, pointerEvents: 'none' }}><TeamMark sport={sport} abbr={club} variant="logo" px={120} /></div>
  const scoreBoxStyle = { textAlign: 'center', padding: compact ? '4px 10px 3px' : '4px 12px 3px', background: alpha(C.bg, 0.72), border: `1px solid ${alpha(accent, called ? 0.6 : 0.3)}`, cursor: 'pointer', minWidth: 44 }
  const scoreBox = score != null && (
    <div onClick={stop(() => setInfo((v) => !v))} style={compact ? scoreBoxStyle : { ...scoreBoxStyle, position: 'absolute', right: 10, top: 8 }}>
      <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.16em', color: C.text2 }}>{scoreWord}</div>
      <div style={{ fontFamily: NUM_FONT, fontSize: 34, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{score}</div>
    </div>
  )
  // places moved since the last update (components/RankMove.js): one mount for every sport's card; information only
  const rankMoveTag = rankMove?.move && <span style={{ background: alpha(C.bg, 0.7), border: `1px solid ${alpha(C.text, 0.22)}`, padding: '1px 6px', lineHeight: 1 }}><RankMoveCell cell={rankMove} up={accent} down={C.text3} size={10} /></span>
  const band = compact ? (
    <div style={{ ...bandBox, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
      {mark}
      <div style={{ position: 'relative', flex: '0 0 auto' }}>{face}</div>
      <div style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        {scoreBox}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          {rank != null && tag(`#${rank}`)}
          {rankMoveTag}
          {rankTags.slice(0, 1).map(tag)}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ ...bandBox, minHeight: 104 }}>
      {mark}
      <div style={{ position: 'absolute', left: 12, top: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
        {rank != null && tag(`#${rank}`)}
        {rankMoveTag}
        {rankTags.slice(0, 1).map(tag)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>{face}</div>
      {scoreBox}
    </div>
  )
  const nameSize = compact ? (n.length > 14 ? 20 : 22) : (n.length > 22 ? 20 : n.length > 16 ? 23 : 26)
  const head = (
    <div style={{ padding: '8px 12px 0' }}>
      <ExplainStrip notes={[info && explain, ...extraNotes]} />
      {/* the name: slanted capitals, wrapping before it would lose a letter (no ellipsis) */}
      <div title={n} style={{ fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', lineHeight: 1.04, letterSpacing: '-.01em', overflowWrap: 'anywhere', fontSize: nameSize, color: C.text, }}>{n}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, fontFamily: NUM_FONT }}>
        {club && sport && <TeamMark sport={sport} abbr={club} variant="logo" px={22} />}
        {opp && <span style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{home === false ? '@' : 'vs'} {opp}</span>}
        {role && <span style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>{role}</span>}
        {extraLine}
      </div>
      {reason && <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.4, marginTop: 6 }}>{reason}</div>}
      {lockIn && nonMember && <CardLockLine C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 6 }} />}
      {stamps.length > 0 && (
        <div data-stamps style={{ display: 'flex', flexWrap: 'wrap', gap: '0 6px', marginTop: 2 }} onClick={(e) => e.stopPropagation()}>
          {stamps.map((s) => (
            <button key={s.key} type="button" onClick={stop(() => explainTap(s.label, s.explain))} aria-label={`${s.text}. ${s.explain}`} style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
              <span style={{ fontFamily: NUM_FONT, fontSize: 12, fontWeight: 800, letterSpacing: '.03em', lineHeight: 1.25, color: C.text, background: alpha(C.bg, 0.7), border: `1px solid ${alpha(C.text, 0.22)}`, borderLeft: `3px solid ${accent}`, padding: '3px 8px', textAlign: 'left' }}>{s.text}</span>
            </button>
          ))}
        </div>
      )}
      {!compact && chips && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>{chips}</div>}
    </div>
  )
  const chipBlock = compact && chips && (
    <div className="rc-chips" style={{ padding: '8px 12px 0' }}><ChipRows items={chips} rows={chipRows} C={C} NUM_FONT={NUM_FONT} /></div>
  )
  const statBlock = (statsNode || stats.length > 0) && (
    <div className="rc-stats" style={{ padding: '8px 12px 0' }}>
      {statsNode || (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, stats.length)}, minmax(0, 1fr))`, gap: 0, borderTop: `1px solid ${alpha(C.text, 0.12)}` }}>
          {stats.slice(0, 6).map((s) => {
            const h = heat(s.pct)
            return (
              <div key={s.label} title={s.title} style={{ minWidth: 0, padding: '6px 8px', borderLeft: `1px solid ${alpha(C.text, 0.12)}` }}>
                <div style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: C.text3, letterSpacing: '.04em', lineHeight: 1.2 }}>{s.label}</div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: h.c, whiteSpace: 'nowrap' }}>{s.value}{s.unit ? <span style={{ fontSize: 11, fontWeight: 700, color: C.text3 }}> {s.unit}</span> : null}</div>
                {s.pct != null && <div style={{ height: 4, borderRadius: 2, background: alpha(C.text, 0.1), marginTop: 3 }}><div style={{ height: 4, borderRadius: 2, width: `${Math.max(4, Math.min(100, s.pct))}%`, background: h.hot ? accent : alpha(C.text, 0.5) }} /></div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
  const footRow = (
    <div className="rc-foot" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: compact ? 'nowrap' : 'wrap', padding: compact ? '6px 12px 8px' : '4px 12px 8px' }}>
      <style>{'.rc-foot button{min-height:44px;min-width:44px}'}</style>
      {back && (
        <button type="button" data-tile="cta" onClick={stop(() => setFlip(true))} aria-label="Flip the card: the stat table" title="Flip the card: the stat table" style={{ background: 'transparent', border: `1px solid ${alpha(accent, 0.4)}`, borderRadius: 8, color: accent, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', padding: compact ? '0 10px' : '0 12px', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{compact ? <><span style={{ fontSize: 17, lineHeight: 1 }}>⟲</span><span className="rc-fliptxt"> Flip</span></> :'⟲ Flip: stat table'}</button>
      )}
      {foot}
    </div>
  )

  return (
    <div onClick={onClick || undefined} title={title} className={compact ? `rc-c${wide && !flip ? ' rc-wide' : ''}` : undefined} style={{
      position: 'relative', boxSizing: 'border-box', minWidth: 0, width: '100%', overflow: 'hidden', borderRadius: 14,
      border: `2px solid ${alpha(accent, called ? 0.6 : 0.35)}`, background: C.bg2, cursor: onClick ? 'pointer' : 'default', opacity: dim ? 0.55 : 1, ...style,
    }}>
      {compact && <style>{RC_CSS}</style>}
      {flip ? (
        <>
          {foil}
          <Back C={C} NUM_FONT={NUM_FONT} accent={accent} name={n} pos={pos} back={back} onFlip={stop(() => setFlip(false))} />
        </>
      ) : compact ? (
        <>
          <div className="rc-a">{foil}{strip}{band}{head}</div>
          <div className="rc-b">{chipBlock}{statBlock}{footRow}</div>
        </>
      ) : (
        <>
          {foil}
          {strip}
          {band}
          {head}
          {statBlock}
          {footRow}
        </>
      )}
    </div>
  )
}

// the compact card's layout rules. The card is its own size container, so the word "Flip" shows when there is room for it (a full-width
// card); the wide card is two columns from tablet up (the one media query, for that layout only).
const RC_CSS = '.rc-c{container-type:inline-size;display:flex;flex-direction:column;flex:1 1 auto}'
  + '.rc-c .rc-b{display:flex;flex-direction:column;flex:1 1 auto;min-width:0}'
  + '.rc-fliptxt{display:none}'
  + '.rc-c .rc-stats,.rc-c .rc-foot{margin-top:auto}.rc-c .rc-stats+.rc-foot{margin-top:0}'
  + '.rc-c .stat-strip-c{gap:4px;grid-template-columns:repeat(4,minmax(0,1fr))!important}'
  + '@container (min-width:300px){.rc-fliptxt{display:inline}}'
  + '@media (min-width:720px){.rc-wide{display:grid;grid-template-columns:minmax(230px,290px) minmax(0,1fr)}.rc-wide .rc-a{border-right:1px solid rgba(255,255,255,.1);padding-bottom:10px}}'

// THE GAME PAGE'S PICK GRID (components/tabs/Games.js): equal-height cells, as many 216px+ tracks as fit; a phone is one track with the
// cells become a horizontal scroll-snap row (one card about 85% wide so the next peeks) with a "1 of N" count under it.
export const PICK_GRID_CSS = '.gp-pickgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(216px,1fr));gap:10px;align-items:stretch}'
  + '.gp-pickgrid>*{min-width:0}.gp-pickcell{display:flex;flex-direction:column}'
  + '.gp-pickgrid-wide{grid-column:1/-1}'
  + '.gp-count{display:none}'
  + '@media (max-width:559px){.gp-pickgrid{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:85%;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;max-width:100%;padding-bottom:4px;scrollbar-width:none}'
  + '.gp-pickgrid::-webkit-scrollbar{display:none}.gp-pickcell,.gp-pickgrid-wide{scroll-snap-align:start;grid-column:auto}.gp-count{display:flex}}'

// TWO ROWS OF CHIPS, THEN "+N": every chip is rendered once to measure, the ones past the row limit are left out, and a "+N" says how many.
// The whole block is the tap target (it is at least two rows tall when it overflows), and it opens them all.
function ChipRows({ items, rows, C, NUM_FONT }) {
  const list = (Array.isArray(items) ? items : [items]).filter(Boolean)
  const ref = useRef(null)
  // the measured count is only good for the chip set it was measured on (sig), so a changed set measures again
  const [meas, setFit] = useState(null)
  const [open, setOpen] = useState(false)
  const sig = list.map((c, i) => c?.key ?? i).join('|')
  const fit = meas && meas.sig === sig ? meas.n : null
  useLayoutEffect(() => {
    if (fit !== null) return
    const el = ref.current
    if (!el) return
    const kids = [...el.children]
    const tops = [...new Set(kids.map((k) => k.offsetTop))].sort((a, b) => a - b)
    if (tops.length <= rows) { setFit({ sig, n: list.length }); return }
    const over = kids.filter((k) => k.offsetTop >= tops[rows]).length
    setFit({ sig, n: Math.max(1, list.length - over - 1) })
  }, [fit, sig, list.length, rows])
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    let w = el.clientWidth
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; setFit(null) } })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const more = fit !== null && fit < list.length
  const shown = fit === null || open ? list : list.slice(0, fit)
  const hidden = list.length - (fit ?? list.length)
  const toggle = { fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, color: C.text2, border: `1px solid ${C.border2}`, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', lineHeight: 1.4 }
  return (
    <div ref={ref} role={more ? 'button' : undefined} tabIndex={more ? 0 : undefined} aria-expanded={more ? open : undefined}
      aria-label={more ? (open ? 'Show fewer chips' : `Show ${hidden} more chips`) : undefined}
      onClick={more ? (e) => { e.stopPropagation(); setOpen((v) => !v) } : undefined}
      onKeyDown={more ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) } } : undefined}
      style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignContent: 'flex-start', cursor: more ? 'pointer' : 'default' }}>
      {shown}
      {more && <span style={toggle}>{open ? 'less' : `+${hidden}`}</span>}
    </div>
  )
}

// THE BACK (lib/cards/playerBack.js): cream stock, the stat table, printed in the chassis black; the accent only as tints and marks.
function Back({ C, NUM_FONT, accent, name, pos, back, onFlip }) {
  const rows = back?.rows || []
  return (
    <div style={{ background: C.text, color: C.bg, padding: '10px 12px 6px', borderTop: `4px solid ${accent}`, flex: '1 1 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, letterSpacing: '.22em' }}>PLAYER PROFILE</span>
        <span style={{ flex: 1, height: 2, background: alpha(accent, 0.8) }} />
        <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800 }}>{pos}</span>
      </div>
      <div style={{ fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', fontSize: 22, lineHeight: 1.05, margin: '4px 0 8px', overflowWrap: 'anywhere' }}>{name}</div>
      <div style={{ border: `2px solid ${C.bg}`, borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: i % 2 ? alpha(C.bg, 0.05) : 'transparent' }}>
            <span style={{ flex: 1, fontFamily: NUM_FONT, fontSize: 12, fontWeight: 700, minWidth: 0 }}>{r.label}</span>
            <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900, whiteSpace: 'nowrap' }}>{r.value}</span>
            {r.pct != null && <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, minWidth: 40, textAlign: 'right', background: alpha(accent, r.pct >= 80 ? 0.3 : 0.1), padding: '1px 4px' }}>{Math.round(r.pct)}th</span>}
          </div>
        ))}
        {!rows.length && !back?.node && <div style={{ padding: 10, fontSize: 12 }}>No more numbers published for him.</div>}
      </div>
      {/* the cream stock is light, so parts that read the dark theme's text colours are handed the inverted ones (their numbers were light-on-cream) */}
      {back?.node && <div style={{ color: C.bg, margin: '8px 0' }}><SportTheme theme={{ ...C, text: C.bg, text2: alpha(C.bg, 0.78), text3: alpha(C.bg, 0.6) }} accent={accent}>{back.node}</SportTheme></div>}
      {back?.note && <div style={{ fontSize: 11, marginTop: 6, opacity: 0.75, lineHeight: 1.4 }}>{back.note}</div>}
      <button type="button" onClick={onFlip} style={{ marginTop: 6, minHeight: 44, minWidth: 44, padding: '0 14px', background: 'transparent', border: `2px solid ${C.bg}`, borderRadius: 8, color: C.bg, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>⟲ Flip back</button>
    </div>
  )
}
