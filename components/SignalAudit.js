'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { usePickRecords } from './PlayerPickRecord'
import { dedupeGraded } from '../lib/graded'

// 🔬 SIGNAL AUDIT — the honesty machine, turned on ourselves (2026-08-08,
// wishlist #1). The site wears a lot of decorations: ⭐ 🎯 🧩 🔁 ⚠️ 👻 🔒
// bands and tags. This page grades EVERY displayed flag against what
// actually happened, across every graded day on the branch — the same
// treatment the picks get. A flag that can't beat its own baseline for
// long enough gets demoted on sight here before it ever gets removed.
//
// Method, stated so nobody has to trust us: for each signal, the baseline
// is the HR rate of slots WHERE THAT FIELD EXISTS in the archive (older
// days didn't carry every flag — comparing a new flag against old days'
// baseline would be a thumb on the scale). Lift = flagged rate − baseline.
// Verdicts are sample-gated: nothing gets a ✅ or a ❌ under 40 flagged
// slots; it gets a 🧪 and patience.

const SIGNALS = [
  { key: 'weak', icon: '⭐', label: 'Weak pitcher spot',
    has: (s) => 'weak_spot_flag' in s, hit: (s) => s.weak_spot_flag === true },
  { key: 'pitch', icon: '🎯', label: 'Pitch-type match',
    has: (s) => 'pitch_type_match_flag' in s, hit: (s) => !!s.pitch_type_match_flag },
  { key: 'aligned', icon: '🧩', label: 'Aligned (tag)',
    has: (s) => Array.isArray(s.top_board_tags), hit: (s) => (s.top_board_tags || []).some((t) => String(t).includes('🧩')) },
  { key: 'b2b', icon: '🔁', label: 'Back-to-back watch',
    has: (s) => 'games_since_last_hr' in s, hit: (s) => Number(s.games_since_last_hr) === 0 },
  { key: 'hrw70', icon: '🚀', label: 'HRW 70+',
    has: (s) => Number(s.hrw_score) > 0, hit: (s) => Number(s.hrw_score) >= 70 },
  { key: 'hiconf', icon: '🔒', label: 'High confidence flag',
    has: (s) => 'high_confidence_hr_flag' in s, hit: (s) => s.high_confidence_hr_flag === true },
  { key: 'ghost', icon: '👻', label: 'Hidden value',
    has: (s) => 'hidden_hr_value' in s, hit: (s) => !!s.hidden_hr_value },
  { key: 'trap', icon: '⚠️', label: 'Trap flag (expects LESS)',
    has: (s) => 'trap_flag' in s, hit: (s) => !!s.trap_flag, invert: true },
  { key: 'alt', icon: '🔄', label: 'Alt look tag',
    has: (s) => 'alt_look_tag' in s, hit: (s) => !!String(s.alt_look_tag || '').trim() },
]

const MIN_N = 40

