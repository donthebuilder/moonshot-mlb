'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import DenseTable from '../DenseTable'
import { StatusChip, Tile, panel } from './parts'

// 🔁 THE 2+ CLUB (2026-09-27, BATCH-MULTI-PLAN step 3) -- the Ledger's third
// view, same on all three products. Every 2+ HR / TD / goal game this
// season, from the league's box scores, each wearing the label we kept at
// the time (lib/multi/build.js). /api/multi does the counting.
//   header    three numbers: 2+ games, how many we had on the board, CALLED
//   season    one row per player, sorted by 2+ games then rate; tap a row for
//             his games. Rate only past a floor of games played (the API's
//             minGp), so a 2-for-2 rookie isn't #1
//   recent    newest first, with the label chip and our saved price
//   NFL QBs   passing TDs, their own table, never added into TD; no chip
//             (the model makes no passing-TD call)
// Tables lead; five rows then "show more" (DenseTable), so the phone isn't
// scrolled past the season table to reach anything.
const WORD = { HR: 'HR', TD: 'TD', G: 'G' }
const shortDay = (d) => {
  const t = new Date(`${d}T12:00:00Z`)
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
const plus = (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v))

export default function MultiClub({ sport, accent, onPlayerClick }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [scope, setScope] = useState('scorers')
  const [who, setWho] = useState(null)
  const [his, setHis] = useState(null)      // the tapped player's own 2+ games, fetched (the recent list only holds the newest)
  useEffect(() => {
    if (!who || !data) { setHis(null); return undefined }
    let alive = true
    fetch(`/api/multi?sport=${sport}&player=${encodeURIComponent(who.player_id)}&season=${data.season}`)
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setHis(j?.games || []) }).catch(() => alive && setHis([]))
    return () => { alive = false }
  }, [who, data, sport])
  useEffect(() => {
    let alive = true
    fetch(`/api/multi?sport=${sport}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (alive) setData(j) }).catch(() => alive && setError(true))
    return () => { alive = false }
  }, [sport])

  const w = WORD[data?.kind] || ''
  const players = useMemo(() => (data?.players || []).map((p) => ({
    // Called in the games we kept a record for; "--" when none were (all BEFORE OUR RECORD).
    ...p, calledIn: p.recorded ? `${p.called} of ${p.recorded}` : '\u2014', lastTxt: p.last ? shortDay(p.last) : '',
    _raw: { player_id: p.player_id, id: p.player_id, name: p.name, player_name: p.name, team: p.team },
  })), [data])
  const recent = useMemo(() => ((who ? his : data?.recent) || [])
    .map((r) => ({ ...r, date: shortDay(r.day), what: `${r.n} ${w}`, _raw: { player_id: r.player_id, id: r.player_id, name: r.name, player_name: r.name, team: r.team } })), [data, who, his, w])
  const qbs = useMemo(() => (data?.qbs || []).map((p) => ({ ...p, lastTxt: p.last ? shortDay(p.last) : '', _raw: { player_id: p.player_id, id: p.player_id, name: p.name, player_name: p.name, team: p.team } })), [data])

  if (error) return <div style={panel(accent)}><span style={{ fontSize: 12, color: C.text3 }}>The 2+ Club is delayed. Try again in a minute.</span></div>
  if (!data) return <div style={panel(accent)}><span style={{ fontSize: 12, color: C.text3 }}>Reading the season…</span></div>

  const perWord = data.per === 10 ? 'per 10 G' : 'per 100 G'
  const seasonCols = [
    { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
    { key: 'team', label: 'Team', heat: false, w: 46 },
    { key: 'multi', label: `2+ ${w}`, w: 50, dp: 0, primary: true, title: `Games with 2 or more ${w} this season` },
    { key: 'most', label: 'MOST', w: 46, dp: 0, title: 'Most in one game' },
    { key: 'gp', label: 'GP', w: 40, dp: 0, heat: false, title: 'Games played' },
    { key: 'rate', label: perWord.toUpperCase(), w: 70, dp: 1, blankWhen: (v) => v == null, title: `2+ games ${perWord}, shown once he has ${data.minGp}+ games` },
    { key: 'calledIn', label: 'CALLED IN', w: 70, heat: false, title: 'Of his 2+ games we kept a record for, how many we CALLED him' },
    { key: 'lastTxt', label: 'LAST', w: 56, heat: false },
  ]
  const recentCols = [
    { key: 'date', label: 'Date', heat: false, w: 54 },
    { key: 'name', label: 'Player', heat: false, sticky: true, bold: true, w: 140 },
    { key: 'team', label: 'Team', heat: false, w: 46 },
    { key: 'opp', label: 'Opp', heat: false, w: 46 },
    { key: 'what', label: w, heat: false, w: 50 },
    { key: 'status', label: 'Call', heat: false, w: 118, fmt: (v) => <StatusChip status={v} /> },
    { key: 'odds', label: 'PRICE', heat: false, w: 56, fmt: plus, title: 'Our saved pregame price, where we had one' },
  ]
  const qbCols = [
    { key: 'name', label: 'QB', heat: false, sticky: true, bold: true, w: 140 },
    { key: 'team', label: 'Team', heat: false, w: 46 },
    { key: 'g3', label: '3+ PASS TD', w: 70, dp: 0, primary: true },
    { key: 'g2', label: '2+', w: 40, dp: 0 },
    { key: 'g4', label: '4+', w: 40, dp: 0 },
    { key: 'most', label: 'MOST', w: 46, dp: 0 },
    { key: 'gp', label: 'GP', w: 40, dp: 0, heat: false },
    { key: 'lastTxt', label: 'LAST', w: 56, heat: false },
  ]
  const isQb = scope === 'qbs'

  return (
    <div style={panel(accent)}>
      {data.stale && (
        <div role="status" style={{ marginBottom: 10, padding: '8px 11px', borderRadius: 9, border: `1px dashed ${C.border2}`, fontSize: 11.5, color: C.text2, lineHeight: 1.5 }}>
          <b style={{ color: C.text, fontFamily: NUM_FONT, letterSpacing: '.05em' }}>LAST SEASON · {data.seasonLabel}</b>
          {' · '}The new season starts soon. Its first 2-{w === 'G' ? 'goal' : w} game shows up here.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, marginBottom: 11 }}>
        <Tile label={`2+ ${w} games`} value={data.header.games} color={accent} sub={data.seasonLabel} />
        <Tile label="On our board" value={data.header.onBoard} color={C.cyan} sub={data.header.before ? `${data.header.before} before record` : ''} />
        <Tile label="Called" value={data.header.called} color={C.green} />
      </div>

      {sport === 'nfl' && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
          {[['scorers', 'Scorers'], ['qbs', 'QBs']].map(([k, label]) => (
            <button key={k} type="button" onClick={() => setScope(k)} aria-pressed={scope === k}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${scope === k ? accent : C.border}`, background: scope === k ? `${accent}1a` : 'transparent', color: scope === k ? C.text : C.text2, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
      )}

      {isQb ? (
        qbs.length ? <DenseTable rows={qbs} columns={qbCols} heatMode="primary" initialSort="g3" maxRows={5} onRowClick={onPlayerClick}
          caption="Passing touchdowns, their own table (never added into scorers). Sorted by 3+ games." />
          : <div style={{ fontSize: 12, color: C.text3 }}>No 2+ passing-TD games yet this season.</div>
      ) : (
        <>
          {players.length ? (
            <DenseTable rows={players} columns={seasonCols} heatMode="primary" initialSort="multi" maxRows={5}
              onRowClick={(raw) => setWho(players.find((p) => p.player_id === raw.player_id) || null)}
              caption={`Every 2+ ${w} game this season, from the league's box scores. Tap a player for his games.`} />
          ) : <div style={{ fontSize: 12, color: C.text3 }}>No 2+ games yet this season.</div>}

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 6px' }}>
            <b style={{ fontSize: 12, letterSpacing: '.06em', color: C.text }}>{who ? `${who.name.toUpperCase()}'S 2+ GAMES` : 'RECENT 2+ GAMES'}</b>
            {who && (
              <>
                <button type="button" onClick={() => onPlayerClick?.(players.find((p) => p.player_id === who.player_id)?._raw)} style={{ background: 'none', border: 'none', color: accent, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', padding: 0 }}>his page ›</button>
                <button type="button" onClick={() => setWho(null)} style={{ background: 'none', border: 'none', color: C.text3, fontSize: 11.5, cursor: 'pointer', padding: 0 }}>show everyone ✕</button>
              </>
            )}
          </div>
          {who && his == null ? <div style={{ fontSize: 12, color: C.text3 }}>Reading his games…</div> : recent.length ? <DenseTable rows={recent} columns={recentCols} heatMode="none" maxRows={5} onRowClick={onPlayerClick} />
            : <div style={{ fontSize: 12, color: C.text3 }}>None in the recent list.</div>}
        </>
      )}
      <div style={{ marginTop: 9, fontSize: 10.5, color: C.text3, lineHeight: 1.5 }}>
        CALLED / ON BOARD / NOT ON BOARD are the labels we recorded at the time. BEFORE OUR RECORD means we kept no graded record that date.
      </div>
    </div>
  )
}
