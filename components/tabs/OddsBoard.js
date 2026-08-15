'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, n, clean, hrScore, hitScore, prodScore, tbScore } from '../../lib/player'
import { fmtOdds, impliedPct, fairOdds, hrPerGame, normName } from '../../lib/odds'
import DenseTable from '../DenseTable'
import OddsStatus, { useOddsStatus } from '../OddsStatus'

// 💵 THE ODDS PAGE (2026-08-15, Donovan: "we need to see the line the book has
// them for, esp if it's at like 1.5 or like a plus-money look for the hit.
// then maybe like a page to see all the odds.")
//
// Every price the bot pulled, in one table, with the thing the rest of the
// site could never show him: THE BOOK'S ACTUAL NUMBER. Every other surface
// assumes the default bar — 1+ hit, 1+ homer — and quietly reports a hit rate
// against a bar nobody is offering. Here the line is a column, and when it
// isn't the standard one it says so out loud, because "76% to get a hit" and
// "76% to get TWO hits" are different bets wearing the same percentage.
//
// PLUS MONEY IS ITS OWN LENS. A hit prop at +150 is the shape he asked for by
// name: the book thinks it's unlikely, and if his own board disagrees that's
// where the money is. One toggle isolates every plus-money quote on the slate.
//
// NOTHING HERE IS A VERDICT EXCEPT ON HOME RUNS. hr_per_pa is the only real
// per-game probability the slate publishes, so it is the only market where an
// edge number appears. Everywhere else the price and the score sit side by
// side and the reader draws his own line — a 0-100 score is not a probability
// and multiplying it against a break-even would be the most confident wrong
// number on the site.

const MARKETS = [
  { key: 'batter_home_runs', label: 'HR', std: 0.5, color: '#FB923C' },
  { key: 'batter_hits', label: 'Hits', std: 0.5, color: '#60A5FA' },
  { key: 'batter_hits_runs_rbis', label: 'H+R+RBI', std: 1.5, color: '#4ade80' },
  { key: 'batter_total_bases', label: 'Bases', std: 1.5, color: '#FCD34D' },
  { key: 'batter_runs_scored', label: 'Runs', std: 0.5, color: '#c084fc' },
  { key: 'batter_rbis', label: 'RBI', std: 0.5, color: '#f87171' },
]

const scoreFor = (p, mk) => (
  mk === 'batter_home_runs' ? hrScore(p)
    : mk === 'batter_hits' ? hitScore(p)
    : mk === 'batter_hits_runs_rbis' ? prodScore(p)
    : mk === 'batter_total_bases' ? tbScore(p)
    : 0
)

