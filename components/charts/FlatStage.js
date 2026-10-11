'use client'
import { useEffect, useState } from 'react'
import { useIsPhone } from '../MobileFold'
import { alpha } from '../../lib/scales'
import StadiumShell from './StadiumShell'

// THE FLAT STAGE (Wave 6, 2026-10-11). The frame the 2D charts share with the 3D views and the player cards: a thin accent frame, a
// foil strip, the kicker on a rule, a faded club mark, the title in slanted capitals, one sentence, up to three tiles (the accent only
// on the signal), the picture, ONE legend line, the switches, and everything else folded behind "More numbers". It is the frame
// GameOffDef drew inline (the card look, 2026-10-10), lifted out so TUDDY, LAMP and BUCKETS draw the same one.
//
// It owns no data and no drawing: the product's theme (C, numFont, accent), its words and its picture arrive as props. Full screen is
// the StadiumShell one (a coarse pointer only), so a phone can open the picture to the whole screen.
//
//   kicker / right   the small caps row: THE FIELD ----- PASSING
//   title / lead     the slanted capitals line and the logo(s) in front of it
//   mark             a node faded behind the corner (a club logo)
//   sentence         what the picture says, in words
//   tiles            [{ label, big, line, pct, hot }] (3 at most)
//   legend           a string or node: the one key line
//   controls         the switches under the picture
//   more             { label, summary, children, defaultOpen } the fold
//   foot             anything after the fold (a bespoke fold, a source line)
//   fullscreen       offer the full-screen button on a phone

export function StageTile({ C, numFont, accent, label, big, line, pct, hot }) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, padding: '2px 10px', borderLeft: `2px solid ${alpha(C.text, 0.12)}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: C.text3, fontFamily: numFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'clip' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1, fontFamily: numFont, color: hot ? accent : C.text, transform: 'skewX(-8deg)', transformOrigin: 'left center' }}>{big}</div>
      <div aria-hidden="true" style={{ height: 4, borderRadius: 2, background: alpha(C.text, 0.1), margin: '4px 0 3px' }}>{pct != null && <div style={{ width: `${Math.max(4, Math.min(100, pct))}%`, height: 4, borderRadius: 2, background: hot ? accent : alpha(C.text, 0.5) }} />}</div>
      <div style={{ fontSize: 11, lineHeight: 1.3, color: C.text2, minHeight: 28 }}>{line}</div>
    </div>
  )
}

/** Two or three big pills, 44px, one choice (flex-equal). items: [[key, text, extra?]] */
export function StageSeg({ C, numFont, accent, items, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 6 }}>
      {items.map(([k, text, extra]) => {
        const on = value === k
        return (
          <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={on}
            style={{ flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '0 10px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              border: `1px solid ${on ? accent : C.border}`, background: on ? alpha(accent, 0.13) : alpha(C.text, 0.035),
              color: on ? accent : C.text2, fontSize: 13, fontWeight: 800, fontFamily: numFont, whiteSpace: 'nowrap' }}>
            {extra}{text}
          </button>
        )
      })}
    </div>
  )
}

/** The lens: underlined text buttons. items: [[key, text]] */
export function StageLens({ C, numFont, accent, items, value, onChange, label = 'What to show', word = 'LENS' }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: C.text3, fontFamily: numFont, marginRight: 4 }}>{word}</span>
      {items.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          style={{ minHeight: 44, minWidth: 44, padding: '0 12px', border: 0, borderBottom: `3px solid ${value === k ? accent : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontFamily: numFont, fontSize: 13, fontWeight: 800, color: value === k ? accent : C.text2 }}>{text}</button>
      ))}
    </div>
  )
}

