'use client'
import CallStatusBadge from '../CallStatusBadge'
import WhyLines from '../WhyLines'
import HelpTip from '../HelpTip'
import { useSportTheme } from '../SportTheme'
import { alpha } from '../../lib/scales'
import { BRAND } from '../../lib/routes'

// MOONSHOT ON HIM -- THE VERDICT (2026-10-08). `sport` ('mlb' default | 'nfl' | 'nhl' | 'nba') only picks the
// product's name for the heading (BRAND in lib/routes.js): MOONSHOT / TUDDY / LAMP / BUCKETS ON HIM. Right under the header: the call-status word (from the sport's
// own status module, passed in as `status`, never re-derived here), the score, one or two lines of why, the
// model's flags as small chips, and one recap line. Off the slate it is ONE short line plus his clean record.
// See the adapter interface in components/player/index.js.
export default function VerdictBlock({
  status = null, score = null, scoreLabel = null, why = [], watch = null, explain = null, signals = [],
  offSlate = null, offSlateHelp = null, recordLine = null, lastLine = null, help = null, whyMax = 2, sport = 'mlb', style,
}) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const label = { fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }
  const line = { fontSize: 12, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.45 }
  const chips = (signals || []).filter((c) => c?.t)
  const brand = BRAND[sport]?.name || BRAND.mlb.name
  return (
    <section data-pm="verdict" aria-label={`${brand} on him`} style={{ margin: '0 0 8px', minWidth: 0, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 30 }}>
        <span style={label}>{brand} ON HIM</span>
        {offSlate == null && status && <CallStatusBadge status={status} size={11} style={{ padding: '2px 7px' }} />}
        {offSlate == null && score != null && Number.isFinite(Number(score)) && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 13, fontWeight: 800, color: accent }}>
            {scoreLabel ? <span style={{ color: C.text3, fontSize: 11, fontWeight: 700 }}>{scoreLabel} </span> : null}{Math.round(Number(score))}
          </span>
        )}
        {offSlate == null && help ? <HelpTip label={`${brand} on him`} text={help} /> : null}
      </div>
      {offSlate != null ? (
        <div style={{ ...line }}>{offSlate}{offSlateHelp ? <HelpTip label="Not on the slate" text={offSlateHelp} /> : null}</div>
      ) : (
        <WhyLines theme={C} numFont={NUM_FONT} accent={accent} why={(why || []).slice(0, whyMax)} watch={watch} explain={explain} />
      )}
      {recordLine ? <div style={{ ...line, color: C.text3, marginTop: 2 }}>{recordLine}</div> : null}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '6px 0 0' }}>
          {chips.map((c) => (
            <span key={c.t} style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', fontFamily: NUM_FONT,
              color: c.warn ? C.text : C.text2, border: `1px solid ${c.warn ? C.border2 : alpha(accent, 0.35)}`, background: c.warn ? C.glass : alpha(accent, 0.07) }}>{c.t}</span>
          ))}
        </div>
      )}
      {lastLine ? <div style={{ ...line, marginTop: 6, color: C.text }}>{lastLine}</div> : null}
    </section>
  )
}
