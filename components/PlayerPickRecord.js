'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { gradedResultsUrl } from '../lib/dataSource'
import { clean } from '../lib/player'
import DenseTable from './DenseTable'
import { Empty } from './ui'

// PER-PLAYER PICK TRACK RECORD, BY CATEGORY.
//
// The question this answers: when the bot picks THIS guy for THIS kind of bet,
// does he deliver. Not "is he good" — good at what.
//
// WHY THIS READS A STATIC FILE INSTEAD OF THE DATA BRANCH.
// The published `data` branch keeps the last stretch of graded days — nine at
// the time of writing. The local results archive has 39 days and 3,973 picks,
// six times as much, and the extra data changes the answers materially (the
// nine-day slice had TOP homering at 32.9%; across 39 days it's 19.2%). Nine
// days is not enough to say anything about an individual player, so this ships
// the full archive as a snapshot at public/pick_matrix.json rather than
// recomputing from whatever the branch happens to be holding.
//
// It is a SNAPSHOT and the header says so with its date range. Regenerating it
// is a bot-side job; see BOT-DATA-REQUESTS.md. Nothing here silently ages —
// if the file is stale, the range in the header is the tell.
//
// THE THRESHOLD RULE, which is the whole reason this table is trustworthy.
// A rate is shown only at 3+ picks IN THAT CATEGORY. Below that the cell shows
// the raw fraction and nothing else, because "1/1" is not 100% and sorting a
// column that treats it as 100% would put every one-appearance fluke on top —
// which is precisely the failure mode a table like this invites. 531 of the
// player-category cells clear 3; the rest stay fractions.
//
// Each category is graded on its own outcome:
//   HR / TOP / TOP15   homered
//   HIT                got a base hit
//   CONTACT            2+ total bases
//   HRR                2+ combined hits, runs and RBI

const JOBS = {
  HR:      { label: 'HR',      job: '1+ HR',          test: (r) => r.hr > 0 },
  TOP:     { label: 'Top',     job: '1+ HR',          test: (r) => r.hr > 0 },
  TOP15:   { label: 'Top15',   job: '1+ HR',          test: (r) => r.hr > 0 },
  HIT:     { label: 'Hit',     job: '1+ hit',         test: (r) => r.hits > 0 },
  CONTACT: { label: 'Contact', job: '2+ total bases', test: (r) => r.tb >= 2 },
  HRR:     { label: 'HRR',     job: '2+ H+R+RBI',     test: (r) => r.hits + r.runs + r.rbi >= 2 },
}
const CAT_ORDER = ['HIT', 'HRR', 'CONTACT', 'TOP', 'TOP15', 'HR']
const MIN_RATE = 3
const i = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// ── live-archive hook, still used by the pick scorecard ──────────────────────
// Reads the published branch. Kept separate from the snapshot on purpose: the
// scorecard needs whatever is current, this table needs whatever is biggest.
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
      setDays(ok); setState(ok.length ? 'done' : 'error')
    })
    return () => { alive = false }
  }, [dates])

  const byPlayer = useMemo(() => {
    const map = new Map()
    days.forEach(({ json }) => {
      const slots = Array.isArray(json?.graded_slots) ? json.graded_slots
        : Array.isArray(json?.results) ? json.results
        : Array.isArray(json) ? json : []
      slots.forEach((s) => {
        const role = clean(s?.game_pick_role || s?.pick_type, '').split('/')[0].trim().toUpperCase()
        const j = JOBS[role]
        if (!j) return
        const id = String(s?.player_id ?? '')
        if (!id) return
        const app = {
          hr: i(s.actual_hr), hits: i(s.actual_hits),
          runs: i(s.actual_runs), rbi: i(s.actual_rbi), tb: i(s.actual_tb),
        }
        const ok = j.test(app)
        let p = map.get(id)
        if (!p) { p = { picks: 0, did: 0, byCat: {} }; map.set(id, p) }
        p.picks++; if (ok) p.did++
        p.byCat[role] = p.byCat[role] || { n: 0, ok: 0 }
        p.byCat[role].n++; if (ok) p.byCat[role].ok++
      })
    })
    return map
  }, [days])

  return { days, dates, state, byPlayer }
}

// ── the matrix ───────────────────────────────────────────────────────────────

