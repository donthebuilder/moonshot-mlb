'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/nfl/theme'
import { alpha } from '../../lib/scales'
import { ChipGroup } from '../matchup/SprayParts'
import NflTable from './NflTable'
import NflFace from './NflFace'
import FootballField from './FootballField'
import { LANES, LANE_WORD } from '../../lib/nfl/fieldModel'

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
const SHELL_COL = () => ({ C0: C.red, C1: C.orange, C2: C.yellow, C3: C.cyan, C4: C.green, C6: C.purple })
const MIN_TGT = 10
const MIN_CAR = 5
const MIN_DEF_CAR = 8

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
  const defs = Object.entries(teams).map(([team, t]) => ({ team, ...t, pick: t.shells?.[shell] ?? 0 }))
    .sort((a, b) => b.pick - a.pick)
  const word = fam === 'man' ? 'man' : 'zone'

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <ChipGroup theme={C} numFont={NUM_FONT} first label="Coverage" value={fam} onChange={setFam} color={C.cyan}
          options={[{ k: 'man', label: 'Man', n: Object.values(matchup?.coverage_player || {}).filter((v) => v?.man?.tgts >= MIN_TGT).length, title: 'Receivers against man coverage' },
            { k: 'zone', label: 'Zone', n: Object.values(matchup?.coverage_player || {}).filter((v) => v?.zone?.tgts >= MIN_TGT).length, title: 'Receivers against zone coverage' }]} />
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{season} charting · {MIN_TGT}+ targets</span>
      </div>

      {/* THIS WEEK'S FITS: good against it, and his opponent plays it a lot */}
      {fits.length > 0 && (
        <div style={{ display: 'grid', gap: 7, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 210px), 1fr))', marginBottom: 12 }}>
          {fits.map((r) => (
            <button key={r._key} type="button" onClick={() => onPlayerClick?.(r._raw, 'REC_YDS')} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
              border: `1px solid ${alpha(C.cyan, 0.4)}`, borderRadius: 11, background: alpha(C.cyan, 0.06), color: 'inherit',
            }}>
              <NflFace player={r._raw} size={34} />
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: TYPE.name, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</b>
                <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3 }}>
                  <b style={{ color: C.cyan }}>{r.ypt}</b> yds/tgt vs {word} · {r.opp} plays {word} <b style={{ color: C.text }}>{Math.round(r.faces)}%</b>
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <NflTable
          key={fam}
          rows={receivers}
          columns={[
            { key: 'name', label: 'Receiver', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', label: 'Tm', w: 44, heat: false, teamMark: 'nfl' },
            { key: 'tgts', label: 'Tgts', w: 44, dp: 0 },
            { key: 'ypt', label: 'Yds/tgt', w: 56, dp: 1, primary: true },
            { key: 'catch', label: 'Catch%', w: 56, dp: 0 },
            { key: 'td', label: 'TD', w: 38, dp: 0 },
            { key: 'faces', label: `Opp ${word}%`, w: 70, dp: 0, title: `How much of this week's opponent's coverage is ${word}` },
          ]}
          onRowClick={(p) => onPlayerClick?.(p, 'REC_YDS')}
          faceOf={(r) => ({ sport: 'nfl', espnId: r._raw?.espn_id, name: r.name })}
          initialSort={{ key: 'ypt', dir: 'desc' }}
          maxHeight={460}
          maxRows={15}
          caption={`Who burns ${word} coverage: every receiver with ${MIN_TGT}+ targets against it, by yards a target. Opp ${word}% = how much his opponent this week plays it.`}
        />
        <div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 7 }}>
            <span style={{ fontSize: TYPE.label, color: C.text3, fontFamily: NUM_FONT, fontWeight: 800, letterSpacing: '.08em' }}>DEFENSES BY</span>
            {SHELLS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => setShell(k)} style={{
                padding: '3px 9px', borderRadius: 999, cursor: 'pointer', fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT, minHeight: 0,
                border: `1px solid ${shell === k ? SHELL_COL()[k] : C.border}`, background: shell === k ? alpha(SHELL_COL()[k], 0.16) : 'transparent',
                color: shell === k ? SHELL_COL()[k] : C.text3,
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {defs.slice(0, 16).map((d) => (
              <div key={d.team} title={SHELLS.map(([k, l]) => `${l} ${d.shells?.[k] ?? 0}%`).join(' · ')} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 44px', alignItems: 'center', gap: 7 }}>
                <b style={{ fontFamily: NUM_FONT, fontSize: 10.5 }}>{d.team}</b>
                <div style={{ display: 'flex', height: 12, borderRadius: 3, overflow: 'hidden', background: C.bg3 }}>
                  {SHELLS.map(([k]) => {
                    const v = d.shells?.[k] || 0
                    return v ? <span key={k} style={{ width: `${v}%`, background: SHELL_COL()[k], opacity: k === shell ? 1 : 0.38 }} /> : null
                  })}
                </div>
                <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, textAlign: 'right', color: SHELL_COL()[shell], fontWeight: 800 }}>{Math.round(d.pick)}%</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 9.5, fontFamily: NUM_FONT }}>
            {SHELLS.map(([k, l]) => <span key={k} style={{ color: SHELL_COL()[k] }}>■ {l}</span>)}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5 }}>The 16 defenses that play {SHELLS.find(([k]) => k === shell)?.[1]} most; each bar is that defense&apos;s whole coverage mix.</div>
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8 }}>Receivers are charted by man vs zone only — no per-receiver split by each shell is published.</div>
    </div>
  )
}

