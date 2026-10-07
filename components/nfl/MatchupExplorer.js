'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { alpha } from '../../lib/scales'
import { ChipGroup } from '../charts'
import NflTable from './NflTable'
import RunLineField from './RunLineField'
import CoverageShellField from './CoverageShellField'
import { LANES, LANE_WORD } from '../../lib/nfl/fieldModel'
import { SHELL_SHAPE } from './CoverageShellField'

// 🔍 THE LEAGUE, BY COVERAGE AND BY HOLE (2026-09-30, Donovan: "I want to be
// able to filter teams' coverages, then see who fits best ... who across the
// league is burning what covers, or running back is doing the best at what
// hole and run type, and then the vice versa for defenses ... way too much
// text, not enough data visualization").
//
//   COVERAGE  pick Man or Zone. Left: the receivers doing the most against
//             it league-wide (yards a target, TDs, catch rate, 10+ targets).
//             Right: every defence's coverage mix drawn as one bar (Cover 0 /
//             1 / 2 / 3 / 4 / 6 shares), sortable by the shell you pick. Top:
//             this week's fits -- a receiver who is good against it whose
//             opponent plays it a lot.
//   HOLES     the field with the league's seven holes as arrows (length =
//             yards a carry). Tap a hole: the backs who do most through it
//             (8+ carries) and the defences that leak most there.
//
// Honest limits, said once, small: the charting splits receivers by man vs
// zone, not by each shell (no per-receiver "vs Cover 3" is published), and
// the run data is by hole, not run type (no inside-zone / power split).
// Source: nfl_matchup.json coverage_player, coverage_team, field.player_rush,
// field.def_rush, field.league_rush (the chart season the file carries).

const HOLE_SHORT = { 'left|end': 'L END', 'left|tackle': 'L TKL', 'left|guard': 'L GRD', 'middle|middle': 'MID', 'right|guard': 'R GRD', 'right|tackle': 'R TKL', 'right|end': 'R END' }
const SHELLS = [['C0', 'Cover 0'], ['C1', 'Cover 1'], ['C2', 'Cover 2'], ['C3', 'Cover 3'], ['C4', 'Cover 4'], ['C6', 'Cover 6']]
// 10-07 colour diet: every coverage shell wears the one accent; the bar's label says which it is.
const SHELL_COL = () => ({ C0: C.green, C1: C.green, C2: C.green, C3: C.green, C4: C.green, C6: C.green })
const MIN_TGT = 10
const MIN_CAR = 5
const MIN_DEF_CAR = 8
const MIN_SHELL = 50

export default function MatchupExplorer({ matchup, data, onPlayerClick, view = 'coverage' }) {
  const byId = useMemo(() => new Map((data?.players || []).map((p) => [String(p.player_id), p])), [data])
  const season = matchup?.chart_season || matchup?.season
  return view === 'coverage'
    ? <Coverage matchup={matchup} byId={byId} onPlayerClick={onPlayerClick} season={season} />
    : <Holes matchup={matchup} byId={byId} onPlayerClick={onPlayerClick} season={season} />
}

