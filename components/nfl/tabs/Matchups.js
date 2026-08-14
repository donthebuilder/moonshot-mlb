'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'
import FieldChart from '../FieldChart'

// Matchups — defence vs position, BY DEPTH ROLE.
//
// The distinction is the whole point. "What this defence allows to wide
// receivers" averages a WR1 and a fourth receiver into one number and is close
// to useless. What you need is what it allows to the guy in the role YOUR
// player occupies, which is why the rows are WR1 / WR2 / WR3 / TE1 / TE2 /
// RB1 / RB2 / QB rather than WR / TE / RB / QB.
//
// Rank is the reading instrument, not the raw number: 66 receiving yards
// allowed means nothing until you know it's 4th-most in the league. Rank 1 =
// allows the most = the softest matchup, which is the direction a bettor
// reads, so rank 1 is green.

const WINDOWS = [['season', 'Season'], ['l10', 'L10'], ['l5', 'L5'], ['l3', 'L3']]

// 32 teams. Rank 1 is the softest spot on the board, 32 the hardest.
function rankColor(rank) {
  if (!Number.isFinite(rank)) return null
  if (rank <= 5) return C.green
  if (rank <= 12) return C.lime
  if (rank <= 21) return C.yellow
  if (rank <= 27) return '#fb923c'
  return C.red
}

function Cell({ cell, stat }) {
  const v = cell?.[stat]
  const r = cell?.[`${stat}_rank`]
  if (v === undefined || v === null) {
    // N/A rather than 0 — a receiver has no rushing line and a quarterback has
    // no receiving line, and printing a zero reads as a measurement.
    return <td style={{ padding: '7px 6px', textAlign: 'center', color: C.text3, fontSize: 10 }}>N/A</td>
  }
  const col = rankColor(r)
  return (
    <td style={{
      padding: '6px 6px', textAlign: 'center',
      background: col ? `${col}14` : 'transparent',
      borderRight: `1px solid ${C.bg}`,
    }}>
      <div style={{ fontFamily: NUM_FONT, fontSize: 12.5, fontWeight: 900, color: C.text }}>
        {Number.isInteger(v) ? v : v.toFixed(1)}
      </div>
      {Number.isFinite(r) && (
        <div style={{
          display: 'inline-block', marginTop: 2, fontFamily: NUM_FONT, fontSize: 8.5,
          fontWeight: 900, color: col, border: `1px solid ${col}55`,
          background: `${col}18`, borderRadius: 4, padding: '0 4px',
        }}>#{r}</div>
      )}
    </td>
  )
}

