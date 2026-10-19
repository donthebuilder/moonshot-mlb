'use client'
import { useState } from 'react'
import Tap from '../Tap'
import { TeamTap } from '../EntityTap'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import TeamMark from '../TeamMark'
import { useSportTheme } from '../SportTheme'
import { ordinal } from '../../lib/format'

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
function More({ n, open, setOpen, accent, total = null }) {
  if (n <= 0) return null   // the site's one show-more rule (10-18): the whole count, "All 42", never "Show 30 more"
  return (
    <button type="button" className="tap-box" onClick={() => setOpen((v) => !v)} style={{
      alignSelf: 'center', minHeight: 32, padding: '4px 10px', borderRadius: 8, cursor: 'pointer',
      border: `1px dashed ${C.border2}`, background: 'transparent', color: accent, fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800,
    }}>{open ? 'Fewer' : total ? `All ${total}` : `+${n} more`}</button>
  )
}

export const ord = ordinal

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
      <span style={{ fontSize: 11, color: accent, fontFamily: NUM_FONT, fontWeight: 800 }}>{count} {countWord}</span>
      {note && <span style={{ fontSize: 11, color: C.text3 }}>{note}</span>}
    </div>
  )
}

/** items: [{ key, name, num (ordinal text), onClick }] */
export function RoundLine({ label, items = [], accent = C.orange }) {
  if (!items.length) return null
  return (
    <div style={{ fontSize: 11, color: C.text2, marginBottom: 8, lineHeight: 1.6 }}>
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

/** The watchlist strip, in the product's accent: hits/watched + a sentence + the entries that landed. */
export function WatchStrip({ label, hits, watched, sentence, children, color = C.orange }) {
  if (!watched) return null
  return (
    <div style={{
      background: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.25)}`,
      borderRadius: 10, padding: '7px 11px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.65 }}>
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
  const themed = !!useSportTheme()?.themed   // 44px chips on a touch screen in TUDDY / LAMP / BUCKETS (.fp-themed); MOONSHOT unchanged
  if (!chips.length) return null
  const shownChips = preview && !open ? chips.slice(0, preview) : chips
  return (
    <div style={{
      background: alpha(accent, 0.07), border: `1px solid ${alpha(accent, 0.32)}`,
      borderRadius: 10, padding: '8px 11px', marginBottom: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: accent }}>{title}</span>
        <span style={{ fontSize: 11, color: C.text3 }}>{sub}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {shownChips.map((c) => (
          <button key={c.key} onClick={c.onClick || undefined} className={themed ? 'fp-themed' : undefined}
            title={c.tags.map((t) => t.why).filter(Boolean).join(' ')}
            style={{
              alignContent: 'center',
              // maxWidth + wrap: a chip with many tags wraps inside itself
              // instead of running off a phone (a chip that fits is unchanged).
              display: 'flex', flexWrap: 'wrap', maxWidth: '100%', gap: 6, alignItems: 'baseline', cursor: c.onClick ? 'pointer' : 'default',
              border: `1px solid ${alpha(accent, 0.45)}`, background: alpha(accent, 0.10),
              borderRadius: 8, padding: '4px 10px',
            }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
            {c.tags.map((t) => (
              <span key={t.k} style={{
                fontSize: 11, fontWeight: 800, fontFamily: NUM_FONT, color: accent,
                border: `1px solid ${alpha(accent, 0.4)}`, borderRadius: 999, padding: '0 6px',
              }}>{t.label}</span>
            ))}
          </button>
        ))}
        {preview ? <More n={chips.length - preview} total={chips.length} open={open} setOpen={setOpen} accent={accent} /> : null}
      </div>
      {foot && <div style={{ fontSize: 11, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>{foot}</div>}
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
                <span><Tap onClick={a.onClick || null}>
                  <b>{a.nameTeam ? <TeamMark sport={a.nameTeam} abbr={a.name} variant="logo" px={16} style={{ verticalAlign: '-3px' }} /> : a.name}</b>
                  {a.small && !a.smallTeam && <small>{a.small}</small>}
                </Tap>
                {/* the club code in the chip is its own link to the club (nav audit 10-08), not part of the player's tap */}
                {a.small && a.smallTeam && <small><TeamTap abbr={a.smallTeam} style={{ minWidth: 0 }}>{a.smallTeam}</TeamTap>{String(a.small).startsWith(a.smallTeam) ? String(a.small).slice(a.smallTeam.length) : ''}</small>}</span>
                <em>{a.em}</em>
              </span>
            ))}
          </div>
        </div>
      ))}

      {foot && <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>{foot}</div>}

      <style jsx>{`
        .lookout-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:7px}
        .lookout-head span{font-size:9px;font-weight:800;letter-spacing:.07em;color:${C.text3};text-transform:uppercase}
        .lookout-head em{color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;font-style:normal;white-space:nowrap}
        .lookout-row{margin-top:7px}
        .lookout-label{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;margin-bottom:5px;font-size:10.5px;font-weight:800;color:${C.text}}
        .lookout-label i{color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;font-style:normal;letter-spacing:.06em;text-transform:uppercase;border-bottom:1px dotted ${C.border2}}
        .lookout-chips{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
        /* AN EVEN GRID (Donovan 10-18: "it's all not even ... not structured properly"): every chip one cell, name left, number right */
        .lookout-chips :global(.chip){display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:40px;padding:4px 10px;border:1px solid ${C.border};border-radius:10px;background:${C.bg};min-width:0}
        .lookout-chips :global(.chip > span){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .lookout-chips :global(.chip-hot){border-color:${alpha(accent, 0.45)};background:${alpha(accent, 0.08)}}
        .lookout-chips :global(.chip b){font-size:10.5px;font-weight:800;color:${C.text}}
        .lookout-chips :global(.chip-hot b){color:${accent}}
        .lookout-chips :global(.chip small){color:${C.text3};font-family:${NUM_FONT};font-size:8px;font-weight:800;letter-spacing:.04em}
        .lookout-chips :global(.chip em){color:${C.text2};font-family:${NUM_FONT};font-size:9px;font-weight:900;font-style:normal}
        .lookout-chips :global(.chip-hot em){color:${accent}}
        /* THE PHONE FLOOR (2026-10-17 phone run): app/globals.css floors inline font-size only, never these classes, so the look-out sat at 8-9px
           on a phone (all three sports share it). 10px text, 11px numbers; wide screens untouched. */
        @media (max-width:560px){
          .lookout-head span,.lookout-head em,.lookout-label i,.lookout-chips :global(.chip small){font-size:10px}
          .lookout-label,.lookout-chips :global(.chip b),.lookout-chips :global(.chip em){font-size:11px}
        }
      `}</style>
    </div>
  )
}

/** rows: [{ key, when ('now' | 'later'), name, onClick, title, chips: [string], more }] */
/** rows: [{ key, when: 'now'|'later', name, chips: [string | { label, onClick }], title, onClick }] */
export function NextUpBox({ title, rows = [], about, color = C.orange }) {
  // a chip with `explain` (lib/numerology/lanePlayers alignChip: the numbers, then which lane gave which) opens its words on a tap
  const [opened, setOpened] = useState(null)
  if (!rows.length) return null
  return (
    <div style={{
      background: alpha(color, 0.06), border: `1px solid ${alpha(color, 0.28)}`,
      borderRadius: 10, padding: '7px 11px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color, marginBottom: 5 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {rows.map((x) => (
          <div key={x.key} style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, flexShrink: 0 }}
              title={x.when === 'now' ? 'his game is live' : 'still to come'}>
              {x.when === 'now' ? '⚡' : '⏳'}
            </span>
            <b
              onClick={x.onClick || undefined}
              title={x.title}
              style={{ fontSize: 11, color: C.text, cursor: x.onClick ? 'pointer' : 'default', flexShrink: 0 }}
            >{x.name}</b>
            {/* a chip is its text, or { label, onClick } when it names something that opens (BUCKETS' game, 10-05) */}
            {x.chips.slice(0, 4).map((c) => {
              const label = typeof c === 'string' ? c : c.label
              const exKey = typeof c !== 'string' && c.explain ? `${x.key}|${label}` : null
              const go = typeof c === 'string' ? null : c.onClick || (exKey ? () => setOpened((o) => (o === exKey ? null : exKey)) : null)
              return (
                <span key={label} onClick={go || undefined} role={go ? (exKey ? 'button' : 'link') : undefined} title={typeof c === 'string' ? undefined : c.title} aria-expanded={exKey ? opened === exKey : undefined} className={exKey ? 'tap-box' : undefined} style={{
                  fontSize: 11, fontFamily: NUM_FONT, padding: '1px 5px', whiteSpace: 'nowrap',
                  borderRadius: 5, border: `1px solid ${color}44`, color, ...(go ? { cursor: 'pointer' } : null),
                }}>{label}</span>
              )
            })}
            {x.chips.length > 4 && (
              <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}
                title={x.title}>+{x.chips.length - 4}</span>
            )}
            {x.chips.map((c) => (typeof c !== 'string' && c.explain && opened === `${x.key}|${c.label}`
              ? <span key={`ex-${c.label}`} style={{ flexBasis: '100%', fontSize: 12, lineHeight: 1.45, color: C.text2, padding: '2px 0 4px 18px' }}>{c.explain}.</span>
              : null))}
          </div>
        ))}
      </div>
      {about && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 11, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT }}>
            what this is
          </summary>
          <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, marginTop: 4 }}>{about}</div>
        </details>
      )}
    </div>
  )
}

/** cards: [{ key, icon, name, times, num, numHot, spot, badges: [{ k, label, color, title }], milestone, title, onClick }] */
// 2026-10-03 (Donovan: "the lamp ledger ... look old and outdated"): with
// `sport` and a card's `team`, the chip leads with his club's logo in place of
// the emoji; type up a step (name 12.5, figure 11) and 40px tall to tap.
export function ScorerChips({ cards = [], accent = C.orange, preview = null, sport = null }) {
  const [open, setOpen] = useState(false)
  const themed = !!useSportTheme()?.themed   // 44px on a touch screen in TUDDY / LAMP / BUCKETS (.fp-themed)
  if (!cards.length) return null
  const shown = preview && !open ? cards.slice(0, preview) : cards
  // AN EVEN GRID, TWO LINES A CARD (Donovan 10-18: "not symmetrical ... not built right" in portrait). Line one: his club, his
  // name, ×N. Line two: the count (only when it is a milestone, lit), his spot, then the badges (the numbers that aligned).
  // `c.num` shows only when `numHot` (a round number) unless the caller sets `numAlways`.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6, marginBottom: 10 }}>
      {shown.map((c) => (
        <button key={c.key} onClick={c.onClick || undefined} className={themed ? 'fp-themed' : undefined}
          title={c.title}
          style={{
            display: 'grid', gap: 3, alignContent: 'center', textAlign: 'left', minWidth: 0, cursor: c.onClick ? 'pointer' : 'default',
            border: `1px solid ${c.milestone ? alpha(accent, 0.6) : C.border}`,
            background: c.milestone ? alpha(accent, 0.10) : C.bg2,
            borderRadius: 10, padding: '6px 10px', minHeight: 48,
          }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {sport && c.team ? <TeamMark sport={sport} abbr={c.team} variant="logo" px={16} /> : <span style={{ fontSize: 12 }}>{c.icon}</span>}
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            {c.times > 1 && <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: accent, fontWeight: 900, flex: 'none' }}>×{c.times}</span>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flexWrap: 'wrap' }}>
            {(c.numHot || c.numAlways) && c.num && <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: c.numHot ? accent : C.text3, fontWeight: 900 }}>{c.num}</span>}
            {c.spot && <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: C.text3 }}>{c.spot}</span>}
            {(c.badges || []).map((b) => (
              <span key={b.k} title={b.title}
                style={{
                  fontSize: 11, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.02em', whiteSpace: 'nowrap',
                  color: b.color || accent, border: `1px solid ${b.color || accent}55`, borderRadius: 4, padding: '1px 4px',
                }}>{b.label}</span>
            ))}
          </span>
        </button>
      ))}
      {preview ? <More n={cards.length - preview} total={cards.length} open={open} setOpen={setOpen} accent={accent} /> : null}
    </div>
  )
}

/** bars: [{ key, label, value, title }]; the tallest is lit. */
export function SpotBars({ title, bars = [], foot, accent = C.orange }) {
  const max = Math.max(1, ...bars.map((b) => b.value))
  if (!bars.some((b) => b.value)) return null
  return (
    <>
      <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>
        {title}
      </div>
      {/* no fixed height (10-18): a 46px box held a 13px number + a 26px bar + a 13px label, so the number sat on the bar */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
        {bars.map((b) => (
          <div key={b.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={b.title}>
            {/* a zero says 0 (dimmed), never blank: a blank collapsed its row and the numbers slid
                one label left -- TUDDY's 'QB 20, RB 20, WR 8' was QB 0, RB 20, WR 20, TE 8 (10-04) */}
            <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: b.value ? C.text2 : C.text3, fontWeight: 800, opacity: b.value ? 1 : 0.6 }}>{b.value || 0}</span>
            <div style={{
              width: '100%', height: `${Math.max(3, (26 * b.value) / max)}px`, borderRadius: 3,
              background: b.value === max && b.value > 0 ? accent : b.value ? alpha(accent, 0.45) : 'rgba(255,255,255,.06)',
            }} />
            <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: C.text3 }}>{b.label}</span>
          </div>
        ))}
      </div>
      {foot && <div style={{ fontSize: 11, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>{foot}</div>}
    </>
  )
}
