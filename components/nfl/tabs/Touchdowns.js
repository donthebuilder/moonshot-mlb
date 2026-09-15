'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor, TYPE } from '../../../lib/nfl/theme'
import { injuryTag, injuryTitle, injuryColor } from '../../../lib/nfl/injury'
import { quoteFor } from '../../../lib/nfl/oddsMatch'
import OddsLine from '../../OddsLine'
import MatchupBadge from '../MatchupBadge'
import { AnatomyStrip } from '../ScoreAnatomy'

// TOUCHDOWNS — the front door.
//
// Donovan, 2026-09-13: "this shit has to help people and me find touchdowns
// just like for home runs." The MLB side has a dedicated HR board; the NFL
// side had touchdowns as market #1 of seven inside a shared ranking shell,
// which is not the same thing as a page that answers the question the product
// exists to answer.
//
// Written for the stated audience — people who do NOT follow football — so:
//
//   · the page opens with names and a sentence, not a table
//   · every number on screen is a bar or a plain-English clause; there is no
//     percentile, no rank chip, no role code
//   · the reason comes from the model's OWN component percentiles, so it can
//     never drift from the score it is explaining
//
// The reason is not decoration. It is the single component doing the most
// work for THIS player — weight x percentile, off `markets[].weights` and
// `player.components.TD`, both already published — so two players at the same
// score can say different things, and the page teaches what the score means
// while it ranks.
const MARKET = 'TD'
const PREVIEW = 6

// One clause per component, in the vocabulary of somebody who has never
// watched a game. Keep these short: they read as the end of "…because he".
const WHY = {
  f_gl_opp:      'gets the ball right next to the end zone more than almost anyone',
  f_rz_opp:      'is on the field for the plays that happen close to the end zone',
  f_touches:     'gets handed the ball constantly — the offence runs through him',
  f_snap_pct:    'almost never comes off the field',
  implied_total: 'plays for the team expected to score the most points',
  f_xtd:         'gets the kind of chances that usually turn into touchdowns',
  opp_td_soft:   'faces a defence that has been giving touchdowns up',
  td_regression: 'has had the chances and not cashed them yet',
}

// WHAT MAKES HIM DIFFERENT, not what carries the most weight. Rendered the
// first version and every row on the board said the identical sentence —
// "he gets the ball right next to the end zone" — because goal-line
// opportunity has the biggest weight AND everyone near the top of a TD board
// is 99th percentile in it. A reason every player shares is not a reason; it
// is the definition of the board.
//
// So each component is scored on how far this player sits ABOVE the rest of
// the ranked field in it, times its weight. The thing he is unusual at wins,
// which is also the only thing worth a sentence.
function baseline(rows) {
  const acc = {}
  for (const p of rows) {
    for (const [k, v] of Object.entries(p?.components?.[MARKET] || {})) {
      if (Number.isFinite(Number(v))) (acc[k] ||= []).push(Number(v))
    }
  }
  const out = {}
  for (const [k, vals] of Object.entries(acc)) {
    vals.sort((a, b) => a - b)
    out[k] = vals[Math.floor(vals.length / 2)]
  }
  return out
}

function reasonFor(player, weights, base) {
  const comps = player?.components?.[MARKET]
  if (!comps || !weights) return null
  let best = null
  for (const [k, pctRaw] of Object.entries(comps)) {
    const w = Number(weights[k])
    const pct = Number(pctRaw)
    if (!Number.isFinite(w) || !Number.isFinite(pct) || !WHY[k]) continue
    const edge = (pct - (base?.[k] ?? 50)) * w
    if (!best || edge > best.edge) best = { k, edge, pct }
  }
  // Two floors, both deliberate: he has to be good at it in absolute terms
  // AND ahead of the field in it. Saying nothing beats dressing up a 50th
  // percentile, and beats telling sixteen players the same thing.
  if (!best || best.pct < 60 || best.edge <= 0) return null
  return WHY[best.k]
}