export default function SignalAudit({ backtest }) {
  const { days, state } = usePickRecords(backtest)

  const { rows, topBeat, daysN, totalN } = useMemo(() => {
    // DEDUPED PER DAY (lib/graded.js). Every signal below is a SLATE-ROW flag
    // — weak_spot_flag, hrw_score, games_since_last_hr — so it is identical on
    // both graded rows of a hitter designated in two categories. Walking the
    // raw slots counted that hitter, his flag and his outcome TWICE inside one
    // night, which double-weights exactly the players the bot likes most: the
    // multi-category picks. That biases every lift on this page, and this page
    // exists to be the honest one. Deduping is per day, never across days — the
    // same hitter flagged on Tuesday and on Friday is genuinely two data points.
    const slots = []
    days.forEach(({ json }) => {
      dedupeGraded(json).forEach((s) => { if (s && s.actual_ab != null) slots.push(s) })
    })
    const judgeable = slots.filter((s) => Number(s.actual_ab) > 0)
    const hrOf = (xs) => xs.length ? xs.filter((s) => Number(s.actual_hr) > 0).length / xs.length : 0

    const rows2 = SIGNALS.map((sig) => {
      const pool = judgeable.filter(sig.has)
      if (!pool.length) return { ...sig, n: 0 }
      const flagged = pool.filter(sig.hit)
      const base = hrOf(pool)
      const rate = hrOf(flagged)
      const lift = (rate - base) * 100 * (sig.invert ? -1 : 1)
      const verdict = flagged.length < MIN_N ? 'young'
        : lift >= 3 ? 'earning'
        : lift <= -3 ? 'failing'
        : 'flat'
      return { ...sig, n: flagged.length, poolN: pool.length, base, rate, lift, verdict }
    }).filter((r) => r.n > 0 || r.poolN)

    // TOP graded as its own claim: beat-his-game (field flows from the
    // tracker starting 2026-08-08; earlier days simply don't carry it)
    const tops = judgeable.filter((s) => 'top_beat_game' in s)
    const topBeat2 = tops.length
      ? { n: tops.length, ok: tops.filter((s) => Number(s.top_beat_game) === 1).length }
      : null

    return { rows: rows2, topBeat: topBeat2, daysN: days.length, totalN: judgeable.length }
  }, [days])

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '12px 0' }}>Auditing the archive…</div>
  if (!rows.length) return <div style={{ fontSize: 11, color: C.text3, padding: '12px 0' }}>No graded days on the branch yet — the audit starts when grading does.</div>

  const V = {
    earning: { word: 'EARNING ITS PLACE', col: '#4ade80' },
    flat:    { word: 'FLAT — ON WATCH', col: '#FCD34D' },
    failing: { word: 'FAILING ITS CLAIM', col: '#f87171' },
    young:   { word: 'SAMPLE TOO YOUNG', col: '#71717a' },
  }

  return (
    <div>
      <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65, marginBottom: 12, maxWidth: 760 }}>
        Every flag the site displays, graded like a pick: HR rate when the flag was on vs the baseline
        of every judgeable slot that COULD have worn it, across <b style={{ fontFamily: NUM_FONT }}>{daysN}</b> graded
        day{daysN !== 1 ? 's' : ''} ({totalN.toLocaleString()} slots). A decoration that can&apos;t beat its
        baseline gets called out here first and removed second — the same rule the picks live under.
        Nothing gets a verdict below {MIN_N} flagged slots.
      </div>

      {topBeat && (
        <div style={{
          background: 'linear-gradient(155deg, rgba(252,211,77,.1), rgba(252,211,77,.02))',
          border: '1px solid rgba(252,211,77,.35)', borderRadius: 10, padding: '9px 13px', marginBottom: 12,
        }}>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#FCD34D' }}>🥇 TOP, graded as its own claim: </span>
          <span style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT }}>
            beat his game on total bases <b style={{ color: C.text }}>{topBeat.ok}/{topBeat.n}</b>
            {' '}({topBeat.n ? ((100 * topBeat.ok) / topBeat.n).toFixed(0) : 0}%)
          </span>
          <span style={{ fontSize: 9.5, color: C.text3 }}> — the designation says &quot;best play in his game&quot;, so this grades exactly that (ties with the game lead count). Tracked from Aug 8 on.</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.sort((a, b) => (b.lift ?? -99) - (a.lift ?? -99)).map((r) => {
          const v = V[r.verdict] || V.young
          return (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${v.col}`,
              borderRadius: 9, padding: '8px 13px',
            }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{r.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, minWidth: 150 }}>{r.label}</span>
              <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text2 }}>
                {(r.rate * 100).toFixed(1)}% vs {(r.base * 100).toFixed(1)}% base
                {' '}· <b style={{ color: r.lift >= 0 ? '#4ade80' : '#f87171' }}>{r.lift >= 0 ? '+' : ''}{r.lift.toFixed(1)}pts</b>
                {r.invert ? ' (inverted — this flag claims LESS)' : ''}
              </span>
              <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.text3 }}>n={r.n} of {r.poolN}</span>
              <span style={{
                marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '.08em',
                fontFamily: NUM_FONT, color: v.col, border: `1px solid ${v.col}55`,
                borderRadius: 999, padding: '2px 9px', flexShrink: 0,
              }}>{v.word}</span>
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 10, lineHeight: 1.6, maxWidth: 760 }}>
        Newer flags (🎯 pitch match, 🔁 B2B, 🔒, 👻) only carry data from the day the tracker started
        archiving them — their pools grow nightly. HR is the yardstick for every row because these are
        power decorations; a flag that helps hits but not homers will read flat here and that&apos;s a
        correct reading of its claim.
      </div>
    </div>
  )
}
