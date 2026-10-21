// GROWTH ON /admin (2026-10-21, claude/BATCH-GROWTH-PLAN-2026-10-21.txt). Server component, render only: the rows lib/growth/snapshot.js writes.
// Big numbers with the change from last week under each, then the CUT OR REWORK list (the replace rule: under 100 median views, 3+ posts in
// 14 days), then every post type (a few rows, the rest folded), then the weekly trend. Phone first: the tables scroll inside their own box.
import { cutList, verdictOf, CUT_VIEWS, CUT_MIN_POSTS, WINDOW_DAYS } from '../../lib/growth/snapshot'
import { C } from '../../lib/theme'

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const delta = (now, then, unit = '') => {
  if (now == null || then == null) return 'first week'
  const d = +(now - then).toFixed(2)
  return d === 0 ? 'same as last week' : `${d > 0 ? '+' : ''}${d.toLocaleString('en-US')}${unit} vs last week`
}
const VERDICT = { cut: 'CUT OR REWORK', earning: 'EARNING', few: 'TOO FEW', outside: 'OUTSIDE THE RULE' }

function Big({ k, v, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <strong style={{ fontSize: 28, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{v}</strong>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{k}</span>
      <small style={{ fontSize: 12, color: 'var(--dim)' }}>{sub}</small>
    </div>
  )
}
const Tag = ({ v }) => (
  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, padding: '1px 5px', border: `1px solid ${v === 'cut' ? C.orange : 'var(--line)'}`, color: v === 'cut' ? C.orange : 'var(--dim)', whiteSpace: 'nowrap' }}>{VERDICT[v]}</span>
)
function TypeRows({ list }) {
  return list.map((t) => (
    <tr key={t.type} style={{ borderTop: '1px solid var(--line)' }}>
      <td style={{ padding: '6px 8px 6px 0', fontSize: 13, whiteSpace: 'nowrap' }}>{t.type}</td>
      <td style={{ padding: 6, fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{t.posts}</td>
      <td style={{ padding: 6, fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmt(t.median)}</td>
      <td style={{ padding: '6px 0 6px 6px' }}><Tag v={verdictOf(t)} /></td>
    </tr>
  ))
}
const Head = () => (
  <thead><tr style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'left' }}><th style={{ paddingRight: 8 }}>TYPE</th><th style={{ padding: 6, textAlign: 'right' }}>POSTS</th><th style={{ padding: 6, textAlign: 'right' }}>MEDIAN VIEWS</th><th /></tr></thead>
)

export default function GrowthPanel({ rows = [] }) {
  const [now, prev] = rows
  const kicker = { fontSize: 12, fontWeight: 800, letterSpacing: 2, marginTop: 18 }
  if (!now) {
    return (
      <div>
        <h2 id="growth" style={kicker}>GROWTH</h2>
        <p style={{ fontSize: 14 }}>No snapshot yet. The first one is taken from 6 AM Phoenix after the push (needs supabase/migrations/202610211200_growth_snapshots.sql).</p>
      </div>
    )
  }
  const d = now.data || {}, p = prev?.data || {}
  const s = d.site || {}, ps = p.site || {}
  const types = d.types || []
  const cuts = cutList(types)
  const rest = types.filter((t) => verdictOf(t) !== 'cut')
  return (
    <div>
      <h2 id="growth" style={kicker}>GROWTH · WEEK OF {now.week}</h2>
      <small style={{ fontSize: 12, color: 'var(--dim)' }}>taken {d.takenAt ? new Date(d.takenAt).toLocaleString('en-US', { timeZone: 'America/Phoenix' }) : '—'} Phoenix · {fmt(d.postsRead)} of our posts read{d.xError ? ` · X said: ${d.xError}` : ''}</small>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 16 }}>
        <Big k="Followers" v={fmt(d.followers)} sub={delta(d.followers, p.followers)} />
        <Big k="Views, last 7 days" v={fmt(d.views7)} sub={`${fmt(d.posts7)} posts · ${delta(d.views7, p.views7)}`} />
        <Big k="Engagement" v={d.engagement7 == null ? '—' : `${d.engagement7}%`} sub={`likes, replies, reposts, quotes, saves / views · ${delta(d.engagement7, p.engagement7, ' pts')}`} />
        <Big k="Profile clicks" v={fmt(d.profile7)} sub={`from our posts, 7 days · ${delta(d.profile7, p.profile7)}`} />
        <Big k="Accounts" v={fmt(s.accounts)} sub={`${fmt(s.accounts7)} new this week`} />
        <Big k="Discord members" v={fmt(d.discord)} sub={delta(d.discord, p.discord)} />
        <Big k="Founding members" v={fmt(s.founding)} sub={`Whop · ${delta(s.founding, ps.founding)}`} />
        <Big k="Push devices" v={fmt(s.push)} sub={delta(s.push, ps.push)} />
      </div>
      <small style={{ display: 'block', fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>/start and /called visits: Vercel → Analytics (the site can't read them).</small>

      <h3 style={{ ...kicker, fontSize: 12 }}>CUT OR REWORK · {cuts.length}</h3>
      <small style={{ fontSize: 12, color: 'var(--dim)' }}>under {CUT_VIEWS} median views with {CUT_MIN_POSTS}+ posts in {WINDOW_DAYS} days (posts under 2 days old left out). Live event posts and hand posts sit outside the rule.</small>
      {cuts.length ? (
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><Head /><tbody><TypeRows list={cuts} /></tbody></table></div>
      ) : <p style={{ fontSize: 14 }}>Nothing under the bar this week.</p>}

      <h3 style={{ ...kicker, fontSize: 12 }}>EVERY POST TYPE · {types.length}</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}><Head /><tbody><TypeRows list={rest.slice(0, 6)} /></tbody></table>
      </div>
      {rest.length > 6 ? (
        <details><summary style={{ fontSize: 13, cursor: 'pointer', padding: '6px 0' }}>+{rest.length - 6} more</summary>
          <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><TypeRows list={rest.slice(6)} /></tbody></table></div>
        </details>
      ) : null}

      {rows.length > 1 ? <>
        <h3 style={{ ...kicker, fontSize: 12 }}>WEEK BY WEEK</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr style={{ fontSize: 11, color: 'var(--dim)', textAlign: 'right' }}><th style={{ textAlign: 'left' }}>WEEK</th><th>FOLLOWERS</th><th>VIEWS 7D</th><th>ENG</th><th>DISCORD</th><th>FOUNDING</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.week} style={{ borderTop: '1px solid var(--line)', textAlign: 'right' }}>
                <td style={{ textAlign: 'left', padding: '6px 8px 6px 0', whiteSpace: 'nowrap' }}>{r.week}</td>
                <td style={{ padding: 6 }}>{fmt(r.data?.followers)}</td><td style={{ padding: 6 }}>{fmt(r.data?.views7)}</td>
                <td style={{ padding: 6 }}>{r.data?.engagement7 == null ? '—' : `${r.data.engagement7}%`}</td>
                <td style={{ padding: 6 }}>{fmt(r.data?.discord)}</td><td style={{ padding: 6 }}>{fmt(r.data?.site?.founding)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </> : null}
    </div>
  )
}
