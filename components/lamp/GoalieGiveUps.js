import { C, NUM_FONT } from '../../lib/nhl/theme'
import { kicker, more, playerHref, teamHref } from './StaticPage'
import StaticPlayerCell from './StaticPlayerCell'
import { POS_KEYS, SIDE_KEYS, POS_WORD, SIDE_WORD, SIDE_SHORT, GIVEUP_FLOOR, splitLine, pct0, leanText } from '../../lib/nhl/goalieGiveUps'
import { seasonLabel } from '../../lib/nhl/reduce'

// 🥅 WHO SCORES ON A GOALIE, AND FROM WHICH SIDE (2026-10-13). Server-rendered, like the leaders beside it: one table, the
// league's own split as its first row, then each goalie's share of the goals he has allowed by the scorer's position
// (C / W / D) and by the side of the ice the shot came from. All counting is lib/nhl/goalieGiveUps.js's (the floors
// are printed below the table); this file only lays the numbers out. The first rows show, the rest sit behind one tap.
// A table that scrolls sideways does so inside its own box, with the goalie's name pinned.
const PREVIEW = 8
const th = { padding: '0 5px 4px', color: C.text3, font: `800 11px/1.2 ${NUM_FONT}`, letterSpacing: '.06em', textAlign: 'right', whiteSpace: 'nowrap' }
const grp = { ...th, textAlign: 'center', color: C.text2, borderBottom: `1px solid ${C.border}`, paddingBottom: 3 }
const td = { padding: '6px 5px', borderTop: `1px solid ${C.border}`, textAlign: 'right', fontFamily: NUM_FONT, fontSize: 12.5, whiteSpace: 'nowrap', verticalAlign: 'middle' }
const sticky = { position: 'sticky', left: 0, background: C.bg, zIndex: 1, textAlign: 'left', fontFamily: 'inherit', minWidth: 150, maxWidth: 164, whiteSpace: 'normal', lineHeight: 1.25 }
const muted = { color: C.text3 }

function Head() {
  return (
    <thead>
      <tr>
        <th style={{ ...grp, ...sticky, borderBottom: 'none' }} />
        <th colSpan={5} style={grp}>GOALS BY SCORER’S POSITION</th>
        <th colSpan={4} style={grp}>BY SIDE OF THE ICE</th>
        <th style={grp}>SHOTS</th>
      </tr>
      <tr>
        <th style={{ ...th, ...sticky, textAlign: 'left' }} scope="col">GOALIE</th>
        <th style={th} scope="col" title="Goals he has allowed">GA</th>
        {POS_KEYS.map((k) => <th key={k} style={th} scope="col" title={`Share of his goals scored by ${POS_WORD[k].toLowerCase()}`}>{k}</th>)}
        <th style={th} scope="col" title="The position furthest above the league’s share, only when it clears the floors below">LEANS</th>
        {SIDE_KEYS.map((k) => <th key={k} style={th} scope="col" title={`Share of his goals from the ${SIDE_WORD[k].toLowerCase()}`}>{SIDE_SHORT[k].toUpperCase()}</th>)}
        <th style={th} scope="col" title="The side furthest above the league’s share, only when it clears the floors below">LEANS</th>
        <th style={th} scope="col" title="Shots on goal he has faced">SA</th>
      </tr>
    </thead>
  )
}

function Share({ cell, lean }) {
  if (cell.share == null) return <span style={muted} title="not enough goals yet">—</span>
  return <span style={lean ? { color: C.ice, fontWeight: 900 } : undefined}>{pct0(cell.share)}</span>
}

function Row({ r }) {
  return (
    <tr className="spc-row">
      <td style={{ ...td, ...sticky, padding: '0 6px' }}>
        <StaticPlayerCell name={r.name} href={playerHref(r.id)} photo={r.photo} team={r.team} teamHref={r.team ? teamHref(r.team) : null} />
      </td>
      <td style={td}>{r.ga}</td>
      {POS_KEYS.map((k) => <td key={k} style={td}><Share cell={r.pos[k]} lean={r.leanPos?.key === k} /></td>)}
      <td style={{ ...td, color: C.ice }}>{leanText(r.leanPos) || (r.enough ? <span style={muted}>none</span> : <span style={muted}>—</span>)}</td>
      {SIDE_KEYS.map((k) => <td key={k} style={td}><Share cell={r.side[k]} lean={r.leanSide?.key === k} /></td>)}
      <td style={{ ...td, color: C.ice }}>{leanText(r.leanSide, (k) => SIDE_SHORT[k]) || (r.enough ? <span style={muted}>none</span> : <span style={muted}>—</span>)}</td>
      <td style={td}>{r.sa}</td>
    </tr>
  )
}

