'use client'
import { C, NUM_FONT } from '../lib/theme'
import { personalFormRead } from '../lib/hrShape'

// ── 💥 HIS HOMER SHAPE (2026-08-14) ─────────────────────────────────────────
//
// Donovan: "each player needs to be categorized by the homers they hit this
// season... Schwarber lasers, James Wood moonshoots... maybe it will help
// figure out when a certain batter is in their form — not the overall shape
// but their personal shape." Computed client-side from batted_ball_log (the
// detail file's season per-ball log — same rows the EV Log tab shows),
// classified with the same five bands the Homer Ledger stamps on tonight's
// homers (lib/hrShape.js). Renders nothing without a log or without a homer
// in it — an unclassified hitter and a "no data" hitter are different claims,
// and neither gets a made-up mix. The matching "is he in his form" number is
// also computed + archived by the bot nightly (personal_shape_match) so a few
// weeks of graded slates can say whether it PREDICTS anything — until then
// this panel is descriptive, not a score.
//
// ── WHY THIS IS ITS OWN FILE NOW, AND WHY IT MOVED (2026-08-16) ─────────────
//
// Donovan: "i need hr shape moved up on the player modal."
//
// WHAT WAS WRONG. This panel shipped on 2026-08-14 as an inline IIFE at the
// very BOTTOM of the Overview tab, underneath the "🔢 The numbers" appendix —
// six stacked columns of label:value rows. Measured on the fixture slate at
// the 580px overview width, that put it roughly 1,900px down the modal's
// scroll: three-plus screens past the fold on a phone, and below the point
// anyone stops scrolling a card they opened to check one thing. A panel
// nobody reaches is a panel that does not exist, however correct it is.
//
// WHY IT BELONGS UP TOP. The rest of that appendix is EVIDENCE — this many
// barrels, this launch angle, this pitcher's HR/9. This panel is not evidence;
// it is a CHARACTERISATION of the hitter ("he is a laser guy, and lately his
// contact is drifting back toward that window"). That is the same job The Read
// does in sentences directly above it, so it now sits with the story instead
// of in the footnotes: read → shape → props matrix → cold case → numbers.
//
// EXTRACTED VERBATIM. Every fact, guard and threshold came across unchanged —
// the band chips, the launch-angle window sentence, the recent-vs-season
// hard-hit comparison, the verdict, and the small print about the bands being
// percentile slices rather than physics. Nothing was condensed away and
// nothing was restyled; the panel is the same panel, at a different altitude.
// Verified by rendering (not by reading the diff): served a fixture hitter a
// detail file with a real batted_ball_log, opened the modal, screenshotted it,
// and confirmed the panel now sits immediately under The Read with all four
// of its parts intact.
//
// `player` is the MERGED object the modal builds (slate row + detail file), not
// the bare slate row — batted_ball_log lives only in the detail file, so
// passing the un-merged row here would silently render nothing forever.
export default function HomerShape({ player }) {
  // Two spellings of the same season log. spray_chart is the older key and
  // still the only one some published detail files carry; batted_ball_log wins
  // when both exist. Neither present → no panel at all (see the guard below).
  const log = Array.isArray(player?.batted_ball_log) && player.batted_ball_log.length
    ? player.batted_ball_log
    : (Array.isArray(player?.spray_chart) ? player.spray_chart : [])
  if (!log.length) return null
  const f = personalFormRead(log)
  // f.n is his count of BAND-CLASSIFIED homers. Zero means the log exists but
  // holds no trackable homer — a different claim from "no log", and it earns
  // the same silence rather than an empty chip row.
  if (!f.n) return null
  const thinMix = f.n < 4
  const inForm = f.match != null && f.match >= 0.08
  const outForm = f.match != null && f.match <= -0.08
  // C.red is the same #f87171 the inline version hard-coded, but it follows a
  // theme swap now (every palette in lib/themes.js keeps `red` a red). The
  // amber below stays a literal on purpose: it is the site's warning yellow,
  // used in ~100 other places, and C.yellow is a visibly darker orange — that
  // swap would be a restyle, and this pass was a move.
  const formCol = inForm ? C.green : outForm ? C.red : C.text3
  return (
    <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800 }}>💥 His homer shape</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {f.n} tracked HR{f.n === 1 ? '' : 's'} this season
        </span>
        {thinMix && (
          <span title="Under 4 tracked homers, one ball swings the whole mix — counts shown, no 'his type' claimed."
            style={{ fontSize: 8.5, color: '#FCD34D', fontFamily: NUM_FONT, fontWeight: 800 }}>thin sample</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: f.laLo != null ? 6 : 0 }}>
        {f.mix.map((m) => (
          <span key={m.key} title={`${m.label} — ${m.blurb}`} style={{
            display: 'flex', gap: 5, alignItems: 'baseline', cursor: 'default',
            border: `1px solid ${m.color}55`, background: `${m.color}12`,
            borderRadius: 999, padding: '2px 9px',
          }}>
            <span style={{ fontSize: 8.5, fontWeight: 900, color: m.color, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>{m.short}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.text, fontFamily: NUM_FONT }}>{m.count}</span>
            {/* A share off three homers is 33% / 33% / 33% and reads like a
                finding. Under four, the count stands alone. */}
            {!thinMix && (
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{Math.round(m.share * 100)}%</span>
            )}
          </span>
        ))}
      </div>
      {f.laLo != null && (
        <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
          His homers leave at <b style={{ color: C.text }}>{Math.round(f.laLo)}–{Math.round(f.laHi)}°</b>
          {f.status === 'ok' ? (
            <>
              {' '}· recent hard-hit contact in that window:{' '}
              <b style={{ color: formCol }}>{Math.round((f.recentRate || 0) * 100)}%</b>
              <span style={{ color: C.text3 }}> vs {Math.round((f.seasonRate || 0) * 100)}% season</span>
              <b style={{ color: formCol }}>
                {' '}{inForm ? '— trending toward his shape' : outForm ? '— away from his shape lately' : '— about his norm'}
              </b>
            </>
          ) : f.status === 'thin_recent' ? (
            <span style={{ color: C.text3 }}> · too few recent hard-hit balls to read his form yet</span>
          ) : null}
        </div>
      )}
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
        Bands are slices of the league homer distribution (see the Homer Ledger), not physics — and
        this reads what his contact looks like, it is not a score. Whether &quot;in his shape&quot; actually
        predicts his homer nights is being tracked from the graded archive before it touches any number.
      </div>
    </div>
  )
}
