'use client'
import { C, NUM_FONT } from '../../lib/theme'
import { alpha, verdictInk } from '../../lib/scales'
import { Dial } from '../VerdictHero'
import TeamMark from '../TeamMark'
import { ANGLE_TAG } from '../../lib/slate/angles'

// ONE GAME CARD, ANY SPORT (2026-09-28). MOONSHOT's game card
// (components/GameStrip.js, "the same style as the prop cards", 2026-08-23)
// lifted out style for style: the wash by heat, the light bar, the dial, the
// matchup, one meta line, the score once there is one, and up to three pick
// chips. GameStrip builds MOONSHOT's cards and renders them through this, so
// its strip is unchanged; TUDDY and LAMP pass their own card objects.
//
// card = {
//   id, title ('NYM @ WSH'), tooltip, past, heat (0-1, tonight's own range),
//   dial: { value, pct, title, dp },
//   band: { icon, word },              // 🌋 MAIN EVENT, 🔥, 🧊
//   lead: node,                        // the first meta mark (✓✓ lineups…)
//   status: { kind: 'live' | 'final' | 'time', text },
//   extra: node,                       // one more meta clause (the air…)
//   score: { away, home, awayScore, homeScore, live } | null,
//   chips: [{ key, tag, color, name, score, title, onClick, leg, style, locked }],   // locked (members gate): a CALLED headline the viewer may not read is not drawn at all
//   weak: 'Weak spot: ...',            // THE WEAK SPOT (one line of public analysis); with weak / angles the card draws BEST ANGLES instead of the chips
//   angles: [{ key, kind: 'matchup' | 'form', name, team, why, href, onClick }],   // lib/slate/angles.js pickAngles: chosen by matchup and form, never by call status
// }
// card.large (LAMP, 2026-10-06, Donovan: "you can't read that"): the meta line and
// the chips at 12px (the tag 11) and a 62px dial; absent, every size below is
// exactly what it was, so MOONSHOT's and TUDDY's strips are unchanged.
export default function SlateCard({ card: c, on = false, accent = C.orange, onSelect, target = null, sport = 'mlb' }) {
  const L = Boolean(c.large)
  // BEST ANGLES (2026-10-17): the angle rows are real links (a player is a link), and a link cannot live inside a <button>; so a card that carries them
  // is a role=button div with the same style. Every card without angles stays the button it was.
  const withAngles = c.weak !== undefined || c.angles !== undefined
  const Root = withAngles ? 'div' : 'button'
  const rootProps = withAngles
    ? { role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(c.id) } } }
    : {}
  const ink = verdictInk(c.heat >= 0.55 ? true : c.heat <= 0.25 ? false : null)
  const col = on ? accent : ink.color
  const wash = alpha(col, 0.05 + 0.11 * c.heat)
  return (
    <Root
      {...rootProps}
      onClick={() => onSelect(c.id)}
      title={c.tooltip}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'left',
        cursor: 'pointer', padding: '12px 13px 11px', minWidth: 0,
        borderRadius: 18,
        border: `1px solid ${alpha(col, on ? 0.6 : 0.24)}`,
        background: `linear-gradient(158deg, ${wash}, ${C.bg2} 56%)`,
        opacity: c.past && !on ? 0.5 : 1,
        display: 'flex', flexDirection: 'column', gap: 9,
      }}
    >
      {/* the light bar — the prop card's one piece of chrome */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${col}, ${alpha(col, 0)} 72%)`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <Dial value={c.dial.value} pct={c.dial.pct} col={c.dial.col || col} size={L ? 60 : 52} dp={c.dial.dp || 0} title={c.dial.title} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{
              fontFamily: NUM_FONT, fontSize: L ? 20 : 15.5, fontWeight: 900, letterSpacing: '-.02em',
              color: C.text, minWidth: 0, flex: '1 1 auto',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: c.past ? 'line-through' : 'none',
            }}>{c.title}</span>
            {c.band?.icon && <span style={{ fontSize: 11, flexShrink: 0 }}>{c.band.icon}</span>}
            {target}
          </div>

          {/* the meta line */}
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
            fontSize: L ? 12 : 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text3,
          }}>
            {c.lead}
            {c.status?.kind === 'live' ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 800 }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%', background: C.green,
                  animation: 'gsLivePulse 1.8s ease-in-out infinite', flexShrink: 0,
                }} />
                {c.status.text}
              </span>
            ) : c.status?.kind === 'final' ? (
              <span style={{ fontWeight: 800 }}>{c.status.text || 'FINAL'}</span>
            ) : (
              <span>{c.status?.text}</span>
            )}
            {c.extra}
            {c.band?.word && (
              <span style={{ fontSize: L ? 11 : 8.5, fontWeight: 900, color: accent, letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                {c.band.word}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* the live score, once there is one */}
      {c.score && (c.score.awayScore != null || c.score.homeScore != null) && (() => {
        const aS = c.score.awayScore ?? 0, hS = c.score.homeScore ?? 0
        return (
          <div style={{
            fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
            color: c.score.live ? C.green : C.text2,
            display: 'flex', gap: 6, alignItems: 'baseline',
          }}>
            {/* logos (Donovan 10-02); the trailing side dims, as its code did */}
            <TeamMark sport={sport} abbr={c.score.away} variant="logo" px={16} dim={aS < hS} />
            <span>{aS}–{hS}</span>
            <TeamMark sport={sport} abbr={c.score.home} variant="logo" px={16} dim={hS < aS} />
          </div>
        )
      })()}

      {/* THE WEAK SPOT, then BEST ANGLES: two rows chosen by matchup and by form (lib/slate/angles.js), no call stamp, no model number.
          SHORTER (Donovan 10-19, "too elongated"): the weak spot holds two lines, each angle tag + name on one line, the why in up to two (its number never cut;
          the whole of both on hover / long-press), no BEST ANGLES heading (the tags say it; the legend under the strip names it) */}
      {c.weak ? (
        <div title={c.weak} style={{ fontSize: 12, lineHeight: 1.35, color: C.text2, fontFamily: NUM_FONT, fontWeight: 600, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.weak}</div>
      ) : null}
      {c.angles?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {c.angles.map((a) => (
            <a key={`${a.kind}-${a.key}`} href={a.href} title={a.title || `${a.name}: ${a.why}`}
              onClick={(e) => { e.stopPropagation(); if (a.onClick) { e.preventDefault(); a.onClick(e) } }}
              style={{
                display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, minHeight: 44, boxSizing: 'border-box',
                padding: '4px 8px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.glass,
                color: C.text2, textDecoration: 'none', fontFamily: NUM_FONT,
              }}>
              {a.team ? <TeamMark sport={sport} abbr={a.team} variant="logo" px={20} /> : null}
              <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                  <b style={{ fontSize: 10.5, letterSpacing: '.08em', color: accent, flexShrink: 0 }}>{ANGLE_TAG[a.kind]}</b>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.text, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{a.leg ? '🔗 ' : ''}{a.name}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: C.text2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.why}</span>
              </span>
            </a>
          ))}
        </div>
      )}

      {/* THE EITHER/OR ROW, in the prop card's tile language */}
      {!withAngles && c.chips?.some((k) => !k.locked) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {c.chips.filter((k) => !k.locked).map((k) => (
            <span key={k.key}
              title={k.title}
              onClick={k.onClick}
              style={{
                display: 'flex', gap: 7, alignItems: L ? 'center' : 'baseline', minWidth: 0,
                fontSize: L ? 12 : 9.5, fontFamily: NUM_FONT, fontWeight: 600, color: C.text2,
                minHeight: L ? 32 : undefined,
                cursor: k.onClick ? 'pointer' : 'inherit',
                border: `1px solid ${k.leg ? k.color : C.border}`,
                background: k.leg ? alpha(k.color, 0.19) : C.glass,
                boxShadow: k.leg ? `0 0 10px ${alpha(k.color, 0.33)}` : 'none',
                borderRadius: 10, padding: L ? '6px 10px' : '4px 8px',
                ...(k.leg ? {} : (k.style || {})),
              }}>
              {k.leg && <span style={{ fontSize: 8 }}>🔗</span>}
              <b style={{ color: k.color, fontSize: L ? 11 : 8, letterSpacing: '.06em', flexShrink: 0 }}>{k.tag}</b>
              <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', minWidth: 0, flex: '1 1 auto' }}>{k.name}</span>
              <b style={{ color: k.leg ? k.color : C.text, flexShrink: 0 }}>{k.score}</b>
            </span>
          ))}
        </div>
      )}
    </Root>
  )
}
