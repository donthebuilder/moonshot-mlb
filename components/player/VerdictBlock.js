'use client'
import CallStatusBadge from '../CallStatusBadge'
import WhyLines from '../WhyLines'
import HelpTip from '../HelpTip'
import { useSportTheme } from '../SportTheme'
import { alpha } from '../../lib/scales'
import { BRAND } from '../../lib/routes'
import { explain as tapExplain } from '../../lib/explain'
import { useCardLock, useMemberState, CardLockLine } from '../MemberGate'
import { useIsPhone } from '../MobileFold'

// MOONSHOT ON HIM -- THE VERDICT (2026-10-08). `sport` ('mlb' default | 'nfl' | 'nhl' | 'nba') only picks the
// product's name for the heading (BRAND in lib/routes.js): MOONSHOT / TUDDY / LAMP / BUCKETS ON HIM. Right under the header: the call-status word (from the sport's
// own status module, passed in as `status`, never re-derived here), the score, one or two lines of why, the
// model's flags as small chips, and one recap line. Off the slate it is ONE short line plus his clean record.
// See the adapter interface in components/player/index.js.
export default function VerdictBlock({
  status = null, score = null, scoreLabel = null, why = [], watch = null, explain = null, signals = [],
  offSlate = null, offSlateHelp = null, recordLine = null, lastLine = null, help = null, whyMax = 2, sport = 'mlb', style, lock = null,
  // compact (2026-10-23, MOONSHOT's card: Donovan, "everything in between ... get rid of"): ONE row -- the call word, the score and
  // the flags, layered over the checklist. No heading, no why lines, no record line (his record is lower on the card); the
  // members line only when this call is the one that's locked.
  compact = false,
}) {
  const { C, NUM_FONT, accent } = useSportTheme()
  // MEMBERS (2026-10-16): `lock` = { key, time, graded?, slateDate? } from the sport's card. A non-member on tonight's not-started CALLED pick (not one of
  // the boards' free four) sees the lock chip, ONE line and the join button instead of the score, why, watch, flags and the long help. Everyone else: as before.
  const nonMember = useMemberState() === 'free'
  const cl = useCardLock({ status, key: lock?.key, time: lock?.time, graded: Boolean(lock?.graded), slateDate: lock?.slateDate || null })
  const locked = Boolean(lock) && offSlate == null && cl.locked
  const label = { fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }
  const line = { fontSize: 12, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.45 }
  const chips = locked ? [] : (signals || []).filter((c) => c?.t)
  // a phone: smaller chips so the flags sit on one line (Donovan 2026-10-22: "chips of repeated data ... half the screen")
  const phone = useIsPhone(560)
  const brand = BRAND[sport]?.name || BRAND.mlb.name
  if (compact) {
    if (offSlate != null) return null
    const chip = (c) => (
      <span key={c.t} {...(c.explain ? { role: 'button', tabIndex: 0, title: c.explain, onClick: () => tapExplain(c.t, c.explain), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapExplain(c.t, c.explain) } } } : null)}
        style={{ display: 'inline-block', fontSize: phone ? 10 : 11, fontWeight: 800, padding: phone ? '2px 6px' : '2px 8px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: NUM_FONT, cursor: c.explain ? 'help' : 'default',
          color: c.warn ? C.text : C.text2, border: `1px solid ${c.warn ? C.border2 : alpha(accent, 0.35)}`, background: c.warn ? C.glass : alpha(accent, 0.07) }}>{c.t}</span>
    )
    return (
      <section data-pm="verdict" aria-label={`${brand} on him`} style={{ margin: '0 0 8px', minWidth: 0, ...style }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', minHeight: 26 }}>
          {status && <CallStatusBadge status={status} size={11} style={{ padding: '2px 7px' }} gate={lock ? cl.gate : null} />}
          {!locked && score != null && Number.isFinite(Number(score)) && (
            <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 800, color: accent, marginRight: 2 }}>
              {scoreLabel ? <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>{scoreLabel} </span> : null}{Math.round(Number(score))}
            </span>
          )}
          {!locked && help ? <HelpTip label={`${brand} on him`} text={help} /> : null}
          {chips.map(chip)}
        </div>
        {locked && <CardLockLine C={C} NUM_FONT={NUM_FONT} />}
      </section>
    )
  }
  return (
    <section data-pm="verdict" aria-label={`${brand} on him`} style={{ margin: '0 0 8px', minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 30 }}>
        <span style={label}>{brand} ON HIM</span>
        {offSlate == null && status && <CallStatusBadge status={status} size={11} style={{ padding: '2px 7px' }} gate={lock ? cl.gate : null} />}
        {offSlate == null && !locked && score != null && Number.isFinite(Number(score)) && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 800, color: accent }}>
            {scoreLabel ? <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>{scoreLabel} </span> : null}{Math.round(Number(score))}
          </span>
        )}
        {offSlate == null && !locked && help ? <HelpTip label={`${brand} on him`} text={help} /> : null}
      </div>
      {offSlate != null ? (
        <div style={{ ...line }}>{offSlate}{offSlateHelp ? <HelpTip label="Not on the slate" text={offSlateHelp} /> : null}</div>
      ) : locked ? null : (
        <WhyLines theme={C} numFont={NUM_FONT} accent={accent} why={(why || []).slice(0, whyMax)} watch={watch} explain={explain} />
      )}
      {offSlate == null && nonMember && <CardLockLine C={C} NUM_FONT={NUM_FONT} />}
      {/* his record and last week on ONE line (2026-10-22: two lines of the same record read as repeated data) */}
      {recordLine || lastLine ? (
        <div style={{ ...line, color: C.text3, marginTop: 2 }}>
          {recordLine && lastLine && typeof recordLine === 'string' ? recordLine.replace(/\.\s*$/, '') : recordLine}{recordLine && lastLine ? ' · ' : null}{lastLine ? <span style={{ color: C.text }}>{lastLine}</span> : null}
        </div>
      ) : null}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '6px 0 0' }}>
          {chips.map((c) => (
            <span key={c.t} {...(c.explain ? { role: 'button', tabIndex: 0, title: c.explain, onClick: () => tapExplain(c.t, c.explain), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapExplain(c.t, c.explain) } } } : null)}
              style={c.explain ? { display: 'inline-block', padding: '12px 0', margin: '-12px 0', cursor: 'help' } : { display: 'contents' }}>
              <span style={{ display: 'inline-block', fontSize: phone ? 10 : 11, fontWeight: 800, padding: phone ? '2px 6px' : '2px 8px', borderRadius: 3, whiteSpace: 'nowrap', fontFamily: NUM_FONT,
                color: c.warn ? C.text : C.text2, border: `1px solid ${c.warn ? C.border2 : alpha(accent, 0.35)}`, background: c.warn ? C.glass : alpha(accent, 0.07) }}>{c.t}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
