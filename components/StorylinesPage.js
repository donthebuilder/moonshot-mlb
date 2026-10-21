'use client'
import { useTeamNav } from '../lib/teamNav'
import DenseTable from './DenseTable'
import Tap from './Tap'
import { MatchLogos } from './TeamMark'
import { useEffect, useMemo, useRef, useState } from 'react'
import useHashFilters from '../lib/useHashFilters'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import PageHeader from './PageHeader'
import HelpTip from './HelpTip'
import StoryRow, { StoryParts, BoardBadge } from './StoryRow'
import MilestoneRate from './MilestoneRate'
import { localDayTime } from '../lib/localTime'
import Fold from './Fold'
import { ShowMoreButton } from './ListPreview'
import { useStoryLock, useLockOf, HiddenCalledLine } from './MemberGate'

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
  model: 'Model', due: 'Chances vs TD', redzone: 'Red zone', hot: 'Hot stick', special: 'Special teams', rest: 'Back-to-back night',
  list_td: 'TD every game', list_100: '100-yard run', run: '25+ run', defense: 'Soft defense', goal_streak: 'Goal streak', point_streak: 'Point streak', iron_man: 'Iron man',
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

// `previewGames` (Wave 2, 2026-10-11; TUDDY and LAMP pass it, MOONSHOT does not, so its page is unchanged): a slate of
// thirteen games was 3,589px of phone before the first table row. With it, the list shows the first N games that
// HAVE stories (start order kept; games with none follow them) and "Show N more games" opens the rest; "How stories did"
// is a fold. Filters, search and every deep link behave the same -- a filter that matches fewer games just shows them.
// `searchBox` false + `keepIds` (a Set of player ids, or null for everyone):
// for a product whose shell already has a search / team filter (MOONSHOT), the
// page follows that filter instead of stacking a second box under it.
export default function StorylinesPage({ sport, eyebrow, theme: C, numFont, accent, onOpenPlayer = null, onOpenGame = null, date = null, searchBox = true, keepIds = null, previewGames = null }) {
  // a team story opens the club (0g A7) where the product has a team door
  const teamNav = useTeamNav()
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  // THE FILTERS RIDE THE ADDRESS (2026-10-20, Donovan: milestones researchable like headlines): st.type= (comma list) and
  // st.q= (lib/useHashFilters), so the Ledger's and Numerology's MILESTONES block can link straight to the Milestone view
  // (components/MilestonesBlock.js) and a shared link reopens the same filtered page.
  const [hf, setHf] = useHashFilters('st', { type: '', q: '' })
  const types = useMemo(() => new Set(String(hf.type || '').split(',').filter(Boolean)), [hf.type])
  const setTypes = (fn) => setHf('type', [...fn(types)].join(','))
  const [calledOnly, setCalledOnly] = useState(false)
  const [rareOnly, setRareOnly] = useState(false)
  const q = hf.q || ''
  const setQ = (v) => setHf('q', v)
  const [open, setOpen] = useState(() => new Set())
  const [openStory, setOpenStory] = useState(null)   // a milestone row opened to its hit rate
  // arriving on a filter (a MILESTONES link): slide the chip row so the first chip that's on is in view, once
  const chipRow = useRef(null); const slid = useRef(false)
  useEffect(() => {
    if (slid.current || !data || !chipRow.current) return
    slid.current = true
    const on = chipRow.current.querySelector('[aria-pressed="true"]')
    if (on) chipRow.current.scrollLeft = Math.max(0, on.offsetLeft - chipRow.current.offsetLeft - 8)
  }, [data])
  const [allGames, setAllGames] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null); setErr(null)
    fetch(`/api/stories?sport=${encodeURIComponent(sport)}${date ? `&date=${date}` : ''}`)
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error && !j.stories?.length) setErr(j.error); setData(j) })
      .catch((e) => alive && setErr(e.message))
    return () => { alive = false }
  }, [sport, date])

  // MEMBERS LOCK (components/MemberGate.js): the CALLED word on tonight's not-started games; a locked man keeps his story, loses the word
  const lockOf = useStoryLock({ sport, stories: data?.stories, games: data?.games, date })
  const lockedNow = useLockOf()
  const allTypes = useMemo(() => [...new Set([...(data?.stories || []).map((s) => s.type), ...types])], [data, types])   // a type on from a link keeps its chip, so it can be turned off
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.stories || []).filter((s) => (!types.size || types.has(s.type))
      && (!calledOnly || s.board?.status === 'called')
      && (!rareOnly || s.rarity >= RARE)
      && (!needle || `${s.name || ''} ${s.team || ''} ${s.opp || ''}`.toLowerCase().includes(needle))
      && (!keepIds || (s.board && keepIds.has(String(s.player_id)))))
  }, [data, types, calledOnly, rareOnly, q, keepIds])
  const games = useMemo(() => (data?.games || []).slice().sort((a, b) => (ORDER[a.state] ?? 0) - (ORDER[b.state] ?? 0)), [data])
  // previewGames: games with a story to show first (a stable sort keeps the start order inside each half)
  const ordered = useMemo(() => {
    if (!previewGames) return games
    const has = (g) => shown.some((s) => s.game_id === g.game_id)
    return games.slice().sort((a, b) => Number(has(b)) - Number(has(a)))
  }, [games, shown, previewGames])
  const filtering = types.size || calledOnly || rareOnly || q.trim() || keepIds

  // the small flat chip (lib/chips.js, 2026-10-20), a 44px hit area on touch
  const chip = (on) => flatChip(on, accent, C, numFont)
  const Badge = ({ b, s }) => <BoardBadge b={b} theme={C} numFont={numFont} accent={accent} lockIn={s ? lockOf(s) : null} />
  const Parts = ({ parts }) => <StoryParts parts={parts} theme={C} numFont={numFont} />

  const howStoriesDid = (

      <section aria-label="How stories did" style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', color: accent, fontFamily: numFont }}>HOW STORIES DID</div>
        <div style={{ fontSize: 12, color: C.text3, margin: '4px 0 6px' }}>Record since {data?.summary?.length ? data.summary.reduce((a, r) => (r.since < a ? r.since : a), data.summary[0].since) : 'the first game'}{data?.summary?.length ? '' : ': no game has been graded yet'}.<HelpTip label="How stories are graded" color={C.text3} text="Every story is frozen at the start of its game and checked after it against the player's own line. A story with no outcome of its own is graded on a productive night; 'everyone' is the same bar for every player who played those nights." /></div>
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
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <PageHeader eyebrow={eyebrow} title="Storylines" theme={C} numFont={numFont} accent={accent}
        note={<>What the numbers say about each game, rarest first.<HelpTip label="Storylines" color={C.text3} text="Every line has the player's board status beside it. Nothing here is a score." /></>} />

      <div ref={chipRow} role="group" aria-label="Filter storylines" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '11px 0', margin: '-11px 0', scrollbarWidth: 'none' }}>
        <button type="button" className={FLAT_CHIP_CLASS} style={chip(calledOnly)} aria-pressed={calledOnly} onClick={() => setCalledOnly((v) => !v)}>Called only</button>
        <button type="button" className={FLAT_CHIP_CLASS} style={chip(rareOnly)} aria-pressed={rareOnly} onClick={() => setRareOnly((v) => !v)}>Rare only</button>
        {allTypes.map((t) => (
          <button key={t} type="button" className={FLAT_CHIP_CLASS} style={chip(types.has(t))} aria-pressed={types.has(t)}
            onClick={() => setTypes((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n })}>{TYPE_LABEL[t] || t}</button>
        ))}
      </div>
      {searchBox && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team or player" aria-label="Search storylines by team or player"
        style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg2, color: C.text, font: 'inherit', fontSize: 16 }} />}

      {err && !data?.stories?.length ? <div style={{ color: C.text3, fontSize: 12 }}>Storylines are delayed ({err}). Nothing is filled in while they are.</div> : null}
      {!data && !err ? <div style={{ color: C.text3, fontSize: 12 }}>Reading tonight&apos;s games…</div> : null}
      {data && !games.length ? <div style={{ color: C.text3, fontSize: 12 }}>No games on the schedule for this date.</div> : null}
      {data && games.length > 0 && filtering && !shown.length ? <div style={{ color: C.text3, fontSize: 12 }}>No {types.size ? [...types].map((t) => (TYPE_LABEL[t] || t).toLowerCase()).join(' or ') : ''} stories match on this slate. Turn a filter off to see the rest.</div> : null}

      {(previewGames && !allGames ? ordered.filter((g) => !(filtering && !shown.some((s) => s.game_id === g.game_id))).slice(0, previewGames) : ordered).map((g) => {
        const rows = shown.filter((s) => s.game_id === g.game_id)
        if (filtering && !rows.length) return null
        const all = open.has(g.game_id)
        const calledRows = rows.filter((s) => s.board?.status === 'called')
        const called = [...new Map(calledRows.filter((s) => !lockedNow({ status: 'called', ...lockOf(s) }).locked).map((s) => [s.player_id, s.name])).values()]
        return (
          <section key={g.game_id} aria-label={`${g.away} at ${g.home}`} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.bg2, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <Tap onClick={onOpenGame && (() => onOpenGame(g.game_id, g))}><b style={{ color: C.text, fontSize: 14, fontFamily: numFont }}>{g.away && g.home ? <MatchLogos sport={sport} away={g.away} home={g.home} px={20} gap={6} /> : `${g.away} @ ${g.home}`}</b></Tap>
              <span style={{ color: g.state === 'live' ? accent : C.text3, fontSize: 11, fontFamily: numFont }}>{g.state === 'live' ? 'LIVE' : g.state === 'final' ? 'FINAL' : timeOf(g.start)}</span>
              <span style={{ marginLeft: 'auto', color: C.text3, fontSize: 11 }}>{rows.length} {rows.length === 1 ? 'story' : 'stories'}</span>
            </div>
            {called.length ? <div style={{ marginTop: 3, fontSize: 11, color: C.text2 }}><span style={{ color: accent, fontWeight: 800, fontFamily: numFont, fontSize: 10 }}>CALLED</span> {called.join(' · ')}</div> : null}
            {/* A started game shows only what was frozen before it (the record began 09-27). */}
            {!rows.length ? <div style={{ marginTop: 6, fontSize: 12, color: C.text3 }}>{g.state !== 'pre' && !g.frozenCount ? 'Nothing was frozen before this one started, so nothing is shown — a story written after the first pitch / kickoff / puck drop would be hindsight.' : 'No storylines for this one.'}</div> : null}
            <div style={{ marginTop: 4 }}>
              {(all ? rows : rows.slice(0, SHOW)).map((s) => {
                const sk = `${s.type}|${s.player_id}|${s.text}`
                // a milestone row opens to his hit rate for that stat (components/MilestoneRate.js); his card is inside it
                const mile = s.type === 'milestone' && s.player_id && s.player_id !== '_game'
                return (<div key={sk}>
                <StoryRow icon={s.icon} theme={C} title={`Source: ${s.source}`} expanded={mile ? openStory === sk : undefined}
                  onClick={mile ? () => setOpenStory((o) => (o === sk ? null : sk))
                    : onOpenPlayer && s.board ? () => onOpenPlayer(s.player_id, s)
                    : teamNav && String(s.player_id).startsWith('team:') ? () => teamNav(String(s.player_id).slice(5)) : null}
                  tag={<Badge b={s.board} s={s} />} style={{ fontSize: 12 }}>
                  <Parts parts={s.parts} />
                  {s.outcome ? (
                    <span style={{ display: 'block', fontSize: 11, fontFamily: numFont, fontWeight: 800, color: s.outcome.base === 'hit' ? accent : C.text3 }}>
                      {s.outcome.base === 'hit' ? '✓ came true' : s.outcome.base === 'miss' ? '✗ did not' : '– no line (did not play)'} · {barWord(s.outcome.bar)}{s.outcome.strong === 'hit' ? ' · strong ✓' : ''}
                    </span>
                  ) : s.frozen && g.state === 'final' ? <span style={{ display: 'block', fontSize: 11, color: C.text3 }}>grading…</span> : null}
                </StoryRow>
                {mile && openStory === sk ? <MilestoneRate sport={sport} story={s} theme={C} numFont={numFont} accent={accent} onOpenPlayer={onOpenPlayer && s.board ? onOpenPlayer : null} /> : null}
                </div>)
              })}
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
      <HiddenCalledLine n={lockOf.hidden} C={C} NUM_FONT={numFont} />
      {previewGames ? (() => {
        const visible = ordered.filter((g) => !(filtering && !shown.some((s) => s.game_id === g.game_id)))
        return visible.length > previewGames
          ? <ShowMoreButton open={allGames} restN={visible.length - previewGames} toggle={() => setAllGames((v) => !v)} itemWord="games" />
          : null
      })() : null}
      {previewGames ? (
        <Fold id={`storylines-record-${sport}`} title="How stories did" meta="every kind of story, graded against everyone">{howStoriesDid}</Fold>
      ) : howStoriesDid}
    </div>
  )
}
