'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj, arr, nameOf } from '../lib/player'
import { pitcherDetailUrl } from '../lib/dataSource'
import DenseTable from './DenseTable'
import { rampColor, inkFor } from './Heatmap'
import { armFormParts } from '../lib/armLeak'
import { penFrom, penLineParts } from '../lib/bullpen'
import { airParts, airVerdict } from '../lib/conditions'

// The arm he's facing tonight — everything about the pitcher in one tab.
//
// This used to be scattered: the arsenal sat inside the batter's pitch table,
// the lineup-spot damage only existed on the Pitchers board, and the platoon
// split was a single line on Overview. Reading "is this a good matchup" meant
// three places. It's one place now.
//
// Two sources, joined here:
//   current/detail/<slate>/pitcher_<id>.json  — arsenal detail, per-lineup-spot
//                                                damage, top/middle/bottom
//                                                order damage. 30 files, one
//                                                per starter.
//   the batter's own slate row                — the bot stamps every hitter
//                                                with the pitcher's season and
//                                                command numbers, so they come
//                                                free with the player.
//
// EVERYTHING IS ORIENTED TOWARD THE HITTER. Bright means good for the batter,
// the same as every other board here. That means most of these columns are
// inverted relative to how a pitcher's stat line normally reads: a high SwStr%
// is a good pitcher and a dark cell. Stated in the captions rather than left
// for you to work out from a colour.

const PITCH_NAMES = {
  FF: '4-Seam', SI: 'Sinker', FC: 'Cutter', SL: 'Slider', ST: 'Sweeper',
  CU: 'Curve', KC: 'K-Curve', CH: 'Changeup', FS: 'Splitter', FA: 'Fastball',
  SV: 'Slurve', KN: 'Knuckle', EP: 'Eephus', FO: 'Forkball', CS: 'Slow curve',
}

// The bot writes some of these as 0-1 fractions and some as 0-100 percentages
// depending on which script produced them, so normalise on the way out rather
// than printing "0.1%" for an 11% swinging-strike rate.
const pctOf = (v) => {
  const x = n(v, null)
  if (x == null) return '—'
  return `${(x <= 1 ? x * 100 : x).toFixed(1)}%`
}

// One section-title voice for the whole tab (2026-08-08 tighten pass): the
// old headers were three ad-hoc bold lines at three sizes, which is why the
// tab read as a pile rather than a page. Same size, same rule, every section.
function SectionTitle({ label, sub, subColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
      margin: '14px 0 5px', paddingTop: 10, borderTop: `1px solid ${C.border}`,
    }}>
      <span style={{
        fontSize: 10.5, fontWeight: 900, letterSpacing: '.08em',
        textTransform: 'uppercase', color: C.text,
      }}>{label}</span>
      {sub && <span style={{ fontSize: 9.5, color: subColor || C.text3, fontFamily: NUM_FONT }}>{sub}</span>}
    </div>
  )
}

// GROUPED STAT TILES (2026-08-09). Owner on the old flat grid of fourteen:
// "lazy and confusing to read, not usable". It was one undifferentiated row
// where HR/9 sat next to SwStr% sat next to 400+ allowed, and nothing told you
// that half of those are reasons to attack him and the other half are reasons
// he'll beat you. Three groups now, each with a one-line header saying what it
// tells you.
//
// The meters are drawn against a FIXED league-typical display range, not
// against tonight's slate and not against a percentile — we don't publish
// pitcher percentiles, so claiming one would be invented. The range and the
// league-average tick are both in each tile's tooltip, and the group caption
// says what the scale is. Where there's no defensible range (375+/400+ allowed
// are raw season counts) the tile shows the number with no bar rather than a
// bar against a made-up ceiling.
const METERS = {
  hr9:      { lo: 0.50, hi: 2.00, mid: 1.20, unit: ' HR/9' },
  barrel:   { lo: 3,    hi: 13,   mid: 8,    unit: '% barrels' },
  ev:       { lo: 85,   hi: 92,   mid: 88.5, unit: ' mph' },
  babip:    { lo: 0.250, hi: 0.330, mid: 0.290, unit: ' BABIP' },
  meatball: { lo: 5,    hi: 12,   mid: 7.5,  unit: '% meatballs' },
  // Documented on this file already: pitch_mix_score runs 15–95 on the live
  // slate with a median of 71.5, so this one IS a real observed range.
  pmix:     { lo: 15,   hi: 95,   mid: 71.5, unit: ' mix fit' },
}

