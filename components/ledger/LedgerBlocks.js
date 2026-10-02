'use client'
import { useState } from 'react'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha } from '../../lib/scales'

// THE LEDGER'S BLOCKS, ONCE (2026-09-28, parity plan 00Q step 3). MOONSHOT's
// Homer ledger (components/HomerLedger.js) lifted out block by block, style
// for style, so TUDDY's and LAMP's ledgers are the same box instead of a
// stack of list panels (Donovan: "the ledgers for each aren't in depth like
// MLB, nor do they look like it"). MOONSHOT renders through these with its
// own words; defaults are MOONSHOT's colours.
//
//   LedgerFrame   the box and its header row
//   RoundLine     "🎯 Round number tonight: Randal Grichuk 15th · Leo Bernal 5th"
//   WatchStrip    "🔮 Tonight's watchlist: 3/41 landed …" (the violet strip)
//   AlignBox      "🧲 Aligning with tonight" -- chips with their tags
//   LookOutBox    "👀 The look-out" -- labelled rows of chips
//   NextUpBox     "🔮 Fits tonight's pattern, hasn't gone yet"
//   ScorerChips   every scorer tonight, numbered
//   SpotBars      "Homers by lineup spot" -- a small bar per bucket
// "+N more" -- the phone rule's long-list preview (TUDDY / LAMP pass `preview`;
// MOONSHOT passes none and shows everything, as it always has).
function More({ n, open, setOpen, accent }) {
  if (n <= 0) return null
  return (
    <button type="button" onClick={() => setOpen((v) => !v)} style={{
      alignSelf: 'center', minHeight: 32, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
      border: `1px dashed ${C.border2}`, background: 'transparent', color: accent, fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800,
    }}>{open ? 'Show less' : `Show ${n} more`}</button>
  )
}

export const ord = (k) => { const s = ['th', 'st', 'nd', 'rd']; const v = k % 100; return `${k}${s[(v - 20) % 10] || s[v] || s[0]}` }

export function LedgerFrame({ header, accent = C.orange, children }) {
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, ${alpha(accent, 0.04)})`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      {header}
      {children}
    </div>
  )
}

/** The plain header TUDDY and LAMP use: "🧾 Touchdown ledger  12 this week  note". */
export function LedgerHead({ title, count, countWord, note, accent = C.orange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</span>
      <span style={{ fontSize: 10, color: accent, fontFamily: NUM_FONT, fontWeight: 800 }}>{count} {countWord}</span>
      {note && <span style={{ fontSize: 9, color: C.text3 }}>{note}</span>}
    </div>
  )
}

/** items: [{ key, name, num (ordinal text), onClick }] */
export function RoundLine({ label, items = [], accent = C.orange }) {
  if (!items.length) return null
  return (
    <div style={{ fontSize: 10.5, color: C.text2, marginBottom: 8, lineHeight: 1.6 }}>
      🎯 <b style={{ color: accent }}>{label}</b>{' '}
      {items.map((c, i) => (
        <span key={c.key}>
          {i > 0 ? ' · ' : ''}
          <b onClick={c.onClick || undefined} style={{ color: C.text, cursor: c.onClick ? 'pointer' : 'default' }}>
            {c.name}
          </b>{' '}<span style={{ fontFamily: NUM_FONT }}>{c.num}</span>
        </span>
      ))}
    </div>
  )
}

/** The violet strip: hits/watched + a sentence + the entries that landed. */
export function WatchStrip({ label, hits, watched, sentence, children, color = C.violet }) {
  if (!watched) return null
  return (
    <div style={{
      background: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.25)}`,
      borderRadius: 10, padding: '7px 11px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
        🔮 <b style={{ color }}>{label}</b>{' '}
        <b style={{ color: hits ? C.text : C.text3, fontFamily: NUM_FONT }}>{hits}</b>
        <span style={{ color: C.text3, fontFamily: NUM_FONT }}>/{watched}</span>{' '}
        <span style={{ color: C.text3 }}>{sentence}</span>
        {children}
      </div>
    </div>
  )
}

