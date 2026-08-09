'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// 🧾 REPORT CARD — the accountability page (2026-08-06).
//
// Three layers, all from the published backtest file, nothing invented:
//   1. LAST NIGHT — each category graded against its OWN bar, with a letter
//      that means something: the grade is the night's rate versus the
//      category's own season baseline, so a 20% HR night grades well and a
//      55% HIT night grades badly. Categories are held to their own history,
//      not to each other.
//   2. EVERY PICK, ALL SEASON — the running record if you'd taken every
//      designated pick: own-bar clears over total, per category. No odds, no
//      units — this site doesn't do odds — just the record, stated.
//   3. TRUST CURVES — each category's nightly own-bar rate over time with a
//      5-day rolling line. The dashed vertical rule is the PICK LOCK date:
//      everything left of it was graded under the old regime where picks
//      could still change mid-game; everything right is locked ground truth.
//      When the curves shift at that line, that's honesty arriving, not the
//      bot changing.

const LOCK_DATE = '2026-08-06'   // the pick-lock commit went live this slate

const CATS = [
  { tier: 'TOP_PICKS', label: 'TOP', color: '#FCD34D', bar: 'HR', barLabel: 'homered' },
  { tier: 'HR_PICKS', label: 'HR', color: '#FB923C', bar: 'HR', barLabel: 'homered' },
  { tier: 'HIT_PICKS', label: 'HIT', color: '#60A5FA', bar: '1+ Hit', barLabel: 'got a hit' },
  { tier: 'HRR_PICKS', label: 'HRR', color: '#22d3ee', bar: '2+ HRR', barLabel: '2+ H+R+RBI' },
  { tier: 'CONTACT_PICKS', label: 'CONTACT', color: '#A78BFA', bar: '2+ TB', barLabel: '2+ total bases' },
]

// Wilson 95% interval (audit #13, 2026-08-08). The season record is a small-n
// binomial and a bare "48.1%" overstates how settled it is. Wilson over normal
// approximation because our n's are exactly where the normal one lies (small
// samples, rates far from 50%). Returns [lo, hi] in percent.
const wilson = (ok, n) => {
  if (!n) return null
  const z = 1.96, p = ok / n, z2 = z * z
  const den = 1 + z2 / n
  const mid = (p + z2 / (2 * n)) / den
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den
  return [Math.max(0, (mid - half) * 100), Math.min(100, (mid + half) * 100)]
}
const ciText = (ok, n) => {
  const ci = wilson(ok, n)
  return ci ? `${ci[0].toFixed(0)}–${ci[1].toFixed(0)}%` : null
}

// Rolling form (audit #14): pooled own-bar rate over the trailing 7 and 30
// graded days, held against the season base. Pooled counts, not an average of
// nightly rates — a 3-pick night shouldn't weigh like a 40-pick night.
const poolRate = (days) => {
  let ok = 0, n = 0
  days.forEach((d) => {
    if (d.ok != null) { ok += d.ok; n += d.n } else { ok += Math.round((d.rate / 100) * d.size); n += d.size }
  })
  return n ? { rate: (100 * ok) / n, ok, n } : null
}

const gradeOf = (rate, base) => {
  if (rate == null || !base) return { g: '—', col: C.text3 }
  const r = rate / base
  if (r >= 1.3) return { g: 'A', col: '#4ade80' }
  if (r >= 1.05) return { g: 'B', col: '#a3e635' }
  if (r >= 0.8) return { g: 'C', col: '#FCD34D' }
  if (r >= 0.5) return { g: 'D', col: C.orange }
  return { g: 'F', col: '#f87171' }
}