export default function PlayerPickRecord({ players = [], backtest, onPlayerClick }) {
  // BOT STREAK — consecutive most-recent designated picks that delivered,
  // from the live graded branch (the snapshot has totals, not sequence).
  const { days: liveDays } = usePickRecords(backtest)
  const botStreak = useMemo(() => {
    const seq = new Map() // name -> [{date, did}]
    ;[...liveDays].sort((a, b) => (a.date < b.date ? 1 : -1)).forEach(({ json }) => {
      const slots = json?.graded_slots || json?.results || []
      slots.forEach((s2) => {
        const role = String(s2?.game_pick_role || s2?.pick_type || '').split('/')[0].trim().toUpperCase()
        const jb = JOBS[role]
        const nm = String(s2?.name || '').toLowerCase().trim()
        if (!jb || !nm) return
        const ok = jb.test({ hits: i(s2.actual_hits), runs: i(s2.actual_runs), rbi: i(s2.actual_rbi), tb: i(s2.actual_tb), hr: i(s2.actual_hr) })
        ;(seq.get(nm) || seq.set(nm, []).get(nm)).push(ok)
      })
    })
    const m = new Map()
    seq.forEach((arr2, nm) => {
      let k = 0
      for (const ok of arr2) { if (ok === arr2[0]) k++; else break }
      m.set(nm, arr2[0] ? k : -k)
    })
    return m
  }, [liveDays])
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [minPicks, setMinPicks] = useState(5)
  const [only, setOnly] = useState('ALL')
  const [todayOnly, setTodayOnly] = useState(false)

  // TONIGHT'S PICKS, joined by name — the snapshot is keyed by name, and so
  // is this. The point: the archive tells you who delivers when picked, and
  // the one moment that matters is when he's picked AGAIN — tonight. A 🤖
  // column plus a filter makes the table answer "of tonight's picks, who has
  // actually earned the designation".
  const todayPicks = useMemo(() => {
    const m = new Map()
    players.forEach((p) => {
      const role = String(p?.game_pick_role || '').split('/')[0].trim().toUpperCase()
      const nm = String(p?.name || '').toLowerCase().trim()
      if (role && nm) m.set(nm, role)
    })
    return m
  }, [players])

  useEffect(() => {
    let alive = true
    fetch('/pick_matrix.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setData(j); setState(j ? 'done' : 'error') } })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    return data.players
      .filter((p) => p.p >= minPicks)
      .filter((p) => only === 'ALL' || (p.c?.[only]?.[1] || 0) >= MIN_RATE)
      .filter((p) => !todayOnly || todayPicks.has(String(p.n || '').toLowerCase().trim()))
      .map((p) => {
        const todayRole = todayPicks.get(String(p.n || '').toLowerCase().trim()) || ''
        const r = {
          streak: botStreak.get(String(p.n || '').toLowerCase().trim()) ?? null,
          today: todayRole,
          isToday: todayRole ? 1 : 0,
          _key: p.n, _raw: { name: p.n, team: p.t },
          name: p.n, team: p.t, picks: p.p, did: p.d,
          rate: p.p >= MIN_RATE ? (100 * p.d) / p.p : null,
          hr: p.hr, h: p.h, tb: p.tb,
          avg: p.ab >= 20 ? p.h / p.ab : null,
          last: String(p.last || '').slice(5),
        }
        // One column per category. Rate above the threshold, raw fraction
        // below it — never a percentage computed off one or two picks.
        CAT_ORDER.forEach((c) => {
          const cell = p.c?.[c]
          if (!cell) { r[c] = null; r[`${c}_t`] = '—'; return }
          const [ok, n] = cell
          r[c] = n >= MIN_RATE ? (100 * ok) / n : null
          r[`${c}_t`] = n >= MIN_RATE ? `${(100 * ok / n).toFixed(0)}% (${ok}/${n})` : `${ok}/${n}`
        })
        return r
      })
  }, [data, minPicks, only, todayOnly, todayPicks])

  if (state === 'loading') return <Empty text="Loading the pick archive…" />
  if (state === 'error') return <Empty text="pick_matrix.json could not be loaded." />

  const m = data.meta

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2 }}>
        Player pick record, by category
      </div>
      <div style={{ fontSize: 10, color: C.text3, marginBottom: 9, lineHeight: 1.6 }}>
        <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{m.picks.toLocaleString()} picks</b> ·{' '}
        <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{m.players} players</b> ·{' '}
        <span style={{ fontFamily: NUM_FONT }}>{m.days} graded days, {m.from} to {m.to}</span>.
        A snapshot of the full local archive, six times what the live branch carries — nine days
        isn&apos;t enough to say anything about one player.
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Has a record in</span>
        <Btn active={only === 'ALL'} onClick={() => setOnly('ALL')}>Any</Btn>
        {CAT_ORDER.map((c) => (
          <Btn key={c} active={only === c} onClick={() => setOnly(c)}>{JOBS[c].label}</Btn>
        ))}
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 10 }}>Total picks</span>
        {[3, 5, 10, 20].map((v) => (
          <Btn key={v} active={minPicks === v} onClick={() => setMinPicks(v)}>{v}+</Btn>
        ))}
        {todayPicks.size > 0 && (
          <Btn active={todayOnly} onClick={() => setTodayOnly((v) => !v)}>
            🤖 Picked today ({[...todayPicks.keys()].length})
          </Btn>
        )}
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginLeft: 6 }}>
          {rows.length} shown
        </span>
      </div>

      <DenseTable
        rows={rows}
        columns={[
          { key: 'name', label: 'Player', heat: false, w: 152, bold: true, sticky: true },
          { key: 'today', label: '🤖 Today', heat: false, w: 62, mono: true,
            fmt: (v) => (v ? v : '·'),
            title: 'He is one of tonight’s designated picks, in this category. The whole point of the archive: check his record in THAT column before trusting tonight’s designation.' },
          { key: 'team', label: 'Tm', heat: false, w: 34, mono: true, dim: true },
          { key: 'streak', label: 'Streak', heat: false, w: 52, mono: true,
            fmt: (v) => (v == null ? '—' : v > 0 ? `W${v}` : `L${-v}`),
            title: 'Consecutive most-recent PICKS delivered (W) or missed (L), from the live graded branch — the bot-side streak, not his batting streak.' },
          { key: 'last', label: 'Last', heat: false, w: 44, mono: true, dim: true,
            title: 'Most recent day he was picked' },
          { key: 'picks', label: 'Picks', w: 46,
            title: 'Total picks across every category' },
          { key: 'rate', label: 'All %', w: 48, dp: 0,
            fmt: (v) => (v == null ? '—' : Number(v).toFixed(0)),
            title: 'Did-its-job rate across every category combined. Read the category columns first — a player strong in one and dead in another averages into a middle that describes nobody.' },

          // One column per category, each sortable on its own.
          ...CAT_ORDER.map((c) => ({
            key: c, label: JOBS[c].label, w: 74,
            fmt: (v, row) => row[`${c}_t`],
            title: `${JOBS[c].label} picks — needed ${JOBS[c].job}. Percent shown at ${MIN_RATE}+ picks in this category; below that it stays a raw fraction, because 1/1 is not 100%. Sorting this column ranks only the players who cleared the threshold.`,
          })),

          { key: 'hr', label: 'HR', w: 38 },
          { key: 'h', label: 'H', w: 38 },
          { key: 'tb', label: 'TB', w: 40 },
          { key: 'avg', label: 'AVG', w: 48, dp: 3,
            fmt: (v) => (v == null ? '—' : Number(v).toFixed(3)),
            title: 'Batting average in games where he was a pick. Blank under 20 AB.' },
        ]}
        onRowClick={onPlayerClick}
        initialSort="picks"
        maxHeight={560}
        // 341 players, and the default 200 cap would silently drop a third of
        // them off the bottom of a table whose whole job is completeness.
        maxRows={400}
        caption={`Each category column is his record when picked FOR that category, graded on that category's own outcome — a HIT pick that singled counts, a HR pick that singled does not. A percentage appears only at ${MIN_RATE}+ picks in that column; anything thinner stays a raw fraction so it can't be mistaken for a rate or floated to the top by a sort. The point of the layout is the spread across a row: players are routinely excellent at one job and useless at another, and the All % column averages that into something that describes neither. Default sort is by total picks rather than by rate, for the same reason. Click any category header to rank within it.`}
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