/** chips: [{ key, name, tags: [{ k, label, why }], onClick }] */
export function AlignBox({ title, sub, chips = [], foot, accent = C.orange, preview = null }) {
  const [open, setOpen] = useState(false)
  if (!chips.length) return null
  const shownChips = preview && !open ? chips.slice(0, preview) : chips
  return (
    <div style={{
      background: alpha(accent, 0.07), border: `1px solid ${alpha(accent, 0.32)}`,
      borderRadius: 10, padding: '8px 11px', marginBottom: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: accent }}>{title}</span>
        <span style={{ fontSize: 9, color: C.text3 }}>{sub}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {shownChips.map((c) => (
          <button key={c.key} onClick={c.onClick || undefined}
            title={c.tags.map((t) => t.why).filter(Boolean).join(' ')}
            style={{
              // maxWidth + wrap: a chip with many tags wraps inside itself
              // instead of running off a phone (a chip that fits is unchanged).
              display: 'flex', flexWrap: 'wrap', maxWidth: '100%', gap: 6, alignItems: 'baseline', cursor: c.onClick ? 'pointer' : 'default',
              border: `1px solid ${alpha(accent, 0.45)}`, background: alpha(accent, 0.10),
              borderRadius: 8, padding: '4px 10px',
            }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
            {c.tags.map((t) => (
              <span key={t.k} style={{
                fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, color: accent,
                border: `1px solid ${alpha(accent, 0.4)}`, borderRadius: 999, padding: '0 6px',
              }}>{t.label}</span>
            ))}
          </button>
        ))}
        {preview ? <More n={chips.length - preview} open={open} setOpen={setOpen} accent={accent} /> : null}
      </div>
      {foot && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>{foot}</div>}
    </div>
  )
}

/** rows: [{ key, label, hint, hintTitle, chips: [{ key, name, small, em, hot, title, onClick }] }] */
export function LookOutBox({ title, tag, rows = [], foot, accent = C.orange }) {
  const shown = rows.filter((r) => r.chips?.length)
  if (!shown.length) return null
  return (
    <div className="lookout" style={{
      background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '9px 11px', marginBottom: 9,
    }}>
      <div className="lookout-head">
        <span>{title}</span>
        <em>{tag}</em>
      </div>

      {shown.map((r) => (
        <div key={r.key} className="lookout-row">
          <span className="lookout-label">
            {r.label}
            <i title={r.hintTitle}>{r.hint}</i>
          </span>
          <div className="lookout-chips">
            {r.chips.map((a) => (
              <span key={a.key} className={a.hot ? 'chip chip-hot' : 'chip'} title={a.title}>
                <Tap onClick={a.onClick || null}>
                  <b>{a.name}</b>
                  {a.small && <small>{a.small}</small>}
                </Tap>
                <em>{a.em}</em>
              </span>
            ))}
          </div>
        </div>
      ))}

      {foot && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6 }}>{foot}</div>}

      <style jsx>{`
        .lookout-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
        .lookout-head span{font-size:9px;font-weight:800;letter-spacing:.07em;color:${C.text3};text-transform:uppercase}
        .lookout-head em{color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;font-style:normal;white-space:nowrap}
        .lookout-row{margin-top:7px}
        .lookout-label{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-bottom:5px;font-size:10.5px;font-weight:800;color:${C.text}}
        .lookout-label i{color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;font-style:normal;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px dotted ${C.border2}}
        .lookout-chips{display:flex;flex-wrap:wrap;gap:5px}
        .lookout-chips :global(.chip){display:inline-flex;align-items:baseline;gap:5px;padding:4px 8px;border:1px solid ${C.border};border-radius:999px;background:${C.bg}}
        .lookout-chips :global(.chip-hot){border-color:${alpha(accent, 0.45)};background:${alpha(accent, 0.08)}}
        .lookout-chips :global(.chip b){font-size:10.5px;font-weight:800;color:${C.text}}
        .lookout-chips :global(.chip-hot b){color:${accent}}
        .lookout-chips :global(.chip small){color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;letter-spacing:.04em}
        .lookout-chips :global(.chip em){color:${C.text2};font-family:${NUM_FONT};font-size:9px;font-weight:900;font-style:normal}
        .lookout-chips :global(.chip-hot em){color:${accent}}
      `}</style>
    </div>
  )
}

