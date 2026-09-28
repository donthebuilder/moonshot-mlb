'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../../PageHeader'
import LampTable from '../LampTable'
import ShotPanel from '../ShotPanel'
import { C, NUM_FONT, rampAt } from '../../../lib/nhl/theme'
import { DelayedBanner, Loading, SourceLine, EmptyState, Kicker, PlayerMark } from '../ui'

// 🏒 LAMP MATCHUPS (2026-09-27, matchups plan Part B, in the shape Donovan
// signed off on TUDDY's): a ranked table of tonight's defences leads --
// goals allowed per game, most first -- and a tap opens that defence's
// detail below: the power play against the penalty kill, the net, rest, who
// fits, and where the attacking club shoots from. Measured, never a LAMP
// score; the season is said in words while it is last season's.
const pct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)
const ord = (n) => (n == null ? '' : `#${n}`)
const PREVIEW = 8

function useMatchups(date) {
  const [state, set] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    let alive = true
    set((s) => ({ ...s, loading: true }))
    fetch(`/api/lamp/matchups${date ? `?date=${date}` : ''}`)
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok) throw Object.assign(new Error(j?.error || `HTTP ${r.status}`), { status: r.status }); return j })
      .then((j) => { if (alive) set({ data: j, error: null, loading: false }) })
      .catch((e) => { if (alive) set((s) => ({ data: s.data, error: e, loading: false })) })
    return () => { alive = false }
  }, [date])
  return state
}

function useGoalies(team) {
  const [g, set] = useState(null)
  useEffect(() => {
    if (!team) return undefined
    let alive = true
    set(null)
    fetch(`/api/lamp/team?team=${team}`).then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) set({ list: (j?.stats?.goalies || []).slice().sort((a, b) => (b.gp || 0) - (a.gp || 0)).slice(0, 2), stale: Boolean(j?.statsStale) }) })
      .catch(() => { if (alive) set({ list: [], stale: false }) })
    return () => { alive = false }
  }, [team])
  return g
}

// One bar against the league's average for the same number.
function Bar({ label, value, avg, good }) {
  const w = (v) => `${Math.max(2, Math.min(100, (v / 0.35) * 100))}%`   // PP% lives in 0-35%
  const pkW = (v) => `${Math.max(2, Math.min(100, ((v - 0.65) / 0.3) * 100))}%` // PK% lives in 65-95%
  const scale = good === 'pk' ? pkW : w
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 56px', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ color: C.text2 }}>{label}</span>
      <span style={{ position: 'relative', height: 12, borderRadius: 6, background: C.bg3 }}>
        {value != null && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: scale(value), borderRadius: 6, background: C.ice }} />}
        {avg != null && <span title="league average" style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: scale(avg), background: C.text }} />}
      </span>
      <b style={{ fontFamily: NUM_FONT, color: C.text, textAlign: 'right' }}>{pct(value)}</b>
    </div>
  )
}

