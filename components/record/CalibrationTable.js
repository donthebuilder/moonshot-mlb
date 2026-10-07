'use client'
// THE CALLS, GRADED BY TIER (2026-10-06). For each tier the bot publishes --
// the five CALLED roles and the three model tiers -- how many calls were
// made, how many cleared their own bar, the rate, and when they were locked,
// so a visitor can check the record against the public files.
// Built on the record's own parts (the same shape as CallHistory beside it):
// DenseTable skin v2 with grouped columns, CallStatusBadge for the CALLED
// word (lib/callStatus STATUS_WORD), the lift tint ScoreBands already uses.
// The numbers come from /api/mlb/calibration (lib/calibration, built only
// from the locked pregame record). Rules, printed under the table:
//   - a tier under MIN N calls prints its n and its counts and NO rate
//   - void / not final / postponed are set aside, never counted as misses
//   - a row stamped at or after first pitch is not a call and is set aside
//   - regular season and postseason are separate tables
import { useMemo, useState } from 'react'
import DenseTable from '../DenseTable'
import CallStatusBadge from '../CallStatusBadge'
import { bandTint } from '../ScoreBands'
import { useSportTheme } from '../SportTheme'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { TYPE } from '../../lib/theme'
import { playerHref, gameHref } from '../../lib/routes'
import { localTime } from '../../lib/localTime'

const DATA_FOLDER = 'https://github.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/tree/data/public/data/current'
const SEASONS = [{ key: 'regular', label: 'Regular season' }, { key: 'post', label: 'Postseason' }]
const PREVIEW = 10

