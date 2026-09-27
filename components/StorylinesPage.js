'use client'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import StoryRow from './StoryRow'

// 📰 STORYLINES, BY GAME (BATCH-STORYLINES-PAGE step 2, 2026-09-27). One page,
// all three products (theme / number font / accent come in as props). Reads
// /api/stories?sport= -- the product's story engine (lib/stories/*) with each
// player's CALLED / ON THE BOARD / NOT ON THE BOARD chip already attached.
//
//   games      tonight's, in start order; games already under way or final
//              drop to the bottom (their stories stay, graded once step 3 lands)
//   each game  a header (teams, time, the CALLED players among its stories),
//              then its stories rarest first: three on show, "+N more"
//   filters    story type (multi-select chips), "Called only", "Rare only"
//              (rarity >= RARE), a team / name search
// Nothing is computed here: the rows are the engine's, in its words.

const RARE = 0.6
const STATUS = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }
const TYPE_LABEL = {
  history: 'History', matchup: 'Matchup', funfact: 'Fun fact', milestone: 'Milestone', b2b: 'Back-to-back', duel: 'Duel',
  revenge: 'Revenge', rivalry: 'Rivalry', birthday: 'Birthday', giveaway: 'Giveaway', multi: '2+ Club', streak: 'Streak',
  model: 'Model', due: 'Due', redzone: 'Red zone', hot: 'Hot stick', special: 'Special teams', rest: 'Back-to-back night',
}
const SHOW = 3
const ORDER = { pre: 0, unknown: 0, live: 1, final: 2 }

