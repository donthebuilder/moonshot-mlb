'use client'
import { C, NUM_FONT } from '../lib/theme'
import DenseTable from './DenseTable'
import { teamCodeFromName } from '../lib/mlbTeams'

// 📋 ONE BOX SCORE, ONE COMPONENT.
//
// 2026-08-15, Donovan: "the box score on the at the plate is hard to read."
//
// It was hard to read because it wasn't a box score — it was a dense grid
// built for a different job, wearing box-score column names. This is the
// newspaper shape, and it is shared by the Box tab and At the Plate so there
// is exactly one of them to fix and one to look at.
//
// WHAT MAKES A BOX READABLE, in the order it matters:
//
//   1. THE NAME COLUMN IS WIDE AND STICKY. Every other column is three
//      characters; the name is the only thing you scan for, and it was the
//      one being truncated.
//   2. NUMBERS ARE TABULAR AND RIGHT-ALIGNED. A proportional font puts the
//      1s and the 4s in different places and the eye stops being able to run
//      down a column.
//   3. ZEROS RECEDE. A box is mostly zeros; if they're the same weight as the
//      hits, nothing stands out. Zeros are dim, non-zeros are normal, and the
//      things that decide games — RBI, HR — carry colour.
//   4. SUBS ARE INDENTED under the man they replaced, which is how you can
//      tell a 3-for-4 from a 3-for-4 across two people in the same slot.
//   5. THE TOTALS ROW IS A RULE, not another row of the same weight.

const BAT_COLS = [
  ['ab', 'AB'], ['r', 'R'], ['h', 'H'], ['rbi', 'RBI'],
  ['bb', 'BB'], ['k', 'K'], ['lob', 'LOB'],
]

// `marks` (2026-08-15): {up, deck, hole} — numeric ids from the live
// snapshot. Restores the AT BAT / ON DECK / IN HOLE tags Donovan built into
// the old At-the-Plate box (his 9d843cd); that block couldn't survive the
// box-score rewrite because it read variables the rewrite removed, so the
// tags come back here, in the shared table, where the Boxes tab gets them too.
export function BattingBox({ side, highlight, onPlayerClick, title, marks = null }) {
  const rows = side?.batting || []
  if (!rows.length) return null
  const t = side?.totals?.batting
  const name = title || side?.team?.name || 'Team'
  // THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b, Donovan: "convert
  // them all to the new sortable sheet"). The box keeps what made it readable:
  // lineup order until you sort (the head's reset puts it back), subs indented
  // under the man they replaced, zeros dim, hits / RBI warm, TOTALS under a
  // rule, the AT BAT / ON DECK / IN HOLE tags, the HR / 2B / SB lines below.
  const columns = [
    { key: 'name', label: 'Batters', heat: false, sticky: true, w: 170, title: 'Lineup order until you sort a column',
      fmt: (v, p) => (
        <span style={{ paddingLeft: (p.depth || 0) * 11, fontWeight: highlight?.has?.(p.id) ? 800 : 500, color: highlight?.has?.(p.id) ? C.orange : undefined }}>
          {p.sub && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
          {v}
          <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{p.pos}</span>
          {marks?.up === p.id && <b title="At the plate right now" style={{ fontSize: 7.5, fontWeight: 900, color: C.green, marginLeft: 4, letterSpacing: '.05em' }}>AT BAT</b>}
          {marks?.deck === p.id && <b title="On deck" style={{ fontSize: 7.5, fontWeight: 900, color: C.amber, marginLeft: 4, letterSpacing: '.05em' }}>ON DECK</b>}
          {marks?.hole === p.id && <b title="In the hole — two away" style={{ fontSize: 7.5, fontWeight: 900, color: C.purple, marginLeft: 4, letterSpacing: '.05em' }}>IN HOLE</b>}
        </span>
      ) },
    ...BAT_COLS.map(([k, l]) => ({
      key: k, label: l, w: 34, fmt: (v) => v ?? '—',
      tone: (n) => (!n ? { color: C.text3 } : (k === 'rbi' || k === 'h') ? { color: C.green, weight: 800 } : { color: C.text, weight: 500 }),
    })),
    { key: 'avg', label: 'AVG', w: 44, fmt: (v) => v ?? '—', tone: () => ({ color: C.text3 }), title: 'Season batting average coming into today' },
  ]
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3,
        paddingBottom: 3, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>{name}</span>
        {t && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
            {t.r} R · {t.h} H · {t.hr ? `${t.hr} HR · ` : ''}{t.lob} LOB
          </span>
        )}
      </div>
      <DenseTable bare tight noGroups rows={rows.map((p, i) => ({ ...p, _key: `${p.id}-${p.spot}-${p.depth}-${i}` }))} columns={columns}
        onRowClick={onPlayerClick || null} rowEdge={(p) => (highlight?.has?.(p.id) ? C.orange : null)}
        heatMode="sorted" maxHeight={9999} maxRows={60} caption={`${name} batting`}
        footRows={t ? [{ name: 'TOTALS', ...Object.fromEntries(BAT_COLS.map(([k]) => [k, t[k]])), avg: t.avg ?? '—' }] : null} />
      {/* Extra-base hits and homers, called out below the table the way a
          newspaper box does — they're buried inside TB otherwise. */}
      {(() => {
        const hrs = rows.filter((p) => p.hr > 0)
        const xbh = rows.filter((p) => p.d2 > 0 || p.d3 > 0)
        const sb = rows.filter((p) => p.sb > 0)
        if (!hrs.length && !xbh.length && !sb.length) return null
        const line = (label, list, fmt) => list.length ? (
          <div><b style={{ color: C.text3 }}>{label}:</b> {list.map(fmt).join(', ')}</div>
        ) : null
        return (
          <div style={{ fontSize: 9.5, color: C.text2, lineHeight: 1.6, marginTop: 5, fontFamily: NUM_FONT }}>
            {line('HR', hrs, (p) => `${p.name}${p.hr > 1 ? ` (${p.hr})` : ''}`)}
            {line('2B/3B', xbh, (p) => `${p.name}${p.d2 > 1 || p.d3 ? ` (${p.d2}/${p.d3})` : ''}`)}
            {line('SB', sb, (p) => `${p.name}${p.sb > 1 ? ` (${p.sb})` : ''}`)}
          </div>
        )
      })()}
    </div>
  )
}