function ScoreBar({ score }) {
  const g = gradeFor(score)
  // Fixed 30-80 scale, the range the board actually occupies — so a short bar
  // on this page and a short bar on Games mean the same thing.
  const pct = Math.max(4, Math.min(100, ((Number(score) || 0) - 30) / 50 * 100))
  return (
    <span style={{
      position: 'relative', display: 'block', height: 4, borderRadius: 99,
      background: 'rgba(255,255,255,.08)',
    }}>
      <span style={{
        position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, borderRadius: 99,
        background: g.color, boxShadow: `0 0 7px -1px ${g.color}`,
      }} />
    </span>
  )
}

function Row({ p, rank, matchup, odds, onPlayerClick, weights, why }) {
  const g = gradeFor(p.scores?.[MARKET])
  const tag = injuryTag(p)
  return (
    <button type="button" onClick={() => onPlayerClick?.(p, MARKET)} className="td-row">
      <span className="td-rank" style={{ color: rank <= 3 ? C.green : C.text3 }}>{rank}</span>
      <span className="td-main">
        <span className="td-top">
          <b className="td-name">{p.name}</b>
          <span className="td-vs">{p.team} vs {p.opp}</span>
          <MatchupBadge matchup={matchup} player={p} market={MARKET} />
          {tag && (
            <span title={injuryTitle(tag)} style={{ color: injuryColor(tag, C), fontWeight: 900, fontSize: TYPE.label }}>
              {tag}
            </span>
          )}
        </span>
        {why && <span className="td-why">He {why}.</span>}
        <span className="td-marks">
          <ScoreBar score={p.scores?.[MARKET]} />
          {/* THE SHAPE, which differentiates where the sentence cannot. Two
              players on the same score built it differently and the strip
              shows that at a glance — the site's own existing chart language
              (ScoreAnatomy, built in the chart-language batch), not a new
              one invented here. */}
          <AnatomyStrip components={p.components?.[MARKET]} weights={weights} width={72} />
        </span>
      </span>
      <span className="td-right">
        <b style={{ color: g.color, fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900 }}>
          {Math.round(p.scores?.[MARKET] ?? 0)}
        </b>
        <OddsLine quote={quoteFor(odds, p, MARKET)} compact />
      </span>
    </button>
  )
}

