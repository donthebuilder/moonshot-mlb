'use client'
import { C, NUM_FONT } from '../lib/theme'

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

const cell = (dim) => ({
  fontFamily: NUM_FONT, fontSize: 11.5, textAlign: 'right',
  padding: '3px 5px', whiteSpace: 'nowrap',
  color: dim ? C.text3 : C.text,
  fontVariantNumeric: 'tabular-nums',
})

const th = {
  fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, textAlign: 'right',
  letterSpacing: '.06em', color: C.text3, padding: '0 5px 4px',
  textTransform: 'uppercase', whiteSpace: 'nowrap',
}

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
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3,
        paddingBottom: 3, borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>{title || side?.team?.name}</span>
        {t && (
          <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>
            {t.r} R · {t.h} H · {t.hr ? `${t.hr} HR · ` : ''}{t.lob} LOB
          </span>
        )}
      </div>
      {/* A SCROLLING BOX IS A CONTROL (2026-09-01). If a region scrolls, a
          keyboard has to be able to reach it and move it -- WCAG 2.1.1 -- and
          a screen reader has to be told what it is. tabIndex + role + a label,
          on all three tables in this file. */}
      <div className="dense-scroll rail box-scroll" role="region" tabIndex={0}
        aria-label={`${title || side?.team?.name || 'Team'} batting`}
        style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {/* The team name is rendered above as a plain div: a heading to the
              eye, nothing to a screen reader. This is what ties the numbers to
              a team for anyone not looking at it. */}
          <caption className="sr-only">{`${title || side?.team?.name || 'Team'} batting`}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: 'left', width: '100%' }}>Batters</th>
              {BAT_COLS.map(([k, l]) => <th scope="col" key={k} style={th}>{l}</th>)}
              <th scope="col" className="box-avg" style={th} title="Season batting average coming into today">AVG</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const on = highlight?.has?.(p.id)
              return (
                <tr key={`${p.id}-${p.spot}-${p.depth}`}
                  onClick={onPlayerClick ? () => onPlayerClick(p) : undefined}
                  style={{
                    cursor: onPlayerClick ? 'pointer' : 'default',
                    background: on ? 'rgba(249,115,22,.10)' : 'transparent',
                  }}>
                  {/* A ROW HEADER, not another cell (2026-09-01). With
                      scope="row" a screen reader reads "Henderson, AB 4, R 1"
                      instead of five naked numbers with nothing to attach them
                      to. Being a th also keeps it clear of MobileCSS's
                      .dense-scroll td button { min-height: 44px } -- right for
                      a dense table of buttons, and it would have tripled the
                      height of a nine-man lineup. */}
                  <th scope="row" style={{
                    fontSize: 11.5, padding: '3px 5px', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    textAlign: 'left', fontWeight: on ? 800 : 500,
                    // The indent IS the information: this man came in for the
                    // one above him.
                    paddingLeft: 5 + p.depth * 11,
                    color: on ? C.orange : C.text,
                  }}>
                    {p.sub && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
                    {p.name}
                    <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{p.pos}</span>
                    {marks?.up === p.id && <b title="At the plate right now" style={{ fontSize: 7.5, fontWeight: 900, color: '#4ade80', marginLeft: 4, letterSpacing: '.05em' }}>AT BAT</b>}
                    {marks?.deck === p.id && <b title="On deck" style={{ fontSize: 7.5, fontWeight: 900, color: '#FCD34D', marginLeft: 4, letterSpacing: '.05em' }}>ON DECK</b>}
                    {marks?.hole === p.id && <b title="In the hole — two away" style={{ fontSize: 7.5, fontWeight: 900, color: '#a78bfa', marginLeft: 4, letterSpacing: '.05em' }}>IN HOLE</b>}
                  </th>
                  {BAT_COLS.map(([k]) => {
                    const v = p[k]
                    const hot = (k === 'rbi' || k === 'h') && v > 0
                    return (
                      <td key={k} style={{
                        ...cell(!v),
                        color: !v ? C.text3 : hot ? '#4ade80' : C.text,
                        fontWeight: hot ? 800 : 500,
                      }}>{v}</td>
                    )
                  })}
                  <td className="box-avg" style={{ ...cell(true), fontSize: 10.5 }}>{p.avg ?? '—'}</td>
                </tr>
              )
            })}
            {t && (
              <tr>
                <th scope="row" style={{
                  fontSize: 10, fontWeight: 800, padding: '4px 5px 2px', textAlign: 'left',
                  color: C.text3, borderTop: `1px solid ${C.border2}`, letterSpacing: '.05em',
                }}>TOTALS</th>
                {BAT_COLS.map(([k]) => (
                  <td key={k} style={{
                    ...cell(false), fontWeight: 800, fontSize: 11,
                    borderTop: `1px solid ${C.border2}`, color: C.text2,
                  }}>{t[k]}</td>
                ))}
                <td className="box-avg" style={{ ...cell(true), borderTop: `1px solid ${C.border2}` }}>{t.avg ?? '—'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
  return (
    <div style={{ minWidth: 0, marginTop: 9 }}>
      <div className="dense-scroll rail box-scroll" role="region" tabIndex={0}
        aria-label={`${title || side?.team?.abbr || 'Team'} pitching`}
        style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <caption className="sr-only">{`${title || side?.team?.abbr || 'Team'} pitching`}</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...th, textAlign: 'left', width: '100%' }}>
                {title || `${side?.team?.abbr || ''} pitchers`}
              </th>
              {PIT_COLS.map(([k, l]) => <th scope="col" key={k} style={th}>{l}</th>)}
              <th scope="col" style={th} title="Pitches thrown (strikes)">P-S</th>
              <th scope="col" className="box-avg" style={th} title="Season ERA">ERA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.id}-${i}`}>
                <th scope="row" style={{
                  fontSize: 11.5, padding: '3px 5px', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: 'left', fontWeight: 500,
                  paddingLeft: p.started ? 5 : 16,
                }}>
                  {!p.started && <span style={{ color: C.text3, marginRight: 3 }}>↳</span>}
                  {p.name}
                  {p.note && <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.orange, marginLeft: 5 }}>{p.note}</span>}
                </th>
                {PIT_COLS.map(([k]) => {
                  const v = p[k]
                  const bad = (k === 'er' || k === 'hr') && v > 0
                  return (
                    <td key={k} style={{
                      ...cell(k !== 'ip' && !v),
                      color: k === 'ip' ? C.text : !v ? C.text3 : bad ? '#f87171' : k === 'k' ? '#4ade80' : C.text,
                      fontWeight: (k === 'ip' || bad || (k === 'k' && v >= 6)) ? 800 : 500,
                    }}>{v}</td>
                  )
                })}
                <td style={{ ...cell(true), fontSize: 10 }}>
                  {p.pitches ? `${p.pitches}-${p.strikes}` : '—'}
                </td>
                <td style={{ ...cell(true), fontSize: 10.5 }}>{p.era ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The innings across the top — R H E down the side. */
export function LineScore({ game }) {
  const innings = game?.innings || []
  if (!innings.length) return null
  const row = (who, label) => (
    <tr>
      <th scope="row" style={{
        fontFamily: NUM_FONT, fontSize: 11, fontWeight: 800, padding: '2px 8px 2px 0',
        whiteSpace: 'nowrap', color: C.text, textAlign: 'left',
      }}>{label}</th>
      {innings.map((i) => (
        <td key={i.n} style={{
          ...cell(i[who] == null || i[who] === 0), textAlign: 'center', minWidth: 20, padding: '2px 4px',
        }}>{i[who] == null ? '·' : i[who]}</td>
      ))}
      {['r', 'h', 'e'].map((k) => (
        <td key={k} style={{
          ...cell(false), textAlign: 'center', minWidth: 24, fontWeight: 800,
          color: k === 'r' ? C.orange : C.text2,
          borderLeft: k === 'r' ? `1px solid ${C.border2}` : 'none',
        }}>{game.totals?.[who]?.[k] ?? '—'}</td>
      ))}
    </tr>
  )
  return (
    <div className="dense-scroll rail box-scroll" role="region" tabIndex={0}
      aria-label="Line score by inning"
      style={{ overflowX: 'auto', marginBottom: 9 }}>
      <table style={{ borderCollapse: 'collapse' }}>
        <caption className="sr-only">Line score by inning</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: 'left' }}><span className="sr-only">Team</span></th>
            {innings.map((i) => (
              <th scope="col" key={i.n} style={{ ...th, textAlign: 'center', minWidth: 20 }}>{i.n}</th>
            ))}
            {['R', 'H', 'E'].map((k) => (
              <th scope="col" key={k} style={{ ...th, textAlign: 'center', minWidth: 24, color: k === 'R' ? C.orange : C.text3 }}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('away', game.away?.abbr || 'AWAY')}
          {row('home', game.home?.abbr || 'HOME')}
        </tbody>
      </table>
    </div>
  )
}