const PIT_COLS = [['ip', 'IP'], ['h', 'H'], ['r', 'R'], ['er', 'ER'], ['bb', 'BB'], ['k', 'K'], ['hr', 'HR']]

export function PitchingBox({ side, title }) {
  const rows = side?.pitching || []
  if (!rows.length) return null
  const name = title || `${side?.team?.abbr || ''} pitchers`
  // The shared sheet (see BattingBox): order of appearance until you sort,
  // relievers indented, ER / HR red, a 6+ K line warm, zeros dim.
  const columns = [
    { key: 'name', label: name, heat: false, sticky: true, w: 170,
      fmt: (v, p) => (
        <span style={{ paddingLeft: p.started ? 0 : 11 }}>
          {!p.started && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
          {v}
          {p.note && <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.orange, marginLeft: 5 }}>{p.note}</span>}
        </span>
      ) },
    ...PIT_COLS.map(([k, l]) => ({
      key: k, label: l, w: 34, fmt: (v) => v ?? '—',
      tone: (n) => (k === 'ip' ? { color: C.text, weight: 800 } : !n ? { color: C.text3 }
        : (k === 'er' || k === 'hr') ? { color: C.red, weight: 800 } : k === 'k' ? { color: C.green, weight: n >= 6 ? 800 : 500 } : { color: C.text, weight: 500 }),
    })),
    { key: 'ps', label: 'P-S', w: 46, heat: false, mono: true, title: 'Pitches thrown (strikes)' },
    { key: 'era', label: 'ERA', w: 44, fmt: (v) => v ?? '—', tone: () => ({ color: C.text3 }), title: 'Season ERA' },
  ]
  return (
    <div style={{ minWidth: 0, marginTop: 9 }}>
      <DenseTable bare tight noGroups rows={rows.map((p, i) => ({ ...p, _key: `${p.id}-${i}`, ps: p.pitches ? `${p.pitches}-${p.strikes}` : '—' }))}
        columns={columns} heatMode="sorted" maxHeight={9999} maxRows={30} caption={`${name} pitching`} />
    </div>
  )
}

/** The innings across the top — R H E down the side. The shared sheet too:
 *  the two clubs, the innings, then R H E (R in the accent). */
export function LineScore({ game }) {
  const innings = game?.innings || []
  if (!innings.length) return null
  const INN = { key: 'inn', label: 'Innings', order: 1 }, TOT = { key: 'tot', label: 'Final', order: 2 }, WHO = { key: 'who', label: 'Club', order: 0 }
  const columns = [
    { key: 'club', label: 'Club', heat: false, sticky: true, w: 70, group: WHO, fmt: (v) => <b style={{ fontFamily: NUM_FONT }}>{v}</b> },
    ...innings.map((i) => ({ key: `i${i.n}`, label: String(i.n), w: 24, group: INN, fmt: (v) => (v == null ? '·' : v), tone: (n) => (!n ? { color: C.text3 } : { color: C.text }) })),
    ...['r', 'h', 'e'].map((k) => ({ key: k, label: k.toUpperCase(), w: 30, group: TOT, fmt: (v) => v ?? '—', tone: () => ({ color: k === 'r' ? C.orange : C.text2, weight: 800 }) })),
  ]
  const row = (who, label) => ({
    _key: who, club: label,
    ...Object.fromEntries(innings.map((i) => [`i${i.n}`, i[who]])),
    ...Object.fromEntries(['r', 'h', 'e'].map((k) => [k, game.totals?.[who]?.[k]])),
  })
  return (
    <div style={{ marginBottom: 9 }}>
      <DenseTable bare tight noGroups rows={[row('away', game.away?.abbr || teamCodeFromName(game.away?.name) || 'AWAY'), row('home', game.home?.abbr || teamCodeFromName(game.home?.name) || 'HOME')]} columns={columns}
        heatMode="sorted" maxHeight={9999} maxRows={2} caption="Line score by inning" />
    </div>
  )
}