// Everything on this tab is oriented toward the HITTER, so every metered stat
// here happens to run the same way: higher is better for the bat. The fill is
// ember above the league tick and grey below it.
function Meter({ v, spec }) {
  if (v == null || !spec || !Number.isFinite(v)) return null
  const { lo, hi, mid } = spec
  const clamp = (x) => Math.max(0, Math.min(1, x))
  const f = clamp((v - lo) / (hi - lo))
  const m = clamp((mid - lo) / (hi - lo))
  const hot = v >= mid
  return (
    <div style={{ position: 'relative', height: 5, borderRadius: 3, background: C.bg3, marginTop: 5, overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: `${(f * 100).toFixed(1)}%`,
        background: hot ? C.orange : 'rgba(255,255,255,.22)',
        borderRadius: 3,
      }} />
      <div style={{
        position: 'absolute', left: `${(m * 100).toFixed(1)}%`, top: -1, bottom: -1,
        width: 1.5, background: 'rgba(255,255,255,.45)',
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// THE THREE THINGS THIS TAB ALSO NEVER SAID (2026-08-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// Same gap as the Pitchers board, on the surface a reader is far more likely
// to be looking at: this tab told you what the arm IS — fourteen season tiles,
// an arsenal, two damage tables — and nothing about what has been happening to
// him lately, who comes in behind him, or what air he is throwing in. All of
// it was already on the hitter's own slate row.
//
// It goes ABOVE the fold, next to the verdict, because that is where a reason
// changes a decision; the tiles stay exactly as they were behind "Show the
// numbers". Nothing was removed to make room. And it is three sentences, not
// three more tiles — the tile grid below is already the thing the owner called
// "lazy and confusing to read", so this is deliberately not more of it.
const toneColor = (t) => (t === 'hot' ? C.orange : t === 'cold' ? C.blue : C.text2)

function ReadLine({ lead, parts, tail }) {
  if (!parts?.length) return null
  return (
    <div style={{ fontSize: 10.5, lineHeight: 1.65, color: C.text3 }}>
      <b style={{ color: C.text2 }}>{lead}</b>
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
          <span title={p.title} style={{
            color: toneColor(p.tone), fontWeight: p.tone === 'plain' ? 400 : 700, cursor: 'help',
          }}>{p.text}</span>
        </span>
      ))}
      .{tail}
    </div>
  )
}

function Stat({ label, value, note, tone, meter, meterKey, title }) {
  const spec = meterKey ? METERS[meterKey] : null
  const tip = title || (spec
    ? `${label}. Bar runs ${spec.lo}–${spec.hi}${spec.unit}; the pale tick is roughly league average (${spec.mid}). Fixed display scale, not a percentile.`
    : label)
  return (
    <div title={tip} style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '8px 11px', minWidth: 104, flex: '1 1 104px',
    }}>
      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: NUM_FONT, color: tone || C.text, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 1 }}>{note}</div>}
      {spec && <Meter v={meter} spec={spec} />}
    </div>
  )
}

