'use client'
// 🔥 STREAKS — the NFL sibling of MOONSHOT's Runs page. See lib/nfl/streaks.js
// for what a streak is. The page: pick a market, pick your own line (chips
// around the bot's bar), and every slate player with a log ranks by
// consecutive games on the same side of that number. Hot at the top, or flip
// to Coldest for the fade board.
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../../lib/nfl/theme'
import { streakMarkets, streakBoard, barChoices } from '../../../lib/nfl/streaks'

const REASON_WORD = { rising: 'usage rising', bot: 'bot likes him' }
const REASON_TITLE = (r) => `Below the volume floor (${r.usage.recent.toFixed(1)} a game over his last 8, floor ${r.usage.floor}) but on the board because: ${r.reasons.map((x) => REASON_WORD[x]).join(', ')}.`
const LABEL = { TD: 'Anytime TD', REC_YDS: 'Receiving yards', REC: 'Receptions', RUSH_YDS: 'Rushing yards', RUSH_ATT: 'Carries', PASS_YDS: 'Passing yards', KICK_PTS: 'Kicking points' }

function Spark({ series, bar, side }) {
  const w = 96, h = 22
  const max = Math.max(bar * 1.5, ...series.map((r) => r.v), 1)
  const step = series.length > 1 ? w / (series.length - 1) : 0
  const y = (v) => h - 2 - (Math.min(v, max) / max) * (h - 4)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <line x1="0" x2={w} y1={y(bar)} y2={y(bar)} stroke={C.text3} strokeDasharray="2 3" strokeWidth="1" />
      {series.map((r, i) => {
        const over = r.v >= bar
        const on = side === 'over' ? over : !over
        return <circle key={i} cx={series.length > 1 ? i * step : w / 2} cy={y(r.v)} r={2.4} fill={on ? (side === 'over' ? C.green : C.red) : 'rgba(255,255,255,.22)'} />
      })}
    </svg>
  )
}