function Detail({ row, league, onOpenPlayer }) {
  const goalies = useGoalies(row?.def)
  if (!row) return null
  const edge = row.oppPp != null && row.pk != null && league.pp != null && league.pk != null
    ? (row.oppPp > league.pp && row.pk < league.pk ? 'the softest spot tonight is special teams' : row.pk < league.pk ? 'the penalty kill is below the league' : 'the penalty kill holds up')
    : null
  return (
    <section id="lamp-def-detail" aria-label={`${row.def} defence`} style={{ display: 'flex', flexDirection: 'column', gap: 12, scrollMarginTop: 80 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: C.cream }}>{row.def} defence <span style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3, fontWeight: 600 }}>· {row.home ? 'vs' : '@'} {row.opp} · tap another row above to switch</span></h2>

      <div>
        <Kicker>POWER PLAY vs PENALTY KILL</Kicker>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
          <b style={{ color: C.text }}>{row.opp}</b>&apos;s power play ({pct(row.oppPp)}, {ord(row.oppPpRank)}) against <b style={{ color: C.text }}>{row.def}</b>&apos;s penalty kill ({pct(row.pk)}, {ord(row.pkRank)}){edge ? `: ${edge}.` : '.'}
        </p>
        <div style={{ display: 'grid', gap: 6, maxWidth: 520 }}>
          <Bar label={`${row.opp} power play`} value={row.oppPp} avg={league.pp} />
          <Bar label={`${row.def} penalty kill`} value={row.pk} avg={league.pk} good="pk" />
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: C.text3 }}>The white tick is the league average.</div>
      </div>

      <div>
        <Kicker>THE NET · {row.def}</Kicker>
        {!goalies ? <div style={{ fontSize: 12, color: C.text3 }}>Loading the goalies…</div> : goalies.list.length ? (
          <>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', maxWidth: 520 }}>
              <thead><tr style={{ color: C.text3, font: `800 9px/1 ${NUM_FONT}`, letterSpacing: '.1em', textAlign: 'left' }}><th style={{ padding: '0 8px 6px 0' }}>GOALIE</th><th style={{ textAlign: 'right' }}>GP</th><th style={{ textAlign: 'right' }}>SV%</th><th style={{ textAlign: 'right' }}>GAA</th></tr></thead>
              <tbody>{goalies.list.map((g) => (
                <tr key={g.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '7px 8px 7px 0' }}><PlayerMark headshot={g.headshot} name={g.name} onClick={() => onOpenPlayer?.(g.id)} /></td>
                  <td style={{ textAlign: 'right', fontFamily: NUM_FONT, color: C.text2 }}>{g.gp ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: NUM_FONT, color: C.text }}>{g.svPct != null ? g.svPct.toFixed(3).replace(/^0/, '') : '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: NUM_FONT, color: C.text }}>{g.gaa != null ? g.gaa.toFixed(2) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ marginTop: 4, fontSize: 11, color: C.text3 }}>Starter not announced: the league names no starter before puck drop, so both are shown.{goalies.stale ? ' Last season’s lines.' : ''}</div>
          </>
        ) : <div style={{ fontSize: 12, color: C.text3 }}>No goalie lines for {row.def} yet.</div>}
      </div>

      <div>
        <Kicker>REST</Kicker>
        <div style={{ fontSize: 12.5, color: C.text2 }}>
          {row.def}: {row.b2b ? <b style={{ color: C.amber }}>back-to-back</b> : row.rest != null ? `${row.rest} day${row.rest === 1 ? '' : 's'} off` : 'rest unknown'}
          {' · '}{row.opp}: {row.oppB2b ? <b style={{ color: C.amber }}>back-to-back</b> : row.oppRest != null ? `${row.oppRest} day${row.oppRest === 1 ? '' : 's'} off` : 'rest unknown'}
        </div>
      </div>

      <div>
        <Kicker>WHO FITS · {row.opp}&apos;S CALLED SKATERS</Kicker>
        {row.called.length ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {row.called.map((p) => <span key={p.playerId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}><PlayerMark headshot={p.mug} name={p.name} size={28} onClick={() => onOpenPlayer?.(p.playerId)} /><span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>{p.pos} · #{p.rank} in the game</span></span>)}
          </div>
        ) : <div style={{ fontSize: 12, color: C.text3 }}>None of tonight&apos;s three called skaters in this game plays for {row.opp}.</div>}
      </div>

      <div>
        <Kicker>WHERE {row.def} ALLOWS SHOTS FROM</Kicker>
        <ShotPanel sel={{ against: row.def }} who={row.def} height={260} />
        <div style={{ marginTop: 4, fontSize: 11, color: C.text3 }}>Every attempt the other club took in {row.def}&apos;s games, drawn on one attacking half.</div>
      </div>

      <div>
        <Kicker>WHERE {row.opp} SHOOTS FROM</Kicker>
        <ShotPanel sel={{ team: row.opp }} who={row.opp} height={260} />
      </div>
    </section>
  )
}

export default function Matchups({ date = null, onOpenPlayer }) {
  const { data, error, loading } = useMatchups(date)
  const [pick, setPick] = useState(null)
  const rows = data?.rows || []
  const league = data?.league || {}
  const lastSeason = Boolean(data?.standingsSeason?.stale || data?.reportSeason?.stale)
  const active = rows.find((r) => r.def === pick) || rows[0] || null
  const lead = rows[0]
  const tableRows = rows.map((r) => ({
    ...r, _id: r.def, vs: `${r.home ? 'vs' : '@'} ${r.opp}`,
    restTxt: r.b2b ? 'B2B' : r.rest != null ? `${r.rest}d` : '—',
  }))
  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'def', label: 'Defence', w: 70, heat: false, sticky: true, bold: true },
    { key: 'vs', label: 'Vs', w: 60, heat: false, mono: true },
    { key: 'gaPg', label: 'GA/GP', w: 56, primary: true, dp: 2 },
    { key: 'pk', label: 'PK%', w: 58, invert: true, fmt: (v, r) => (v == null ? '—' : `${(v * 100).toFixed(1)} ${ord(r.pkRank)}`) },
    { key: 'oppPp', label: 'Opp PP%', w: 70, fmt: (v, r) => (v == null ? '—' : `${(v * 100).toFixed(1)} ${ord(r.oppPpRank)}`) },
    { key: 'restTxt', label: 'Rest', w: 46, heat: false, mono: true },
    { key: 'fits', label: 'Who fits it', w: 170, heat: false, fmt: (v, r) => (r.called.length
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{r.called.map((p) => (p.mug ? <img key={p.playerId} src={p.mug} alt="" width={20} height={20} loading="lazy" style={{ width: 20, height: 20, borderRadius: '50%', background: C.bg3 }} /> : null))}<span>{r.called[0].name}{r.called.length > 1 ? ` +${r.called.length - 1}` : ''}</span></span>
      : <span style={{ color: C.text3 }}>—</span>) },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PageHeader eyebrow="LAMP · MATCHUPS" title="The defences to attack tonight"
        note="Every club playing tonight, ranked by goals allowed per game. Tap a row for its power play against penalty kill, the net, rest, who fits, where it allows shots and where the other club shoots from."
        theme={C} numFont={NUM_FONT} accent={C.ice} />
      <DelayedBanner error={error} what="tonight's matchups" />
      {loading && !data ? <Loading what="tonight's matchups" /> : null}
      {data && !rows.length ? <EmptyState title="NO GAMES TONIGHT" note="No NHL games on this date, so there are no defences to rank." /> : null}
      {rows.length > 0 && (
        <>
          <div style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.5 }}>
            {lastSeason ? <b style={{ color: C.amber, fontFamily: NUM_FONT, letterSpacing: '.04em' }}>LAST SEASON&apos;S NUMBERS · </b> : null}
            Softest: <b style={{ color: C.text }}>{lead.def}</b>, {lead.gaPg ?? '—'} goals allowed a game{league.gaPg != null ? ` (league ${league.gaPg})` : ''}, penalty kill {pct(lead.pk)} {ord(lead.pkRank)}{lead.called[0] ? <>; <b style={{ color: C.text }}>{lead.called[0].name}</b> leads {lead.opp}&apos;s called skaters</> : null}.
          </div>
          <LampTable rows={tableRows} columns={columns} heatMode="primary" ramp={rampAt} maxRows={PREVIEW} maxHeight={9999}
            rowEdge={(r) => (r.def === active?.def ? C.ice : null)}
            onRowClick={(r) => { setPick(r.def); if (typeof document !== 'undefined') requestAnimationFrame(() => document.getElementById('lamp-def-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }} />
          <Detail row={active} league={league} onOpenPlayer={onOpenPlayer} />
        </>
      )}
      <SourceLine>Goals allowed: the league standings (goalAgainst / gamesPlayed). PK% and PP%: api.nhle.com/stats team reports, regular season; ranks against all 32 clubs, #1 = best for the attacking club (the weakest penalty kill, the strongest power play, the most goals allowed). Rest: each club&apos;s schedule. Who fits: tonight&apos;s LAMP board, the three called per game. Goalies: club stats.</SourceLine>
    </div>
  )
}
