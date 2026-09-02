'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n as num } from '../lib/player'

// 🎮 GAME SIMULATOR (2026-08-24)
//
// Donovan: "simulate what the player will do in the game. pitcher batter team
// totals and score pitchers pitches all that fun stuff simple though nothing
// heavy." He showed a third-party tool's pitcher card (FD/DK points, a
// BF/Inn/R/H/K/BB table with a probability-by-count breakdown, a bar chart of
// the likeliest strikeout bucket) as a TONE reference, not a template to copy.
//
// NO NEW BACKEND. Every number below is built client-side from fields already
// published on the slate/detail payloads this app already fetches — the same
// pitcher_* and season_* fields MatchupPitcher, PitcherModal and
// ProjectedOutput already read (see lib/projection.js's own derivation for the
// batter formulas this mirrors). Nothing here calls out to a stats API or a
// new JSON file.
//
// WHAT'S PUBLISHED VS PROXIED —
//   pitcher_era, pitcher_whip, pitcher_k9, pitcher_bb9, pitcher_hr9  — real,
//     season rates, on every pitcher row.
//   expected innings per start                                       — NOT
//     published anywhere in the payload (no pitcher_ip / pitcher_gs / batters-
//     faced-per-start field exists on the slate). Proxied with a fixed 5.2 IP,
//     the actual 2024-2025 MLB average start length — stated here, not tuned,
//     and called out in the UI caption rather than presented as a real rate.
//   season_avg, season_iso, season_pa, season_hr, season_bb_rate     — real,
//     the exact fields lib/projection.js already builds the site's own
//     Projected Output panel from.
//   plate appearances per game for one lineup spot                   — NOT
//     published per-hitter. Proxied at 4.3 PA/game, the long-run MLB average
//     for a everyday lineup spot (~76 team PA / 9 hitters ≈ 8.4 is the TEAM's
//     count across a full lineup cycling more than once; 4.3 is the
//     per-hitter, per-game figure that number is built from). Stated in the UI.
//
// THE MATH, CLOSED-FORM (no Monte Carlo — this runs on every card render):
//
//   PITCHER, given expIP = 5.2:
//     expK  = (pitcher_k9  / 9) * expIP
//     expBB = (pitcher_bb9 / 9) * expIP
//     expHR = (pitcher_hr9 / 9) * expIP
//     expER = (pitcher_era / 9) * expIP                    (runs, earned)
//     expH  = max(0, pitcher_whip * expIP - expBB)          WHIP = (H+BB)/IP
//     expPitches = expIP * 15                               (~15 pitches/IP,
//                                                             the standard
//                                                             rule-of-thumb
//                                                             pace)
//     K distribution: Poisson(λ = expK), bucketed 0,1,2,…,9,10+ — the
//     textbook closed-form model for a bounded count of independent-ish
//     events over a fixed exposure (batters faced), and exactly what a bar
//     chart of "likeliest K total" needs.
//
//   FANTASY POINTS (simplified, standard DK/FD MLB pitcher scoring — the
//   count/rate terms only; win, CG, no-hitter bonuses need a simulated GAME
//   result this panel doesn't attempt, so they're left out rather than
//   guessed at):
//     DK ≈ expIP*3*2.25 + expK*2 - expER*2 - expH*0.6 - expBB*0.6
//          (2.25 pts/out = 6.75/IP, 2/K, -2/ER, -0.6/H, -0.6/BB)
//     FD ≈ expIP*3 + expK*3 - expER*3 - expH*0.6 - expBB*0.6
//          (3 pts/out actually 1/out = 3/IP; FD counts 3/K, -3/ER)
//
//   BATTER, given expPA = 4.3:
//     expAB = expPA * (1 - season_bb_rate)                 AB/PA = 1 - BB%
//     expH  = season_avg * expAB
//     expTB = (season_avg + season_iso) * expAB             SLG = AVG + ISO
//     expHR = (season_hr / season_pa) * expPA               HR/PA, already a
//                                                             rate, applied
//                                                             directly to PA
//     Hit-count distribution: Binomial(n = round(expAB), p = season_avg),
//     bucketed 0 / 1 / 2+ hits — the standard closed-form model for "how many
//     of n independent trials at rate p succeed," which is exactly what a
//     hit total is once AB and AVG are taken as given.
//
// Both distributions are genuinely closed-form (no simulation loop): the
// Poisson PMF and the Binomial PMF are evaluated directly at each bucket.

