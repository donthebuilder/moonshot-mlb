'use client'
import TeamMark from '../TeamMark'
import Tap from '../Tap'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { EXPECTED_POINTS_LABEL, EXPECTED_POINTS_WORDS } from '../../lib/nba/teamModel'
import { Kicker } from './ui'

// 🏀 EXPECTED POINTS FOR ONE GAME, FROM THE TEAM MODEL (lib/nba/teamModel.js, /api/buckets/teammodel): the
// game page's version of the Slate dial. Each club's points a game, what it allows, and the expected points
// (home court and the back-to-back in). One small table: tables lead. The words live in ONE constant.
export const BASIS_NOTE = {
  'last season': 'No regular-season games on file yet: both clubs are last season’s numbers.',
  'part last season': 'Early in the season: each club’s games so far are blended with last season’s.',
  'this season': 'Built from this season’s games so far.',
}

/** One sentence for the Slate / game page: where the numbers come from. */
export function basisLine(games, preseason = false) {
  const rows = (games || []).filter(Boolean)
  if (!rows.length) return null
  if (rows.every((g) => g.basis === 'last season')) return preseason ? 'Preseason: no regular-season games yet, so each club is last season’s numbers.' : BASIS_NOTE['last season']
  if (rows.some((g) => g.basis !== 'this season')) return BASIS_NOTE['part last season']
  return BASIS_NOTE['this season']
}

export default function BucketsTeamExpected({ model, preseason = false, onOpenTeam }) {
  if (!model) return null
  const cell = { padding: '0 6px', textAlign: 'right', fontFamily: NUM_FONT, fontSize: 13, minWidth: 40 }
  const rows = [model.away, model.home]
  return (
    <section aria-label={EXPECTED_POINTS_LABEL}>
      <Kicker>{EXPECTED_POINTS_WORDS.toUpperCase()} · {model.total.toFixed(1)} TOTAL</Kicker>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', background: C.bg2 }}>
        <caption className="sr-only">{EXPECTED_POINTS_LABEL} for this game, from the team model: each club’s points scored and allowed a game, and the expected points</caption>
        <thead><tr style={{ color: C.text3, fontSize: 11 }}>
          <th scope="col" style={{ ...cell, textAlign: 'left', height: 32 }}>CLUB</th>
          <th scope="col" style={cell}>SCORES</th>
          <th scope="col" style={cell}>ALLOWS</th>
          <th scope="col" style={{ ...cell, color: C.purple }}>EXPECTED</th>
        </tr></thead>
        <tbody>{rows.map((t, i) => (
          <tr key={t.abbrev} style={{ borderTop: `1px solid ${C.border}` }}>
            <th scope="row" style={{ ...cell, textAlign: 'left', height: 44 }}>
              <Tap onClick={() => onOpenTeam?.(t.abbrev)} title={t.abbrev}>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><TeamMark sport="nba" abbr={t.abbrev} variant="logo" px={20} />{t.abbrev}
                  {(i === 0 ? model.b2b?.away : model.b2b?.home) ? <span title="Second night of a back-to-back" style={{ color: C.text3, fontSize: 11 }}>B2B</span> : null}</span>
              </Tap>
            </th>
            <td style={{ ...cell, color: C.text2 }}>{t.scores.toFixed(1)}</td>
            <td style={{ ...cell, color: C.text2 }}>{t.allows.toFixed(1)}</td>
            <td style={{ ...cell, fontWeight: 900, color: C.text }}>{t.pts.toFixed(1)}</td>
          </tr>
        ))}</tbody>
      </table>
      <p style={{ margin: '6px 0 0', fontSize: 12, lineHeight: 1.4, color: C.text3 }}>
        {basisLine([model], preseason)} Each club’s points a game against the other’s allowed, home court and rest in. The players’ xPTS are a separate number.
      </p>
    </section>
  )
}
