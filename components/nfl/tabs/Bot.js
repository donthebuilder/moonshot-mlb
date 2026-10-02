'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE, MARKETS } from '../../../lib/nfl/theme'
import { PanelTitle } from '../../ui'
import { PillRow } from '../../Filters'
import { SportTheme } from '../../SportTheme'
import { ShortlistHead, ShortlistPills } from '../../shortlist/ShortlistParts'
import NflTable from '../NflTable'
import Picks from './Picks'
import { quoteFor, impliedPct, fmtOdds, edgeOf } from '../../../lib/nfl/oddsMatch'
import { fetchNfl, nflSlatePaths, nflPicksPaths, nflLogPaths, nflSlateLooksReal, nflPicksLooksReal } from '../../../lib/nfl/dataSource'

// 🤖 THE BOT, TUDDY (2026-09-29, Donovan on Picks/Pairs/Live: "figure it
// out" -- build it from MOONSHOT's). MOONSHOT's Bot page (components/tabs/
// Bot.js) is a PanelTitle with a view pill row over its Shortlist; this is
// the same frame and the same Shortlist head and pills
// (components/shortlist/ShortlistParts.js), with football's numbers in the
// table:
//
//   Shortlist   everyone the model scored for one market this week, ranked
//               by the model's score, the bot's card slot beside him, the
//               market's own published stats, and the price read MOONSHOT's
//               Shortlist does -- only where it is honest (below).
//   The card    the bot's graded ladders (components/nfl/tabs/Picks.js),
//               unchanged: the calls and you-vs-the-bot.
//   Next week   the Shortlist over next week's slate and card, when the bot
//               has built them.
//
// THE PRICE READ HAS A REAL RATE OR NO READ. MOONSHOT compares the price to
// hr_per_pa through his lineup spot -- a probability. TUDDY's 0-100 score is
// a RANK, never compared to a price (lib/nfl/oddsMatch edgeOf's own rule).
// The rate here is nfl_logs.json's published clear-rate: games he cleared
// this market's bar over his last ten, and only with 5+ games behind it.
// No rate, or no price on the same line, and Room/Read stay blank and say so.
//
// DROPPED FROM MOONSHOT'S PAGE, FOR WANT OF DATA: Today's sheet and The Read.
// The bot publishes no NFL sheet (the text document MOONSHOT's sheet viewer
// parses) and no per-player reason text; the bot would need an
// nfl_sheet_week.txt and reason fields on the card's rungs.

const VIEWS = [
  { key: 'short', label: 'Shortlist' },
  { key: 'card', label: 'The card' },
  { key: 'next', label: 'Next week' },
]

// The market's own stats, from the payload's research columns, in this order.
const MARKET_STATS = {
  TD: ['TD', 'xTD', 'RZ', 'GL', 'TGT%'],
  REC_YDS: ['TGT%', 'TGT', 'RECYD', 'AIRYD', 'WOPR'],
  REC: ['TGT%', 'TGT', 'REC', 'WOPR'],
  RUSH_YDS: ['CAR', 'RUYD', 'RZ', 'RYOE'],
  RUSH_ATT: ['CAR', 'RUYD', 'GL'],
  PASS_YDS: ['ATT', 'PAYD', 'PATD', 'CPOE'],
  KICK_PTS: ['FGM', 'PAT'],
  DEF_TD: [],
}
const MIN_GAMES = 5
const READ_WORD = { value: ['room', 'green'], fair: ['fair', 'text2'], priced_out: ['priced out', 'red'] }

