'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { btnStyle } from '../../ui'
import MatchupMap from '../MatchupMap'
import DvpTable from '../DvpTable'

// Matchups — pick a defence, then read it two ways.
//
//   THE MAP    where the yards they give up actually come from, as a shape.
//   THE TABLE  what they allow to each depth role, ranked against the league.
//
// The map answers "where do I attack them", the table answers "does that
// help MY guy". Neither replaces the other, which is why both are here rather
// than one winning. Drop a player onto the map and it stops being a scouting
// report and becomes a bet: his usage lands on their holes, or it doesn't.

const WINDOWS = [['season', 'Season'], ['l10', 'L10'], ['l5', 'L5'], ['l3', 'L3']]

// "Marvin Mims Jr." → "Mims". Taking the last token gave a picker with a
// button labelled "Jr.".
const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i
function surname(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] || name
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

function Section({ title, sub, children, style }) {
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: 'hidden', marginTop: 12, ...style,
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: NUM_FONT, fontSize: 10, fontWeight: 900, color: C.text,
          letterSpacing: '.12em',
        }}>{title}</span>
        {sub && <span style={{ fontSize: 10.5, color: C.text3 }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

// Squarer and tighter than the shared pill. The MLB side keeps btnStyle as-is.
function teamStyle(active) {
  return {
    fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
    padding: '6px 10px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
    border: `1px solid ${active ? C.green : C.border}`,
    background: active ? `${C.green}1f` : 'rgba(255,255,255,.03)',
    color: active ? C.green : C.text2,
  }
}

export default function Matchups({ matchup, data }) {
  // The slate is six teams. Listing all 32 alphabetically put ATL next to ARI
  // and buried the ones playing tonight in a wall of three-letter codes — so
  // the games lead, laid out as games, and the league hides behind a toggle.
  const slate = useMemo(
    () => (data?.games || []).map((g) => [g.away, g.home]).filter(([a, h]) => a && h),
    [data])
  const onSlate = useMemo(() => new Set(slate.flat()), [slate])
  const rest = useMemo(
    () => Object.keys(matchup?.dvp?.season || {}).sort().filter((t) => !onSlate.has(t)),
    [matchup, onSlate])

  const [team, setTeam] = useState(null)
  const [win, setWin] = useState('season')
  const [pid, setPid] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const active = team || slate[0]?.[0] || rest[0]

  const pick = (t) => { setTeam(t); setPid(null) }

  // Who's actually going at this defence on this card. Ranked by their best
  // score so the picker leads with the names worth checking.
  const facing = useMemo(() => (data?.players || [])
    .filter((p) => p.opp === active && matchup?.field?.player_pass?.[p.player_id])
    .map((p) => ({ ...p, best: Math.max(...Object.values(p.scores || { x: 0 })) }))
    .sort((a, b) => b.best - a.best)
    // 14 covered ~6 players facing a preseason defense. A real team's
    // pass-catchers and backs alone are more than that.
    .slice(0, 30), [data, active, matchup])

  const picked = facing.find((p) => p.player_id === pid) || null
  const role = picked ? matchup?.roles?.[picked.player_id] : null

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
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10,
      }}>
        {slate.map(([away, home]) => (
          <div key={`${away}@${home}`} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: 3,
            border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg2,
          }}>
            <button onClick={() => pick(away)} style={teamStyle(away === active)}>{away}</button>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3 }}>@</span>
            <button onClick={() => pick(home)} style={teamStyle(home === active)}>{home}</button>
          </div>
        ))}
        {rest.length > 0 && (
          <button onClick={() => setShowAll((v) => !v)} style={{
            ...teamStyle(showAll), color: showAll ? C.green : C.text3,
          }}>{showAll ? 'HIDE' : `ALL ${rest.length + onSlate.size}`}</button>
        )}
      </div>
      {showAll && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {rest.map((t) => (
            <button key={t} onClick={() => pick(t)} style={teamStyle(t === active)}>{t}</button>
          ))}
        </div>
      )}

      <Section
        title={`${active} — THE MAP`}
        sub={picked
          ? `${picked.name}'s work on their holes`
          : 'where their yards allowed come from — pick a player to overlay his usage'}
        style={{ marginTop: 0 }}
      >
        {facing.length > 0 && (
          <div style={{
            display: 'flex', gap: 5, flexWrap: 'wrap', padding: '10px 14px 0',
          }}>
            <button onClick={() => setPid(null)} style={btnStyle(C.cyan, !pid)}>Defence only</button>
            {facing.map((p) => (
              <button key={p.player_id} onClick={() => setPid(p.player_id)}
                      style={btnStyle(C.cyan, pid === p.player_id)}>
                {surname(p.name)} <span style={{ opacity: .6 }}>{p.position}</span>
              </button>
            ))}
          </div>
        )}
        <div style={{ padding: 14 }}>
          <MatchupMap
            field={matchup.field}
            team={active}
            player={picked}
            mode={picked ? 'player' : 'def'}
            defaultView={picked?.position === 'RB' ? 'rush' : 'pass'}
          />
        </div>
      </Section>

      <Section
        title={`${active} — DEFENCE VS POSITION`}
        sub={`by depth role · rank 1 = allows the most = softest · ${matchup.season}`}
      >
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '10px 14px 0' }}>
          {WINDOWS.filter(([k]) => matchup.dvp[k]).map(([k, label]) => (
            <button key={k} onClick={() => setWin(k)} style={btnStyle(C.cyan, k === win)}>{label}</button>
          ))}
        </div>
        <div style={{ paddingTop: 10 }}>
          <DvpTable data={matchup} team={active} win={win} highlight={role} />
        </div>
        {picked && !role && (
          <div style={{ fontSize: 10, color: C.text3, padding: '8px 14px 12px' }}>
            Depth roles publish with the next bot run — until then no row is pinned to {picked.name}.
          </div>
        )}
      </Section>

      <Profile data={matchup} team={active} />
    </div>
  )
}
