'use client'
import { useTeamNav } from '../lib/teamNav'
import DenseTable from './DenseTable'
import Tap from './Tap'
import { useEffect, useMemo, useState } from 'react'
import PageHeader from './PageHeader'
import StoryRow, { StoryParts, BoardBadge } from './StoryRow'
import { localDayTime } from '../lib/localTime'

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
const TYPE_LABEL = {
  history: 'History', matchup: 'Matchup', funfact: 'Fun fact', milestone: 'Milestone', b2b: 'Back-to-back', duel: 'Duel',
  revenge: 'Revenge', rivalry: 'Rivalry', birthday: 'Birthday', giveaway: 'Giveaway', multi: '2+ Club', streak: 'Streak',
  model: 'Model', due: 'Due', redzone: 'Red zone', hot: 'Hot stick', special: 'Special teams', rest: 'Back-to-back night',
  list_td: 'TD every game', list_100: '100-yard run', goal_streak: 'Goal streak', point_streak: 'Point streak', iron_man: 'Iron man',
}
const SHOW = 3
// The bar a frozen story was graded on, in words (lib/stories/grade.js).
const BAR_WORD = { hr: 'homered', hit: '1+ hit', td: 'scored a TD', goal: 'scored', productive: 'productive' }
const barWord = (bar) => BAR_WORD[bar] || (String(bar).startsWith('milestone:') ? 'reached it' : String(bar).startsWith('streak:') ? 'streak extended' : String(bar || ''))
const MIN_PCT = 30   // no percentage until a type has this many graded stories
const ORDER = { pre: 0, unknown: 0, live: 1, final: 2 }

const timeOf = (iso) => {
  const ms = Date.parse(iso || '')
  if (!Number.isFinite(ms)) return ''
  return localDayTime(ms)
}

// `searchBox` false + `keepIds` (a Set of player ids, or null for everyone):
// for a product whose shell already has a search / team filter (MOONSHOT), the
// page follows that filter instead of stacking a second box under it.
export default function StorylinesPage({ sport, eyebrow, theme: C, numFont, accent, onOpenPlayer = null, onOpenGame = null, date = null, searchBox = true, keepIds = null }) {
  // a team story opens the club (0g A7) where the product has a team door
  const teamNav = useTeamNav()
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
  const Badge = ({ b }) => <BoardBadge b={b} theme={C} numFont={numFont} accent={accent} />
  const Parts = ({ parts }) => <StoryParts parts={parts} theme={C} numFont={numFont} />

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
              <Tap onClick={onOpenGame && (() => onOpenGame(g.game_id, g))}><b style={{ color: C.text, fontSize: 14, fontFamily: numFont }}>{g.away} @ {g.home}</b></Tap>
              <span style={{ color: g.state === 'live' ? accent : C.text3, fontSize: 11, fontFamily: numFont }}>{g.state === 'live' ? 'LIVE' : g.state === 'final' ? 'FINAL' : timeOf(g.start)}</span>
              <span style={{ marginLeft: 'auto', color: C.text3, fontSize: 11 }}>{rows.length} {rows.length === 1 ? 'story' : 'stories'}</span>
            </div>
            {called.length ? <div style={{ marginTop: 3, fontSize: 11, color: C.text2 }}><span style={{ color: accent, fontWeight: 800, fontFamily: numFont, fontSize: 10 }}>CALLED</span> {called.join(' · ')}</div> : null}
            {/* A started game shows only what was frozen before it (the record began 09-27). */}
            {!rows.length ? <div style={{ marginTop: 6, fontSize: 12, color: C.text3 }}>{g.state !== 'pre' && !g.frozenCount ? 'Nothing was frozen before this one started, so nothing is shown -- a story written after the first pitch / kickoff / puck drop would be hindsight.' : 'No storylines for this one.'}</div> : null}
            <div style={{ marginTop: 4 }}>
              {(all ? rows : rows.slice(0, SHOW)).map((s) => (
                <StoryRow key={`${s.type}|${s.player_id}|${s.text}`} icon={s.icon} theme={C} title={`Source: ${s.source}`}
                  onClick={onOpenPlayer && s.board ? () => onOpenPlayer(s.player_id, s)
                    : teamNav && String(s.player_id).startsWith('team:') ? () => teamNav(String(s.player_id).slice(5)) : null}
                  tag={<Badge b={s.board} />} style={{ fontSize: 12 }}>
                  <Parts parts={s.parts} />
                  {s.outcome ? (
                    <span style={{ display: 'block', fontSize: 11, fontFamily: numFont, fontWeight: 800, color: s.outcome.base === 'hit' ? accent : C.text3 }}>
                      {s.outcome.base === 'hit' ? '✓ came true' : s.outcome.base === 'miss' ? '✗ did not' : '– no line (did not play)'} · {barWord(s.outcome.bar)}{s.outcome.strong === 'hit' ? ' · strong ✓' : ''}
                    </span>
                  ) : s.frozen && g.state === 'final' ? <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>grading…</span> : null}
                </StoryRow>
              ))}
            </div>
            {rows.length > SHOW ? (
              <button type="button" onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(g.game_id)) n.delete(g.game_id); else n.add(g.game_id); return n })}
                style={{ minHeight: 44, padding: 0, border: 'none', background: 'transparent', color: C.text2, font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                {all ? 'Show less' : `Show ${rows.length - SHOW} more`}
              </button>
            ) : null}
          </section>
        )
      })}
      <section aria-label="How stories did" style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont }}>HOW STORIES DID</div>
        <div style={{ fontSize: 12, color: C.text3, margin: '4px 0 6px' }}>Every story is frozen at the start of its game and checked after it against the player&apos;s own line. A story with no outcome of its own is graded on a productive night; &ldquo;everyone&rdquo; is the same bar for every player who played those nights. The record started {data?.summary?.length ? data.summary.reduce((a, r) => (r.since < a ? r.since : a), data.summary[0].since) : 'the day this shipped'}{data?.summary?.length ? '' : ' — no game has been graded yet'}.</div>
        {data?.summary?.length ? (
          <div style={{ overflowX: 'auto' }}>
            {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b). A rate under
                MIN_PCT graded prints as "h of n", as before; sorts by the rate. */}
            <DenseTable bare noGroups tight heatMode="sorted" maxHeight={9999} maxRows={40} accent={accent}
              caption="Each kind of story: how often it came true, against everyone"
              rows={data.summary.map((r) => ({ ...r, _key: r.type, rate: r.n ? r.hit / r.n : null, baseRate: r.base?.players ? r.base.hits / r.base.players : null }))}
              columns={[
                { key: 'type', label: 'Story', heat: false, sticky: true, w: 180, fmt: (v, r) => <span>{TYPE_LABEL[v] || v}{r.bar ? <span style={{ color: C.text3 }}> · {barWord(r.bar)}</span> : null}</span> },
                { key: 'n', label: 'Graded', w: 56, dp: 0 },
                { key: 'rate', label: 'Came true', w: 76, fmt: (_, r) => (r.n >= MIN_PCT ? `${Math.round((100 * r.hit) / r.n)}%` : `${r.hit} of ${r.n}`), tone: () => ({ color: C.text }) },
                { key: 'baseRate', label: 'Everyone', w: 76, fmt: (_, r) => (r.base ? (r.base.players >= MIN_PCT ? `${Math.round((100 * r.base.hits) / r.base.players)}%` : `${r.base.hits} of ${r.base.players}`) : '—'), tone: () => ({ color: C.text3 }) },
              ]} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