export default function Streaks({ data, logs, onPlayerClick }) {
  const markets = useMemo(() => streakMarkets(logs), [logs])
  const [mk, setMk] = useState(markets[0]?.key || 'REC_YDS')
  const market = markets.find((m) => m.key === mk) || markets[0]
  const [bar, setBar] = useState(null)
  const [side, setSide] = useState('over')
  const [pos, setPos] = useState('ALL')
  const line = bar ?? market?.bar ?? 0
  const chips = useMemo(() => (market ? barChoices(market.key, market.bar) : []), [market])

  const rows = useMemo(() => {
    if (!market) return []
    // Only positions the bot scores in this market. Without this the cold
    // board was every quarterback at "30 straight under 40 receiving yards",
    // which is true and worthless.
    const eligible = new Set((data?.markets || []).find((m) => m.key === market.key)?.positions || [])
    // A man on a bye is carried in the payload for the catalog's sake, but
    // "who is hot right now" is a question about people who are playing.
    const players = (data?.players || []).filter((p) => !p.on_bye && (!eligible.size || eligible.has(p.position)) && (pos === 'ALL' || p.position === pos))
    return streakBoard(logs, players, market.field, line, side, 30, market.key).filter((r) => r.streak > 0).slice(0, 60)
  }, [logs, data, market, line, side, pos])

  if (!markets.length) return <div className="ts-empty">No game logs published yet — the bot ships nfl_logs.json on its first run of the season.</div>

  return (
    <div className="ts">
      <section className="ts-hero">
        <div>
          <small>TUDDY · STREAKS</small>
          <h1>{side === 'over' ? 'Who is hot' : 'Who is cold'}</h1>
          <p>Consecutive games on the same side of a number <b>you</b> pick, last 30 games, no model in the way. Hot is the play; cold is the fade — or the bounce, if you believe in those. Low-volume names only make the board with a reason printed next to them: usage rising, or the bot rating him this week.</p>
        </div>
        <div className="ts-side">
          <button className={side === 'over' ? 'on' : ''} onClick={() => setSide('over')}>🔥 Hottest</button>
          <button className={side === 'under' ? 'on' : ''} onClick={() => setSide('under')}>🧊 Coldest</button>
        </div>
      </section>

      <div className="ts-controls">
        <div className="ts-row">{markets.map((m) => <button key={m.key} className={m.key === market.key ? 'on' : ''} onClick={() => { setMk(m.key); setBar(null); setPos('ALL') }}>{LABEL[m.key] || m.key}</button>)}</div>
        <div className="ts-row"><small>LINE</small>{chips.map((c) => <button key={c} className={c === line ? 'on' : ''} onClick={() => setBar(c)}>{c}{c === market.bar ? ' · bot' : ''}</button>)}</div>
        <div className="ts-row"><small>POS</small>{['ALL', ...((data?.markets || []).find((m) => m.key === market.key)?.positions || ['QB', 'RB', 'WR', 'TE', 'K'])].map((p) => <button key={p} className={p === pos ? 'on' : ''} onClick={() => setPos(p)}>{p}</button>)}</div>
      </div>

      {!rows.length && <div className="ts-empty">Nobody on this slate is on a run at {line} {LABEL[market.key]?.toLowerCase()}.</div>}
      <div className="ts-list">
        {rows.map((r, i) => {
          const g = gradeFor(r.player.scores?.[market.key])
          const col = side === 'over' ? C.green : C.red
          const mag = Math.min(1, r.streak / 10)
          return (
            <button type="button" key={r.player.player_id} className="ts-item" onClick={() => onPlayerClick?.(r.player, market.key)}>
              <span className="ts-rank">{i + 1}</span>
              <span className="ts-who"><b>{r.player.name}{r.questionable && <i className="ts-q" title="Listed questionable on the slate">Q</i>}</b><small>{r.player.team} · {r.player.position} · vs {r.player.opp || '—'}{r.usage && !r.usage.volume ? <> · <em className="ts-why" title={REASON_TITLE(r)}>{r.reasons.map((x) => REASON_WORD[x]).join(' · ')}</em></> : null}</small></span>
              <Spark series={r.last8} bar={line} side={side} />
              <span className="ts-streak" style={{ color: col }}><b>{r.streak}</b><small>{side === 'over' ? 'straight over' : 'straight under'}</small><i style={{ width: `${mag * 100}%`, background: col }} /></span>
              <span className="ts-rate"><b>{Math.round(r.rate * 100)}%</b><small>{r.hits}/{r.games} over {line}</small></span>
              <span className="ts-last"><b>{r.lastV}</b><small>last</small></span>
              <span className="ts-score" style={{ color: g.color }}><b>{Number.isFinite(r.player.scores?.[market.key]) ? Math.round(r.player.scores[market.key]) : '—'}</b><small>bot</small></span>
            </button>
          )
        })}
      </div>

      <style>{`
      .ts{display:flex;flex-direction:column;gap:12px}
      .ts-hero{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:22px 24px;border:1px solid rgba(34,197,94,.28);border-radius:16px;background:radial-gradient(circle at 88% 8%,rgba(34,197,94,.14),transparent 36%),radial-gradient(circle at 6% 100%,rgba(34,211,238,.1),transparent 40%),${C.bg2}}
      .ts-hero small{color:${C.green};font:900 8px/1 ${NUM_FONT};letter-spacing:.12em}
      .ts-hero h1{margin:7px 0 5px;font-size:clamp(26px,4.5vw,44px);letter-spacing:-.04em}
      .ts-hero p{max-width:600px;margin:0;color:${C.text3};font-size:10.5px;line-height:1.5}.ts-hero p b{color:${C.text2}}
      .ts-side{display:flex;gap:6px;flex-shrink:0}
      .ts-side button{padding:10px 14px;border:1px solid ${C.border};border-radius:10px;background:${C.bg};color:${C.text2};font:800 10px/1 ${NUM_FONT};cursor:pointer}
      .ts-side button.on{border-color:${C.green};color:${C.green};background:rgba(34,197,94,.08)}
      .ts-controls{display:flex;flex-direction:column;gap:6px}
      .ts-row{display:flex;align-items:center;gap:5px;overflow-x:auto;padding-bottom:2px}
      .ts-row small{color:${C.text3};font:900 8px/1 ${NUM_FONT};letter-spacing:.1em;margin-right:4px;flex-shrink:0}
      .ts-row button{flex:0 0 auto;padding:7px 10px;border:1px solid ${C.border};border-radius:8px;background:${C.bg2};color:${C.text3};font:800 8.5px/1 ${NUM_FONT};cursor:pointer;white-space:nowrap}
      .ts-row button.on{border-color:${C.cyan};color:${C.cyan};background:rgba(34,211,238,.08)}
      .ts-list{display:flex;flex-direction:column;gap:5px}
      .ts-item{display:grid;grid-template-columns:22px 1fr 96px 110px 76px 44px 40px;align-items:center;gap:10px;padding:8px 12px;border:1px solid ${C.border};border-radius:11px;background:${C.bg2};color:inherit;text-align:left;cursor:pointer}
      .ts-item:hover{border-color:${C.border2}}
      .ts-rank{color:${C.text3};font:900 10px/1 ${NUM_FONT}}
      .ts-who b{display:block;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ts-who small{display:block;margin-top:2px;color:${C.text3};font:700 8px/1 ${NUM_FONT}}.ts-q{display:inline-block;margin-left:5px;padding:1px 4px;border-radius:4px;background:rgba(250,204,21,.15);color:${C.yellow};font:900 8px/1 ${NUM_FONT};font-style:normal;vertical-align:middle}.ts-why{color:${C.cyan};font-style:normal}
      .ts-streak{position:relative;display:flex;align-items:baseline;gap:5px;padding-bottom:6px}.ts-streak b{font:900 20px/1 ${NUM_FONT}}.ts-streak small{font:800 7.5px/1 ${NUM_FONT};color:${C.text3};text-transform:uppercase;letter-spacing:.04em}
      .ts-streak i{position:absolute;left:0;bottom:0;height:3px;border-radius:99px}
      .ts-rate,.ts-last,.ts-score{display:flex;flex-direction:column;align-items:flex-end;font-family:${NUM_FONT}}
      .ts-rate b,.ts-last b,.ts-score b{font-size:13px;font-weight:900}.ts-rate small,.ts-last small,.ts-score small{margin-top:2px;font-size:7.5px;font-weight:700;color:${C.text3};white-space:nowrap}
      .ts-empty{padding:26px;border:1px dashed ${C.border2};border-radius:12px;text-align:center;color:${C.text3};font-size:10.5px}
      @media(max-width:640px){.ts-hero{flex-direction:column;align-items:flex-start}.ts-item{grid-template-columns:18px 1fr 90px 40px;}.ts-item svg{display:none}.ts-rate,.ts-last{display:none}}
      `}</style>
    </div>
  )
}
