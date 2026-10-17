'use client'
// BUCKETS ON HIM (2026-10-17): MOONSHOT's BotOnHim (components/BotOnHim.js) for a basketball player. Where MOONSHOT lists each ROLE the bot gave him
// on the clean pregame record, this lists each BUCKETS MARKET it scored him in on the LOCKED record (buckets_log, graded rows only; a row that
// is void -- he did not play -- is out), judged on that market's own bar: the games on file, the games he was CALLED in, how often a called
// market cleared, the games he cleared the bar at all, and the same split by home and away. n on every number. Research, not a call.
// Per model version: each market is its own version (lib/nba/model.js NBA_MARKETS), named under the table. A badge appears only while it is true.
// Source: data.calls of /api/buckets/player (the live versions' rows on him). Home and away come from his game log, joined on the game id.
import { useMemo } from 'react'
import BucketsTable from './BucketsTable'
import ScrollHint from '../player/ScrollHint'
import HelpTip from '../HelpTip'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import { ACTUAL_WORD } from '../../lib/nba/legs'
import { BRAND } from '../../lib/routes'

const PERFECT_MIN = 3   // a perfect run counts from this many called games
const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const frac = (a, b) => (b ? `${a}/${b}` : '—')

export default function BucketsOnHim({ calls = [], homeOf = {}, style = null }) {
  const model = useMemo(() => {
    const graded = (calls || []).filter((r) => r.actual != null && r.hit != null && !r.void_reason && NBA_MARKETS[r.market])
    if (!graded.length) return null
    const by = new Map()
    for (const r of graded) { if (!by.has(r.market)) by.set(r.market, []); by.get(r.market).push(r) }
    const rows = Object.keys(NBA_MARKETS).filter((m) => by.has(m)).map((m) => {
      const R = by.get(m)
      const called = R.filter((r) => r.status === 'called')
      const home = (r) => homeOf[String(r.game_id)]
      const split = (side) => { const g = R.filter((r) => home(r) === side); return frac(g.filter((r) => r.hit).length, g.length) }
      const def = NBA_MARKETS[m]
      return {
        _id: m, market: def.label, job: def.bar != null ? `${def.bar}+ ${ACTUAL_WORD[m] || ''}`.trim() : '', version: def.version,
        g: R.length, called: called.length, did: frac(called.filter((r) => r.hit).length, called.length), hits: R.filter((r) => r.hit).length,
        home: split(true), away: split(false), _calledN: called.length, _calledHit: called.filter((r) => r.hit).length,
      }
    })
    const dates = graded.map((r) => r.game_date).sort()
    const badges = rows.filter((r) => r._calledN >= PERFECT_MIN && r._calledHit === r._calledN)
      .map((r) => ({ key: r._id, label: 'CLEARED EVERY TIME CALLED', text: `${r._calledHit}/${r._calledN} in ${r.market}`, job: r.job || r.market }))
    return { rows, games: new Set(graded.map((r) => r.game_date)).size, since: dates[0], through: dates[dates.length - 1], badges }
  }, [calls, homeOf])
  if (!model) return null
  const brand = BRAND.nba.name
  const columns = [
    { key: 'market', label: 'Market', group: 'Market', sticky: true, heat: false, w: 104, fmt: (v, r) => <span style={{ display: 'grid', lineHeight: 1.2 }}><b>{v}</b>{r.job ? <span style={{ fontSize: 12, color: C.text3 }}>bar: {r.job}</span> : null}</span> },
    { key: 'g', label: 'G', group: 'All games', w: 36, heat: false, numeric: true, title: 'Games with a graded locked row in that market, voids (did not play) out' },
    { key: 'called', label: 'Called', group: 'All games', w: 52, heat: false, numeric: true, title: 'Games he was CALLED in for that market' },
    { key: 'did', label: 'Cleared when called', group: 'All games', w: 64, heat: false, title: 'Called games where he cleared the market’s bar' },
    { key: 'hits', label: 'Cleared (any)', group: 'All games', w: 60, heat: false, numeric: true, title: 'Games he cleared the bar, called or not' },
    { key: 'home', label: 'Home', group: 'Cleared / games by side', w: 52, heat: false, title: 'Cleared / games at home' },
    { key: 'away', label: 'Away', group: 'Cleared / games by side', w: 52, heat: false, title: 'Cleared / games away' },
  ]
  return (
    <section style={{ marginTop: 14, ...style }} aria-label={`${brand} on him`}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: C.text2, fontFamily: NUM_FONT }}>{brand} ON HIM</span>
        <span style={{ fontSize: 12, color: C.text3 }}>{model.games} game{model.games === 1 ? '' : 's'} on the locked record, {day(model.since)}–{day(model.through)}<HelpTip label="Market record" text={`Each market ${brand} has scored him in, judged on that market’s own bar. Locked rows only, graded; a game he did not play is out. Small samples: a lead, not a fact.`} /></span>
      </div>
      {model.badges.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {model.badges.map((b) => (
            <span key={b.key} title={`${b.label}: ${b.text} (bar: ${b.job}), from ${PERFECT_MIN} called games`} style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, color: C.purple, border: `1px solid ${C.purple}66`, borderRadius: 6, padding: '3px 8px' }}>
              {b.label} · {b.text}
            </span>
          ))}
        </div>
      ) : null}
      <ScrollHint hint="Swipe for Home, Away">
        <BucketsTable rows={model.rows} columns={columns} heatMode="none" maxRows={model.rows.length} maxHeight={9999}
          caption={`Each market ${brand} has scored him in, on its own bar. Model versions: ${model.rows.map((r) => r.version).join(', ')}.`} />
      </ScrollHint>
    </section>
  )
}