const poissonPmf = (lambda, k) => {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 2; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

const binomPmf = (nTrials, p, k) => {
  if (nTrials <= 0) return k === 0 ? 1 : 0
  const pp = Math.min(1, Math.max(0, p))
  let logC = 0
  for (let i = 0; i < k; i++) logC += Math.log((nTrials - i) / (i + 1))
  const logP = logC + k * Math.log(pp || 1e-9) + (nTrials - k) * Math.log((1 - pp) || 1e-9)
  return Math.exp(logP)
}

// Fixed proxies, named up top so anyone reading the code sees the assumption
// once rather than as a magic number three functions deep.
const AVG_START_IP = 5.2      // MLB average innings per start, not published per-pitcher
const AVG_PA_GAME = 4.3       // MLB average plate appearances per game, one lineup spot
const PITCHES_PER_IP = 15     // standard pace rule-of-thumb

// A bar's LENGTH is its share of the likeliest bucket — that is what makes the
// shape of the distribution readable at this size. The NUMBER printed beside it
// is the real probability of that bucket. Those are two different quantities and
// they were the same number until 2026-09-02, which made the column of numbers
// carry % signs while summing to ~240%. Length and label are now separate props
// so the chart can stay shaped by the max and still read true.
const pctLabel = (p) => {
  if (!(p > 0)) return '0%'
  if (p < 0.005) return '<1%'
  return `${(p * 100).toFixed(0)}%`
}

function Bar({ label, p, width, color, big }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 30, fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: big ? 14 : 10, background: C.bg3, borderRadius: 5, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.max(0, Math.min(100, width))}%`, height: '100%',
          background: color, borderRadius: 5, transition: 'width .2s',
        }} />
      </div>
      <span style={{ width: 34, fontSize: 9.5, color: C.text2, fontFamily: NUM_FONT }}>{pctLabel(p)}</span>
    </div>
  )
}

function Stat({ label, value, sub }) {
  return (
    <div style={{
      minWidth: 62, padding: '6px 10px', background: C.bg3,
      border: `1px solid ${C.border}`, borderRadius: 9,
    }}>
      <div style={{ fontSize: 7.5, fontWeight: 800, letterSpacing: '.08em', color: C.text3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 900, color: C.text, fontFamily: NUM_FONT }}>{value}</div>
      {sub && <div style={{ fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
    </div>
  )
}

const Caption = ({ children }) => (
  <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.55, marginTop: 8, maxWidth: 620 }}>{children}</div>
)

/**
 * PitcherSim — one starter's simple projected line, fantasy points, and a
 * strikeout-total bar chart. `getStat(key)` resolves a `pitcher_*` field the
 * same way PitcherModal's own `src()` already does (first non-empty value
 * across the opposing lineup rows) — pass that resolver in so this never
 * needs its own fetch or its own fallback chain.
 */
export function PitcherSim({ getStat, name }) {
  const era = num(getStat('pitcher_era'), null)
  const whip = num(getStat('pitcher_whip'), null)
  const k9 = num(getStat('pitcher_k9'), null)
  const bb9 = num(getStat('pitcher_bb9'), null)
  const hr9 = num(getStat('pitcher_hr9'), null)

  if (era == null && whip == null && k9 == null) {
    return <div style={{ fontSize: 11, color: C.text3 }}>No published rate stats for {name || 'this pitcher'} to simulate from yet.</div>
  }

  const ip = AVG_START_IP
  const expK = k9 != null ? (k9 / 9) * ip : 0
  const expBB = bb9 != null ? (bb9 / 9) * ip : 0
  const expHR = hr9 != null ? (hr9 / 9) * ip : 0
  const expER = era != null ? (era / 9) * ip : 0
  const expH = whip != null ? Math.max(0, whip * ip - expBB) : 0
  const pitches = Math.round(ip * PITCHES_PER_IP)

  const dk = ip * 3 * 2.25 + expK * 2 - expER * 2 - expH * 0.6 - expBB * 0.6
  const fd = ip * 3 + expK * 3 - expER * 3 - expH * 0.6 - expBB * 0.6

  // K distribution: Poisson(expK), bucketed 0..9, 10+.
  const buckets = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const pmf = buckets.map((kk) => poissonPmf(expK, kk))
  const pTail = Math.max(0, 1 - pmf.reduce((a, b) => a + b, 0))
  const dist = [...buckets.map((kk, i) => ({ label: String(kk), p: pmf[i] })), { label: '10+', p: pTail }]
  const maxP = Math.max(...dist.map((d) => d.p), 0.001)

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
        🎮 Game sim — {name || 'starter'} <span style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>· projected start</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="IP" value={ip.toFixed(1)} sub="proxied pace" />
        <Stat label="K" value={expK.toFixed(1)} />
        <Stat label="BB" value={expBB.toFixed(1)} />
        <Stat label="H" value={expH.toFixed(1)} />
        <Stat label="ER" value={expER.toFixed(1)} />
        <Stat label="HR" value={expHR.toFixed(2)} />
        <Stat label="Pitches" value={pitches} sub="~15/IP" />
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{
          flex: 1, padding: '8px 12px', borderRadius: 10,
          background: 'rgba(74,222,128,.08)', border: '1px solid rgba(74,222,128,.28)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 800, color: C.green, letterSpacing: '.06em' }}>DK POINTS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: NUM_FONT }}>{dk.toFixed(1)}</div>
        </div>
        <div style={{
          flex: 1, padding: '8px 12px', borderRadius: 10,
          background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.28)',
        }}>
          <div style={{ fontSize: 8, fontWeight: 800, color: C.blue, letterSpacing: '.06em' }}>FD POINTS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: NUM_FONT }}>{fd.toFixed(1)}</div>
        </div>
      </div>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.text3, letterSpacing: '.06em', marginBottom: 6 }}>
        STRIKEOUT TOTAL — CHANCE OF EACH
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {dist.map((d) => (
          <Bar key={d.label} label={d.label} p={d.p} width={(d.p / maxP) * 100} color={C.purple} big={d.p === maxP} />
        ))}
      </div>
      <Caption>
        Bars are Poisson(λ={expK.toFixed(2)}). The percentage beside each row is that K-total&apos;s real
        probability — the column adds to 100%. Bar LENGTH is that bucket&apos;s share of the likeliest one, so
        the shape stays readable when the top bucket is only a quarter of the field. Innings pace (5.2) and pitches/inning (~15) are league-average proxies —
        this site doesn&apos;t publish a real per-start IP pace. ER, H and BB come straight from his published
        ERA/WHIP/BB9; DK and FD points are the count/rate terms only (no win, CG, or no-hitter bonus, which need
        a simulated game result this panel doesn&apos;t attempt). Entertainment only, not a betting projection.
      </Caption>
    </div>
  )
}

/**
 * BatterSim — one hitter's simple projected line and a hit-count bar chart,
 * built the same way lib/projection.js already derives the site's Projected
 * Output panel: AB/PA from his own walk rate, hits/TB from AVG and ISO, HR
 * straight from his season HR-per-PA rate.
 */
export function BatterSim({ player, name }) {
  const p = player || {}
  const avg = num(p.season_avg, null)
  const iso = num(p.season_iso, 0)
  const seasonPa = num(p.season_pa, 0)
  const seasonHr = num(p.season_hr, 0)
  const bbRate = num(p.season_bb_rate, 0.08)

  if (avg == null) {
    return <div style={{ fontSize: 11, color: C.text3 }}>No published season line for {name || 'this batter'} to simulate from yet.</div>
  }

  const pa = AVG_PA_GAME
  const ab = pa * (1 - Math.min(0.6, Math.max(0, bbRate)))
  const expH = avg * ab
  const expTB = (avg + iso) * ab
  const expHR = seasonPa > 0 ? (seasonHr / seasonPa) * pa : 0

  // Hit-count distribution: Binomial(n = round(AB), p = AVG), 0 / 1 / 2+.
  const nAb = Math.max(1, Math.round(ab))
  const p0 = binomPmf(nAb, avg, 0)
  const p1 = binomPmf(nAb, avg, 1)
  const p2plus = Math.max(0, 1 - p0 - p1)
  const dist = [
    { label: '0', p: p0 },
    { label: '1', p: p1 },
    { label: '2+', p: p2plus },
  ]
  const maxP = Math.max(...dist.map((d) => d.p), 0.001)

  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 6 }}>
        🎮 Game sim — {name || 'batter'} <span style={{ fontSize: 10, color: C.text3, fontWeight: 600 }}>· projected game</span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <Stat label="PA" value={pa.toFixed(1)} sub="proxied pace" />
        <Stat label="AB" value={ab.toFixed(1)} />
        <Stat label="H" value={expH.toFixed(2)} />
        <Stat label="TB" value={expTB.toFixed(2)} />
        <Stat label="HR" value={expHR.toFixed(3)} />
      </div>
      <div style={{ fontSize: 9, fontWeight: 800, color: C.text3, letterSpacing: '.06em', marginBottom: 6 }}>
        HITS TONIGHT — CHANCE OF EACH
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {dist.map((d) => (
          <Bar key={d.label} label={d.label} p={d.p} width={(d.p / maxP) * 100} color={C.orange} big={d.p === maxP} />
        ))}
      </div>
      <Caption>
        Built from his own season line — AVG {avg.toFixed(3)}, ISO {iso.toFixed(3)}, walk rate{' '}
        {(bbRate * 100).toFixed(1)}% — the same fields the Projected Output panel already uses. PA/game (4.3)
        is a league-average proxy: this site doesn&apos;t publish a real per-hitter PA pace. Hit buckets are
        Binomial(n≈{nAb}, p={avg.toFixed(3)}). The percentage beside each row is that bucket&apos;s real
        probability and the three add to 100%; bar length is its share of the likeliest bucket.
        Entertainment only, not a betting projection.
      </Caption>
    </div>
  )
}
