'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { gradedResultsUrl } from '../lib/dataSource'
import { clean } from '../lib/player'
import DenseTable from './DenseTable'
import { Empty } from './ui'

// PER-PLAYER PICK TRACK RECORD.
//
// The category scorecard answers "does the HR bucket work". This answers the
// question you actually ask when you're building a card: has THIS GUY, when the
// bot has picked him, done the thing he was picked for.
//
// Nothing on the site did this before. Results only ever loaded one graded day,
// so a player's history existed in the archive but was never assembled — you
// could see that Judge homered last Tuesday, not that he's been picked six
// times and delivered twice.
//
// This fetches every graded day the backtest knows about (nine today) and rolls
// them up by player_id. Each appearance is graded against its own category's
// job, same rules as the scorecard:
//
//   HR / TOP   homered
//   HIT        got a base hit
//   CONTACT    2+ total bases
//   HRR        2+ combined hits, runs and RBI
//
// THE SAMPLE IS SMALL AND THE TABLE SAYS SO. Nine days means most players have
// been picked once or twice. A 1-for-1 player is not a 100% player, so the
// default sort is by number of picks rather than by hit rate, the rate column
// is blank under three appearances, and there's a minimum-picks filter that
// starts at 3. Sorting a nine-day archive by percentage would put every
// one-appearance fluke on top, which is exactly the wrong thing for this to do.

const JOBS = {
  HR:      { label: 'HR',      job: '1+ HR',          test: (r) => r.hr > 0 },
  TOP:     { label: 'Top',     job: '1+ HR',          test: (r) => r.hr > 0 },
  HIT:     { label: 'Hit',     job: '1+ hit',         test: (r) => r.hits > 0 },
  CONTACT: { label: 'Contact', job: '2+ total bases', test: (r) => r.tb >= 2 },
  HRR:     { label: 'HRR',     job: '2+ H+R+RBI',     test: (r) => r.hits + r.runs + r.rbi >= 2 },
}
const CATS = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const i = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// Shared loader. The track-record tab uses it to build its table; the pick
// scorecard uses it to stamp a prior record onto tonight's picks. Same fetch,
// same rules, so the two views can't disagree.
//
// Nine small JSON files, fetched in parallel and only when a view that needs
// them mounts.
export function usePickRecords(backtest) {
  const [days, setDays] = useState([])
  const [state, setState] = useState('loading')

  const dates = useMemo(() => {
    const per = backtest?.per_day
    const d = Array.isArray(per) ? per.map((x) => x?.date) : Object.keys(per || {})
    return d.filter(Boolean).sort().reverse()
  }, [backtest])

  useEffect(() => {
    if (!dates.length) { setState('none'); return }
    let alive = true
    setState('loading')
    Promise.all(dates.map((d) =>
      fetch(gradedResultsUrl(d))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => ({ date: d, json: j }))
        .catch(() => ({ date: d, json: null }))
    )).then((all) => {
      if (!alive) return
      const ok = all.filter((x) => x.json)
      setDays(ok)
      setState(ok.length ? 'done' : 'error')
    })
    return () => { alive = false }
  }, [dates])

  // player_id -> { picks, did, byCat: { HR: {n, ok}, ... } }
  const byPlayer = useMemo(() => {
    const map = new Map()
    days.forEach(({ json }) => {
      const slots = Array.isArray(json?.graded_slots) ? json.graded_slots
        : Array.isArray(json?.results) ? json.results
        : Array.isArray(json) ? json : []
      slots.forEach((s) => {
        const role = clean(s?.game_pick_role, '').split('/')[0].trim().toUpperCase()
        const j = JOBS[role]
        if (!j) return
        const id = String(s?.player_id ?? '')
        if (!id) return
        const app = {
          hr: i(s.actual_hr), hits: i(s.actual_hits),
          runs: i(s.actual_runs), rbi: i(s.actual_rbi), tb: i(s.actual_tb),
        }
        const did = j.test(app)
        let p = map.get(id)
        if (!p) { p = { picks: 0, did: 0, byCat: {} }; map.set(id, p) }
        p.picks++
        if (did) p.did++
        p.byCat[role] = p.byCat[role] || { n: 0, ok: 0 }
        p.byCat[role].n++
        if (did) p.byCat[role].ok++
      })
    })
    return map
  }, [days])

  return { days, dates, state, byPlayer }
}