export default function OddsBoard({ players = [], odds = null, onPlayerClick }) {
  const [market, setMarket] = useState('batter_home_runs')
  const [plusOnly, setPlusOnly] = useState(false)
  const [offStd, setOffStd] = useState(false)

  const status = useOddsStatus()
  const live = MARKETS.find((m) => m.key === market) || MARKETS[0]

  // Join the published board to tonight's slate. by_player_id is the honest
  // key; by_name is the fallback for a hitter the bot's join missed, and a
  // priced player who isn't on the slate at all simply can't be shown here —
  // he has no score to sit next to.
  const rows = useMemo(() => {
    const byId = odds?.by_player_id || {}
    const byName = odds?.by_name || {}
    if (!Object.keys(byId).length && !Object.keys(byName).length) return []
    const out = []
    players.forEach((p) => {
      const q = (byId[String(p?.player_id ?? p?.id)] || byName[normName(nameOf(p))] || {})[market]
      if (!q) return
      const over = n(q.over, NaN)
      const line = n(q.line, NaN)
      if (!Number.isFinite(over)) return
      const need = q.implied ?? impliedPct(over)
      const rate = market === 'batter_home_runs' ? hrPerGame(p) : null
      const edge = rate != null && need != null ? rate - need : null
      out.push({
        _key: `${p?.player_id}-${p?.game_pk}`,
        _raw: p,
        player: nameOf(p),
        tm: teamOf(p),
        opp: oppOf(p),
        line,
        over,
        need: need != null ? Math.round(10 * need) / 10 : null,
        score: Math.round(10 * scoreFor(p, market)) / 10 || null,
        rate: rate != null ? Math.round(10 * rate) / 10 : null,
        edge: edge != null ? Math.round(10 * edge) / 10 : null,
        fair: rate != null ? fairOdds(rate) : null,
        books: n(q.books, 0),
        best: n(q.best_over, over),
        bestBook: clean(q.best_book, ''),
      })
    })
    return out
  }, [players, odds, market])

  const shown = useMemo(() => {
    let r = rows
    if (plusOnly) r = r.filter((x) => x.over > 0)
    if (offStd) r = r.filter((x) => Number.isFinite(x.line) && Math.abs(x.line - live.std) > 1e-9)
    return r
  }, [rows, plusOnly, offStd, live.std])

  const offCount = rows.filter((x) => Number.isFinite(x.line) && Math.abs(x.line - live.std) > 1e-9).length
  const plusCount = rows.filter((x) => x.over > 0).length

  const pill = (on, col = C.orange) => ({
    padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 999,
    border: `1px solid ${on ? col : C.border}`,
    background: on ? `${col}22` : 'transparent',
    color: on ? col : C.text3, whiteSpace: 'nowrap',
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ fontSize: 19, fontWeight: 900, margin: 0 }}>💵 The odds</h2>
        <span style={{ fontSize: 11, color: C.text3 }}>
          every price the bot pulled tonight — with the number the book is actually offering
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, maxWidth: 760, marginBottom: 10 }}>
        <b style={{ color: C.text }}>LINE is the bar the book set.</b> Everywhere else this site
        assumes the standard one ({live.label} at {live.std}); when a book moves it — a hit line at
        1.5, bases at 2.5 — a rate measured against the standard bar is answering a different
        question. <b style={{ color: C.text }}>NEED</b> is what the price has to hit to break even.
        On home runs only, the slate publishes a real per-game rate, so <b style={{ color: C.text }}>EDGE</b> is
        his rate minus that break-even; every other market shows the score beside the price and
        leaves the judgement to you.
      </div>

      <OddsStatus status={status} />

      {/* market picker */}
      <div className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
        {MARKETS.map((m) => {
          const cnt = (() => {
            const byId = odds?.by_player_id || {}
            const byName = odds?.by_name || {}
            let k = 0
            players.forEach((p) => {
              if ((byId[String(p?.player_id ?? p?.id)] || byName[normName(nameOf(p))] || {})[m.key]) k++
            })
            return k
          })()
          return (
            <button key={m.key} onClick={() => setMarket(m.key)}
              disabled={!cnt}
              style={{ ...pill(market === m.key, m.color), opacity: cnt ? 1 : 0.35 }}>
              {m.label}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, marginLeft: 5, opacity: 0.75 }}>{cnt}</span>
            </button>
          )
        })}
      </div>

      {/* the two lenses he asked for by name */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <button onClick={() => setPlusOnly((v) => !v)} style={pill(plusOnly, '#4ade80')}
          title="Only quotes paying plus money — the book says unlikely. If your board disagrees, this is where the value is.">
          ＋ Plus money only <span style={{ fontFamily: NUM_FONT, fontSize: 9 }}>{plusCount}</span>
        </button>
        <button onClick={() => setOffStd((v) => !v)} style={pill(offStd, '#FCD34D')}
          title={`Only quotes where the book moved OFF the standard ${live.std} bar — the ones where a normal hit-rate column is answering the wrong question.`}>
          ≠ Off the standard line <span style={{ fontFamily: NUM_FONT, fontSize: 9 }}>{offCount}</span>
        </button>
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
          {shown.length} of {rows.length} shown
        </span>
      </div>

      {!rows.length ? (
        <div style={{
          background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12,
          padding: '14px 16px', fontSize: 11, color: C.text3, lineHeight: 1.6,
        }}>
          No {live.label} prices joined to tonight&apos;s slate yet. The status line above says where
          the fetch stands — an empty board here with a healthy status usually just means the books
          haven&apos;t posted this market for this slate.
        </div>
      ) : (
        <DenseTable
          key={`${market}-${plusOnly}-${offStd}`}
          rows={shown}
          columns={[
            { key: 'player', label: 'Hitter', heat: false, w: 152, bold: true, sticky: true },
            { key: 'tm', label: 'TM', heat: false, w: 34, mono: true, dim: true },
            { key: 'opp', label: 'vs', heat: false, w: 34, mono: true, dim: true },
            {
              key: 'line', label: 'LINE', w: 52, heat: false, dp: 1,
              title: `The bar the book set. Standard for ${live.label} is ${live.std} — anything else is a different bet than the boards assume.`,
              fmt: (v) => (Number.isFinite(v) ? (
                <b style={{
                  fontFamily: NUM_FONT,
                  color: Math.abs(v - live.std) > 1e-9 ? '#FCD34D' : C.text,
                }}>{Math.abs(v - live.std) > 1e-9 ? '≠ ' : ''}{v}</b>
              ) : '—'),
            },
            {
              key: 'over', label: 'PRICE', w: 58, heat: false,
              title: 'The over, as the book prices it. Green is plus money.',
              fmt: (v) => <b style={{ fontFamily: NUM_FONT, color: v > 0 ? '#4ade80' : C.text }}>{fmtOdds(v)}</b>,
            },
            {
              key: 'need', label: 'NEED %', w: 56, dp: 1, invert: true,
              title: 'What that price has to hit to break even.',
            },
            {
              key: 'score', label: `${live.label} score`, w: 62, dp: 1,
              title: "The bot's 0-100 confidence on THIS market. Not a probability — never compare it to NEED.",
            },
            ...(market === 'batter_home_runs' ? [
              { key: 'rate', label: 'HIS RATE %', w: 62, dp: 1,
                title: 'His own per-game homer probability, from hr_per_pa and his lineup spot. The one real rate the slate publishes.' },
              { key: 'fair', label: 'FAIR', w: 52, heat: false,
                title: 'What his own rate says the price should be.',
                fmt: (v) => (v == null ? '—' : <span style={{ fontFamily: NUM_FONT, color: C.text3 }}>{fmtOdds(v)}</span>) },
              { key: 'edge', label: 'EDGE', w: 54, dp: 1,
                title: 'His rate minus the break-even. Positive means the book is paying more than his season says it should.',
                fmt: (v) => (v == null ? '—' : (
                  <b style={{ fontFamily: NUM_FONT, color: v >= 3 ? '#4ade80' : v <= -3 ? '#f87171' : C.text2 }}>
                    {v > 0 ? '+' : ''}{v.toFixed(1)}
                  </b>
                )) },
            ] : []),
            { key: 'books', label: 'BKS', w: 40, heat: false, dim: true,
              title: 'How many of your books quoted it. One book is one opinion.' },
          ]}
          onRowClick={onPlayerClick}
          initialSort={market === 'batter_home_runs' ? 'edge' : 'score'}
          maxHeight={560}
          caption={`Click a header to sort, a row to open his card. LINE in yellow with a ≠ means the book is NOT on the standard ${live.std} bar for ${live.label} — the boards' hit rates are measured against ${live.std}, so read those two together carefully.`}
        />
      )}
    </div>
  )
}