function Shortlist({ data, picks, logs, odds, market, setMarket, onPlayerClick, week = 'this' }) {
  const [view, setView] = useState('profile')
  const [limit, setLimit] = useState(40)
  const cols = data?.research_columns || []
  const blk = picks?.card?.[market] || null
  const slot = useMemo(() => new Map((blk?.rungs || []).map((r) => [String(r.player_id), r])), [blk])
  const bar = logs?.bars?.[market]?.[1]

  const ranked = useMemo(() => (data?.players || [])
    .filter((p) => !p.on_bye && Number.isFinite(Number(p.scores?.[market])))
    .map((p) => {
      const q = quoteFor(odds, p, market)
      const r = logs?.logs?.[String(p.player_id)]?.rates?.[market]?.l10
      const rate = Array.isArray(r) && r[1] >= MIN_GAMES ? (100 * r[0]) / r[1] : null
      const onLine = q && q.matches
      const e = onLine && rate != null ? edgeOf(q, rate) : null
      const s = slot.get(String(p.player_id))
      const row = {
        _key: p.player_id, _raw: p, name: p.name, pos: p.position, team: p.team, opp: p.opp || '',
        score: Number(p.scores[market]),
        pick: s ? `#${s.rank}${s.grade ? ` · ${s.grade}` : ''}` : '',
        rate, rateTxt: Array.isArray(r) ? `${r[0]}/${r[1]}` : '',
        price: q ? q.over : null,
        priceTxt: !q ? 'no price posted' : `${fmtOdds(q.over)}${onLine ? '' : ` ≠ o${q.line}`}`,
        assume: onLine ? (q.implied ?? impliedPct(q.over)) : null,
        room: e ? e.diff : null,
        read: e ? e.verdict : null,
      }
      for (const k of MARKET_STATS[market] || []) {
        const c = cols.find((x) => x.key === k)
        const v = Number(p.stats?.[k])
        row[`s_${k}`] = Number.isFinite(v) ? (c?.pct ? v * 100 : v) : null
      }
      return row
    })
    .sort((a, b) => b.score - a.score), [data, market, odds, logs, slot, cols])

  const rows = useMemo(() => {
    const base = view === 'fit' ? [...ranked].sort((a, b) => (b.room ?? -999) - (a.room ?? -999)) : ranked
    return base.slice(0, limit)
  }, [ranked, view, limit])
  const anyPriced = ranked.some((r) => r.price != null)
  const label = (MARKETS.find(([k]) => k === market) || [])[1] || market

  const columns = [
    { key: 'name', label: 'Player', heat: false, w: 150, bold: true, sticky: true },
    { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true, teamMark: 'nfl' },
    { key: 'opp', label: 'Opp', heat: false, w: 38, mono: true, dim: true },
    { key: 'pos', label: 'Pos', heat: false, w: 34, mono: true, dim: true },
    { key: 'pick', label: 'Card', heat: false, w: 64, mono: true,
      title: `His rung on the bot's ${label} card this week (#1 first) and its grade. Blank: not on the card.`,
      fmt: (v) => (v ? <span style={{ color: C.green, fontWeight: 800 }}>{v}</span> : <span style={{ color: C.text3 }}>—</span>) },
    { key: 'score', label: 'Score', w: 56, dp: 1, primary: true,
      title: `The model's 0-100 ${label} score. A rank against this week's field, not a probability.` },
    ...(MARKET_STATS[market] || []).map((k) => {
      const c = cols.find((x) => x.key === k)
      return { key: `s_${k}`, label: c?.label || k, w: 52, dp: c?.dp ?? 1, title: c?.desc }
    }),
    { key: 'rate', label: 'L10 clear', w: 64, heat: false, mono: true,
      fmt: (v, r) => (v == null ? <span style={{ color: C.text3 }}>{r.rateTxt || '—'}</span> : `${v.toFixed(0)}% · ${r.rateTxt}`),
      title: `Games he cleared the ${label} bar${bar != null ? ` (${bar}+)` : ''} over his last ten, from his game log. Needs ${MIN_GAMES}+ games to count as a rate.` },
    { key: 'price', label: 'Price', heat: false, w: 64, mono: true, fmt: (v, r) => r.priceTxt,
      title: 'The book’s price on this market. ≠ means the book is on a different line than the bar — a different bet.' },
    { key: 'assume', label: 'Odds assume', w: 70, heat: false, mono: true, fmt: (v) => (v == null ? '—' : `${v.toFixed(1)}%`),
      title: 'The clear-rate the price needs to break even.' },
    { key: 'room', label: 'Room', w: 52, scale: 'div', anchor: 0, ceiling: 8, anchorLabel: 'the break-even price',
      fmt: (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`),
      title: 'His L10 clear-rate minus what the odds assume, in points. Only where both exist on the same line.' },
    { key: 'read', label: 'Read', heat: false, w: 84,
      fmt: (v) => (v ? <b style={{ color: C[READ_WORD[v][1]], fontSize: 10 }}>{READ_WORD[v][0]}</b> : <span style={{ color: C.text3 }}>—</span>) },
  ]

  return (
    <div>
      <PillRow label="Market" value={market} onChange={setMarket}
        options={MARKETS.map(([k, l]) => ({ key: k, label: l, count: (data?.players || []).filter((p) => !p.on_bye && Number.isFinite(Number(p.scores?.[k]))).length }))} />
      {!ranked.length ? (
        <div style={{ fontSize: TYPE.body, color: C.text3, padding: '12px 2px' }}>
          {week === 'next' ? 'Next week’s board isn’t built yet — the bot builds it on its weekly run.' : `Nobody is scored for ${label} this week yet.`}
        </div>
      ) : (
        <>
          <div style={{ marginTop: 8 }}>
            <ShortlistHead title={`🎯 Who stands out · ${label}`} shown={rows.length} total={ranked.length} limit={limit} setLimit={setLimit} />
          </div>
          {blk?.rungs?.length > 0 && (
            <div style={{ fontSize: 9.5, color: C.text3, margin: '0 0 8px', lineHeight: 1.5 }}>
              The bot put <b style={{ color: C.text2 }}>{blk.rungs.length}</b> of {ranked.length} on its {label} card
              {week === 'next' ? ' for next week' : ' this week'}{blk.bar != null ? ` — each needs ${blk.bar}+` : ''}.
            </div>
          )}
          <div style={{ display: 'flex', gap: 5, marginBottom: 9, flexWrap: 'wrap' }}>
            <ShortlistPills options={[['profile', 'Strongest profiles'], ['fit', 'Best odds fits']]} value={view} onChange={setView} />
            {view === 'fit' && !anyPriced && (
              <span style={{ fontSize: 9.5, color: C.text3, alignSelf: 'center' }}>
                no {label} prices posted yet — every row reads &ldquo;no price posted&rdquo; until the odds run lands
              </span>
            )}
          </div>
          <NflTable
            key={`${market}-${view}-${week}`}
            rows={rows}
            columns={columns.map((c) => ({ ...c, group: BOT_GROUP_OF(c.key) }))}
            onRowClick={onPlayerClick ? (p) => onPlayerClick(p, market) : null}
            initialSort={null}
            heatMode="sorted"
            maxHeight={560}
            maxRows={Math.max(rows.length, 1)}
            dimRow={(r) => r._raw?.low_sample}
            caption={`Strongest profiles is the model's ${label} ranking; Best odds fits re-sorts by Room. Room and Read only speak where a real rate (his L10 clear-rate, ${MIN_GAMES}+ games) meets a price on the same line as the bar — the 0-100 score never touches the odds. Dimmed rows are low-sample.`}
          />
        </>
      )}
    </div>
  )
}