const nf = (n) => Number(n).toLocaleString('en-US')
const mins = (m) => (m == null ? '—' : m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`)
const etTime = (ms) => (ms == null ? '—' : localTime(ms, { zone: false }))
const short = (d) => String(d || '').slice(5).replace('-', '/')
const lineText = (l) => `${l.hits} H · ${l.runs} R · ${l.rbi} RBI · ${l.tb} TB${l.hr ? ` · ${l.hr} HR` : ''}`

function Calls({ tier, season, callsUrl, Table, C, NUM_FONT, accent }) {
  const { data, error } = useLiveFetch(`${callsUrl}?tier=${tier.key}&season=${season}`)
  const rows = useMemo(() => (data?.calls || []).map((c, i) => ({ ...c, _key: `${c.date}-${c.pk}-${c.pid}-${i}`, result: c.hit ? 'CLEARED' : 'MISSED' })), [data])
  if (error && !data) return <p style={{ fontSize: TYPE.body, color: C.text3 }}>The calls are delayed — try again in a minute.</p>
  if (!data) return <p style={{ fontSize: TYPE.body, color: C.text3 }}>Loading the {tier.label} calls…</p>
  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
        <b style={{ color: C.text }}>Every {tier.label} call</b> ({nf(rows.length)}), newest first. Bar: {tier.bar}. Misses are listed with the hits.
      </p>
      <Table rows={rows} maxRows={PREVIEW} maxHeight={9999} heatMode="none" initialSort={null} bare dict={{}}
        caption={`Every graded ${tier.label} call, with the line it was graded on and when it was locked`}
        columns={[
          { key: 'date', label: 'Game', group: 'Call', heat: false, w: 62, mono: true, fmt: (v, r) => <a href={`/app${gameHref('mlb', r.pk)}`} style={{ color: 'inherit' }}>{short(v)}</a> },
          { key: 'name', label: 'Hitter', group: 'Call', heat: false, sticky: true, bold: true, w: 150, fmt: (v, r) => <a href={playerHref('mlb', r.pid)} style={{ color: 'inherit' }}>{v}</a> },
          { key: 'team', label: 'Team', group: 'Call', heat: false, w: 48, teamMark: 'mlb' },
          { key: 'opp', label: 'Opp', group: 'Call', heat: false, w: 44, fmt: (v) => <span style={{ color: C.text3 }}>{v || '—'}</span> },
          { key: 'result', label: 'Result', group: 'Result', heat: false, w: 78, fmt: (v) => <b style={{ color: v === 'CLEARED' ? accent : C.text3, fontFamily: NUM_FONT }}>{v}</b> },
          { key: 'line', label: 'Line', group: 'Result', heat: false, numeric: false, w: 190, fmt: (v) => lineText(v) },
          { key: 'lockAt', label: 'Locked', group: 'Lock', heat: false, w: 84, mono: true, fmt: (v) => etTime(v) },
          { key: 'firstPitch', label: 'First pitch', group: 'Lock', heat: false, w: 84, mono: true, fmt: (v) => etTime(v) },
          { key: 'leadMin', label: 'Before', group: 'Lock', heat: false, w: 74, mono: true, fmt: (v) => mins(v) },
        ]} />
    </div>
  )
}

export default function CalibrationTable({ sport = 'mlb', Table = DenseTable, title = 'The calls, graded by tier' }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const { data, error } = useLiveFetch(`/api/calibration?sport=${sport}`)
  const [season, setSeason] = useState('regular')
  const [open, setOpen] = useState(null)
  const block = data?.[season]
  const rows = useMemo(() => (block?.tiers || []).map((t) => ({
    ...t, _key: t.key,
    rateText: t.enough ? `${t.rate.toFixed(1)}%` : 'not enough calls yet',
    liftText: t.lift == null ? '—' : `${t.lift > 0 ? '+' : ''}${t.lift.toFixed(1)} pts`,
    proofText: t.proof.state === 'proven' ? 'PROVEN' : t.proof.state === 'testing' ? 'TESTING' : '—',
    boardText: t.board.n ? `${t.board.rate.toFixed(1)}%` : '—',
    leadMed: t.lead ? t.lead.median : null, leadMin: t.lead ? t.lead.min : null,
  })), [block])

  if (error && !data) return <p style={{ fontSize: TYPE.body, color: C.text3 }}>The tier table is delayed — try again in a minute.</p>
  if (!data) return null
  const tierOpen = open && block?.tiers.find((t) => t.key === open)
  const hasLead = Boolean(block?.tiers.some((t) => t.lead))
  const total = block ? block.tiers.filter((t) => t.kind !== 'model').reduce((a, t) => a + t.n, 0) : 0
  const chip = (on) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', font: `800 ${TYPE.body}px/1 ${NUM_FONT}`, letterSpacing: '.04em',
    border: `1px solid ${on ? accent : C.border2}`, background: on ? `${accent}22` : 'transparent', color: on ? accent : C.text2,
  })

  return (
    <section aria-label={title} style={{ marginTop: 18 }}>
      <div style={{ color: accent, font: `900 ${TYPE.label}px/1 ${NUM_FONT}`, letterSpacing: '.14em', margin: '4px 0 6px' }}>{title.toUpperCase()}</div>
      <div role="group" aria-label="Season" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 8px' }}>
        {SEASONS.map((s) => (
          <button key={s.key} type="button" aria-pressed={season === s.key} onClick={() => { setSeason(s.key); setOpen(null) }} style={chip(season === s.key)}>{s.label}</button>
        ))}
      </div>
      {block?.nights ? (
        <p style={{ margin: '0 0 8px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
          <b style={{ color: C.text }}>{nf(total)} calls</b> over {block.nights} {block.unit || 'night'}{block.nights === 1 ? '' : 's'}{block.from ? ` (${short(block.from)}–${short(block.to)})` : block.weeks ? ` (weeks ${block.weeks[0]}–${block.weeks.at(-1)})` : ''}, each tier on its own bar{hasLead ? ', each one stamped before first pitch' : ''}.
          A rate waits for {data.minN} calls; until then the row shows its count and nothing else.
        </p>
      ) : (
        <p style={{ margin: '0 0 8px', fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>No locked, graded calls in the {SEASONS.find((s) => s.key === season).label.toLowerCase()} yet.</p>
      )}
      {block?.nights ? (
        <Table rows={rows} maxRows={12} maxHeight={9999} heatMode="none" initialSort={null} bare dict={{}}
          dimRow={(r) => !r.enough}
          caption="One row per tier. Cleared = reached the tier's own bar. Board = every hitter on the locked board on that same bar. Under the minimum, no rate is shown."
          columns={[
            { key: 'label', label: 'Tier', group: 'Tier', heat: false, sticky: true, w: 172, fmt: (v, r) => (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <b>{r.kind === 'status' ? '' : v}</b>{r.kind === 'call' || r.kind === 'status' ? <CallStatusBadge status={r.status || 'called'} size={8} /> : <span style={{ color: C.text3, fontSize: TYPE.label }}>model</span>}
              </span>) },
            { key: 'bar', label: 'Bar', group: 'Tier', heat: false, numeric: false, w: 96 },
            { key: 'n', label: 'Calls', group: 'Result', heat: false, w: 54, dp: 0, fmt: (v) => nf(v) },
            { key: 'hits', label: 'Cleared', group: 'Result', heat: false, w: 62, dp: 0, fmt: (v) => nf(v) },
            { key: 'misses', label: 'Missed', group: 'Result', heat: false, w: 58, dp: 0, fmt: (v) => nf(v) },
            { key: 'rateText', label: 'Rate', group: 'Result', heat: false, numeric: false, w: 132, fmt: (v, r) => <b style={{ color: r.enough ? C.text : C.text3, fontWeight: r.enough ? 900 : 600 }}>{v}</b> },
            { key: 'proofText', label: 'Proof', group: 'Result', heat: false, numeric: false, w: 78, fmt: (v) => <span style={{ fontFamily: NUM_FONT, fontWeight: 900, fontSize: TYPE.label, letterSpacing: '.06em', color: v === 'PROVEN' ? accent : C.text3 }}>{v}</span> },
            { key: 'boardText', label: 'Board', group: 'Versus', heat: false, numeric: false, w: 62 },
            { key: 'liftText', label: 'Lift', group: 'Versus', heat: false, numeric: false, w: 78, fmt: (v, r) => {
              const { bg, fg } = bandTint(r.lift, r.enough)
              return <span style={{ background: bg, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', color: fg }}>{v}</span>
            } },
            ...(hasLead ? [
              { key: 'leadMed', label: 'Locked', group: 'Lock', heat: false, w: 88, mono: true, fmt: (v) => (v == null ? '—' : `${mins(v)} before`) },
              { key: 'leadMin', label: 'Latest', group: 'Lock', heat: false, w: 76, mono: true, fmt: (v) => (v == null ? '—' : mins(v)) },
            ] : []),
          ]} />
      ) : null}
      {block?.nights && data.callsUrl ? (
        <>
          <p style={{ margin: '10px 0 6px', fontSize: TYPE.body, color: C.text2 }}>Check the calls, one tier at a time:</p>
          <div role="group" aria-label="Tier calls" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {block.tiers.map((t) => (
              <button key={t.key} type="button" aria-pressed={open === t.key} onClick={() => setOpen(open === t.key ? null : t.key)} style={chip(open === t.key)}>{t.label} · {nf(t.n)}</button>
            ))}
          </div>
          {tierOpen ? <div style={{ marginTop: 10 }}><Calls tier={tierOpen} season={season} callsUrl={data.callsUrl} Table={Table} C={C} NUM_FONT={NUM_FONT} accent={accent} /></div> : null}
        </>
      ) : null}
      <p style={{ margin: '10px 0 0', fontSize: TYPE.body, color: C.text3, lineHeight: 1.6 }}>
        {'PROVEN = 30+ calls and still beating the board on games played after the tier was chosen; TESTING = anything else (no tier has a chosen date yet, so none is proven). Board = every hitter on the locked board on the same bar; Lift = the tier minus the board; Locked = how long before first pitch the row was stamped (median), Latest = the closest any call came.'}{' '}
        Set aside, never counted as misses: {block ? nf(block.void) : 0} did not play{hasLead ? ' (or the game was postponed)' : ''}{block?.pending ? `, ${nf(block.pending)} not final yet` : ''}
        {hasLead ? `, ${block ? nf(block.late) : 0} rows stamped at or after first pitch${block?.lateNights?.length ? ` (every row on ${block.lateNights.map(short).join(', ')} was stamped after first pitch, so those nights are not in this table)` : ''}` : ''}.
        {data.noRecordNights?.length ? ` No locked board was published for ${data.noRecordNights.map(short).join(', ')}.` : ''}
        {hasLead ? (<>
          {' '}A call&apos;s lock is our own stamp on the board row, compared here with the game&apos;s scheduled first pitch; the rows are the public
          {' '}<a href={DATA_FOLDER} style={{ color: 'inherit' }}>public record files</a>. The stamp is ours: nothing outside our own system timestamps it yet.
          {' '}Rows read from {short(data.since)}; the regular season and the postseason are counted apart.</>)
          : ' Each row was locked before the game by the record\'s own rule; no start time is stored beside it, so no lock lead is shown. Preseason is not counted; the regular season and the playoffs are counted apart.'}
      </p>
    </section>
  )
}