function Spark({ days, cat, lockX }) {
  // nightly own-bar rate dots + 5-day rolling line, 0–100 scale
  const W = 260, H = 64, PAD = 4
  const pts = days.map((d, i) => ({
    x: PAD + (i * (W - 2 * PAD)) / Math.max(1, days.length - 1),
    y: d.rate == null ? null : H - PAD - ((H - 2 * PAD) * Math.min(100, d.rate)) / 100,
    rate: d.rate, date: d.date, n: d.n,
  }))
  const roll = pts.map((p, i) => {
    const win = pts.slice(Math.max(0, i - 4), i + 1).filter((x) => x.y != null)
    if (!win.length) return null
    return { x: p.x, y: win.reduce((a, x) => a + x.y, 0) / win.length }
  }).filter(Boolean)
  const path = roll.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const lockIdx = days.findIndex((d) => d.date >= LOCK_DATE)
  const lx = lockIdx >= 0 ? pts[lockIdx]?.x : null
  return (
    <svg className="rc-spark" width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <line x1={PAD} x2={W - PAD} y1={H - PAD - (H - 2 * PAD) * 0.5} y2={H - PAD - (H - 2 * PAD) * 0.5}
        stroke="rgba(255,255,255,.07)" strokeWidth="1" />
      {lx != null && (
        <line x1={lx} x2={lx} y1={2} y2={H - 2} stroke="rgba(74,222,128,.55)" strokeWidth="1" strokeDasharray="3 3">
          <title>pick lock — everything right of this line is locked ground truth</title>
        </line>
      )}
      {path && <path d={path} fill="none" stroke={cat.color} strokeWidth="1.6" opacity="0.9" />}
      {pts.map((p, i) => p.y != null && (
        <circle key={i} cx={p.x} cy={p.y} r="2"
          fill={days[i].date >= LOCK_DATE ? cat.color : `${cat.color}55`}>
          <title>{p.date}: {p.rate.toFixed(0)}%{p.n ? ` (n=${p.n})` : ''}</title>
        </circle>
      ))}
    </svg>
  )
}

