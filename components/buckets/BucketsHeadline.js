'use client'
import HeadlinePicks from '../headline/HeadlinePicks'

// 🏀 BUCKETS' HEADLINE PICKS (2026-10-03, the visual pass: "the basketball
// shit don't got none of this"). The same layout as MOONSHOT's The Four,
// TUDDY's The Six and LAMP's Tonight's calls (components/headline/
// HeadlinePicks.js), one box per BUCKETS board: PTS 25+, REB 10+, AST 8+.
// Each box: the night's top 3 CALLED players by that board's score
// (/api/buckets/board rows with status 'called'). A row from a game not yet
// locked is the live preview and says so, in capitals. No record line: it
// stays absent until the board has a graded regular-season night to show.
const f1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : null)

const LANES = [
  { key: 'pts', label: 'PTS 25+', icon: '🏀', colorKey: 'purple', blurb: 'scores 25+', stat: (r) => f1(r.ptsPg) && `${f1(r.ptsPg)} PTS/g` },
  { key: 'reb', label: 'REB 10+', icon: '🧱', colorKey: 'teal', blurb: '10+ rebounds', stat: (r) => f1(r.rebPg) && `${f1(r.rebPg)} REB/g` },
  { key: 'ast', label: 'AST 8+', icon: '🎯', colorKey: 'amber', blurb: '8+ assists', stat: (r) => f1(r.astPg) && `${f1(r.astPg)} AST/g` },
]

function topCalled(board) {
  const rows = (board?.rows || []).map((r) => ({ ...r, ...(r.legs || {}) }))
  return rows.filter((r) => r.status === 'called' && Number.isFinite(Number(r.score))).sort((a, b) => b.score - a.score).slice(0, 3)
}

export default function BucketsHeadline({ theme: C, numFont, boards, onOpenPlayer }) {
  const lanes = LANES.map((l) => ({
    key: l.key, label: l.label, icon: l.icon, color: C[l.colorKey] || C.purple, blurb: l.blurb,
    empty: 'Waiting for tonight’s board.',
    picks: topCalled(boards?.[l.key]).map((r, i) => {
      const preview = r.locked === false
      const where = `${r.team} ${r.home ? 'vs' : '@'} ${r.opp}${f1(r.minPg) ? ` · ${f1(r.minPg)} MIN/g` : ''}`
      return {
        key: String(r.playerId), raw: r, name: r.name, score: Math.round(r.score),
        flag: preview ? { icon: '⏳', title: 'PREVIEW — not a call until its game locks' } : null,
        lines: i === 0 ? [l.stat(r) || '', `${where}${preview ? ' · PREVIEW' : ''}`] : [],
        team: i === 0 ? null : r.team,
        micro: i === 0 ? null : `${l.stat(r) || ''}${preview ? ' · preview' : ''}`,
      }
    }),
  })).filter((l) => l.picks.length)
  if (!lanes.length) return null
  return (
    <HeadlinePicks sport="nba" theme={C} numFont={numFont}
      title="🏀 Tonight's calls"
      subtitle="the called players on each board: the top scorer on each team, while he is on the board. Scores rank tonight's pool, 0–100 — not probabilities."
      lanes={lanes} collapsePhone
      onPick={(pick) => pick.raw?.playerId && onOpenPlayer?.(String(pick.raw.playerId))} />
  )
}