const timeOf = (iso) => {
  const ms = Date.parse(iso || '')
  if (!Number.isFinite(ms)) return ''
  return `${new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
}

// `searchBox` false + `keepIds` (a Set of player ids, or null for everyone):
// for a product whose shell already has a search / team filter (MOONSHOT), the
// page follows that filter instead of stacking a second box under it.
export default function StorylinesPage({ sport, eyebrow, theme: C, numFont, accent, onOpenPlayer = null, date = null, searchBox = true, keepIds = null }) {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [types, setTypes] = useState(() => new Set())
  const [calledOnly, setCalledOnly] = useState(false)
  const [rareOnly, setRareOnly] = useState(false)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(() => new Set())

  useEffect(() => {
    let alive = true
    setData(null); setErr(null)
    fetch(`/api/stories?sport=${encodeURIComponent(sport)}${date ? `&date=${date}` : ''}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error && !j.stories?.length) setErr(j.error); setData(j) })
      .catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [sport, date])

  const allTypes = useMemo(() => [...new Set((data?.stories || []).map((s) => s.type))], [data])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.stories || []).filter((s) => (!types.size || types.has(s.type))
      && (!calledOnly || s.board?.status === 'called')
      && (!rareOnly || s.rarity >= RARE)
      && (!needle || `${s.name || ''} ${s.team || ''} ${s.opp || ''}`.toLowerCase().includes(needle))
      && (!keepIds || (s.board && keepIds.has(String(s.player_id)))))
  }, [data, types, calledOnly, rareOnly, q, keepIds])
  const games = useMemo(() => (data?.games || []).slice().sort((a, b) => (ORDER[a.state] ?? 0) - (ORDER[b.state] ?? 0)), [data])
  const filtering = types.size || calledOnly || rareOnly || q.trim() || keepIds

  const chip = (on) => ({
    flex: '0 0 auto', minHeight: 44, padding: '0 12px', borderRadius: 22, border: `1px solid ${on ? accent : C.border}`,
    background: on ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'transparent', color: on ? C.text : C.text2,
    font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  })
  const Badge = ({ b }) => {
    if (!b) return null
    const tone = b.status === 'called' ? accent : b.status === 'board' ? C.text2 : C.text3
    return <span style={{ color: tone, fontFamily: numFont, fontSize: 10, fontWeight: 800 }}>{STATUS[b.status]}{b.status !== 'off' && Number.isFinite(Number(b.score)) ? ` ${Math.round(b.score)}` : ''}</span>
  }
  const Parts = ({ parts }) => parts.map((x, j) => (x.t === 'name'
    ? <b key={j} style={{ color: C.text }}>{x.v}</b>
    : x.t === 'num' ? <b key={j} style={{ fontFamily: numFont, color: C.orange }}>{x.v}</b> : <span key={j}>{x.v}</span>))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={eyebrow} title="Storylines" theme={C} numFont={numFont} accent={accent}
        note={<>Tonight&apos;s games, each with what the numbers are already saying about it — rarest first, every line with the player&apos;s board status beside it. Nothing here is a score.</>} />

      <div role="group" aria-label="Filter storylines" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        <button type="button" style={chip(calledOnly)} aria-pressed={calledOnly} onClick={() => setCalledOnly((v) => !v)}>Called only</button>
        <button type="button" style={chip(rareOnly)} aria-pressed={rareOnly} onClick={() => setRareOnly((v) => !v)}>Rare only</button>
        {allTypes.map((t) => (
          <button key={t} type="button" style={chip(types.has(t))} aria-pressed={types.has(t)}
            onClick={() => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })}>{TYPE_LABEL[t] || t}</button>
        ))}
      </div>
      {searchBox && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team or player" aria-label="Search storylines by team or player"
        style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, font: 'inherit', fontSize: 16 }} />}

      {err && !data?.stories?.length ? <div style={{ color: C.text3, fontSize: 12 }}>Storylines are delayed ({err}). Nothing is filled in while they are.</div> : null}
      {!data && !err ? <div style={{ color: C.text3, fontSize: 12 }}>Reading tonight&apos;s games…</div> : null}
      {data && !games.length ? <div style={{ color: C.text3, fontSize: 12 }}>No games on the schedule for this date.</div> : null}

      {games.map((g) => {
        const rows = shown.filter((s) => s.game_id === g.game_id)
        if (filtering && !rows.length) return null
        const all = open.has(g.game_id)
        const called = [...new Map(rows.filter((s) => s.board?.status === 'called').map((s) => [s.player_id, s.name])).values()]
        return (
          <section key={g.game_id} aria-label={`${g.away} at ${g.home}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ color: C.text, fontSize: 14, fontFamily: numFont }}>{g.away} @ {g.home}</b>
              <span style={{ color: g.state === 'live' ? accent : C.text3, fontSize: 11, fontFamily: numFont }}>{g.state === 'live' ? 'LIVE' : g.state === 'final' ? 'FINAL' : timeOf(g.start)}</span>
              <span style={{ marginLeft: 'auto', color: C.text3, fontSize: 11 }}>{rows.length} {rows.length === 1 ? 'story' : 'stories'}</span>
            </div>
            {called.length ? <div style={{ marginTop: 3, fontSize: 11, color: C.text2 }}><span style={{ color: accent, fontWeight: 800, fontFamily: numFont, fontSize: 10 }}>CALLED</span> {called.join(' · ')}</div> : null}
            {!rows.length ? <div style={{ marginTop: 6, fontSize: 12, color: C.text3 }}>No storylines for this one.</div> : null}
            <div style={{ marginTop: 4 }}>
              {(all ? rows : rows.slice(0, SHOW)).map((s) => (
                <StoryRow key={`${s.type}|${s.player_id}|${s.text}`} icon={s.icon} theme={C} title={`Source: ${s.source}`}
                  onClick={onOpenPlayer && s.board ? () => onOpenPlayer(s.player_id, s) : null}
                  tag={<Badge b={s.board} />} style={{ fontSize: 12 }}>
                  <Parts parts={s.parts} />
                </StoryRow>
              ))}
            </div>
            {rows.length > SHOW ? (
              <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.game_id)) n.delete(g.game_id); else n.add(g.game_id); return n })}
                style={{ minHeight: 44, padding: 0, border: 'none', background: 'transparent', color: C.text2, font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {all ? 'Show fewer' : `+${rows.length - SHOW} more`}
              </button>
            ) : null}
          </section>
        )
      })}
      <div style={{ fontSize: 11, color: C.text3 }}>Graded after the games: each story is frozen at first pitch / kickoff / puck drop and checked against what happened — the record starts the day it ships.</div>
    </div>
  )
}
