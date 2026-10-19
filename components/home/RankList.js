'use client'
// A RANKED LIST ON HOME, ANY SPORT (10-19, the LAMP twins of TUDDY's power rankings, TD ledger and Look-Out):
// rank, a club logo, a name, then one or two short value cells. Four rows, then "All N" (the one show-more rule).
// Every number is the caller's, already formatted; this only lays them out evenly (44px rows, fixed columns).
import TeamMark from '../TeamMark'
import { usePreview, ShowMoreButton } from '../ListPreview'

export default function RankList({ title, sub = null, rows = [], sport, theme, numFont, accent, onAll = null, allLabel = 'All', empty = null, ranked = true }) {
  const pv = usePreview(rows)
  if (!rows.length && !empty) return null
  return (
    <section aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ font: `900 12px/1.2 ${numFont}`, letterSpacing: '.08em', color: theme.text }}>{title.toUpperCase()}</span>
          {sub ? <span style={{ marginLeft: 8, fontSize: 11, color: theme.text3 }}>{sub}</span> : null}
        </span>
        {onAll ? <button type="button" className="tap-box" onClick={onAll} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: accent, font: `800 11px/1 ${numFont}`, whiteSpace: 'nowrap' }}>{allLabel} ›</button> : null}
      </div>
      {!rows.length ? <div style={{ fontSize: 12, color: theme.text3, padding: '6px 0' }}>{empty}</div> : null}
      <div style={{ display: 'grid', gap: 2 }}>
        {pv.shown.map((r, i) => (
          <button type="button" key={r.key} onClick={r.onOpen || undefined}
            style={{ background: 'none', border: 0, borderBottom: `1px solid ${theme.border}`, borderRadius: 0, font: 'inherit', color: theme.text, textAlign: 'left', cursor: r.onOpen ? 'pointer' : 'default', width: '100%', display: 'grid', gridTemplateColumns: `${ranked ? '22px ' : ''}20px minmax(0, 1fr) auto`, alignItems: 'center', gap: 8, minHeight: 44, padding: '0 4px' }}>
            {ranked ? <span style={{ font: `800 11px/1 ${numFont}`, color: theme.text3 }}>{i + 1}</span> : null}
            {r.team ? <TeamMark sport={sport} abbr={r.team} variant="logo" px={18} /> : <span />}
            <span style={{ minWidth: 0, display: 'grid' }}>
              <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</b>
              {r.line ? <span style={{ fontSize: 11, color: theme.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.line}</span> : null}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: `900 13px/1 ${numFont}`, color: i < 3 && ranked ? accent : theme.text2, whiteSpace: 'nowrap' }}>{r.value}</span>
          </button>
        ))}
      </div>
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} />
    </section>
  )
}
