'use client'
// TOP 10 ON HOME, ANY SPORT (Donovan 10-18: "share everything NFL got"). TUDDY's MiniBoard
// (components/nfl/tabs/Home.js) as one shared piece: rank, his club's logo, name, position,
// the score; four rows, then "All 10" (the site's one show-more rule). The rows come in ranked
// and already cleared by the caller's members gate -- a locked call is never passed here; the
// caller passes how many it held back and the list says so in one line.
import TeamMark from '../TeamMark'
import { usePreview, ShowMoreButton } from '../ListPreview'

export default function TopTenList({ title, rows = [], sport, theme, numFont, accent, onOpen = null, onAll = null, allLabel = 'Full board', held = 0 }) {
  const pv = usePreview(rows.slice(0, 10))
  if (!rows.length) return null
  return (
    <section aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ font: `900 12px/1.2 ${numFont}`, letterSpacing: '.08em', color: theme.text }}>{title.toUpperCase()}</span>
        {onAll ? <button type="button" className="tap-box" onClick={onAll} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: accent, font: `800 11px/1 ${numFont}` }}>{allLabel} ›</button> : null}
      </div>
      <div style={{ display: 'grid', gap: 2 }}>
        {pv.shown.map((r, i) => (
          <button type="button" key={r.key} onClick={onOpen ? () => onOpen(r) : undefined}
            style={{ background: 'none', border: 0, borderRadius: 0, font: 'inherit', cursor: onOpen ? 'pointer' : 'default', width: '100%', display: 'grid', gridTemplateColumns: '22px 20px minmax(0, 1fr) auto auto', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 4px', borderBottom: `1px solid ${theme.border}`, color: theme.text, textAlign: 'left' }}>
            <span style={{ font: `800 11px/1 ${numFont}`, color: theme.text3 }}>{i + 1}</span>
            {r.team ? <TeamMark sport={sport} abbr={r.team} variant="logo" px={18} /> : <span />}
            <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</b>
            <span style={{ font: `700 11px/1 ${numFont}`, color: theme.text3 }}>{r.pos || ''}</span>
            <strong style={{ font: `900 14px/1 ${numFont}`, color: i < 3 ? accent : theme.text2, minWidth: 24, textAlign: 'right' }}>{Math.round(r.score)}</strong>
          </button>
        ))}
      </div>
      <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} />
      {held > 0 ? <div style={{ marginTop: 4, fontSize: 11, color: theme.text3 }}>+{held} called {held === 1 ? 'pick' : 'picks'} for members</div> : null}
    </section>
  )
}