/** rows: [{ key, when ('now' | 'later'), name, onClick, title, chips: [string], more }] */
export function NextUpBox({ title, rows = [], about, color = C.cyan }) {
  if (!rows.length) return null
  return (
    <div style={{
      background: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.28)}`,
      borderRadius: 10, padding: '7px 11px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color, marginBottom: 5 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((x) => (
          <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, flexShrink: 0 }}
              title={x.when === 'now' ? 'his game is live' : 'still to come'}>
              {x.when === 'now' ? '⚡' : '⏳'}
            </span>
            <b
              onClick={x.onClick || undefined}
              title={x.title}
              style={{ fontSize: 11, color: C.text, cursor: x.onClick ? 'pointer' : 'default', flexShrink: 0 }}
            >{x.name}</b>
            {x.chips.slice(0, 4).map((c) => (
              <span key={c} style={{
                fontSize: 8.5, fontFamily: NUM_FONT, padding: '1px 5px', whiteSpace: 'nowrap',
                borderRadius: 5, border: `1px solid ${color}44`, color,
              }}>{c}</span>
            ))}
            {x.chips.length > 4 && (
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}
                title={x.title}>+{x.chips.length - 4}</span>
            )}
          </div>
        ))}
      </div>
      {about && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 9, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT }}>
            what this is
          </summary>
          <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginTop: 4 }}>{about}</div>
        </details>
      )}
    </div>
  )
}

/** cards: [{ key, icon, name, times, num, numHot, spot, badges: [{ k, label, color, title }], milestone, title, onClick }] */
export function ScorerChips({ cards = [], accent = C.orange, preview = null }) {
  const [open, setOpen] = useState(false)
  if (!cards.length) return null
  const shown = preview && !open ? cards.slice(0, preview) : cards
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      {shown.map((c) => (
        <button key={c.key} onClick={c.onClick || undefined}
          title={c.title}
          style={{
            display: 'flex', gap: 6, alignItems: 'baseline', cursor: c.onClick ? 'pointer' : 'default',
            border: `1px solid ${c.milestone ? alpha(accent, 0.6) : C.border}`,
            background: c.milestone ? alpha(accent, 0.10) : C.bg2,
            borderRadius: 8, padding: '4px 10px',
          }}>
          <span style={{ fontSize: 10 }}>{c.icon}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
          {c.times > 1 && <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: accent, fontWeight: 900 }}>×{c.times}</span>}
          <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: c.numHot ? accent : C.text3, fontWeight: c.numHot ? 900 : 600 }}>
            {c.num}
          </span>
          {c.spot && <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>{c.spot}</span>}
          {(c.badges || []).map((b) => (
            <span key={b.k} title={b.title}
              style={{
                fontSize: 8, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.04em',
                color: b.color || accent, border: `1px solid ${b.color || accent}55`, borderRadius: 4, padding: '1px 4px',
              }}>{b.label}</span>
          ))}
        </button>
      ))}
      {preview ? <More n={cards.length - preview} open={open} setOpen={setOpen} accent={accent} /> : null}
    </div>
  )
}

/** bars: [{ key, label, value, title }]; the tallest is lit. */
export function SpotBars({ title, bars = [], foot, accent = C.orange }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  if (!bars.some((b) => b.value)) return null
  return (
    <>
      <div style={{ fontSize: 9.5, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46 }}>
        {bars.map((b) => (
          <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={b.title}>
            <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: b.value ? C.text2 : C.text3, fontWeight: 800 }}>{b.value || ''}</span>
            <div style={{
              width: '100%', height: `${Math.max(3, (26 * b.value) / max)}px`, borderRadius: 3,
              background: b.value === max && b.value > 0 ? accent : b.value ? alpha(accent, 0.45) : 'rgba(255,255,255,.06)',
            }} />
            <span style={{ fontSize: 8, fontFamily: NUM_FONT, color: C.text3 }}>{b.label}</span>
          </div>
        ))}
      </div>
      {foot && <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>{foot}</div>}
    </>
  )
}
