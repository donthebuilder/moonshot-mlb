'use client'
import DenseTable from '../DenseTable'
import TeamMark from '../TeamMark'
import { useEffect, useMemo, useState } from 'react'
import { lanePlayers } from '../../lib/numerology/lanePlayers'
import { MIN_NIGHTS } from '../../lib/numerology/laneTable'
import { playerHref } from '../../lib/routes'

// LANE SCOREBOARD (2026-10-07; was "Which lanes run hot", 2026-09-27 BATCH-NUMEROLOGY step 6). It scores
// LANES, not players: per lane, the matched players' hit rate against the base rate for everyone eligible,
// over graded nights only (/api/numerology/lanes). The old name promised a list of players it never had; the
// list now sits under it -- "Tonight's players on these lanes", the same matchLanes output, see
// lib/numerology/lanePlayers.js -- and the table is honest about how little it has so far:
//   a lane with under 30 graded nights shows its running counts, labelled PROVISIONAL with its nights, and no
//   z and no |z|>=2 highlight -- the 30-night gate (laneTable.js MIN_NIGHTS) still guards every claim that a
//   lane is anything more than chance; only the counts are shown early.
// Phone first: five rows, the rest behind one tap. Pattern watching.
const pct = (v) => (v == null ? '—' : `${(100 * v).toFixed(1)}%`)
const SHOW_PLAYERS = 8

/**
 * sport, theme / numFont / accent: the product's. `tonight` (optional) = { date, items } -- tonight's players in the
 * lanes' adapter shape ({ id, name, team, a, score? }, lib/numerology/lanePlayers.js); without it only the scoreboard draws.
 */
export default function LaneTable({ sport, theme: C, numFont, accent, tonight = null }) {
  const [data, setData] = useState(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    let alive = true
    fetch(`/api/numerology/lanes?sport=${encodeURIComponent(sport)}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setData(j) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  const onLanes = useMemo(() => (tonight?.date ? lanePlayers(tonight.items, tonight.date, { limit: SHOW_PLAYERS }) : []), [tonight])
  if (!data?.configured) return null
  // proven lanes keep the API's order (|z|); a provisional lane has no z to rank by, so it is ordered by how many
  // matched players it has counted, which is only a size, never a claim
  const lanes = (data.lanes || []).filter((l) => l.matched > 0)
    .sort((a, b) => (b.shown - a.shown) || (a.shown ? 0 : (b.matched - a.matched) || a.label.localeCompare(b.label)))
  const provisional = lanes.some((l) => !l.shown)
  const rows = all ? lanes : lanes.slice(0, 5)
  const box = { padding: '11px 12px', border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2 }
  const head = <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont, marginBottom: 2 }}>LANE SCOREBOARD</div>
  const sub = <div style={{ fontSize: 11, color: C.text3, marginBottom: 6, lineHeight: 1.45 }}>How each number lane has done on graded nights. It scores lanes, not players.</div>
  const players = onLanes.length ? (
    <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont }}>TONIGHT&apos;S PLAYERS ON THESE LANES</div>
      <div style={{ fontSize: 11, color: C.text3, margin: '2px 0 4px', lineHeight: 1.45 }}>Whoever is on the most lanes tonight. A lane is a pattern, not a pick: the scoreboard above says how little it has proved.</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {onLanes.map((p) => (
          <li key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
            <a href={playerHref(sport, p.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, color: C.text, textDecoration: 'none', minWidth: 0 }}>
              {p.team ? <TeamMark sport={sport} abbr={p.team} variant="logo" px={20} /> : null}
              <span style={{ display: 'grid', minWidth: 0, flex: 1, lineHeight: 1.25 }}>
                <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{p.team ? <span style={{ marginLeft: 6, color: C.text3, fontFamily: numFont, fontSize: 11, fontWeight: 700 }}>{p.team}</span> : null}</b>
                <span title={(p.fullLabels || p.labels).join(' · ')} style={{ fontSize: 11, color: C.text2 }}>{p.labels.slice(0, 3).join(' · ')}{p.labels.length > 3 ? ` · +${p.labels.length - 3}` : ''}</span>
              </span>
              <span style={{ fontFamily: numFont, fontSize: 11, color: accent, fontWeight: 800, whiteSpace: 'nowrap' }}>{p.n} {p.n === 1 ? 'lane' : 'lanes'}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  ) : null
  if (!lanes.length) {
    return (
      <section aria-label="Lane scoreboard" style={box}>
        {head}
        {sub}
        <div style={{ fontSize: 12, lineHeight: 1.5, color: C.text2 }}>
          {data.nights
            ? `${data.nights} graded night${data.nights === 1 ? '' : 's'} recorded${data.recorded > data.nights ? `, ${data.recorded - data.nights} more being graded` : ''}.`
            : data.recorded
              ? `${data.recorded} night${data.recorded === 1 ? '' : 's'} recorded so far; a night counts once every game on it is graded.`
              : 'Nothing recorded yet: each night is logged before the game starts and graded after the final.'}{' '}
          A lane&apos;s running counts appear here once it has a graded night, labelled provisional until it has {data.minNights || MIN_NIGHTS}: its matched players&apos; hit rate against everyone who could have matched.
        </div>
        {players}
      </section>
    )
  }
  return (
    <section aria-label="Lane scoreboard" style={box}>
      {head}
      {sub}
      <div style={{ overflowX: 'auto' }}>
        {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). z and the |z| of 2+ highlight only on a lane with
            the full 30 graded nights; a provisional lane shows its counts and says so in words. */}
        <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={Math.max(rows.length, 1)} accent={accent}
          caption="The lane scoreboard: how each number lane has done on graded nights"
          rows={rows.map((l) => ({ ...l, _key: l.lane }))}
          columns={[
            { key: 'label', label: 'Lane', heat: false, sticky: true, w: 168, fmt: (v, l) => (
              <span style={{ display: 'grid', lineHeight: 1.25, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                <b>{v}</b>
                {!l.shown && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.02em', color: C.amber || C.text3 }}>provisional · {l.nights} {l.nights === 1 ? 'night' : 'nights'}</span>}
              </span>
            ) },
            { key: 'nights', label: 'Nights', w: 54, dp: 0 },
            { key: 'matchedRate', label: 'Matched hit', w: 110, fmt: (v, l) => <span style={{ fontFamily: numFont }}>{pct(v)} <span style={{ color: C.text3, fontSize: 11 }}>{l.matchedHits}/{l.matched}</span></span> },
            { key: 'baseRate', label: 'Everyone', w: 70, fmt: (v) => pct(v), tone: () => ({ color: C.text2 }) },
            { key: 'z', label: 'z', w: 44, fmt: (v, l) => (!l.shown || v == null ? '—' : Number(v).toFixed(1)), tone: (n, l) => ({ color: l.shown && Math.abs(n || 0) >= 2 ? accent : C.text3, weight: 800 }) },
          ]} />
      </div>
      {lanes.length > 5 && <button type="button" onClick={() => setAll((v) => !v)} style={{ marginTop: 6, minHeight: 44, padding: '0 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: 'transparent', color: accent, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{all ? 'Show five' : `+${lanes.length - 5} more lanes`}</button>}
      <div style={{ marginTop: 6, fontSize: 11, color: C.text3, lineHeight: 1.5 }}>
        {provisional ? <>Provisional: under {data.minNights || MIN_NIGHTS} graded nights, the counts are real but no lane is a finding yet, so no z is shown. </> : null}
        z = matched players against the rest of the eligible pool; |z| under 2 is chance. Graded nights only. Never part of a score.
      </div>
      {players}
    </section>
  )
}