function Coverage({ matchup, byId, onPlayerClick, season }) {
  const [fam, setFam] = useState('man')
  const [shell, setShell] = useState('C1')
  const teams = matchup?.coverage_team || {}
  const oppShare = (team) => {
    const t = teams[team]
    return t ? (fam === 'man' ? t.man_pct : t.zone_pct) : null
  }

  const receivers = useMemo(() => Object.entries(matchup?.coverage_player || {})
    .map(([pid, v]) => {
      const p = byId.get(pid)
      const s = v?.[fam]
      if (!p || !s || (s.tgts || 0) < MIN_TGT) return null
      const faces = p.opp ? oppShare(p.opp) : null
      return {
        _key: pid, _raw: p, player_id: pid, espn_id: p.espn_id, name: p.name, position: p.position, team: p.team, opp: p.opp || '',
        tgts: s.tgts, ypt: s.ypt, catch: s.catch_pct, td: s.td, rz: s.rz_tgts, faces,
        fit: faces != null && s.ypt != null ? s.ypt * (faces / 100) : null,
      }
    }).filter(Boolean), [matchup, byId, fam]) // eslint-disable-line react-hooks/exhaustive-deps

  const fits = [...receivers].filter((r) => r.faces != null).sort((a, b) => b.fit - a.fit).slice(0, 6)
  const defs = Object.entries(teams).filter(([, t]) => (t.shell_n || 0) >= MIN_SHELL).map(([team, t]) => ({ _key: team, team, man_pct: t.man_pct, zone_pct: t.zone_pct, shell_n: t.shell_n, pick: t.shells?.[shell] ?? 0 }))
    .sort((a, b) => b.pick - a.pick)
  // the league's share of charted snaps in each shell: every club's share weighted by its snaps
  const leagueSnaps = Object.values(teams).reduce((a, t) => a + ((t.shell_n || 0) >= MIN_SHELL ? t.shell_n : 0), 0)
  const leagueShare = Object.fromEntries(SHELLS.map(([k]) => [k, leagueSnaps ? Object.values(teams).reduce((a, t) => a + ((t.shell_n || 0) >= MIN_SHELL ? ((t.shells?.[k] || 0) * t.shell_n) / 100 : 0), 0) * 100 / leagueSnaps : null]))
  const word = fam === 'man' ? 'man' : 'zone'

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <ChipGroup theme={C} numFont={NUM_FONT} first label="Coverage" value={fam} onChange={setFam} color={C.green}
          options={[{ k: 'man', label: 'Man', n: Object.values(matchup?.coverage_player || {}).filter((v) => v?.man?.tgts >= MIN_TGT).length, title: 'Receivers against man coverage' },
            { k: 'zone', label: 'Zone', n: Object.values(matchup?.coverage_player || {}).filter((v) => v?.zone?.tgts >= MIN_TGT).length, title: 'Receivers against zone coverage' }]} />
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{season} charting · {MIN_TGT}+ targets</span>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <NflTable
          key={fam}
          rows={receivers}
          columns={[
            { key: 'name', group: 'Receiver', label: 'Receiver', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', group: 'Receiver', label: 'Tm', w: 44, heat: false, teamMark: 'nfl' },
            { key: 'tgts', group: 'Against it', label: 'Tgts', w: 44, dp: 0 },
            { key: 'ypt', group: 'Against it', label: 'Yds/tgt', w: 56, dp: 1, primary: true },
            { key: 'catch', group: 'Against it', label: 'Catch%', w: 56, dp: 0 },
            { key: 'td', group: 'Against it', label: 'TD', w: 38, dp: 0 },
            { key: 'faces', group: 'This week', label: `Opp ${word}%`, w: 70, dp: 0, title: `How much of this week's opponent's coverage is ${word}` },
          ]}
          onRowClick={(p) => onPlayerClick?.(p, 'REC_YDS')}
          faceOf={(r) => ({ sport: 'nfl', espnId: r._raw?.espn_id, name: r.name })}
          initialSort={{ key: 'ypt', dir: 'desc' }}
          maxHeight={460}
          maxRows={15}
          caption={`Who burns ${word} coverage: every receiver with ${MIN_TGT}+ targets against it, by yards a target. Opp ${word}% = how much his opponent this week plays it.`}
        />
        <div>
          {/* THE SHELL, DRAWN: the secondary lined up, the league's share of snaps on it (CoverageShellField) */}
          <CoverageShellField shell={shell} hue={SHELL_COL()[shell]} big={`${leagueShare[shell] != null ? leagueShare[shell].toFixed(1) : '—'}%`} sub={`of the league's ${leagueSnaps.toLocaleString()} charted snaps`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 8 }}>
            {SHELLS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setShell(k)} aria-pressed={shell === k} style={{
                minHeight: 44, padding: '4px 6px', borderRadius: 10, cursor: 'pointer', fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${shell === k ? SHELL_COL()[k] : C.border}`, background: shell === k ? alpha(SHELL_COL()[k], 0.16) : 'transparent',
                color: shell === k ? SHELL_COL()[k] : C.text2, lineHeight: 1.2,
              }}>{label}<br /><span style={{ color: C.text3 }}>{leagueShare[k] != null ? `${leagueShare[k].toFixed(0)}%` : '—'}</span></button>
            ))}
          </div>
          <div style={{ fontSize: TYPE.label, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>{SHELL_SHAPE[shell]?.word} The drawing is the textbook alignment; the percentage is real.</div>
        </div>
      </div>

      {/* WHO PLAYS IT MOST: the defences, ranked, in a table (the bars it replaced were the same numbers) */}
      <div style={{ marginTop: 14 }}>
        <NflTable
          key={`defs-${shell}`}
          rows={defs}
          columns={[
            { key: 'team', group: 'Defense', label: 'Defense', w: 74, heat: false, sticky: true, teamMark: 'nfl' },
            { key: 'pick', group: 'Shell', label: '% of snaps', w: 76, dp: 1, primary: true },
            { key: 'man_pct', group: 'Family', label: 'Man %', w: 56, dp: 0 },
            { key: 'zone_pct', group: 'Family', label: 'Zone %', w: 58, dp: 0 },
            { key: 'shell_n', group: 'Sample', label: 'Snaps', w: 52, dp: 0, title: 'Charted snaps behind the shares' },
          ]}
          initialSort={{ key: 'pick', dir: 'desc' }}
          maxHeight={420}
          maxRows={10}
          caption={`Who plays ${SHELLS.find(([k]) => k === shell)?.[1]} most: defenses with ${MIN_SHELL}+ charted snaps, by their share of it.`}
        />
      </div>

      {/* THIS WEEK'S FITS: good against it, and his opponent plays it a lot */}
      {fits.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <NflTable
            key={`fits-${fam}`}
            rows={fits}
            columns={[
              { key: 'name', group: 'Receiver', label: 'This week\'s fit', w: 150, heat: false, bold: true, sticky: true },
              { key: 'opp', group: 'Receiver', label: 'Vs', w: 48, heat: false, teamMark: 'nfl' },
              { key: 'ypt', group: `Against ${word}`, label: 'Yds/tgt', w: 58, dp: 1, primary: true },
              { key: 'faces', group: `Against ${word}`, label: `Opp ${word}%`, w: 70, dp: 0 },
            ]}
            onRowClick={(p) => onPlayerClick?.(p, 'REC_YDS')}
            faceOf={(r) => ({ sport: 'nfl', espnId: r._raw?.espn_id, name: r.name })}
            initialSort={{ key: 'ypt', dir: 'desc' }}
            maxHeight={9999}
            maxRows={6}
            caption={`Good against ${word} coverage, and his opponent this week plays it a lot.`}
          />
        </div>
      )}
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8 }}>Receivers are charted by man vs zone only — no per-receiver split by each shell is published.</div>
    </div>
  )
}

function Holes({ matchup, byId, onPlayerClick, season }) {
  const [hole, setHole] = useState('middle|middle')
  const [defTeam, setDefTeam] = useState(null)   // a defence picked from the table: the field shows ITS holes
  const f = matchup?.field || {}
  const lg = f.league_rush || {}
  const dl = defTeam ? f.def_rush?.[defTeam] || {} : null
  const src = dl || lg
  const minAtt = dl ? MIN_DEF_CAR : 30
  const cells = Object.fromEntries(LANES.map((z) => {
    const m = src[z] || {}
    const thin = !(m.att >= minAtt)
    return [z, { big: m.ypc != null ? m.ypc.toFixed(1) : '—', sub: `${m.att || 0}`, yards: m.ypc != null ? m.ypc : null, thin,
      title: `${LANE_WORD[z]} · ${defTeam ? `${defTeam} allow` : 'league'} ${m.ypc ?? '—'} yds a carry on ${m.att || 0}${thin ? ' (too few carries to call it)' : ''}` }]
  }))
  const league = lg[hole] || {}

  // THE SEVEN HOLES, as the dense table that leads; the field beside it is the same numbers drawn
  const holeRows = LANES.map((z) => {
    const m = lg[z] || {}
    return { _key: z, z, hole: HOLE_SHORT[z], att: m.att || 0, ypc: m.ypc, stuff: m.att ? (100 * (m.stf || 0)) / m.att : null, big: m.att ? (100 * (m.x10 || 0)) / m.att : null, td: m.td || 0,
      dYpc: dl?.[z]?.att >= MIN_DEF_CAR ? dl[z].ypc : null }
  })

  const backs = useMemo(() => Object.entries(f.player_rush || {}).map(([pid, lanes]) => {
    const m = lanes?.[hole]
    const p = byId.get(pid)
    if (!p || !m || (m.att || 0) < MIN_CAR) return null
    const all = Object.values(lanes).reduce((a, x) => a + (x?.att || 0), 0)
    return { _key: pid, _raw: p, player_id: pid, name: p.name, team: p.team, opp: p.opp || '', att: m.att, ypc: m.ypc, td: m.td, share: all ? (100 * m.att) / all : null, vsLg: league.ypc ? m.ypc - league.ypc : null }
  }).filter(Boolean), [f, hole, byId, league.ypc])

  const defs = Object.entries(f.def_rush || {}).map(([team, lanes]) => {
    const m = lanes?.[hole]
    if (!m || (m.att || 0) < MIN_DEF_CAR) return null
    return { _key: team, team, att: m.att, ypc: m.ypc, td: m.td, stuff: m.att ? (100 * (m.stf || 0)) / m.att : null, big: m.att ? (100 * (m.x10 || 0)) / m.att : null, vsLg: league.ypc ? m.ypc - league.ypc : null }
  }).filter(Boolean)

  return (
    <div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'start', marginBottom: 12 }}>
        <div>
          <NflTable
            rows={holeRows}
            columns={[
              { key: 'hole', group: 'Hole', label: 'Hole', w: 70, heat: false, sticky: true, bold: true, fmt: (v, r) => <span style={{ color: r.z === hole ? C.green : undefined }}>{v}</span> },
              { key: 'att', group: 'League', label: 'Car', w: 46, dp: 0 },
              { key: 'ypc', group: 'League', label: 'Yds/car', w: 56, dp: 1, primary: true },
              { key: 'stuff', group: 'League', label: 'Stuff%', w: 52, dp: 0, invert: true, title: 'Carries stopped for 0 or less' },
              { key: 'big', group: 'League', label: '10+%', w: 46, dp: 0 },
              { key: 'td', group: 'League', label: 'TD', w: 36, dp: 0 },
              ...(dl ? [{ key: 'dYpc', group: defTeam, label: 'Yds/car', w: 56, dp: 1, title: `${defTeam} allow, through this hole` }] : []),
            ]}
            onRowClick={(r) => setHole(r.z)}
            rowEdge={(r) => (r.z === hole ? C.green : null)}
            initialSort={null}
            maxHeight={9999}
            maxRows={7}
            caption={`The seven holes, league-wide, ${season}. Tap one: who runs it best, and who can't stop it.`}
          />
        </div>
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6, fontFamily: NUM_FONT, fontSize: TYPE.label, color: C.text2 }}>
            <b style={{ color: C.text }}>{defTeam ? `${defTeam} defense allow` : 'League, yards a carry'}</b>
            {defTeam && <button type="button" onClick={() => setDefTeam(null)} style={{ minHeight: 44, padding: '0 12px', borderRadius: 999, border: `1px solid ${C.border2}`, background: 'transparent', color: C.text2, cursor: 'pointer', fontFamily: NUM_FONT, fontWeight: 800 }}>Show the league ✕</button>}
          </div>
          <RunLineField cells={cells} pickedKey={hole} onPick={setHole} hue={C.green} label={`${defTeam || 'League'} yards a carry through each hole`} />
          <div style={{ fontSize: TYPE.label, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Offense lined up as they stand; the bar over each man is yards a carry through his hole, the carries above the number. Dashed = too few carries to call it (under {minAtt}). Tap a defense in the table below to see its holes. {season} season.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <NflTable
          key={`b-${hole}`}
          rows={backs}
          columns={[
            { key: 'name', group: 'Runner', label: 'Runner', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', group: 'Runner', label: 'Tm', w: 44, heat: false, teamMark: 'nfl' },
            { key: 'att', group: 'Through it', label: 'Car', w: 42, dp: 0 },
            { key: 'ypc', group: 'Through it', label: 'Yds/car', w: 56, dp: 1, primary: true },
            { key: 'vsLg', group: 'Through it', label: 'Vs lg', w: 50, dp: 1, title: 'His yards a carry here minus the league’s' },
            { key: 'td', group: 'Through it', label: 'TD', w: 36, dp: 0 },
            { key: 'share', group: 'Through it', label: 'His %', w: 50, dp: 0, title: 'Share of his carries that go through this hole' },
          ]}
          onRowClick={(p) => onPlayerClick?.(p, 'RUSH_YDS')}
          faceOf={(r) => ({ sport: 'nfl', espnId: r._raw?.espn_id, name: r.name })}
          initialSort={{ key: 'ypc', dir: 'desc' }}
          maxHeight={420}
          maxRows={12}
          caption={`Who runs it best: every back with ${MIN_CAR}+ carries through ${HOLE_SHORT[hole]}.`}
        />
        <NflTable
          key={`d-${hole}`}
          rows={defs}
          columns={[
            { key: 'team', group: 'Defense', label: 'Defense', w: 70, heat: false, sticky: true, teamMark: 'nfl' },
            { key: 'att', group: 'Faced here', label: 'Car', w: 42, dp: 0 },
            { key: 'ypc', group: 'Faced here', label: 'Yds/car', w: 56, dp: 1, primary: true },
            { key: 'vsLg', group: 'Faced here', label: 'Vs lg', w: 50, dp: 1 },
            { key: 'big', group: 'Faced here', label: '10+%', w: 48, dp: 0, title: 'Carries through here that went 10+ yards' },
            { key: 'stuff', group: 'Faced here', label: 'Stuff%', w: 52, dp: 0, invert: true, title: 'Carries stopped for 0 or less. Inverted: more stuffs is worse for the runner' },
            { key: 'td', group: 'Faced here', label: 'TD', w: 36, dp: 0 },
          ]}
          onRowClick={(r) => setDefTeam(r.team)}
          rowEdge={(r) => (r.team === defTeam ? C.green : null)}
          initialSort={{ key: 'ypc', dir: 'desc' }}
          maxHeight={420}
          maxRows={12}
          caption={`Who can't stop it: every defense that faced ${MIN_DEF_CAR}+ carries through ${HOLE_SHORT[hole]}, leakiest first. Tap one to put its holes on the field.`}
        />
      </div>
      <div style={{ fontSize: TYPE.label, color: C.text3, marginTop: 8 }}>By hole only — the run type (inside zone, power, counter) is not in the published data.</div>
    </div>
  )
}