export default function ReportCard({ backtest }) {
  const model = useMemo(() => {
    const per = backtest?.per_day
    if (!per) return null
    const dates = Object.keys(per).sort()
    const today = new Date().toLocaleDateString('en-CA')
    // last COMPLETE night: strictly before today, with a real pool
    const lastDate = [...dates].reverse().find((d) => d < today
      && Object.values(per[d]?.tiers || {}).some((t) => (t?.pool_size || 0) >= 6)) || null

    const rows = CATS.map((cat) => {
      const days = dates.map((d) => {
        const t = per[d]?.tiers?.[cat.tier]
        const rate = t?.metrics?.[cat.bar]
        const counts = t?.metric_counts?.[cat.bar]
        return {
          date: d,
          rate: rate == null ? null : Number(rate),
          n: counts ? counts[1] : (t?.pool_size ?? null),
          ok: counts ? counts[0] : null,
          size: t?.pool_size ?? 0,
        }
      }).filter((d) => d.rate != null && d.size > 0)
      // season record, own bar: exact counts where published, reconstructed
      // from (rate × pool) where the older file format only carried rates
      let ok = 0, n = 0, approx = false
      days.forEach((d) => {
        if (d.ok != null) { ok += d.ok; n += d.n } else { ok += Math.round((d.rate / 100) * d.size); n += d.size; approx = true }
      })
      const base = n ? (100 * ok) / n : null
      const last = lastDate ? days.find((d) => d.date === lastDate) : null
      // since the pick lock — the record that can't have been flattered
      let lockOk = 0, lockN = 0
      days.filter((d) => d.date >= LOCK_DATE).forEach((d) => {
        if (d.ok != null) { lockOk += d.ok; lockN += d.n } else { lockOk += Math.round((d.rate / 100) * d.size); lockN += d.size }
      })
      // trailing form windows by graded-day count (calendar gaps don't matter
      // — an off-day slate teaches nothing)
      const form7 = poolRate(days.slice(-7))
      const form30 = poolRate(days.slice(-30))
      return { cat, days, ok, n, approx, base, last, lockOk, lockN, form7, form30, grade: gradeOf(last?.rate, base) }
    })
    return { rows, lastDate, dates }
  }, [backtest])

  if (!model) return null
  const anyApprox = model.rows.some((r) => r.approx)
  const seasonOk = model.rows.reduce((a, r) => a + r.ok, 0)
  const seasonN = model.rows.reduce((a, r) => a + r.n, 0)
  const lockOk = model.rows.reduce((a, r) => a + r.lockOk, 0)
  const lockN = model.rows.reduce((a, r) => a + r.lockN, 0)
  const seasonPct = seasonN ? (100 * seasonOk) / seasonN : null
  const lockPct = lockN ? (100 * lockOk) / lockN : null
  const lockNights = model.dates.filter((d) => d >= LOCK_DATE).length

  // TURNED UP 2026-08-09 (owner likes this block — "make the two headline
  // records more prominent"). Same two numbers, same CIs, same honesty; they
  // just stop looking like a caption. Each record is now its own card with the
  // count at display size, and the since-lock card carries the ember/green
  // accent because it's the one being built in public.
  const Record = ({ kicker, kickerCol, value, pctVal, ci, ciTitle, foot, accent }) => (
    <div style={{
      flex: '1 1 220px', minWidth: 0,
      background: accent
        ? `linear-gradient(150deg, rgba(74,222,128,.10), rgba(74,222,128,.02))`
        : `linear-gradient(150deg, rgba(255,255,255,.05), rgba(255,255,255,.012))`,
      border: `1px solid ${accent ? 'rgba(74,222,128,.34)' : C.border}`,
      boxShadow: accent ? '0 0 22px rgba(74,222,128,.07) inset' : 'none',
      borderRadius: 13, padding: '12px 16px',
    }}>
      <div style={{
        fontSize: 9, color: kickerCol, textTransform: 'uppercase',
        letterSpacing: '.11em', fontWeight: 900, marginBottom: 3,
      }}>{kicker}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: NUM_FONT, fontSize: 34, fontWeight: 900,
          lineHeight: 1.05, letterSpacing: '-.03em',
          color: value === 'building…' ? C.text3 : C.text,
        }}>{value}</span>
        {pctVal != null && (
          <span style={{
            fontFamily: NUM_FONT, fontSize: 19, fontWeight: 900,
            color: pctVal >= 45 ? '#4ade80' : C.orange,
          }}>{pctVal.toFixed(1)}%</span>
        )}
      </div>
      {ci && (
        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 4 }} title={ciTitle}>
          95% CI {ci}
        </div>
      )}
      {foot && <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>{foot}</div>}
    </div>
  )

  return (
    <div>
      {/* THE HEADLINE RECORD — season, and the part that can't be flattered */}
      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.05))`,
        border: `1px solid ${C.border}`, borderRadius: 14, padding: '12px 13px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Record
            kicker="Season, every pick"
            kickerCol={C.text3}
            value={seasonN ? `${seasonOk}/${seasonN}` : '—'}
            pctVal={seasonPct}
            ci={seasonN > 0 ? ciText(seasonOk, seasonN) : null}
            ciTitle="95% Wilson interval — where the true rate plausibly lives given this sample size"
            foot={`every graded night on file · ${model.dates.length} days`}
          />
          <Record
            kicker="✅ Since the lock"
            kickerCol="#4ade80"
            value={lockN ? `${lockOk}/${lockN}` : 'building…'}
            pctVal={lockPct}
            ci={lockN > 0 ? ciText(lockOk, lockN) : null}
            ciTitle="95% Wilson interval — wide while the locked sample is young, and it should be"
            foot={lockN ? `${lockNights} locked night${lockNights === 1 ? '' : 's'} since ${LOCK_DATE}` : `locking since ${LOCK_DATE}`}
            accent
          />
        </div>
        <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}` }}>
          The <b style={{ color: '#4ade80' }}>since-lock</b> number is the one that matters going forward:
          every pick in it froze at first pitch and could never be revised. It starts small and grows
          nightly — that&apos;s the record being built in public. The intervals are there because a
          headline rate on a young sample is a guess wearing a decimal point.
        </div>
      </div>
      {/* ── 1. last night ── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>🧾 Report card</span>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {model.lastDate ? `last complete night: ${model.lastDate}` : 'no complete night graded yet'}
        </span>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 10, lineHeight: 1.5 }}>
        Each category graded against its OWN bar and its OWN season baseline — a 20% HR night can be an A
        while a 55% HIT night is a D. The letter is the night ÷ the baseline, not a feeling.
      </div>
      {model.lastDate && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {model.rows.map(({ cat, last, base, grade }) => (
            <div key={cat.tier} style={{
              background: `linear-gradient(155deg, ${cat.color}10, ${cat.color}03)`,
              border: `1px solid ${cat.color}35`, borderRadius: 11, padding: '9px 12px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: cat.color, fontFamily: NUM_FONT, letterSpacing: '.08em' }}>{cat.label}</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: grade.col, fontFamily: NUM_FONT, lineHeight: 1.15 }}>{grade.g}</div>
              <div style={{ fontSize: 10, color: C.text2, fontFamily: NUM_FONT }}>
                {last ? `${last.rate.toFixed(0)}% ${cat.barLabel}` : 'no picks'}
              </div>
              <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
                {last?.ok != null ? `${last.ok}/${last.n} · ` : last?.n ? `n=${last.n} · ` : ''}baseline {base?.toFixed(0)}%
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 2. every pick, all season ── */}
      <div style={{ fontSize: 11.5, fontWeight: 900, marginBottom: 2 }}>Every pick, all season</div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        If you had taken every designated pick at its own bar — the record, no odds, no units.
        {anyApprox && ' Days from the older file format published rates without counts; those days are reconstructed as rate × pool and marked ≈.'}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
        {model.rows.map(({ cat, ok, n, approx, base }) => (
          <div key={cat.tier} style={{ display: 'flex', gap: 7, alignItems: 'baseline' }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: cat.color, fontFamily: NUM_FONT }}>{cat.label}</span>
            <span style={{ fontSize: 13, fontWeight: 900, fontFamily: NUM_FONT, color: C.text }}>
              {approx ? '≈' : ''}{ok}/{n}
            </span>
            <span style={{ fontSize: 10, color: base >= 50 ? '#4ade80' : base >= 30 ? '#FCD34D' : C.text3, fontFamily: NUM_FONT }}>
              {base?.toFixed(1)}%
            </span>
            {n > 0 && (
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }} title="95% Wilson interval">
                ({ciText(ok, n)})
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ── model form: trailing 7 / 30 graded days (audit #14) ── */}
      <div style={{ fontSize: 11.5, fontWeight: 900, marginBottom: 2 }}>Model form</div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        Pooled own-bar rate over the last 7 and 30 graded days vs the season base — is the model
        running hot, cold, or itself right now. Pooled counts, not averaged nights, so big slates
        weigh what they should.
      </div>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {model.rows.map(({ cat, base, form7, form30 }) => {
          const d7 = form7 && base != null ? form7.rate - base : null
          const arrow = (d) => d == null ? '' : d >= 3 ? ' ▲' : d <= -3 ? ' ▼' : ' ·'
          const colOf = (d) => d == null ? C.text3 : d >= 3 ? '#4ade80' : d <= -3 ? '#f87171' : C.text2
          return (
            <div key={cat.tier} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${cat.color}`, borderRadius: 9, padding: '7px 11px' }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: cat.color, fontFamily: NUM_FONT, letterSpacing: '.06em' }}>{cat.label}</div>
              <div style={{ fontSize: 10.5, fontFamily: NUM_FONT, marginTop: 3, color: colOf(d7) }}>
                7d {form7 ? `${form7.rate.toFixed(0)}% (${form7.ok}/${form7.n})` : '—'}{arrow(d7)}
              </div>
              <div style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.text3, marginTop: 1 }}>
                30d {form30 ? `${form30.rate.toFixed(0)}%` : '—'} · season {base?.toFixed(0)}%
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 3. trust curves ── */}
      <div style={{ fontSize: 11.5, fontWeight: 900, marginBottom: 2 }}>Trust curves</div>
      <div style={{ fontSize: 9.5, color: C.text3, marginBottom: 8, lineHeight: 1.5 }}>
        Nightly own-bar rate (dots) with a 5-day rolling line. The <span style={{ color: '#4ade80' }}>dashed
        green rule</span> is the pick lock ({LOCK_DATE}): left of it, picks could still change mid-game and
        graded rates ran slightly flattered; right of it is locked ground truth. Dim dots = pre-lock.
      </div>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {model.rows.map(({ cat, days }) => (
          <div key={cat.tier} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px' }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: cat.color, fontFamily: NUM_FONT }}>{cat.label}</span>
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{cat.bar} · {days.length} nights</span>
            </div>
            <Spark days={days} cat={cat} />
          </div>
        ))}
      </div>
    </div>
  )
}