function LeagueRow({ lg }) {
  const cell = (c) => ({ share: c?.share ?? null })
  const bg = { ...td, color: C.text2, fontWeight: 800 }
  return (
    <tr className="spc-row">
      <td style={{ ...bg, ...sticky }}>League, all goalies</td>
      <td style={bg}>{lg.ga}</td>
      {POS_KEYS.map((k) => <td key={k} style={bg}><Share cell={cell(lg.pos[k])} /></td>)}
      <td style={bg} />
      {SIDE_KEYS.map((k) => <td key={k} style={bg}><Share cell={cell(lg.side[k])} /></td>)}
      <td style={bg} />
      <td style={bg}>{lg.sa}</td>
    </tr>
  )
}

const box = { overflowX: 'auto', maxWidth: '100%' }
const tbl = { borderCollapse: 'collapse', width: '100%', minWidth: 560 }

export default function GoalieGiveUps({ view }) {
  if (!view || view.state !== 'ok' || !view.rows.length) return null
  const { league: lg, rows } = view
  const season = seasonLabel(view.season)
  const head = rows.slice(0, PREVIEW)
  const rest = rows.slice(PREVIEW)
  return (
    <section aria-label="Who scores on each goalie">
      <h2 style={kicker}>WHO SCORES ON A GOALIE · {season}</h2>
      {view.fallback ? (
        <p style={{ margin: '0 0 8px', color: C.amber, fontSize: 12.5, lineHeight: 1.5 }}>
          Showing {season}, the last full season: only {view.current?.enough || 0} of this season’s goalies have faced {GIVEUP_FLOOR.goals} goals yet. This season’s numbers are never added in.
        </p>
      ) : null}
      <p style={{ margin: '0 0 8px', color: C.text2, fontSize: 12.5, lineHeight: 1.5 }}>
        Each goalie’s goals against, by who scored (center, wing or defenseman) and by where the shot came from. The league’s own split is the first row, so every share has its comparison beside it.
        League goals by position: {splitLine(lg.pos, POS_KEYS)}. By side: {splitLine(lg.side, SIDE_KEYS, (k) => SIDE_SHORT[k])}.
      </p>
      <div style={box}>
        <table style={tbl}>
          <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            Each goalie’s share of goals against by the scorer’s position and by the side of the ice, with the league’s shares in the first row.
          </caption>
          <Head />
          <tbody><LeagueRow lg={lg} />{head.map((r) => <Row key={r.id} r={r} />)}</tbody>
        </table>
      </div>
      {rest.length ? (
        <details>
          <summary style={more}>Show {rest.length} more goalies</summary>
          <div style={box}>
            <table style={tbl}><Head /><tbody>{rest.map((r) => <Row key={r.id} r={r} />)}</tbody></table>
          </div>
        </details>
      ) : null}
      <p style={{ margin: '8px 0 0', color: C.text3, fontSize: 12, lineHeight: 1.5 }}>
        Regular season, shots on goal and goals, empty nets and the shootout left out. A goalie is listed at {GIVEUP_FLOOR.shots} shots against; his shares print at {GIVEUP_FLOOR.goals} goals against, and a dash means not enough yet. LEANS names the position or side furthest above the league’s share, only when it is at least {GIVEUP_FLOOR.pts} points above and bigger than the wobble of that many goals; “none” means his split looks like the league’s.
        Position is the scorer’s latest logged one{lg.posKnown != null ? ` (known for ${pct0(lg.posKnown)} of the league’s goals; the rest are left out of the shares)` : ''}. Side is the side of the ice the shot came from, left and right as the shooter sees the net; which way the shooter shoots (left- or right-handed) is not stored, so it is not shown.
        {view.unnamed ? ` ${view.unnamed} goalies who are not on a current roster are left out.` : ''} Where goals have gone in, not a forecast of who scores next.
      </p>
    </section>
  )
}
