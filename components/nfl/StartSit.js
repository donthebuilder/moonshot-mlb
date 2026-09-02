'use client'
import { useMemo, useState } from 'react'
import NflTeamMark from '../fantasy/NflTeamMark'
import { projectPlayer } from './TeamPower'

// ══ START / SIT ═══════════════════════════════════════════════════════════════
//
// The "pick helper" the same fresh user asked for (2026-08-23), confirmed by
// Donovan 2026-09-01. Franchise's Coach page already answers it for a roster
// it can see; this answers it for ANY two names, for someone whose league is
// not on this site. Pick two men, read the two projections side by side, and
// under them the per-market model scores the bot already publishes — the
// reason one number is bigger than the other, not just the number.
//
// Same projection as Franchise (lib/fantasy/scoring.js, PPR), same scores as
// every board on this page. Nothing here is a new model. The verdict line is
// deliberately blunt about a small gap: under two projected points the honest
// answer is "coin flip — start the one with the better matchup", and it says
// so rather than manufacturing a favourite.

const MARKETS = [['TD', 'Anytime TD'], ['REC_YDS', 'Rec yds'], ['REC', 'Receptions'], ['RUSH_YDS', 'Rush yds'], ['RUSH_ATT', 'Carries'], ['PASS_YDS', 'Pass yds'], ['KICK_PTS', 'Kick pts']]

function Picker({ players, value, onChange, placeholder }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle.length < 2) return []
    return players.filter((p) => p.name.toLowerCase().includes(needle) || String(p.team || '').toLowerCase() === needle).slice(0, 8)
  }, [players, q])
  if (value) {
    return (
      <div className="ss-pick">
        <NflTeamMark size={22} team={value.team} />
        <b>{value.name}</b><small>{value.team} · {value.position}</small>
        <button onClick={() => { onChange(null); setQ('') }} title="Change">✕</button>
      </div>
    )
  }
  return (
    <div className="ss-search">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {hits.length > 0 && (
        <div className="ss-hits">
          {hits.map((p) => <button key={p.player_id} onClick={() => { onChange(p); setQ('') }}><NflTeamMark size={18} team={p.team} /><b>{p.name}</b><small>{p.team} · {p.position}</small></button>)}
        </div>
      )}
    </div>
  )
}

export default function StartSit({ players = [], onPlayerClick }) {
  const [a, setA] = useState(null)
  const [b, setB] = useState(null)
  const pool = useMemo(() => (players || []).filter((p) => p?.name && p?.position), [players])
  const pa = a ? projectPlayer(a) : null
  const pb = b ? projectPlayer(b) : null
  const gap = pa != null && pb != null ? Math.round((pa - pb) * 10) / 10 : null
  const lead = gap == null ? null : gap > 0 ? a : gap < 0 ? b : null
  const verdict = gap == null ? null
    : Math.abs(gap) < 2 ? `Coin flip — ${Math.abs(gap).toFixed(1)} projected points apart. Start the better matchup; the model cannot separate them.`
    : `Start ${lead.name} — ${Math.abs(gap).toFixed(1)} projected points more${lead.low_sample ? ', on a thin sample' : ''}${lead.questionable ? ', and he is questionable' : ''}.`

  return (
    <section className="tuddy-startsit">
      <div className="ss-head"><div><small>PICK HELPER</small><h2>Start / sit</h2></div><span>PPR projection · per-game stats · tap a name for his card</span></div>
      <div className="ss-grid">
        <Picker players={pool} value={a} onChange={setA} placeholder="first player…" />
        <span className="ss-vs">vs</span>
        <Picker players={pool} value={b} onChange={setB} placeholder="second player…" />
      </div>
      {a && b && (
        <>
          <div className="ss-verdict">{verdict}</div>
          <div className="ss-table">
            <div className="ss-r ss-h"><span>Projected pts</span><em onClick={() => onPlayerClick?.(a, 'TD')} className={gap > 0 ? 'win' : ''}>{pa.toFixed(1)}</em><em onClick={() => onPlayerClick?.(b, 'TD')} className={gap < 0 ? 'win' : ''}>{pb.toFixed(1)}</em></div>
            {MARKETS.filter(([k]) => Number.isFinite(a.scores?.[k]) || Number.isFinite(b.scores?.[k])).map(([k, label]) => {
              const sa = a.scores?.[k], sb = b.scores?.[k]
              return (
                <div className="ss-r" key={k}>
                  <span>{label} score</span>
                  <em className={Number.isFinite(sa) && Number.isFinite(sb) && sa > sb ? 'win' : ''}>{Number.isFinite(sa) ? Math.round(sa) : '—'}</em>
                  <em className={Number.isFinite(sa) && Number.isFinite(sb) && sb > sa ? 'win' : ''}>{Number.isFinite(sb) ? Math.round(sb) : '—'}</em>
                </div>
              )
            })}
            <div className="ss-r"><span>Opponent</span><em>{a.opp || '—'}</em><em>{b.opp || '—'}</em></div>
            <div className="ss-r"><span>Flags</span><em>{[a.questionable && 'Q', a.low_sample && 'thin'].filter(Boolean).join(' · ') || '—'}</em><em>{[b.questionable && 'Q', b.low_sample && 'thin'].filter(Boolean).join(' · ') || '—'}</em></div>
          </div>
        </>
      )}
      <style>{`
        .tuddy-startsit{border:1px solid rgba(6,182,212,.25);border-radius:16px;padding:14px;background:linear-gradient(160deg,rgba(6,182,212,.06),transparent 60%)}
        .ss-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}
        .ss-head small{display:block;font:900 9px/1 var(--num-font,ui-monospace,monospace);letter-spacing:.1em;opacity:.65}
        .ss-head h2{margin:4px 0 0;font-size:17px}
        .ss-head>span{font:700 9.5px/1.3 var(--num-font,ui-monospace,monospace);opacity:.6}
        .ss-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:start}
        .ss-vs{align-self:center;font:900 10px/1 var(--num-font,ui-monospace,monospace);opacity:.5}
        .ss-search{position:relative}
        .ss-search input{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:inherit;font-size:12px;outline:none}
        .ss-hits{position:absolute;left:0;right:0;top:100%;z-index:5;margin-top:4px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:#0b0f14;overflow:hidden}
        .ss-hits>button{display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;background:transparent;border:none;color:inherit;cursor:pointer;text-align:left;font-size:12px}
        .ss-hits>button:hover{background:rgba(255,255,255,.06)}
        .ss-hits small,.ss-pick small{font-size:9.5px;opacity:.6}
        .ss-pick{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:10px;border:1px solid rgba(6,182,212,.4);background:rgba(6,182,212,.08);font-size:12px;min-width:0}
        .ss-pick b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ss-pick button{margin-left:auto;background:transparent;border:none;color:inherit;opacity:.6;cursor:pointer}
        .ss-verdict{margin-top:10px;font-size:12.5px;font-weight:700;line-height:1.5}
        .ss-table{margin-top:8px;display:flex;flex-direction:column;gap:2px}
        .ss-r{display:grid;grid-template-columns:1fr 64px 64px;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,.06);font-size:11px;align-items:baseline}
        .ss-r span{opacity:.65}
        .ss-r em{font:800 12px/1 var(--num-font,ui-monospace,monospace);font-style:normal;text-align:right;opacity:.7}
        .ss-r em.win{opacity:1;color:#22c55e}
        .ss-h em{font-size:15px;cursor:pointer}
        @media(max-width:520px){.ss-grid{grid-template-columns:1fr;gap:6px}.ss-vs{justify-self:center}}
      `}</style>
    </section>
  )
}
