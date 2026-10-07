'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import NflTable from './NflTable'
import { FilterPill } from '../Filters'
import PageHeader from '../PageHeader'

// LONGEST TDs (2026-10-06) -- TUDDY's twin of MOONSHOT's Longest board
// (components/tabs/LongestBoard.js). MOONSHOT ranks tonight's hitters by how far
// they hit the ball; the football question is "who has scored from the
// farthest", and unlike MOONSHOT's board this one is a RECORD of what happened,
// not a projection: every row is one touchdown nfl_td_feed stored when the
// scoring play was first seen, with the yardage parsed from ESPN's play text
// (/api/nfl/longest). Same table, same columns-first layout, same heat on the
// column that decides the order.
//
// A touchdown whose play text carries no yardage (a fumble recovery in the end
// zone) is not on this board: no yardage is not 0 yards.
const KINDS = [
  { k: 'all', label: 'All' },
  { k: 'pass', label: 'Pass' },
  { k: 'rush', label: 'Rush' },
  { k: 'ret', label: 'Returns' },
]
const isRet = (r) => /return/.test(r.kind || '')
const dayWord = (d) => {
  const t = Date.parse(`${d}T12:00:00Z`)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : d
}

const COLS = [
  { key: 'rank', group: 'Touchdown', label: '#', w: 34, heat: false, dim: true },
  { key: 'name', group: 'Touchdown', label: 'Scorer', w: 150, heat: false, sticky: true, bold: true },
  { key: 'team', group: 'Touchdown', label: 'Tm', w: 44, heat: false },
  { key: 'opp', group: 'Touchdown', label: 'Opp', w: 44, heat: false },
  { key: 'yards', group: 'Distance', label: 'YDS', w: 48, dp: 0, primary: true, title: 'Yards of the scoring play, as ESPN wrote it' },
  { key: 'type', group: 'Distance', label: 'Type', w: 96, heat: false },
  { key: 'passer', group: 'Play', label: 'From', w: 112, heat: false, dim: true },
  { key: 'quarter', group: 'Play', label: 'Q', w: 34, dp: 0, heat: false },
  { key: 'when', group: 'Play', label: 'Date', w: 58, heat: false, dim: true },
]

export default function LongestTds({ data, season, query = '', onPlayerClick }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [kind, setKind] = useState('all')

  useEffect(() => {
    if (!season) { setState({ status: 'down', rows: [] }); return undefined }
    let alive = true
    setState({ status: 'loading', rows: [] })
    fetch(`/api/nfl/longest?season=${season}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setState(j?.available ? { status: 'ok', rows: j.rows || [] } : { status: 'down', rows: [] }) })
      .catch(() => { if (alive) setState({ status: 'down', rows: [] }) })
    return () => { alive = false }
  }, [season])

  const byId = useMemo(() => Object.fromEntries((data?.players || []).map((p) => [p.player_id, p])), [data])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return state.rows
      .filter((r) => (kind === 'all' || (kind === 'ret' ? isRet(r) : r.kind === kind)))
      .filter((r) => !needle || r.name.toLowerCase().includes(needle) || String(r.team).toLowerCase().includes(needle))
      .map((r, i) => ({
        ...r, rank: i + 1, type: r.kind_word || '—', passer: r.passer || '—', when: dayWord(r.day), _raw: byId[r.player_id] || null,
      }))
  }, [state.rows, kind, query, byId])

  return (
    <div>
      <PageHeader
        eyebrow="TUDDY · LONGEST TDs"
        title="The longest touchdowns of the season"
        note={<>Every touchdown the feed has seen in {season}, ranked by the yards of the scoring play. A record of what happened, not a projection; a score with no yardage in the play text is left off.</>}
        theme={C} numFont={NUM_FONT} accent={C.green}
      />
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
        {KINDS.map((x) => <FilterPill key={x.k} active={kind === x.k} onClick={() => setKind(x.k)}>{x.label}</FilterPill>)}
      </div>
      {state.status === 'loading' && <div style={{ padding: 22, color: C.text3, fontSize: TYPE.body }}>Loading the season&apos;s touchdowns…</div>}
      {state.status === 'down' && (
        <div style={{ padding: 22, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: TYPE.body }}>
          The touchdown feed could not be read just now. Try again in a minute.
        </div>
      )}
      {state.status === 'ok' && !rows.length && (
        <div style={{ padding: 22, border: `1px dashed ${C.border2}`, borderRadius: 12, textAlign: 'center', color: C.text3, fontSize: TYPE.body }}>
          {state.rows.length ? 'No touchdown matches that filter.' : `No ${season} touchdowns with a yardage are in the feed yet.`}
        </div>
      )}
      {rows.length > 0 && (
        <NflTable rows={rows} columns={COLS} initialSort="yards" maxRows={25 /* a preview; "show N more" */}
          onRowClick={onPlayerClick ? (r) => (r._raw ? onPlayerClick(r._raw, 'TD') : null) : null} />
      )}
    </div>
  )
}