// Next week's slate, card and logs: fetched only when the view is opened.
function useNextWeek(on) {
  const [st, setSt] = useState({ data: null, picks: null, logs: null, loading: false })
  useEffect(() => {
    if (!on || st.data || st.loading) return
    let alive = true
    setSt((s) => ({ ...s, loading: true }))
    Promise.all([
      fetchNfl(nflSlatePaths('next'), nflSlateLooksReal).catch(() => null),
      fetchNfl(nflPicksPaths('next'), nflPicksLooksReal).catch(() => null),
      fetchNfl(nflLogPaths('next')).catch(() => null),
    ]).then(([data, picks, logs]) => { if (alive) setSt({ data, picks, logs, loading: false }) })
    return () => { alive = false }
  }, [on]) // eslint-disable-line react-hooks/exhaustive-deps
  return st
}

// THE GROUP ROW (2026-10-01, BATCH-TABLE-SKIN-V2; the v2 skin only): who and
// his rung on the card, the case for him (the score and the stats behind it),
// then the price.
const BOT_G = {
  call: { key: 'call', label: 'Call', order: 0 }, why: { key: 'why', label: 'The case', order: 1 }, price: { key: 'price', label: 'The price', order: 2 },
}
const BOT_GROUP_OF = (key) => (['name', 'team', 'opp', 'pos', 'pick'].includes(key) ? BOT_G.call
  : ['rate', 'price', 'assume', 'room', 'read'].includes(key) ? BOT_G.price : BOT_G.why)

export default function Bot({ data, picks, results, logs, matchup, odds, oddsStatus, onPlayerClick }) {
  const [view, setView] = useState('short')
  const [market, setMarket] = useState('TD')
  const next = useNextWeek(view === 'next')
  return (
    <SportTheme theme={C} accent={C.green} numFont={NUM_FONT}>
      <div>
        <PanelTitle
          title="The Bot"
          sub="This week ranked, the card it called, and next week once it's built"
          right={<PillRow value={view} options={VIEWS.map((v) => ({ key: v.key, label: v.label }))} onChange={setView} />}
          theme={C}
          numFont={NUM_FONT}
        />
        {view === 'short' && <Shortlist data={data} picks={picks} logs={logs} odds={odds} market={market} setMarket={setMarket} onPlayerClick={onPlayerClick} />}
        {view === 'card' && <Picks picks={picks} results={results} data={data} matchup={matchup} onPlayerClick={onPlayerClick} odds={odds} oddsStatus={oddsStatus} logs={logs} />}
        {view === 'next' && (next.loading && !next.data
          ? <div style={{ fontSize: TYPE.body, color: C.text3, padding: '12px 2px' }}>Reading next week’s board…</div>
          : <Shortlist data={next.data} picks={next.picks} logs={next.logs} odds={null} market={market} setMarket={setMarket} onPlayerClick={onPlayerClick} week="next" />)}
      </div>
    </SportTheme>
  )
}
