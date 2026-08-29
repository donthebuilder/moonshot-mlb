'use client'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, score as fmtScore } from '../lib/scales'

// ══ THE DIAL AND THE HERO ═══════════════════════════════════════════════════
//
// The Props page's card head, extracted so the player and pitcher modals can
// open the same way. Donovan, 2026-08-23: "i .ike how the props pages looks.
// please up grade both pitcher and player moadlas like this too its looks
// good." Scope, asked and answered the same day: THE HERO ONLY — the top of
// each modal becomes this block, and every panel below it is left alone. A
// look change is not worth putting the arsenal, the zone map or the splits at
// risk.
//
// The dial is the whole idea. A model score drawn as a ring that fills to its
// own value: two nested circles and a conic-gradient. No canvas, no SVG, no
// library, and it re-reads the live palette on every render like everything
// else on this site, so it survives a theme swap without a special case.

/**
 * Dial — a score as a ring.
 *
 * `max` exists because not every number on this site is a 0-100 board score.
 * The batter models are; `pitcher_attack_score` is not — MatchupPitcher.js has
 * measured it at 0–53.9 with a median of 19.5, so a ring filling to 13/100
 * would draw an arm that leaks as an arm that does nothing. The PRINTED number
 * is always the real one; `max` only sets what a full ring means, and the
 * caller is expected to say so in a title.
 */
export function Dial({ value, col, size = 64, max = 100, title, dp = 0, pct: pctOverride }) {
  const v = value == null ? null : Number(value)
  // `pct` overrides the ring when the number has no absolute scale of its own.
  // A Game Score is defined RELATIVE to tonight's slate — "GS vs the median" —
  // so there is no 0-100 to draw it against and the strip already computes its
  // own normalised heat. The printed number is still the real one.
  const pct = pctOverride != null ? Math.max(0, Math.min(100, Number(pctOverride)))
    : v == null ? null : Math.max(0, Math.min(100, (v / max) * 100))
  const inner = Math.round(size * 0.81)
  return (
    <div title={title} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'grid', placeItems: 'center',
      background: pct == null
        ? alpha(C.text3, 0.14)
        : `conic-gradient(from 180deg, ${col} ${pct}%, ${alpha(col, 0.13)} ${pct}%)`,
      boxShadow: pct == null ? 'none' : `0 0 14px ${alpha(col, 0.22)}`,
      cursor: title ? 'inherit' : 'default',
    }}>
      <div style={{
        width: inner, height: inner, borderRadius: '50%', background: C.bg,
        display: 'grid', placeItems: 'center', border: `1px solid ${alpha(col, 0.18)}`,
      }}>
        <span style={{
          fontSize: Math.round(size * 0.3), fontWeight: 900, fontFamily: NUM_FONT,
          color: col, lineHeight: 1,
        }}>{v == null ? '—' : fmtScore(v, dp)}</span>
      </div>
    </div>
  )
}

/** The badge capsule — the site's role codes, drawn once. */
export function VerdictBadge({ label, col, quiet }) {
  return (
    <span style={{
      flexShrink: 0, fontSize: 8.5, fontWeight: 900, letterSpacing: '.07em',
      padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      color: quiet ? C.text3 : col,
      border: `1px solid ${quiet ? C.border2 : alpha(col, 0.55)}`,
      background: quiet ? 'transparent' : alpha(col, 0.12),
    }}>{label}</span>
  )
}

/**
 * VerdictHero — dial, who, badge, and one sentence.
 *
 * `right` is the caller's own controls (close, compare, navigate, watch) and
 * sits opposite the badge, because on a phone the ✕ has to stay where the
 * thumb already expects it.
 */
export default function VerdictHero({
  col, score, max, dialTitle, dp,
  title, badge, badgeQuiet, meta, metaRight, market, line, right,
  chips, footer, style,
}) {
  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      border: `1px solid ${alpha(col, 0.26)}`, borderRadius: 18, padding: '14px 14px 13px',
      background: `linear-gradient(158deg, ${alpha(col, 0.13)}, ${C.bg2} 54%)`,
      display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0, ...style,
    }}>
      {/* the light bar — the one piece of chrome, and the thing that makes a
          stack of these read as separate decisions from across a room */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${col}, ${alpha(col, 0)} 72%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        <Dial value={score} col={col} max={max} title={dialTitle} dp={dp} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{
              fontSize: 16.5, fontWeight: 900, letterSpacing: '-.01em', minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{title}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {badge && <VerdictBadge label={badge} col={col} quiet={badgeQuiet} />}
              {right}
            </span>
          </div>
          {meta && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 10, color: C.text3, fontFamily: NUM_FONT,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{meta}</span>
              {/* SUBTLE, as asked: "odds are cool make subtle". The book's own
                  number, dimmed, at the end of the line the matchup is already
                  on — present when you look for it, silent when you don't. */}
              {metaRight && (
                <span style={{
                  flexShrink: 0, fontSize: 10, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3,
                }}>{metaRight}</span>
              )}
            </div>
          )}
          {market && (
            <div style={{
              fontSize: 8.5, fontWeight: 900, letterSpacing: '.11em',
              textTransform: 'uppercase', color: col,
            }}>{market}</div>
          )}
        </div>
      </div>

      {line && (
        <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.55, minWidth: 0 }}>{line}</div>
      )}

      {chips && chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <span key={c.t} style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: '.03em', padding: '3px 8px',
              borderRadius: 999, whiteSpace: 'nowrap',
              color: c.warn ? C.text : C.text2,
              border: `1px solid ${c.warn ? C.border2 : alpha(col, 0.3)}`,
              background: c.warn ? C.glass : alpha(col, 0.07),
            }}>{c.t}</span>
          ))}
        </div>
      )}

      {/* The period tiles belong INSIDE the card. Rendered as a sibling they
          float under its border looking detached from the verdict they back —
          caught in the render, fixed here so every caller gets it right. */}
      {footer}
    </div>
  )
}

/** The three period tiles, doubling as the streak display. */
export function PeriodTiles({ tiles }) {
  return (
    <div style={{ display: 'flex', gap: 7 }}>
      {tiles.map((t) => (
        <span key={t.k} style={{
          flex: 1, textAlign: 'center', padding: '7px 3px', borderRadius: 12,
          border: `1px solid ${C.border}`, background: C.glass, minWidth: 0,
        }}>
          <span style={{
            display: 'block', fontSize: 8, fontWeight: 800, letterSpacing: '.1em',
            color: C.text3, fontFamily: NUM_FONT,
          }}>{t.k}</span>
          <span style={{
            display: 'block', fontSize: 13, fontWeight: 800, fontFamily: NUM_FONT,
            color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{t.v}</span>
        </span>
      ))}
    </div>
  )
}