// One group of tiles with a header that says what the group is FOR. The header
// is the whole fix: "🎯 Attackable — the case for the bat" tells you how to
// read the five numbers under it before you read any of them.
//
// ── THE ARSENAL+DAMAGE RESTYLE (2026-08-18) ─────────────────────────────────
// Same principle as GameStrip's 2026-08-16 Apple pass, applied here: three
// groups used to each spend a tinted background fill AND a coloured border
// AND a coloured left-edge AND a coloured title on saying "I am this group" —
// four ways to say one thing, stacked on top of the REAL colour underneath
// (the meters, the hot/cold tones on individual stats), which is the signal
// that actually changes read from row to row. Down to one mark — the left
// edge — plus the coloured title text, which was already doing the real
// labelling work ("🎯 Attackable" in orange reads as attackable without the
// tile behind it needing to glow too). Nothing here changes WHAT a stat says;
// every number, meter and note is untouched.
function StatGroup({ icon, title, blurb, color, children }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`, borderLeft: `3px solid ${color}`,
      borderRadius: 11, padding: '9px 11px 11px', marginBottom: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', marginBottom: 7 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{
          fontSize: 10.5, fontWeight: 900, color, letterSpacing: '.07em',
          textTransform: 'uppercase', fontFamily: NUM_FONT,
        }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5, flex: '1 1 200px', minWidth: 0 }}>{blurb}</span>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{children}</div>
    </div>
  )
}

export default function MatchupPitcher({ player, slateMode }) {
  const [detail, setDetail] = useState(null)
  const [state, setState] = useState('idle')

  const pitcherId = player?.pitcher_id
  const bats = clean(player?.bats || player?.handedness, '').toUpperCase().slice(0, 1)
  const spot = n(player?.lineup_spot, null)

  useEffect(() => {
    if (!pitcherId) return
    let alive = true
    setState('loading'); setDetail(null)
    fetch(pitcherDetailUrl(pitcherId, slateMode))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDetail(j); setState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [pitcherId, slateMode])

  // Arsenal, taken from the split that matches which side this hitter stands
  // on. The overall mix is the fallback and is labelled as such — a starter's
  // usage against lefties can look nothing like his usage overall.
  // HAND TOGGLE. Defaults to the side this hitter actually bats from, because
  // that's the answer to "what will HE see" — but a starter's mix and the
  // damage he allows can look completely different to the other side, and you
  // often want that when you're deciding which half of a lineup to attack.
  // 'auto' follows the hitter; L/R force it; 'all' is his overall usage.
  const [handView, setHandView] = useState('auto')
  // Detail is collapsed by default. The tab was ~14 stat tiles and three tables
  // open at once, which is everything the bot knows and no indication of what
  // to do with it. The verdict answers the question; the rest is there when you
  // want to check its working.
  const [showDetail, setShowDetail] = useState(false)
  const effHand = handView === 'auto' ? bats : handView === 'all' ? '' : handView

  const { arsenal, side } = useMemo(() => {
    const key = effHand === 'L' ? 'pitcher_pitch_mix_vs_lhb' : effHand === 'R' ? 'pitcher_pitch_mix_vs_rhb' : null
    const split = key ? arr(obj(detail?.[key]).pitch_type_summary) : []
    const overall = arr(detail?.pitcher_pitch_arsenal_detail)
    const use = split.length ? split : overall
    return {
      arsenal: use.map((a) => {
        const code = clean(a.pitch_code || a.pitch_type, '')
        return {
          _key: code,
          pitch: PITCH_NAMES[code] || code,
          code,
          usage: n(a.usage_pct ?? a.usage, 0),
          seen: n(a.count, 0),
          bbe: n(a.bbe_allowed, 0),
          hr: n(a.hr_allowed, 0),
          hrRate: n(a.hr_per_bbe, 0) * 100,
          ev: n(a.avg_ev_allowed, 0) || null,
          barrel: n(a.barrel_rate_allowed, 0) * 100,
          hard: n(a.hard_hit_rate_allowed, 0) * 100,
          xwoba: a.xwoba_allowed == null ? null : n(a.xwoba_allowed, 0),
        }
      }).sort((x, y) => y.usage - x.usage),
      side: split.length ? (effHand === 'L' ? 'vs LHB' : 'vs RHB') : 'overall',
    }
  }, [detail, effHand])

  const spots = useMemo(() => Object.values(obj(detail?.pitcher_lineup_spot_damage)).map((s) => ({
    _key: String(s.spot),
    spot: n(s.spot, 0),
    mine: spot != null && n(s.spot, -1) === spot ? 1 : 0,
    pa: n(s.pa, 0),
    slg: n(s.slg, 0),
    iso: n(s.iso, 0),
    hr: n(s.hr, 0),
    hrRate: n(s.hr_rate, 0) * 100,
    hard: n(s.hard_hit_rate, 0) * 100,
    barrel: n(s.barrel_rate, 0) * 100,
    ev: n(s.avg_ev, 0) || null,
    damage: n(s.damage_score, 0),
    label: clean(s.label, ''),
    sample: clean(s.sample, ''),
  })).sort((a, b) => a.spot - b.spot), [detail, spot])

  const zones = useMemo(() => ['top', 'middle', 'bottom'].map((k) => {
    const z = obj(detail?.pitcher_lineup_zone_damage)[k]
    if (!z) return null
    return {
      _key: k,
      zone: `${k} (${arr(z.spots).join('-')})`,
      pa: n(z.pa, 0),
      slg: n(z.slg, 0),
      iso: n(z.iso, 0),
      hr: n(z.hr, 0),
      hrRate: n(z.hr_rate, 0) * 100,
      hard: n(z.hard_hit_rate, 0) * 100,
      barrel: n(z.barrel_rate, 0) * 100,
      damage: n(z.damage_score, 0),
      label: clean(z.label, ''),
      sample: clean(z.sample, ''),
    }
  }).filter(Boolean), [detail])

  if (!player?.pitcher_name) {
    return <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0' }}>No starter announced for this game yet.</div>
  }

  const weakSide = clean(player?.pitcher_weak_side, '')
  const matchesWeak = weakSide && bats && ((weakSide === 'LHB' && bats === 'L') || (weakSide === 'RHB' && bats === 'R'))
  const hr9 = n(player?.pitcher_hr9, null)
  const mySpot = spots.find((s) => s.mine)

  // ── THE VERDICT ───────────────────────────────────────────────────────────
  //
  // Four reasons, each either on or off, each one sentence. This is the whole
  // point of the tab: "is this a good arm to attack, and why". Everything below
  // is the evidence, and it stays folded away until asked for.
  //
  // Scale notes, checked against the live slate so the wording matches reality:
  //   pitcher_attack_score   0–53.9, median 19.5  → 30+ is genuinely high
  //   pitch_mix_score        15–95,  median 71.5  → 80+ is a real edge
  //   weak_pitcher_flag      true on 187 of 268 — 70% of the slate, so it is
  //                          NOT used as a reason here. A flag that fires on
  //                          seven hitters in ten carries no information, and
  //                          putting it in a verdict would make every arm look
  //                          attackable.
  const attack = n(player?.pitcher_attack_score, 0)
  const pmix = n(player?.pitch_mix_score, 0)
  const reasons = [
    { on: hr9 != null && hr9 >= 1.3, good: true,
      text: `Gives up ${hr9?.toFixed(2)} HR per nine — above league, and the single most direct signal here.` },
    { on: matchesWeak, good: true,
      text: `His weak side is ${weakSide}, and this hitter bats ${bats}HB.` },
    { on: pmix >= 80, good: true,
      text: `Pitch-mix fit ${pmix.toFixed(0)} of 95 — this batter handles what this arm throws.` },
    { on: attack >= 30, good: true,
      text: `Attack score ${attack.toFixed(0)} — top of tonight's range, which tops out near 54 rather than 100.` },
    { on: hr9 != null && hr9 <= 0.9, good: false,
      text: `Only ${hr9?.toFixed(2)} HR per nine — he suppresses the long ball.` },
    { on: n(player?.pitcher_swstr_pct, 0) >= 0.13 || n(player?.pitcher_swstr_pct, 0) >= 13, good: false,
      text: 'High swinging-strike rate — he misses bats, which is his edge and not yours.' },
    { on: weakSide && bats && !matchesWeak, good: false,
      text: `His weak side is ${weakSide}; this hitter bats the other way.` },
  ].filter((r) => r.on)
  const forCount = reasons.filter((r) => r.good).length
  const againstCount = reasons.length - forCount
  const verdict = forCount >= 2 && forCount > againstCount ? { label: 'Attackable', col: C.orange }
    : againstCount >= 2 && againstCount > forCount ? { label: 'Tough arm', col: C.text2 }
    : { label: 'Mixed', col: '#FCD34D' }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 800 }}>{clean(player.pitcher_name)}</span>
        <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
          {clean(player.pitcher_throws, '?')}HP · {clean(player.pitcher_team, '')} ·
          {' '}ERA {clean(player.pitcher_era, '—')} · WHIP {clean(player.pitcher_whip, '—')}
        </span>
        {clean(player.pitcher_attack_tag, '') !== '—' && (
          <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT }}>{clean(player.pitcher_attack_tag)}</span>
        )}
      </div>

      {/* Verdict first. Owner likes this box, so 2026-08-09 only tightened it:
          the tally moved up onto the headline row so the shape of the call is
          readable without reading any reason, the reasons themselves sit on a
          tighter rhythm, and the toggle moved inline beside them instead of
          taking a line of its own. Same logic, same sentences, less air. */}
      <div style={{
        background: C.bg2, border: `1px solid ${verdict.col}55`,
        borderLeft: `4px solid ${verdict.col}`,
        borderRadius: 12, padding: '9px 13px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: verdict.col, lineHeight: 1.1 }}>{verdict.label}</span>
          <span style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>
            for {nameOf(player)} · {bats || '?'}HB vs {clean(player.pitcher_throws, '?')}HP
          </span>
          {reasons.length > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'baseline', fontFamily: NUM_FONT, fontSize: 10 }}>
              <span style={{ color: C.orange, fontWeight: 900 }}>+{forCount}</span>
              <span style={{ color: C.text3 }}>/</span>
              <span style={{ color: C.text2, fontWeight: 900 }}>−{againstCount}</span>
            </span>
          )}
        </div>

        {reasons.length === 0 ? (
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 4 }}>
            Nothing stands out either way — a league-average matchup on every input this site checks.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 5 }}>
            {reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 10.5, color: C.text2, display: 'flex', gap: 6, lineHeight: 1.5 }}>
                <span style={{ color: r.good ? C.orange : C.text3, fontWeight: 900, flexShrink: 0 }}>
                  {r.good ? '+' : '−'}
                </span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowDetail((v) => !v)}
          style={{
            marginTop: 7, padding: '3px 10px', fontSize: 10, fontWeight: 700,
            borderRadius: 7, cursor: 'pointer', fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}
        >{showDetail ? 'Hide the numbers' : 'Show the numbers'}</button>
      </div>

      {/* ── FORM · THE PEN · THE AIR ───────────────────────────────────────
          Three sentences off the same slate row the verdict is built from.
          Every clause carries its own tooltip naming the field behind it, and
          a clause with no published field behind it is dropped rather than
          printed as a zero. */}
      {(() => {
        const form = armFormParts(player)
        const penParts = penLineParts(penFrom(player))
        const air = airParts(player)
        const wxHr = n(player.weather_hr_effect_pct, null)
        const airAll = [
          ...air,
          ...(wxHr != null && wxHr !== 0 ? [{
            key: 'wxhr',
            text: `the bot puts the air at ${wxHr > 0 ? '+' : ''}${wxHr}% on home runs`,
            tone: wxHr > 0 ? 'hot' : 'cold',
            title: 'weather_hr_effect_pct — the bot\'s published summary of tonight\'s conditions as a percentage swing on the home-run RATE at this park. Not a chance of anything.',
          }] : []),
        ]
        // This hitter's OWN fit against those relievers, which is a different
        // question from how the pen grades overall — the Pitchers board shows
        // the lineup average, this shows him.
        const myFit = n(player.bullpen_pitch_fit, null)
        const vsPen = n(player.batter_vs_bullpen_score, null)
        const verdict = airVerdict(player)
        if (!form.length && !penParts.length && !airAll.length) return null
        return (
          <div style={{
            background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
            padding: '9px 13px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <ReadLine lead={'What’s been going on: '} parts={form} />
            <ReadLine
              lead="Behind him: "
              parts={[
                ...penParts,
                ...(myFit != null ? [{
                  key: 'myfit',
                  text: `this hitter grades ${myFit.toFixed(0)} on pitch fit against it`,
                  tone: myFit >= 70 ? 'hot' : myFit <= 45 ? 'cold' : 'plain',
                  title: 'bullpen_pitch_fit — how well THIS batter\'s swing matches what those relievers throw. A 0-100 fit score, not a chance of anything.',
                }] : []),
                ...(vsPen != null && vsPen > 0 ? [{
                  key: 'vspen',
                  text: `his batter-versus-bullpen score is ${vsPen.toFixed(0)}`,
                  tone: vsPen >= 60 ? 'hot' : 'plain',
                  title: 'batter_vs_bullpen_score — the bot\'s combined rating of this hitter against this bullpen. A 0-100 score that sits low across most of the slate (median around 10), so read a 60 as high rather than as middling.',
                }] : []),
              ]}
            />
            <ReadLine
              lead={`${clean(player.venue_name, '') || 'The air'}: `}
              parts={airAll}
              tail={verdict === 'carrying'
                ? <span style={{ color: C.orange, fontWeight: 700 }}> The ball is carrying here tonight.</span>
                : verdict === 'dead'
                  ? <span style={{ color: C.blue, fontWeight: 700 }}> This is dead air.</span>
                  : null}
            />
          </div>
        )
      })()}

      {showDetail && (<>

      {/* Hand toggle — drives the stat tiles AND the arsenal below. */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Split</span>
        {[
          { k: 'auto', label: bats ? `vs ${bats}HB — this hitter` : 'This hitter' },
          { k: 'L', label: 'vs LHB' },
          { k: 'R', label: 'vs RHB' },
          { k: 'all', label: 'Overall' },
        ].map((o) => {
          const on = handView === o.k
          return (
            <button
              key={o.k}
              onClick={() => setHandView(o.k)}
              style={{
                padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
                fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >{o.label}</button>
          )
        })}
        {handView !== 'auto' && handView !== 'all' && handView !== bats && (
          <span style={{ fontSize: 9.5, color: C.orange, fontFamily: NUM_FONT }}>
            not this hitter&apos;s side — {bats || '?'}HB
          </span>
        )}
      </div>

      {/* THE THREE GROUPS. Everything here is "how good is this for the guy at
          the plate", not "how good is this pitcher" — and now the grouping
          says which of those two things each number is measuring. */}
      {(() => {
        // Normalised 0-100 values for the meters. The bot writes some rates as
        // fractions and some as percentages, so run them all through the same
        // normaliser the display uses rather than metering raw fields.
        const asPct = (v) => { const x = n(v, null); return x == null ? null : (x <= 1 ? x * 100 : x) }
        const meatball = asPct(player.pitcher_meatball_pct)
        const barrel = asPct(player.pitcher_barrel_allowed)
        const evAlw = n(player.pitcher_ev_allowed, null)
        const babip = n(player.pitcher_babip, null)
        const pmixV = n(player.pitch_mix_score, null)
        const d375 = n(player.pitcher_375_allowed, null)
        const d400 = n(player.pitcher_400_allowed, null)
        const sideHr9 = effHand ? n(effHand === 'L' ? player.pitcher_hr9_vs_lhb : player.pitcher_hr9_vs_rhb, null) : hr9
        const sideWhip = effHand
          ? n(effHand === 'L' ? player.pitcher_whip_vs_lhb : player.pitcher_whip_vs_rhb, null)
          : n(player.pitcher_whip, null)

        return (
          <>
            <StatGroup
              icon="🎯"
              title="Attackable"
              color={C.orange}
              blurb="What he gives up. Every bar here fills to the right when it's good news for the bat."
            >
              <Stat label="HR/9" value={hr9 == null ? '—' : hr9.toFixed(2)}
                tone={hr9 >= 1.4 ? C.orange : hr9 <= 0.9 ? C.text3 : C.text}
                note={hr9 == null ? 'not published' : hr9 >= 1.4 ? 'gives them up' : hr9 <= 0.9 ? 'suppresses them' : 'league-ish'}
                meter={hr9} meterKey="hr9" />
              <Stat label={effHand ? `HR/9 vs ${effHand}HB` : 'HR/9 overall'}
                value={sideHr9 == null ? '—' : sideHr9.toFixed(2)}
                note={effHand ? 'his split against this side' : 'both sides combined'}
                meter={sideHr9} meterKey="hr9" />
              <Stat label="Barrel% allowed" value={pctOf(player.pitcher_barrel_allowed)}
                note="contact quality against"
                meter={barrel} meterKey="barrel" />
              <Stat label="EV allowed" value={evAlw == null ? '—' : evAlw.toFixed(1)}
                note="avg exit velo he gives up"
                meter={evAlw} meterKey="ev" />
              <Stat label={effHand ? `WHIP vs ${effHand}HB` : 'WHIP overall'}
                value={sideWhip == null ? '—' : sideWhip.toFixed(2)}
                note="baserunners against this side"
                title="Walks and hits per inning against this side. No bar: WHIP is traffic, not damage, and it doesn't map cleanly onto a good-for-the-hitter scale." />
              {/* Raw season counts. No bar, on purpose — a count has no league
                  range to draw against without inventing a ceiling. */}
              <Stat label="375+ allowed" value={d375 == null ? '—' : String(Math.round(d375))}
                note="balls he's let travel"
                title="Count of 375ft+ balls allowed this season. Shown as a bare count — a season total has no league-typical range to meter it against, so drawing a bar would mean inventing a ceiling." />
              <Stat label="400+ allowed" value={d400 == null ? '—' : String(Math.round(d400))}
                tone={n(player.pitcher_400_allowed, 0) >= 5 ? C.orange : C.text}
                note="real distance given up"
                title="Count of 400ft+ balls allowed this season. Same reason as 375+: a bare count, no invented bar." />
            </StatGroup>

            <StatGroup
              icon="🛡"
              title="His weapons"
              color="#60A5FA"
              blurb="How he beats hitters. A big number in this group is bad news for the bat — no bars and no shading here on purpose, so nothing in it can be misread as an edge."
            >
              <Stat label="K%" value={pctOf(player.pitcher_k_rate)}
                note="how often he ends it himself" />
              <Stat label="SwStr%" value={pctOf(player.pitcher_swstr_pct)}
                note="swing and miss per pitch" />
              <Stat label="Whiff%" value={pctOf(player.pitcher_whiff_pct)}
                note="misses per swing" />
              <Stat label="Putaway%" value={pctOf(player.pitcher_putaway_pct)}
                note="2-strike counts he finishes" />
              <Stat label="1st-pitch K%" value={pctOf(player.pitcher_first_pitch_strike_pct)}
                note="how often he gets ahead" />
            </StatGroup>

            <StatGroup
              icon="📍"
              title="Location & fit"
              color="#a78bfa"
              blurb="Where he puts it, who it suits, and how much of his line is luck. Bars fill right when it favours the bat."
            >
              <Stat label="Meatball%" value={meatball == null ? '—' : `${meatball.toFixed(1)}%`}
                note="pitches down the middle"
                meter={meatball} meterKey="meatball" />
              <Stat label="Pitch-mix score" value={pmixV == null ? '—' : pmixV.toFixed(0)}
                tone={pmixV != null && pmixV >= 70 ? C.orange : C.text}
                note={clean(player.pitch_mix_note, 'this batter vs this arsenal')}
                meter={pmixV} meterKey="pmix" />
              <Stat label="Weak side" value={weakSide || '—'}
                tone={matchesWeak ? C.orange : C.text}
                note={matchesWeak ? `${bats}HB — that's this hitter` : weakSide ? 'not this hitter' : 'none published'}
                title="The batting side he's published as vulnerable to. Categorical, so there's nothing to meter — it either matches this hitter or it doesn't." />
              <Stat label="BABIP against" value={babip == null ? '—' : babip.toFixed(3)}
                tone={babip != null && babip < 0.270 ? C.orange : C.text}
                note={babip != null && babip < 0.270 ? 'low — some of that is luck' : 'balls in play against'}
                meter={babip} meterKey="babip" />
            </StatGroup>
          </>
        )
      })()}

      <div style={{ fontSize: 9, color: C.text3, marginBottom: 12, lineHeight: 1.5 }}>
        The bars run against a <b style={{ color: C.text2 }}>fixed league-typical range</b> with a pale
        tick at roughly league average — they are not percentiles, because this site doesn&apos;t publish
        pitcher percentiles and a fake one would be worse than no bar. Each tile&apos;s tooltip states its
        range. Raw season counts (375+ / 400+ allowed) and categorical fields (weak side) get no bar at
        all rather than one drawn against an invented ceiling. And the whole
        <b style={{ color: '#60A5FA' }}> His weapons</b> group is deliberately plain: K%, SwStr%, Whiff%,
        Putaway% and 1st-pitch K% are the pitcher&apos;s strengths, so shading them on a bright-is-good
        ramp would invert the meaning of every other tile on the page.
        {n(player.pitcher_babip, 0) > 0 && n(player.pitcher_babip, 0) < 0.270 && (
          <> His BABIP against is {n(player.pitcher_babip).toFixed(3)}, which is below the ~.290 a
          defence-neutral pitcher usually settles at. Some of that is his contact management and
          some is luck that hasn&apos;t corrected yet — it makes him look better than he&apos;ll
          finish.</>
        )}
      </div>

      {mySpot && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.orange}`,
          borderRadius: 10, padding: '9px 13px', marginBottom: 12,
        }}>
          <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Batting #{mySpot.spot} against him
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, margin: '2px 0' }}>
            {mySpot.label || '—'} · damage {mySpot.damage.toFixed(0)}
            <span style={{ fontSize: 10.5, color: C.text3, fontWeight: 500, fontFamily: NUM_FONT }}>
              {' '}on {mySpot.pa} PA{mySpot.sample ? ` (${mySpot.sample} sample)` : ''}
            </span>
          </div>
          <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
            {mySpot.slg.toFixed(3)} SLG · {mySpot.iso.toFixed(3)} ISO · {mySpot.hr} HR · {mySpot.hard.toFixed(0)}% hard hit
          </div>
          {mySpot.pa < 20 && (
            <div style={{ fontSize: 9.5, color: C.orange, marginTop: 3 }}>
              {mySpot.pa} plate appearances is far too few to read a lineup-spot tendency from. Treat this
              as colour, not evidence — the order-thirds table below pools three spots and is the sturdier number.
            </div>
          )}
        </div>
      )}

      {state === 'loading' && <div style={{ fontSize: 11, color: C.text3 }}>Loading his detail file…</div>}
      {(state === 'missing' || state === 'error') && (
        <div style={{ fontSize: 11, color: C.text3, padding: '8px 0' }}>
          No detail file published for this starter, so the arsenal and lineup-damage tables below are
          unavailable. The season numbers above come off the slate row and are unaffected.
        </div>
      )}

      {arsenal.length > 0 && (
        <>
          <SectionTitle
            label="Arsenal"
            sub={side === 'overall' ? 'overall usage — no side split published' : `his mix ${side}, the side this hitter bats from`}
            subColor={side === 'overall' ? C.text3 : C.orange}
          />
          <DenseTable
            rows={arsenal}
            columns={[
              { key: 'pitch',  label: 'Pitch',  heat: false, w: 92, bold: true, sticky: true },
              { key: 'usage',  label: 'Usage', w: 58, dp: 1, fmt: (v) => `${Number(v).toFixed(1)}%`,
                title: 'Share of his pitches. Not good or bad — just how often you see it.' },
              { key: 'seen',   label: 'Thrown', w: 50 },
              { key: 'bbe',    label: 'BBE',    w: 42, title: 'Balls in play against this pitch — the denominator' },
              // 2026-08-12: bare "HR" here was matching the GLOSSARY's HR
              // SCORE entry (a 0-100 ranking) plus its ranking/percentage
              // banner — this is a home-run COUNT, same fix as PlayerModal's
              // Season block already made for the same collision.
              { key: 'hr',     label: 'HR',     w: 38,
                explain: 'Home runs allowed on this specific pitch.' },
              { key: 'hrRate', label: 'HR/BBE%', w: 58, dp: 1,
                explain: 'Home runs allowed on this pitch, as a share of batted balls against it — not of every pitch thrown.' },
              { key: 'ev',     label: 'EV alw', w: 52, dp: 1, title: 'Average exit velocity allowed on this pitch' },
              { key: 'hard',   label: 'HH%',    w: 46, dp: 0 },
              { key: 'barrel', label: 'Barrel%', w: 54, dp: 1 },
              { key: 'xwoba',  label: 'xwOBA',  w: 50, dp: 3, fmt: (v) => (v == null ? '—' : Number(v).toFixed(3)) },
            ]}
            initialSort="usage"
            maxHeight={300}
            caption="Bright is good for the hitter throughout — these are the pitches that get hurt. Usage is the exception and carries no judgement, it's just how often he throws it; a pitch that gets crushed on 3% usage is a footnote, not a plan. Watch the BBE column: several of these lines rest on single-digit balls in play, and a 1-for-4 pitch reads as 25% HR/BBE."
          />
        </>
      )}

      {/* SIDE BY SIDE (2026-08-08 tighten pass): thirds and per-spot answer
          the same question at two zoom levels, so they belong next to each
          other, not one on top of the other with the sturdier table scrolled
          off screen. Wide screens get both at once; narrow ones wrap. */}
      {(zones.length > 0 || spots.length > 0) && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {zones.length > 0 && (
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <SectionTitle label="Damage by order third" sub="the sturdier read — three spots pooled" />
              <DenseTable
                rows={zones}
                columns={[
                  { key: 'zone',   label: 'Order',  heat: false, w: 100, bold: true, sticky: true },
                  { key: 'pa',     label: 'PA',     w: 40 },
                  { key: 'slg',    label: 'SLG',    w: 50, dp: 3 },
                  { key: 'iso',    label: 'ISO',    w: 50, dp: 3 },
                  // 2026-08-12: bare "HR"/"HR%" both matched the GLOSSARY's
                  // HR SCORE entry (a 0-100 ranking, not a count or a real
                  // rate) plus its ranking/percentage banner. This table's
                  // HR% is share of PLATE APPEARANCES, a different base than
                  // the pitch-arsenal table's HR/BBE% above.
                  { key: 'hr',     label: 'HR',     w: 34,
                    explain: 'Home runs he has allowed to hitters in this third of the order.' },
                  { key: 'hrRate', label: 'HR%',    w: 44, dp: 1,
                    explain: 'Home runs as a share of plate appearances against hitters in this third of the order.' },
                  { key: 'hard',   label: 'HH%',    w: 44, dp: 1 },
                  { key: 'barrel', label: 'Brl%',   w: 44, dp: 1 },
                  { key: 'damage', label: 'Dmg',    w: 44, dp: 0 },
                  { key: 'label',  label: 'Read',   heat: false, w: 70, dim: true },
                ]}
                initialSort="damage"
                maxHeight={200}
                caption="Three spots pooled per row — roughly triple the PA of any single spot, and the number to trust when the two tables disagree."
              />
            </div>
          )}
          {spots.length > 0 && (
            <div style={{ flex: '1 1 380px', minWidth: 0 }}>
              <SectionTitle
                label="Damage by lineup spot"
                sub={spot != null ? `this hitter bats #${spot}` : 'nine thin slices of one season'}
                subColor={spot != null ? C.orange : C.text3}
              />
              <DenseTable
                rows={spots}
                columns={[
                  { key: 'spot',   label: '#',      w: 30 },
                  { key: 'mine',   label: 'Him',    flag: true, mark: '●', w: 32 },
                  { key: 'pa',     label: 'PA',     w: 40 },
                  { key: 'slg',    label: 'SLG',    w: 50, dp: 3 },
                  { key: 'iso',    label: 'ISO',    w: 50, dp: 3 },
                  // 2026-08-12: same GLOSSARY['hr'] score-collision fix as
                  // the order-third table above, for the same reason.
                  { key: 'hr',     label: 'HR',     w: 34,
                    explain: 'Home runs he has allowed to hitters in this lineup spot.' },
                  { key: 'hrRate', label: 'HR%',    w: 44, dp: 1,
                    explain: 'Home runs as a share of plate appearances against hitters in this lineup spot.' },
                  { key: 'hard',   label: 'HH%',    w: 44, dp: 1 },
                  { key: 'ev',     label: 'EV',     w: 44, dp: 1 },
                  { key: 'damage', label: 'Dmg',    w: 44, dp: 0 },
                ]}
                initialSort="spot"
                maxHeight={280}
                caption="Nine rows split from the same season, so each is thin — most sit around 10–15 PA, a handful of swings. The weakest table on the page; the thirds beside it say the same thing with triple the sample. # is a label, not a score."
              />
            </div>
          )}
        </div>
      )}

      </>)}
    </div>
  )
}