export default function Touchdowns({ data, matchup, odds, onPlayerClick }) {
  const [open, setOpen] = useState(false)

  const { rows, weights, games, base } = useMemo(() => {
    const m = (data?.markets || []).find((x) => x.key === MARKET)
    const elig = new Set(m?.positions || ['RB', 'WR', 'TE'])
    const list = (data?.players || [])
      .filter((p) => !p.on_bye && elig.has(p.position) && Number.isFinite(Number(p.scores?.[MARKET])))
      .sort((a, b) => (b.scores[MARKET] ?? 0) - (a.scores[MARKET] ?? 0))
    return {
      rows: list,
      weights: m?.weights || null,
      base: baseline(list),
      games: new Set(list.map((p) => [p.team, p.opp].sort().join('@'))).size,
    }
  }, [data])

  if (!rows.length) {
    return <div style={{ color: C.text3, fontSize: TYPE.body, padding: 18 }}>
      No scored players in this week&apos;s payload yet.
    </div>
  }

  const top = rows[0]
  const topWhy = reasonFor(top, weights, base)
  const shown = open ? rows : rows.slice(0, PREVIEW)

  // ── SAY IT ONCE ────────────────────────────────────────────────────────
  // Rendered this twice before believing it: the top of a touchdown board is
  // genuinely homogeneous — the same handful of high-usage backs on the best
  // offences — so the honest "what stands out about him" answer is the SAME
  // sentence for the first six names, whichever way it is computed. Forcing a
  // different one per player would mean inventing a distinction the model
  // does not make.
  //
  // So the sentence prints on the first player it is true of and goes quiet
  // underneath, and the anatomy strip carries the per-player difference
  // instead. Six identical sentences in a column stop being information.
  const seen = new Set()
  const whyFor = shown.map((p) => {
    const r = reasonFor(p, weights, base)
    if (!r || seen.has(r)) return null
    seen.add(r)
    return r
  })

  return (
    <div>
      {/* THE ANSWER, BEFORE THE LIST — the same shape the Map's rebuild uses,
          for the same reason: the page should say something before it asks
          anyone to read a ranking. */}
      <div className="td-hero">
        <small>WHO SCORES A TOUCHDOWN THIS WEEK</small>
        <h1>{top.name}</h1>
        <p>
          {topWhy
            ? <>He {topWhy} — the best chance on the board across {games} game{games === 1 ? '' : 's'}.</>
            : <>Top of the board across {games} game{games === 1 ? '' : 's'}.</>}
        </p>
        <div className="td-hero-stats">
          <span><b>{rows.length}</b>players ranked</span>
          <span><b>{rows.filter((p) => (p.scores?.[MARKET] ?? 0) >= 70).length}</b>rated A or better</span>
        </div>
      </div>

      <div className="td-list">
        {shown.map((p, i) => (
          <Row key={p.player_id} p={p} rank={i + 1} matchup={matchup} odds={odds}
               onPlayerClick={onPlayerClick} weights={weights} why={whyFor[i]} />
        ))}
      </div>

      {/* LONG-LIST RULE (site-wide, 2026-09-11): preview a short cut with a
          clear way to see the rest. A phone does not want 180 rows. */}
      {rows.length > PREVIEW && (
        <button type="button" className="td-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}

      <p className="td-foot">
        Ranked by the model&apos;s own touchdown score. The short bar is the
        score; the striped bar beside it is what built it, so two players on
        the same number can look different. A sentence appears the first time
        it is true of somebody and stays quiet below that.
      </p>

      <style>{`
        .td-hero{padding:22px 22px 18px;margin-bottom:11px;border:1px solid rgba(0,245,173,.26);border-radius:16px;
          background:radial-gradient(circle at 88% 6%,rgba(0,245,173,.11),transparent 46%),${C.bg2}}
        .td-hero small{display:block;color:${C.green};font:900 8.5px/1 ${NUM_FONT};letter-spacing:.19em}
        .td-hero h1{margin:11px 0 8px;font-size:clamp(27px,5.4vw,44px);line-height:1.02;letter-spacing:-.035em;color:${C.text}}
        .td-hero p{margin:0;max-width:620px;font-size:14px;line-height:1.55;color:${C.text2}}
        .td-hero-stats{display:flex;gap:22px;margin-top:15px}
        .td-hero-stats span{display:flex;flex-direction:column;gap:3px;color:${C.text3};font:800 8px/1.2 ${NUM_FONT};letter-spacing:.1em;text-transform:uppercase}
        .td-hero-stats b{color:${C.green};font:900 21px/1 ${NUM_FONT}}
        .td-list{display:flex;flex-direction:column;gap:5px}
        .td-row{display:flex;align-items:center;gap:11px;width:100%;padding:10px 12px;text-align:left;cursor:pointer;
          border:1px solid ${C.border};border-radius:11px;background:rgba(255,255,255,.022);color:inherit}
        .td-row:hover{border-color:rgba(0,245,173,.34);background:rgba(0,245,173,.045)}
        .td-rank{flex:0 0 20px;font:900 12px/1 ${NUM_FONT};text-align:right}
        .td-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
        .td-top{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .td-name{font-size:13.5px;font-weight:700;color:${C.text}}
        .td-vs{font:800 8.5px/1 ${NUM_FONT};color:${C.text3};letter-spacing:.06em}
        .td-why{font-size:11.5px;line-height:1.4;color:${C.text2}}
        .td-marks{display:flex;align-items:center;gap:9px}
        .td-marks>span:first-child{flex:1;min-width:0}
        .td-right{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
        .td-more{width:100%;margin-top:7px;padding:9px;cursor:pointer;border:1px solid ${C.border};
          border-radius:10px;background:transparent;color:${C.text3};font:800 10px/1 ${NUM_FONT};letter-spacing:.1em}
        .td-more:hover{border-color:rgba(0,245,173,.34);color:${C.green}}
        .td-foot{margin:13px 0 0;max-width:620px;font-size:11px;line-height:1.55;color:${C.text3}}
        @media(max-width:620px){
          .td-hero{padding:17px 15px 15px}
          .td-hero-stats{gap:16px}
          .td-row{gap:8px;padding:9px 10px}
          .td-why{font-size:11px}
        }
      `}</style>
    </div>
  )
}
