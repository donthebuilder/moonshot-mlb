'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean, obj, arr, nameOf } from '../lib/player'
import { pitcherDetailUrl } from '../lib/dataSource'
import DenseTable from './DenseTable'
import { rampColor, inkFor } from './Heatmap'

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

function Stat({ label, value, note, tone }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '8px 11px', minWidth: 104, flex: '1 1 104px',
    }}>
      <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, fontFamily: NUM_FONT, color: tone || C.text, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 8.5, color: C.text3, marginTop: 1 }}>{note}</div>}
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

      {/* Verdict first. One line, then the reasons, then everything else on
          request. */}
      <div style={{
        background: C.bg2, border: `1px solid ${verdict.col}55`,
        borderLeft: `4px solid ${verdict.col}`,
        borderRadius: 12, padding: '11px 14px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 17, fontWeight: 900, color: verdict.col }}>{verdict.label}</span>
          <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
            for {nameOf(player)} · {bats || '?'}HB vs {clean(player.pitcher_throws, '?')}HP
          </span>
        </div>

        {reasons.length === 0 ? (
          <div style={{ fontSize: 11, color: C.text3, marginTop: 5 }}>
            Nothing stands out either way — a league-average matchup on every input this site checks.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
            {reasons.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: C.text2, display: 'flex', gap: 7 }}>
                <span style={{ color: r.good ? C.orange : C.text3, fontWeight: 800, flexShrink: 0 }}>
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
            marginTop: 9, padding: '4px 11px', fontSize: 10.5, fontWeight: 700,
            borderRadius: 7, cursor: 'pointer', fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3,
          }}
        >{showDetail ? 'Hide the numbers' : 'Show the numbers'}</button>
      </div>

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

      {/* The headline read. Everything here is "how good is this for the guy at
          the plate", not "how good is this pitcher". */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="HR/9" value={hr9 == null ? '—' : hr9.toFixed(2)}
          tone={hr9 >= 1.4 ? C.orange : hr9 <= 0.9 ? C.text3 : C.text}
          note={hr9 >= 1.4 ? 'gives them up' : hr9 <= 0.9 ? 'suppresses them' : 'league-ish'} />
        <Stat label="Weak side" value={weakSide || '—'}
          tone={matchesWeak ? C.orange : C.text}
          note={matchesWeak ? `${bats}HB — that's this hitter` : weakSide ? 'not this hitter' : 'none published'} />
        <Stat label={effHand ? `HR/9 vs ${effHand}HB` : 'HR/9 overall'}
          value={(() => {
            if (!effHand) return hr9 == null ? '—' : hr9.toFixed(2)
            const v = n(effHand === 'L' ? player.pitcher_hr9_vs_lhb : player.pitcher_hr9_vs_rhb, null)
            return v == null ? '—' : v.toFixed(2)
          })()}
          note={effHand ? 'his split against this side' : 'both sides combined'} />
        <Stat label={effHand ? `WHIP vs ${effHand}HB` : 'WHIP overall'}
          value={(() => {
            if (!effHand) return clean(player.pitcher_whip, '—')
            const v = n(effHand === 'L' ? player.pitcher_whip_vs_lhb : player.pitcher_whip_vs_rhb, null)
            return v == null ? '—' : v.toFixed(2)
          })()}
          note="baserunners against this side" />
        <Stat label="Meatball%" value={n(player.pitcher_meatball_pct, null) == null ? '—' : `${n(player.pitcher_meatball_pct).toFixed(1)}%`}
          note="pitches down the middle" />
        <Stat label="SwStr%" value={pctOf(player.pitcher_swstr_pct)}
          note="swing and miss — high is bad for the hitter" />
        <Stat label="Whiff%" value={pctOf(player.pitcher_whiff_pct)}
          note="misses per swing" />
        <Stat label="K%" value={pctOf(player.pitcher_k_rate)}
          note="how often he ends it himself" />
        <Stat label="Barrel% allowed" value={pctOf(player.pitcher_barrel_allowed)}
          note="contact quality against" />
        <Stat label="EV allowed" value={n(player.pitcher_ev_allowed, null) == null ? '—' : `${n(player.pitcher_ev_allowed).toFixed(1)}`}
          note="avg exit velo he gives up" />
        <Stat label="BABIP against" value={n(player.pitcher_babip, null) == null ? '—' : n(player.pitcher_babip).toFixed(3)}
          tone={n(player.pitcher_babip, 0) < 0.270 ? C.orange : C.text}
          note={n(player.pitcher_babip, 0) < 0.270 ? 'low — some of that is luck' : 'balls in play against'} />
        <Stat label="375+ allowed" value={n(player.pitcher_375_allowed, null) == null ? '—' : String(Math.round(n(player.pitcher_375_allowed)))}
          note="balls he's let travel" />
        <Stat label="400+ allowed" value={n(player.pitcher_400_allowed, null) == null ? '—' : String(Math.round(n(player.pitcher_400_allowed)))}
          tone={n(player.pitcher_400_allowed, 0) >= 5 ? C.orange : C.text}
          note="real distance given up" />
        {/* Moved here from the Hot Zones "Signals" sub-tab, which was a second
            copy of this row one click away inside a different tab. */}
        <Stat label="Putaway%" value={pctOf(player.pitcher_putaway_pct)}
          note="2-strike counts he finishes" />
        <Stat label="1st-pitch K%" value={pctOf(player.pitcher_first_pitch_strike_pct)}
          note="how often he gets ahead" />
        <Stat label="Pitch-mix score" value={n(player.pitch_mix_score, null) == null ? '—' : n(player.pitch_mix_score).toFixed(0)}
          tone={n(player.pitch_mix_score, 0) >= 70 ? C.orange : C.text}
          note={clean(player.pitch_mix_note, 'batter vs this arsenal')} />
      </div>

      <div style={{ fontSize: 9, color: C.text3, marginBottom: 12, lineHeight: 1.5 }}>
        SwStr%, Whiff% and K% are the pitcher&apos;s strengths, so a big number there is bad news for
        the bat — they&apos;re shown plain rather than shaded, because putting them on the
        bright-is-good ramp would invert the meaning of every other tile in this row.
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
              { key: 'hr',     label: 'HR',     w: 38 },
              { key: 'hrRate', label: 'HR/BBE%', w: 58, dp: 1 },
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
                  { key: 'hr',     label: 'HR',     w: 34 },
                  { key: 'hrRate', label: 'HR%',    w: 44, dp: 1 },
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
                  { key: 'hr',     label: 'HR',     w: 34 },
                  { key: 'hrRate', label: 'HR%',    w: 44, dp: 1 },
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