function DvpTable({ data, team, win }) {
  const roles = data?.dvp_roles || []
  const stats = data?.dvp_stats || []
  const labels = data?.dvp_labels || {}
  const blob = data?.dvp?.[win]?.[team]
  if (!blob) {
    return <div style={{ color: C.text3, fontSize: 12, padding: 16 }}>
      No defence data for {team} in this window.
    </div>
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead>
          <tr style={{ background: 'rgba(255,255,255,.03)' }}>
            <th style={{
              padding: '7px 10px', fontSize: 9.5, fontWeight: 900, color: C.text3,
              textAlign: 'left', letterSpacing: '.08em', position: 'sticky', left: 0,
              background: C.bg2,
            }}>POSITION</th>
            {stats.map((s) => (
              <th key={s} style={{
                padding: '7px 6px', fontSize: 9.5, fontWeight: 900, color: C.text3,
                letterSpacing: '.06em',
              }}>{labels[s] || s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.filter((r) => blob[r]).map((role) => (
            <tr key={role} style={{ borderTop: `1px solid ${C.border}` }}>
              <td style={{
                padding: '6px 10px', fontSize: 11.5, fontWeight: 800, color: C.text,
                position: 'sticky', left: 0, background: C.bg2,
              }}>{role}</td>
              {stats.map((s) => <Cell key={s} cell={blob[role]} stat={s} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: C.text3, minWidth: 96 }}>{label}</span>
      <span style={{ fontFamily: NUM_FONT, fontSize: 11.5, color: C.text }}>{children}</span>
    </div>
  )
}

function Profile({ data, team }) {
  const cov = data?.coverage_team?.[team]
  const exp = data?.def_explosive?.[team]
  if (!cov && !exp) return null
  return (
    <div style={{
      display: 'grid', gap: 10, marginTop: 12,
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    }}>
      {cov && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.cyan}`,
          borderRadius: 10, padding: '11px 14px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
            marginBottom: 7,
          }}>{team} COVERAGE</div>
          <Row label="Man / Zone">{cov.man_pct}% / {cov.zone_pct}%</Row>
          <Row label="Att · YPA">{cov.att} · {cov.ypa}</Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
            {Object.entries(cov.shells || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <span key={k} style={{
                fontFamily: NUM_FONT, fontSize: 9.5, fontWeight: 800, color: C.text2,
                border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 6px',
              }}>{k} <b style={{ color: C.cyan }}>{v}%</b></span>
            ))}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, marginTop: 7, lineHeight: 1.5 }}>
            Shell rates are off the {cov.shell_n} snaps NGS charted a coverage for —
            roughly half. Man/zone is charted on effectively all of them.
          </div>
        </div>
      )}
      {exp && (
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.purple}`,
          borderRadius: 10, padding: '11px 14px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
            marginBottom: 7,
          }}>{team} EXPLOSIVE ALLOWED</div>
          <Row label="Pass yards">{exp.yds}</Row>
          <Row label="10+ / 20+">{exp.pass_10} / {exp.pass_20}</Row>
          <Row label="30+ / 40+">{exp.pass_30} / {exp.pass_40}</Row>
          <Row label="Explosive %">{exp.exp_pct}%</Row>
          <Row label="Deep (20+ air)">{exp.deep_cmp}/{exp.deep_att} · {exp.deep_pct}% · {exp.deep_td} TD</Row>
        </div>
      )}
    </div>
  )
}

export default function Matchups({ matchup, data }) {
  const teams = useMemo(() => {
    const fromGames = (data?.games || []).flatMap((g) => [g.home, g.away])
    const all = Object.keys(matchup?.dvp?.season || {}).sort()
    // Teams on this slate first — that's what you're here for — then the league.
    return [...new Set([...fromGames.filter(Boolean), ...all])]
  }, [matchup, data])

  const [team, setTeam] = useState(null)
  const [win, setWin] = useState('season')
  const active = team || teams[0]

  if (!matchup?.dvp) {
    return (
      <div style={{
        border: `1px dashed ${C.border2}`, borderRadius: 12, padding: 28,
        textAlign: 'center', color: C.text3, fontSize: 12.5,
      }}>Matchup data hasn&apos;t been published yet.</div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.text3, marginBottom: 10 }}>
        By depth role. Rank 1 = allows the most = softest. {matchup.season}.
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
        {teams.slice(0, 40).map((t) => (
          <button key={t} onClick={() => setTeam(t)} style={btnStyle(C.green, t === active)}>{t}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {WINDOWS.filter(([k]) => matchup.dvp[k]).map(([k, label]) => (
          <button key={k} onClick={() => setWin(k)} style={btnStyle(C.cyan, k === win)}>{label}</button>
        ))}
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, overflow: 'hidden',
      }}>
        <div style={{
          padding: '9px 13px', borderBottom: `1px solid ${C.border}`,
          fontSize: 12.5, fontWeight: 900, color: C.text,
        }}>{active} Defense</div>
        <DvpTable data={matchup} team={active} win={win} />
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
        padding: '13px 15px', marginTop: 12,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 900, color: C.text3, letterSpacing: '.1em',
          marginBottom: 9,
        }}>{active} — WHERE THEY LEAK</div>
        <FieldChart field={matchup.field} team={active} mode="def" />
      </div>

      <Profile data={matchup} team={active} />
    </div>
  )
}