export default function PlayerPickRecord({ backtest, onPlayerClick }) {
  const { days, dates, state } = usePickRecords(backtest)
  const [minPicks, setMinPicks] = useState(3)
  const [cat, setCat] = useState('ALL')

  // One row per player, with every appearance folded in.
  const players = useMemo(() => {
    const map = new Map()
    days.forEach(({ date, json }) => {
      const slots = Array.isArray(json?.graded_slots) ? json.graded_slots
        : Array.isArray(json?.results) ? json.results
        : Array.isArray(json) ? json : []
      slots.forEach((s) => {
        const role = clean(s?.game_pick_role, '').split('/')[0].trim().toUpperCase()
        const j = JOBS[role]
        if (!j) return
        const id = String(s?.player_id ?? s?.name ?? '')
        if (!id) return
        const app = {
          date, role,
          hr: i(s.actual_hr), hits: i(s.actual_hits),
          runs: i(s.actual_runs), rbi: i(s.actual_rbi), tb: i(s.actual_tb),
        }
        app.did = j.test(app)
        let p = map.get(id)
        if (!p) {
          p = {
            _key: id, id,
            name: clean(s?.name, '—'), team: clean(s?.team, ''),
            apps: [], byCat: {},
          }
          map.set(id, p)
        }
        p.apps.push(app)
        p.byCat[role] = p.byCat[role] || { n: 0, ok: 0 }
        p.byCat[role].n++
        if (app.did) p.byCat[role].ok++
      })
    })

    return [...map.values()].map((p) => {
      const use = cat === 'ALL' ? p.apps : p.apps.filter((a) => a.role === cat)
      const n = use.length
      const ok = use.filter((a) => a.did).length
      const hr = use.reduce((s, a) => s + a.hr, 0)
      const hits = use.reduce((s, a) => s + a.hits, 0)
      const tb = use.reduce((s, a) => s + a.tb, 0)
      // The category mix, most-picked first — this is the "which pick was it"
      // part, kept as a compact string so it fits one column.
      const mix = CATS.filter((c) => p.byCat[c])
        .sort((a, b) => p.byCat[b].n - p.byCat[a].n)
        .map((c) => `${JOBS[c].label} ${p.byCat[c].ok}/${p.byCat[c].n}`)
        .join(' · ')
      const last = [...use].sort((a, b) => (a.date < b.date ? 1 : -1))[0]
      return {
        _key: p._key, _raw: { player_id: p.id, name: p.name, team: p.team },
        name: p.name, team: p.team,
        picks: n, did: ok,
        // Blank under 3 picks — a 1-for-1 is not a rate.
        rate: n >= 3 ? (100 * ok) / n : null,
        hr, hits, tb,
        mix, last: last ? last.date.slice(5) : '',
        streak: (() => {
          // Consecutive most-recent appearances that delivered. A small,
          // readable "is he on one right now" signal.
          const seq = [...use].sort((a, b) => (a.date < b.date ? 1 : -1))
          let k = 0
          for (const a of seq) { if (a.did) k++; else break }
          return k
        })(),
      }
    }).filter((p) => p.picks >= minPicks)
      .sort((a, b) => b.picks - a.picks || (b.rate ?? -1) - (a.rate ?? -1))
  }, [days, minPicks, cat])

  if (state === 'loading') return <Empty text={`Loading ${dates.length} graded days…`} />
  if (state === 'none') return <Empty text="No graded days in the backtest summary yet." />
  if (state === 'error') return <Empty text="None of the graded files could be loaded." />

  const totalApps = players.reduce((s, p) => s + p.picks, 0)
  const totalOk = players.reduce((s, p) => s + p.did, 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Pick</span>
        {['ALL', ...CATS].map((c) => (
          <Btn key={c} active={cat === c} onClick={() => setCat(c)}>
            {c === 'ALL' ? 'All' : JOBS[c].label}
          </Btn>
        ))}
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 8 }}>Min picks</span>
        {[1, 2, 3, 5].map((m) => (
          <Btn key={m} active={minPicks === m} onClick={() => setMinPicks(m)}>{m}+</Btn>
        ))}
      </div>

      <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, fontFamily: NUM_FONT }}>
        {players.length} players · {totalApps} appearances · {totalOk} delivered · {days.length} graded days
      </div>

      <DenseTable
        rows={players}
        columns={[
          { key: 'name',   label: 'Player', heat: false, w: 152, bold: true, sticky: true },
          { key: 'team',   label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
          { key: 'mix',    label: 'Picked as', heat: false, w: 210, dim: true, mono: true,
            title: 'Every category he has been picked in, with how often he did that category’s job. Most-picked first.' },
          { key: 'last',   label: 'Last',   heat: false, w: 44, mono: true, dim: true,
            title: 'Most recent day he was a pick' },
          { key: 'picks',  label: 'Picks',  w: 46,
            title: 'How many times the bot has picked him across the graded archive' },
          { key: 'did',    label: 'Did job', w: 56,
            title: 'How many of those appearances delivered on that pick’s own outcome' },
          { key: 'rate',   label: 'Rate %', w: 54, dp: 0,
            fmt: (v) => (v == null ? '—' : Number(v).toFixed(0)),
            title: 'Blank under three picks on purpose — a 1-for-1 player is not a 100% player, and nine days is not enough to make him one.' },
          { key: 'streak', label: 'Run',    w: 40,
            title: 'Consecutive most-recent appearances that delivered' },
          { key: 'hr',     label: 'HR',     w: 38 },
          { key: 'hits',   label: 'H',      w: 38 },
          { key: 'tb',     label: 'TB',     w: 40 },
        ]}
        onRowClick={onPlayerClick}
        initialSort="picks"
        maxHeight={520}
        caption={`Every hitter the bot has picked across ${days.length} graded days, and whether he did the job of the pick he was on — a HIT pick that singled counts, a HR pick that singled does not. "Picked as" is the answer to which pick it was: it lists each category he has appeared in with his record inside it, so a player who is money as a HIT pick and dead as a HR pick reads that way instead of averaging into nothing. Sorted by number of picks rather than by rate, and Rate is blank under three appearances — with nine days in the archive most of these players have been picked once or twice, and ranking by percentage would just float the flukes to the top. Raise Min picks to 5 to see only the names with something close to a record. Click a row to open the hitter.`}
      />
    </div>
  )
}

function Btn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? `${C.orange}22` : 'transparent',
      border: `1px solid ${active ? C.orange : C.border}`,
      color: active ? C.orange : C.text3,
      borderRadius: 7, padding: '3px 9px', fontSize: 10,
      fontWeight: active ? 800 : 600, cursor: 'pointer', fontFamily: NUM_FONT,
    }}>{children}</button>
  )
}