export default function FlatStage({
  theme: C, numFont, accent, label = 'Chart', kicker = 'THE FIELD', right = null, title = null, lead = null, mark = null, sentence = null,
  tiles = null, legend = null, controls = null, more = null, foot = null, fullscreen = false, fullLabel = 'Chart, full screen',
  maxWidth = null, bare = false, foldTiles = false, storeKey = null, children,
}) {
  // PHONE (<= 430px): a COMPACT first screen -- one 44px header, the one-sentence read, the tiles in one row -- and the chart opens on a tap
  // (remembered for the session, per storeKey). Wider screens draw the whole stage as before.
  const phone = useIsPhone(430)
  const [chartOpen, setChartOpen] = useState(false)
  const sk = `flat-stage:${storeKey || label}`
  useEffect(() => { try { if (sessionStorage.getItem(sk) === '1') setChartOpen(true) } catch (e) { /* no storage: the choice is just not remembered */ } }, [sk])
  const toggleChart = () => setChartOpen((v) => { const n = !v; try { sessionStorage.setItem(sk, n ? '1' : '0') } catch (e) { /* private window */ } return n })
  const compact = phone
  if (compact) foldTiles = false
  const tileRow = tiles?.length > 0 ? (
    <div style={{ display: 'flex', margin: '0 -2px 8px' }}>
      {tiles.slice(0, 3).map((t) => <StageTile key={t.label} C={C} numFont={numFont} accent={accent} {...t} />)}
    </div>
  ) : null
  if (foldTiles && tileRow) more = { ...(more || {}), label: more?.label || 'More numbers', children: <>{tileRow}{more?.children}</> }
  const [open, setOpen] = useState(Boolean(more?.defaultOpen))
  const pic = maxWidth ? <div style={{ maxWidth, margin: '0 auto' }}>{children}</div> : children
  const frame = { marginBottom: 14, position: 'relative', overflow: 'hidden', border: `2px solid ${alpha(accent, 0.53)}`, borderRadius: 14, boxShadow: `0 0 26px ${alpha(accent, 0.12)}`, background: `radial-gradient(circle at 10% 0%, ${alpha(accent, 0.13)} 0%, transparent 55%), ${C.bg2}` }
  if (compact && !chartOpen) {
    return (
      <section aria-label={label} className="flat-stage" style={frame}>
        <div aria-hidden="true" style={{ height: 3, background: `linear-gradient(100deg, ${accent}, ${C.text} 45%, ${accent} 60%, ${alpha(accent, 0.33)})` }} />
        <div style={{ padding: '0 12px 8px' }}>
          <button type="button" aria-expanded="false" onClick={toggleChart} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: 44, padding: 0, background: 'none', border: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.2em', color: accent, fontFamily: numFont, whiteSpace: 'nowrap' }}>{kicker}</span>
            <span style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', color: C.text, transform: 'skewX(-8deg)', minWidth: 0, flex: 1, overflowWrap: 'anywhere', lineHeight: 1.15 }}>{typeof title === 'string' ? title : ''}</span>
            <span aria-hidden="true" style={{ font: `900 14px/1 ${numFont}`, color: accent }}>▾</span>
          </button>
          {sentence && <p style={{ margin: '0 0 6px', fontSize: 13, lineHeight: 1.35, color: C.text2 }}>{sentence}</p>}
          {tiles?.length > 0 && (
            <div style={{ display: 'flex', margin: '0 -2px' }}>
              {tiles.slice(0, 3).map((t) => (
                <div key={t.label} title={t.line || undefined} style={{ flex: '1 1 0', minWidth: 0, padding: '0 8px', borderLeft: `2px solid ${alpha(C.text, 0.12)}` }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: C.text3, fontFamily: numFont, whiteSpace: 'nowrap' }}>{t.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1, fontFamily: numFont, color: t.hot ? accent : C.text, transform: 'skewX(-8deg)', transformOrigin: 'left center' }}>{t.big}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    )
  }
  return (
    <section aria-label={label} className="flat-stage" style={{ marginBottom: 14, position: 'relative', overflow: 'hidden', border: `2px solid ${alpha(accent, 0.53)}`, borderRadius: 14, boxShadow: `0 0 26px ${alpha(accent, 0.12)}`, background: `radial-gradient(circle at 10% 0%, ${alpha(accent, 0.13)} 0%, transparent 55%), ${C.bg2}` }}>
      <style>{'@keyframes fsFoil{from{background-position:0 0}to{background-position:200% 0}} .flat-stage .fs-foil{background-size:200% 100%;animation:fsFoil 1.6s ease-out 1} @media (prefers-reduced-motion: reduce){.flat-stage .fs-foil{animation:none}} [data-stadium-full="1"] .fs-pic{height:100%;display:flex;align-items:center;justify-content:center} [data-stadium-full="1"] .fs-pic svg{height:100%!important;width:auto!important;max-width:100%!important;max-height:100%}'}</style>
      <div aria-hidden="true" className="fs-foil" style={{ height: 3, background: `linear-gradient(100deg, ${accent}, ${C.text} 45%, ${accent} 60%, ${alpha(accent, 0.33)})` }} />
      {mark && <div aria-hidden="true" style={{ position: 'absolute', right: -18, top: 34, opacity: 0.1, pointerEvents: 'none' }}>{mark}</div>}
      <div style={{ position: 'relative', padding: '10px 12px 12px' }}>
        {!bare && (
          <div role={compact ? 'button' : undefined} tabIndex={compact ? 0 : undefined} aria-expanded={compact ? true : undefined} onClick={compact ? toggleChart : undefined} onKeyDown={compact ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleChart() } } : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, ...(compact ? { minHeight: 44, cursor: 'pointer' } : null) }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.28em', color: accent, fontFamily: numFont, whiteSpace: 'nowrap' }}>{kicker}</span>
            <span aria-hidden="true" style={{ flex: 1, height: 1, background: alpha(accent, 0.33) }} />
            {right && <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.12em', color: C.text2, fontFamily: numFont }}>{right}</span>}
            {compact && <span aria-hidden="true" style={{ font: `900 14px/1 ${numFont}`, color: accent, transform: 'rotate(180deg)' }}>▾</span>}
          </div>
        )}
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 2px', flexWrap: 'wrap' }}>
            {lead}
            <span style={{ fontSize: 22, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-.01em', color: C.text, transform: 'skewX(-8deg)', overflowWrap: 'anywhere', minWidth: 0 }}>{title}</span>
          </div>
        )}
        {sentence && <p style={{ margin: '2px 0 8px', fontSize: 14, lineHeight: 1.4, color: C.text2 }}>{sentence}</p>}
        {!foldTiles && tileRow}
        <div className="fs-pic">
          {fullscreen
            ? <StadiumShell theme={C} accent={accent} fullLabel={fullLabel}>{pic}</StadiumShell>
            : pic}
        </div>
        {legend && <div style={{ margin: '6px 0 6px', fontSize: 12, lineHeight: 1.5, color: C.text3 }}>{legend}</div>}
        {controls && <div style={{ display: 'grid', gap: 6 }}>{controls}</div>}
        {more && (
          <div style={{ marginTop: 2 }}>
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: 0, background: 'none', border: 0, cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
              <span style={{ font: `800 12px/1.2 ${numFont}`, letterSpacing: '.18em', color: accent, whiteSpace: 'nowrap' }}>{(more.label || 'MORE NUMBERS').toUpperCase()}</span>
              {more.summary && <span style={{ font: `800 12px/1.2 ${numFont}`, color: C.text2, whiteSpace: 'nowrap' }}>· {more.summary}</span>}
              <span aria-hidden="true" style={{ flex: 1, height: 1, background: alpha(accent, 0.33) }} />
              <span aria-hidden="true" style={{ font: `900 14px/1 ${numFont}`, color: accent, transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
            </button>
            {open && <div style={{ marginTop: 6 }}>{more.children}</div>}
          </div>
        )}
        {foot}
      </div>
    </section>
  )
}
