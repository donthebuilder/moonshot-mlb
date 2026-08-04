'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { kRiskScore, pitcherOverall } from '../lib/scoring_additions'

// SCORE AUDIT — is this number checkable, and if so does it work?
//
// The site now shows several composites that the bot doesn't publish: K Risk,
// Overall pitcher, HRW, pitch mix. Each one is a defensible blend of published
// rates, and none of that is the same as being right. This panel is the place
// that says which of them have been checked against outcomes and which haven't,
// so a score can't quietly acquire authority just by being on a board.
//
// It is deliberately self-activating. Each score declares the graded field it
// needs; if that field is absent from the archive the row reads "not auditable"
// and explains what's missing. The moment live_results_tracker.py starts
// writing the field, the row switches to a real measured breakdown with no code
// change here. That's the "track and update" part — the audit doesn't need to
// be rebuilt when the bot catches up.
//
// See BOT-DATA-REQUESTS.md §1 and §2 for the exact bot changes.

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }

// Each score: how to compute it from a slate row, and what graded field would
// prove or disprove it.
const SCORES = [
  {
    key: 'krisk',
    name: 'K Risk',
    calc: (p) => kRiskScore(p),
    needs: 'actual_k',
    outcome: (s) => { const k = num(s.actual_k); return k == null ? null : k > 0 },
    outcomeLabel: 'struck out',
    // High K Risk should mean MORE strikeouts, so the top band should have the
    // highest rate. If the bands come out flat or backwards, the score is noise.
    expect: 'up',
    why: 'Blended from the hitter’s season K rate and the pitcher’s K rate, swinging-strike and putaway rates. Nothing has ever been checked against a real strikeout.',
  },
  {
    key: 'poverall',
    name: 'Overall pitcher',
    calc: (p) => pitcherOverall(p),
    needs: 'pitcher_overall_or_slate_join',
    outcome: (s) => { const h = num(s.actual_hr); return h == null ? null : h > 0 },
    outcomeLabel: 'homered',
    expect: 'up',
    why: 'Season pitcher scores blended 70/30 with his last three starts. Attackable arms should give up more homers; if the bands are flat, they don’t.',
  },
]

function bandsFor(rows, calc, outcome) {
  const scored = rows
    .map((r) => ({ v: calc(r.slate || r.slot), hit: outcome(r.slot) }))
    .filter((x) => Number.isFinite(x.v) && x.v > 0 && x.hit !== null)
  if (scored.length < 40) return null
  scored.sort((a, b) => a.v - b.v)
  const cut = Math.floor(scored.length / 4)
  const labels = ['Bottom 25%', '25–50%', '50–75%', 'Top 25%']
  const out = []
  for (let b = 0; b < 4; b++) {
    const seg = scored.slice(b * cut, b === 3 ? scored.length : (b + 1) * cut)
    if (!seg.length) continue
    const ok = seg.filter((x) => x.hit).length
    out.push({ label: labels[b], n: seg.length, ok, pct: (100 * ok) / seg.length })
  }
  return out
}

export default function ScoreAudit({ slots = [], players = [] }) {
  // Graded slots don't carry the model inputs, so each one is joined back to
  // its slate row by player_id. That join is exact for tonight and approximate
  // for an older day — which is itself an argument for BOT-DATA-REQUESTS §2.
  const joined = useMemo(() => {
    const byId = new Map()
    players.forEach((p) => { if (p?.player_id != null) byId.set(String(p.player_id), p) })
    return slots.map((s) => ({ slot: s, slate: byId.get(String(s?.player_id)) || null }))
      .filter((r) => r.slate)
  }, [slots, players])

  const results = useMemo(() => SCORES.map((sc) => {
    const anyOutcome = slots.some((s) => sc.outcome(s) !== null)
    if (!anyOutcome) return { ...sc, state: 'missing' }
    const bands = bandsFor(joined, sc.calc, sc.outcome)
    if (!bands) return { ...sc, state: 'thin', n: joined.length }
    const lo = bands[0].pct, hi = bands[bands.length - 1].pct
    const spread = hi - lo
    const works = sc.expect === 'up' ? spread > 0 : spread < 0
    return { ...sc, state: 'measured', bands, spread, works }
  }), [joined, slots])

  if (!slots.length) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>Score audit</div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.55 }}>
        Which of the site&apos;s composite scores have actually been checked against outcomes. A score
        with no matching outcome field in the graded archive can&apos;t be validated at all, and says
        so here rather than being presented as if it had been.
      </div>

      {results.map((r) => (
        <div key={r.key} style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
          padding: '9px 12px', marginBottom: 7,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 800 }}>{r.name}</span>
            {r.state === 'missing' && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                background: '#f8717122', color: '#f87171', fontFamily: NUM_FONT,
              }}>NOT AUDITABLE</span>
            )}
            {r.state === 'thin' && (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
                too few joined rows ({r.n}) to band
              </span>
            )}
            {r.state === 'measured' && (
              <span style={{
                fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                fontFamily: NUM_FONT,
                background: r.works ? `${C.orange}22` : '#f8717122',
                color: r.works ? C.orange : '#f87171',
              }}>{r.works ? 'SEPARATES' : 'NO SIGNAL'} · {r.spread >= 0 ? '+' : ''}{r.spread.toFixed(1)} pts top vs bottom</span>
            )}
          </div>

          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 3, lineHeight: 1.55 }}>
            {r.state === 'missing'
              ? <>The archive has no <code style={{ color: C.text2 }}>{r.needs}</code> field, so there
                  is no way to tell whether this number means anything. {r.why} It stays on the boards
                  because the inputs are real and published, but treat it as a summary of the
                  model&apos;s opinion, not as a measured predictor.</>
              : r.why}
          </div>

          {r.state === 'measured' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
              {r.bands.map((b) => (
                <div key={b.label} style={{
                  flex: '1 1 90px', background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '5px 8px',
                }}>
                  <div style={{ fontSize: 8.5, color: C.text3 }}>{b.label}</div>
                  <div style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: C.orange }}>
                    {b.pct.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {b.ok}/{b.n} {r.outcomeLabel}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
