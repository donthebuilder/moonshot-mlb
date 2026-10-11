'use client'
import { useState } from 'react'
import { alpha } from '../../lib/scales'
import { STATUS_WORD } from '../../lib/callStatus'
import { useSportTheme } from '../SportTheme'
import TeamMark from '../TeamMark'
import { ExplainStrip } from './CardParts'
import { RankMoveCell } from '../RankMove'

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

export default function RankCard({
  accent: accentProp = null, status = null, pos = '', rank = null, face = null, sport, club = null, name, opp = null, home = true, role = '',
  score = null, scoreWord = 'SCORE', explain = null, reason = null, chips = null, stats = [], statsNode = null, back = null, foot = null, onClick = null,
  dim = false, extraLine = null, rankTags = [], extraNotes = [], style = null, title = undefined, rankMove = null,
}) {
  const { C, NUM_FONT, accent: themeAccent } = useSportTheme()
  const accent = accentProp || themeAccent
  const called = status === 'called'
  const [flip, setFlip] = useState(false)
  const [info, setInfo] = useState(false)
  const n = String(name || '')
  const heat = (pct) => (pct == null ? { c: C.text, hot: false } : pct >= 80 ? { c: accent, hot: true } : pct <= 20 ? { c: C.text3, hot: false } : { c: C.text, hot: false })
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  const tag = (t) => (
    <span key={t} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: C.text, background: alpha(C.bg, 0.7), border: `1px solid ${alpha(C.text, 0.22)}`, borderLeft: `3px solid ${called ? accent : alpha(C.text, 0.4)}`, padding: '2px 7px', whiteSpace: 'nowrap' }}>{t}</span>
  )

  return (
    <div onClick={onClick || undefined} title={title} style={{
      position: 'relative', boxSizing: 'border-box', minWidth: 0, width: '100%', overflow: 'hidden', borderRadius: 14,
      border: `2px solid ${alpha(accent, called ? 0.6 : 0.35)}`, background: C.bg2, cursor: onClick ? 'pointer' : 'default', opacity: dim ? 0.55 : 1, ...style,
    }}>
      {/* the foil strip, CALLED only (lib/cards/cardKit.js foil) */}
      <div style={{ height: 5, background: called ? `linear-gradient(100deg, ${accent} 0%, ${alpha(C.text, 0.95)} 22%, ${accent} 44%, ${alpha(C.text, 0.7)} 66%, ${accent} 84%, ${alpha(C.text, 0.9)} 100%)` : 'transparent' }} />
      {flip ? (
        <Back C={C} NUM_FONT={NUM_FONT} accent={accent} name={n} pos={pos} back={back} onFlip={stop(() => setFlip(false))} />
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px 0' }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.28em', color: called ? accent : C.text2, whiteSpace: 'nowrap' }}>{status ? STATUS_WORD[status] : ''}</span>
            <span style={{ flex: 1, height: 1, background: alpha(accent, called ? 0.5 : 0.2) }} />
            <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: C.text2 }}>{pos}</span>
          </div>
          {/* the portrait over the faded club mark, the rank tag and the score box */}
          <div style={{ position: 'relative', minHeight: 104, margin: '6px 0 0', borderTop: `1px solid ${alpha(accent, 0.2)}`, borderBottom: `1px solid ${alpha(accent, 0.45)}`, background: `radial-gradient(circle at 50% 42%, ${alpha(accent, 0.32)} 0%, ${alpha(accent, 0.06)} 64%, ${alpha(C.bg, 0.3)} 100%)`, overflow: 'hidden' }}>
            {club && sport && <div style={{ position: 'absolute', right: -24, top: 4, opacity: 0.16, pointerEvents: 'none' }}><TeamMark sport={sport} abbr={club} variant="logo" px={120} /></div>}
            <div style={{ position: 'absolute', left: 12, top: 8, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              {rank != null && tag(`#${rank}`)}
              {/* places moved since the last update (components/RankMove.js): one mount for every sport's card; information only */}
              {rankMove?.move && <span style={{ background: alpha(C.bg, 0.7), border: `1px solid ${alpha(C.text, 0.22)}`, padding: '1px 6px', lineHeight: 1 }}><RankMoveCell cell={rankMove} up={accent} down={C.text3} size={10} /></span>}
              {rankTags.slice(0, 1).map(tag)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>{face}</div>
            {score != null && (
              <div onClick={stop(() => setInfo((v) => !v))} style={{ position: 'absolute', right: 10, top: 8, textAlign: 'center', padding: '4px 12px 3px', background: alpha(C.bg, 0.72), border: `1px solid ${alpha(accent, called ? 0.6 : 0.3)}`, cursor: 'pointer', minWidth: 44 }}>
                <div style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 800, letterSpacing: '.16em', color: C.text2 }}>{scoreWord}</div>
                <div style={{ fontFamily: NUM_FONT, fontSize: 34, fontWeight: 900, lineHeight: 1, color: accent, transform: 'skewX(-8deg)' }}>{score}</div>
              </div>
            )}
          </div>
          <div style={{ padding: '8px 12px 0' }}>
            <ExplainStrip notes={[info && explain, ...extraNotes]} />
            {/* the name: slanted capitals, wrapping before it would lose a letter (no ellipsis) */}
            <div title={n} style={{ fontWeight: 900, fontStyle: 'italic', textTransform: 'uppercase', lineHeight: 1.04, letterSpacing: '-.01em', overflowWrap: 'anywhere', fontSize: n.length > 22 ? 20 : n.length > 16 ? 23 : 26, color: C.text }}>{n}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4, fontFamily: NUM_FONT }}>
              {club && sport && <TeamMark sport={sport} abbr={club} variant="logo" px={22} />}
              {opp && <span style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{home === false ? '@' : 'vs'} {opp}</span>}
              {role && <span style={{ fontSize: 12, fontWeight: 600, color: C.text3 }}>{role}</span>}
              {extraLine}
            </div>
            {reason && <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.4, marginTop: 6 }}>{reason}</div>}
            {chips && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>{chips}</div>}
          </div>
          {(statsNode || stats.length > 0) && (
            <div style={{ padding: '8px 12px 0' }}>
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
          )}
          <div className="rc-foot" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', padding: '4px 12px 8px' }}>
            <style>{'.rc-foot button{min-height:44px;min-width:44px}'}</style>
            {back && (
              <button type="button" onClick={stop(() => setFlip(true))} aria-label="Flip the card: the stat table" style={{ background: 'transparent', border: `1px solid ${alpha(accent, 0.4)}`, borderRadius: 8, color: accent, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em', padding: '0 12px', cursor: 'pointer' }}>⟲ Flip: stat table</button>
            )}
            {foot}
          </div>
        </>
      )}
    </div>
  )
}

// THE BACK (lib/cards/playerBack.js): cream stock, the stat table, printed in the chassis black; the accent only as tints and marks.
function Back({ C, NUM_FONT, accent, name, pos, back, onFlip }) {
  const rows = back?.rows || []
  return (
    <div style={{ background: C.text, color: C.bg, padding: '10px 12px 6px', borderTop: `4px solid ${accent}` }}>
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
      {back?.node && <div style={{ color: C.bg, margin: '8px 0' }}>{back.node}</div>}
      {back?.note && <div style={{ fontSize: 11, marginTop: 6, opacity: 0.75, lineHeight: 1.4 }}>{back.note}</div>}
      <button type="button" onClick={onFlip} style={{ marginTop: 6, minHeight: 44, minWidth: 44, padding: '0 14px', background: 'transparent', border: `2px solid ${C.bg}`, borderRadius: 8, color: C.bg, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>⟲ Flip back</button>
    </div>
  )
}
