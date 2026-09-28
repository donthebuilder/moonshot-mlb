'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'

// THE WATCH BOX, ONCE (2026-09-28, MLB-PARITY-BOARDS plan "ADDED 09-28" + D;
// CLAUDE.md: MOONSHOT's components are the base). MOONSHOT's B2B WATCH --
// lifted out of components/tabs/HitsHRR.js style for style -- so TUDDY's TD
// WATCH and LAMP's GOAL WATCH are the same box, not look-alikes:
//   one bordered box in the product colour: icon + NAME + a status count,
//   the claim line at the right ("no hit-rate claim" unless one is earned),
//   one labelled row per reason (with its archive line only when the graded
//   history supports one), rectangular cards (club tile, name, score line)
//   that turn green with "✓ … AGAIN" when the pick hits, and one plain
//   sentence at the bottom saying what the archive does and doesn't show.
// This file computes nothing: rows, rates and hit states arrive from the
// caller, which names the field it read.
//
// rows: [{ key, label, rate?: string, accent?, items: [{ key, tile, name, line,
//          hit?: boolean, hitText?, onClick? }] }]
export default function WatchBox({ icon, title, status, note, rows = [], footer = null, accent = null, theme = null, numFont = null, ariaLabel = null }) {
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  const ac = accent || C.orange
  const live = rows.filter((r) => r.items?.length)
  return (
    <section aria-label={ariaLabel || undefined} style={{
      margin: '-2px 0 11px', padding: '9px 11px', border: `1px solid ${ac}4d`,
      borderRadius: 11, background: `linear-gradient(105deg,${ac}16,${C.bg2} 48%,${C.bg})`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ color: ac, fontFamily: NUM_FONT, fontSize: TYPE.name }}>{icon ? `${icon} ` : ''}{title}</b>
        {status ? <span style={{ color: C.text3, fontSize: TYPE.micro }}>{status}</span> : null}
        {note ? <span style={{ marginLeft: 'auto', color: C.text3, fontSize: TYPE.micro }}>{note}</span> : null}
      </div>
      {live.map((r) => (
        <div key={r.key} style={{ marginTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: TYPE.label, color: r.accent || ac, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '.06em' }}>{r.label}</span>
            {r.rate ? <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{r.rate}</span> : null}
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 1 }}>
            {r.items.map((it) => (
              <button key={it.key} onClick={it.onClick} style={{
                flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8,
                minWidth: 165, padding: '7px 9px', borderRadius: 9, cursor: 'pointer',
                border: `1px solid ${it.hit ? C.green : C.border2}`,
                background: it.hit ? `${C.green}12` : C.bg2, color: C.text, textAlign: 'left',
              }}>
                <span style={{
                  display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 8,
                  background: `${it.hit ? C.green : ac}18`, color: it.hit ? C.green : ac,
                  fontFamily: NUM_FONT, fontSize: TYPE.micro, fontWeight: 900,
                }}>{it.tile}</span>
                <span><b style={{ display: 'block', fontSize: TYPE.name }}>{it.name}</b><small style={{ display: 'block', marginTop: 3, color: it.hit ? C.green : C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}>{it.hit ? it.hitText : it.line}</small></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {footer && live.length > 0 && (
        <div style={{ marginTop: 7, fontSize: TYPE.label, color: C.text3, lineHeight: 1.5 }}>{footer}</div>
      )}
    </section>
  )
}
