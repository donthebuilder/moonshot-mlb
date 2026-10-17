'use client'
// THE NUMBERS TAB (2026-10-17): MOONSHOT's "The numbers" (PlayerModal tab 'numbers', label:value rows in four columns that become one on a phone),
// LAMP's rows. Every value is a field LAMP holds: tonight's board row (the goal score, its place, the three legs it is built from), his season line,
// his form from the game log, tonight's context and his career. A value he has none of is left out, never a dash standing in for a guess. A
// member-only fact (the word, the score, the places, the percentiles that add to the score) is not drawn while his card is locked.
import { C, NUM_FONT } from '../../lib/nhl/theme'
import CallStatusBadge from '../CallStatusBadge'
import HelpTip from '../HelpTip'
import { fmtSec, fmtPct1, fmtPct3, fmt2, plusMinus } from './ui'

const BOX = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 1, padding: '7px 0', borderBottom: `1px solid ${C.border}`, minWidth: 0 }
const finite = (v) => v != null && v !== '' && Number.isFinite(Number(v))

function Row({ label, value, help }) {
  return (
    <div style={BOX}>
      <span style={{ fontSize: 12, color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}{help ? <HelpTip label={label} text={help} color={C.text3} /> : null}</span>
      <span style={{ fontSize: 12, color: C.text, fontFamily: NUM_FONT, fontWeight: 600, minWidth: 0, textAlign: 'right' }}>{value}</span>
    </div>
  )
}
const Head = ({ children }) => <div style={{ fontSize: 11, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 0 4px' }}>{children}</div>
const th = (v) => (finite(v) ? ` · ${Math.round(v)}th` : '')
const sum = (rows, k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0)

export default function LampNumbers({ goalie, fr, career, row, locked, statusShown, context, log = [], seasonLabel }) {
  const l5 = log.slice(0, 5)
  const l10 = log.slice(0, 10)
  const dr = (() => { if (!log.length) return null; const i = log.findIndex((r) => Number(r.g) > 0); return i < 0 ? log.length : i })()
  const groups = []
  if (!goalie && row) {
    groups.push(['Tonight’s board', [
      statusShown && !locked ? <Row key="w" label="Word" value={<CallStatusBadge status={statusShown} size={11} />} /> : null,
      !locked && finite(row.score) ? <Row key="s" label="Goal score" value={Math.round(row.score)} help="A 0-100 rank among tonight’s scored skaters, not a chance of anything." /> : null,
      !locked && finite(row.nightRank) ? <Row key="nr" label="Place tonight" value={`#${row.nightRank} of ${row.nightOf}`} /> : null,
      !locked && finite(row.rank) ? <Row key="gr" label="Place in his game" value={`#${row.rank}`} /> : null,
      finite(row.legs?.goalsPg) ? <Row key="g" label="Goals / game" value={`${row.legs.goalsPg.toFixed(2)}${locked ? '' : th(row.pct?.goalsPg)}`} /> : null,
      finite(row.legs?.shotsPg) ? <Row key="sh" label="Shots / game" value={`${row.legs.shotsPg.toFixed(2)}${locked ? '' : th(row.pct?.shotsPg)}`} /> : null,
      finite(row.legs?.toi) ? <Row key="t" label="Ice time" value={`${fmtSec(row.legs.toi)}${locked ? '' : th(row.pct?.toi)}`} /> : null,
    ]])
  }
  if (fr) {
    groups.push([`Season · ${seasonLabel || ''}`, goalie ? [
      <Row key="gp" label="GP" value={fr.gp} />, <Row key="gs" label="GS" value={fr.gs} />, <Row key="w" label="W" value={fr.w} />, <Row key="l" label="L" value={fr.l} />,
      <Row key="otl" label="OTL" value={fr.otl} />, <Row key="gaa" label="GAA" value={fmt2(fr.gaa)} />, <Row key="sv" label="SV%" value={fmtPct3(fr.svPct)} />, <Row key="so" label="SO" value={fr.so} />,
    ] : [
      <Row key="gp" label="GP" value={fr.gp} />, <Row key="g" label="G" value={fr.g} />, <Row key="a" label="A" value={fr.a} />, <Row key="pts" label="PTS" value={fr.pts} />,
      finite(fr.plusMinus) ? <Row key="pm" label="+/-" value={plusMinus(fr.plusMinus)} /> : null,
      <Row key="s" label="Shots" value={fr.shots} />, finite(fr.shPct) ? <Row key="sp" label="S%" value={fmtPct1(fr.shPct)} /> : null,
      finite(fr.toi) ? <Row key="toi" label="TOI" value={fmtSec(fr.toi)} /> : null, <Row key="ppg" label="PP goals" value={fr.ppg} />, <Row key="gwg" label="GWG" value={fr.gwg} />,
    ]])
  }
  if (!goalie && log.length) {
    groups.push(['Form', [
      <Row key="l5g" label="Last 5 · goals" value={`${sum(l5, 'g')} in ${l5.length}`} />,
      <Row key="l5p" label="Last 5 · points" value={`${sum(l5, 'pts')} in ${l5.length}`} />,
      <Row key="l10" label="Last 10 · goals" value={`${sum(l10, 'g')} in ${l10.length}`} />,
      dr != null ? <Row key="dr" label="Games since a goal" value={dr} /> : null,
    ]])
  }
  if (!goalie && context) {
    groups.push(['Tonight’s game', [
      finite(context.oppGaPg) ? <Row key="ga" label="Opp goals allowed / game" value={Number(context.oppGaPg).toFixed(2)} /> : null,
      context.b2b != null ? <Row key="b2b" label="Played last night" value={context.b2b ? 'yes' : 'no'} /> : null,
      context.lineupKnown != null ? <Row key="lu" label="Lineup posted" value={context.lineupKnown ? 'yes' : 'not yet'} /> : null,
    ]])
  }
  if (career) {
    groups.push(['Career · regular season', goalie
      ? [<Row key="gp" label="GP" value={career.gp} />, <Row key="w" label="W" value={career.w} />, <Row key="gaa" label="GAA" value={fmt2(career.gaa)} />, <Row key="sv" label="SV%" value={fmtPct3(career.svPct)} />]
      : [<Row key="gp" label="GP" value={career.gp} />, <Row key="g" label="G" value={career.g} />, <Row key="a" label="A" value={career.a} />, <Row key="pts" label="PTS" value={career.pts} />]])
  }
  const shown = groups.map(([t, rows]) => [t, rows.filter((r) => r && r.props.value != null && r.props.value !== '' && r.props.value !== '—')]).filter(([, rows]) => rows.length)
  if (!shown.length) return null
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>The numbers</span>
        <span style={{ fontSize: 12, color: C.text3 }}>the evidence behind the read, tap a (?) for what it means</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '0 24px' }}>
        {shown.map(([t, rows]) => <div key={t}><Head>{t}</Head>{rows}</div>)}
      </div>
    </div>
  )
}
