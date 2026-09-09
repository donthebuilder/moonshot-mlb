'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { n, nameOf, teamOf, oppOf, txt } from '../lib/player'
import { verdictInk, alpha } from '../lib/scales'
import { fmtOdds } from '../lib/odds'
import { sbPriceFor } from './tabs/StealBoard'

// ══ 🏃 STEAL LOOKS, ON THE FRONT PAGE ═══════════════════════════════════════
//
// Donovan, 2026-09-01, on the Steal Board: promote it AND add a score — "but
// I'm unsure about the use of more tabs, we have to get that under control."
// Then, asked where a front-door strip should go: "the home page thing is
// perfect."
//
// So: no tab. The board stays where it is (a group inside the boards page,
// reachable as #tab=steals now); this is its front door — the three best
// steal spots on the slate, the same shape as The Four above it, with the
// book's price when there is one. The score it ranks on is the bot's own
// steal_risk_score — the runner's history, the arm's willingness to be run
// on, the catcher's arm, scaled by on-base — which already exists and is
// archived unscored (see StealBoard.js). Nothing here is a second model.
//
// It renders nothing on a slate with no scored runners, and it says so when
// the catcher half of the score is missing on every row, because tonight's
// number is then built on half the matchup and the reader should know that.

const riskOf = (p) => {
  const v = n(p?.steal_risk_score, 0)
  return v > 0 && String(p?.steal_risk_status || '') !== 'no_runner' ? v : null
}

export default function StealLooksStrip({ players = [], odds = null, onPlayerClick, onNavigate }) {
  const top = useMemo(() => {
    const scored = (players || [])
      .filter((p) => p && p.player_id && riskOf(p) != null && n(p?.season_sb, 0) + n(p?.season_cs, 0) >= 5)
      .map((p) => ({ p, risk: riskOf(p), price: sbPriceFor(odds, p) }))
      .sort((a, b) => b.risk - a.risk || n(b.p.season_sb, 0) - n(a.p.season_sb, 0))
    return scored.slice(0, 3)
  }, [players, odds])

  const armMissing = useMemo(() => {
    const rows = (players || []).filter((p) => txt(p?.opp_catcher_name))
    return rows.length > 0 && !rows.some((p) => p?.opp_catcher_cs_rate != null || p?.opp_catcher_pop_time != null)
  }, [players])

  if (!top.length) return null

  return (
    <div style={{
      border: `1px solid ${C.border}`, borderRadius: 14, padding: '11px 14px 10px', marginBottom: 12,
      background: `linear-gradient(155deg, ${C.bg2}, ${alpha(C.cyan, 0.04)})`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>🏃 Steal looks tonight</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          best steal spots · the runner, the arm, the catcher{armMissing ? ' · catcher unmeasured tonight' : ''}
        </span>
        {onNavigate && (
          <span onClick={() => onNavigate('steals')}
            title="Every runner on the slate, sortable, with prices"
            style={{ marginLeft: 'auto', fontSize: 9.5, color: C.cyan, cursor: 'pointer', fontFamily: NUM_FONT, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
            steal board →
          </span>
        )}
      </div>
      <style>{`.steal-looks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
        @media(max-width:600px){.steal-looks{grid-template-columns:1fr}}`}</style>
      <div className="steal-looks">
        {top.map(({ p, risk, price }, i) => {
          const sb = n(p.season_sb, 0), cs = n(p.season_cs, 0)
          const succ = sb + cs ? Math.round((100 * sb) / (sb + cs)) : null
          const cName = txt(p.opp_catcher_name)
          return (
            <button key={p.player_id} onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
              title={txt(p.steal_risk_note) || ''}
              style={{
                textAlign: 'left', cursor: onPlayerClick ? 'pointer' : 'default', minWidth: 0,
                border: `1px solid ${alpha(C.cyan, i === 0 ? 0.5 : 0.25)}`, background: alpha(C.cyan, i === 0 ? 0.09 : 0.04),
                borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 3,
              }}>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                <b style={{ fontSize: 11.5, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', color: C.text }}>{nameOf(p)}</b>
                <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontWeight: 900, fontSize: 13, color: risk >= 60 ? verdictInk(true).color : C.cyan, flexShrink: 0 }}
                  title="The bot's steal-spot score, 0–100">{risk.toFixed(0)}</span>
              </span>
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {teamOf(p)} vs {oppOf(p)}{cName ? ` · C ${cName.split(' ').slice(-1)[0]}` : ''}
              </span>
              <span style={{ fontSize: 9.5, color: C.text2, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {sb} SB{succ != null ? ` · ${succ}%` : ''}{n(p.season_obp, 0) ? ` · OBP ${Number(p.season_obp).toFixed(3).replace(/^0/, '')}` : ''}
                {price?.matches ? <b style={{ marginLeft: 6, color: C.text }}>{fmtOdds(price.over)}</b> : <span style={{ marginLeft: 6, color: C.text3 }}>no price</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