function Holes({ matchup, byId, onPlayerClick, season }) {
  const [hole, setHole] = useState('left|end')
  const f = matchup?.field || {}
  const lg = f.league_rush || {}
  const maxYpc = Math.max(1, ...LANES.map((z) => lg[z]?.ypc || 0))
  const cells = Object.fromEntries(LANES.map((z) => {
    const m = lg[z] || {}
    return [z, { big: m.ypc != null ? m.ypc.toFixed(1) : '—', small: `${HOLE_SHORT[z]}${m.att ? ` · ${m.att}` : ''}`, heat: m.ypc != null ? m.ypc / maxYpc : null, len: m.ypc != null ? m.ypc / maxYpc : 0.1, title: `${LANE_WORD[z]} · league ${m.ypc ?? '—'} yds a carry on ${m.att || 0}` }]
  }))
  const league = lg[hole] || {}

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
      <div className="spray-wrap" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, marginBottom: 12 }}>
        <div style={{ flex: '0 1 420px', minWidth: 0, width: '100%' }}>
          <FootballField mode="rush" cells={cells} pickedKey={hole} onPick={setHole} maxWidth={420} />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: TYPE.name, fontWeight: 900 }}>{LANE_WORD[hole]?.replace(/^runs /, 'Runs ')}</div>
          <div style={{ fontFamily: NUM_FONT, fontSize: 10.5, color: C.text2, lineHeight: 1.7, marginTop: 2 }}>
            League: <b style={{ color: C.text }}>{league.ypc ?? '—'}</b> yds a carry on {league.att || 0} · {league.td || 0} TD
            {league.att ? <> · stuffed {Math.round((100 * (league.stf || 0)) / league.att)}% · 10+ yds {Math.round((100 * (league.x10 || 0)) / league.att)}%</> : null}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8, lineHeight: 1.6 }}>
            Each arrow is a hole at the line, its length the league&apos;s yards a carry there; under it, the hole and its carries. Tap one: who runs it best, and who can&apos;t stop it. {season} season.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', alignItems: 'start' }}>
        <NflTable
          key={`b-${hole}`}
          rows={backs}
          columns={[
            { key: 'name', label: 'Runner', w: 150, heat: false, bold: true, sticky: true },
            { key: 'team', label: 'Tm', w: 44, heat: false, teamMark: 'nfl' },
            { key: 'att', label: 'Car', w: 42, dp: 0 },
            { key: 'ypc', label: 'Yds/car', w: 56, dp: 1, primary: true },
            { key: 'vsLg', label: 'Vs lg', w: 50, dp: 1, title: 'His yards a carry here minus the league’s' },
            { key: 'td', label: 'TD', w: 36, dp: 0 },
            { key: 'share', label: 'His %', w: 50, dp: 0, title: 'Share of his carries that go through this hole' },
          ]}
          onRowClick={(p) => onPlayerClick?.(p, 'RUSH_YDS')}
          faceOf={(r) => ({ sport: 'nfl', espnId: r._raw?.espn_id, name: r.name })}
          initialSort={{ key: 'ypc', dir: 'desc' }}
          maxHeight={420}
          maxRows={12}
          caption={`Who runs it best: every back with ${MIN_CAR}+ carries through this hole.`}
        />
        <NflTable
          key={`d-${hole}`}
          rows={defs}
          columns={[
            { key: 'team', label: 'Defense', w: 70, heat: false, sticky: true, teamMark: 'nfl' },
            { key: 'att', label: 'Car', w: 42, dp: 0 },
            { key: 'ypc', label: 'Yds/car', w: 56, dp: 1, primary: true },
            { key: 'vsLg', label: 'Vs lg', w: 50, dp: 1 },
            { key: 'big', label: '10+%', w: 48, dp: 0, title: 'Carries through here that went 10+ yards' },
            { key: 'stuff', label: 'Stuff%', w: 52, dp: 0, invert: true, title: 'Carries stopped for 0 or less. Inverted: more stuffs is worse for the runner' },
            { key: 'td', label: 'TD', w: 36, dp: 0 },
          ]}
          initialSort={{ key: 'ypc', dir: 'desc' }}
          maxHeight={420}
          maxRows={12}
          caption={`Who can't stop it: every defense that faced ${MIN_DEF_CAR}+ carries through this hole, leakiest first.`}
        />
      </div>
      <div style={{ fontSize: 9.5, color: C.text3, marginTop: 8 }}>By hole only — the run type (inside zone, power, counter) is not in the published data.</div>
    </div>
  )
}
