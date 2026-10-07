'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import HelpTip from '../HelpTip'
import DenseTable from '../DenseTable'
import MlbTeamMark from '../MlbTeamMark'
import SharedLeaderTile from '../LeaderTile'
import { LeadersFilterBar, LeadersLead, LeagueTopCard, LeadersSection } from '../leaders/LeadersParts'
import {
  leagueLeaders, LEADER_CATS,
  gradedHistory, HIST_FIRST, HIST_MAX, HIST_MIN_PICKS, HIST_MIN_NIGHTS,
} from '../../lib/leaders'
import { tone, alpha } from '../../lib/scales'
import { hr9Color } from '../../lib/hr9'
import { useTeamNav } from '../../lib/teamNav'
import { isKnownTeam } from '../../lib/mlbTeams'

// League Leaders — SEASON STATS ONLY.
//
// This page used to rank hitters by the bot's model scores: HR score, HRR
// score, hit score, pitch-mix, damage conversion, IHR, barrel rate. Those all
// belong to the model, and every other board on this site already shows them —
// which made Leaders a fifth copy of the same ranking rather than a page of its
// own.
//
// It's a batter summary now: the actual season line. Average, on-base,
// slugging, OPS, ISO, home runs, RBI, runs, strikeout and walk rates, BABIP and
// the platoon splits. Nothing here is modelled, weighted, projected or scored.
// If a number on this page disagrees with a baseball card, the payload is
// wrong — there's no interpretation layer left to blame.
//
// TOTAL BASES IS THE ONE DERIVED COLUMN AND IT SAYS SO.
// The slate carries no season hits, at-bats, doubles or triples — only last
// 5/7/10 windows — so TB can't be read off the payload. It's computed as:
//
//     AB ≈ PA × (1 − BB%)        TB = SLG × AB
//
// which ignores hit-by-pitch and sacrifices and therefore runs a few bases
// light. Good enough to rank by, wrong enough that the column is labelled
// "TB est" and the caption explains it rather than letting it pass as a
// counting stat.

// 🗓️ AND ONE SECTION THAT ISN'T TONIGHT (2026-08-16, Donovan: "i think i
// still dont see the historical things on leaders").
//
// He'd asked once before and got a structural answer — "there's no separate
// historical page, Leaders has its own lenses" — which was true and was not
// what he asked. Every board above, season stats included, is a ranking of the
// men playing TONIGHT; there was no way to ask "who has actually been going
// deep lately" on this page. The historical strip at the top of the page reads
// the bot's own graded archive back a week at a time (lib/leaders.js does the
// fetching, the deduping and the grading) and ranks it.
//
// It is opt-in on a click and nothing above it changed. A graded night is
// close to a megabyte, so loading a week of them on every visit to this tab
// would be the single most expensive thing the site does — and the answer it
// gives moves once a day, not once a minute.

const MIN_PA_STEPS = [0, 50, 100, 200, 300]

// AB estimate, kept in its own function so the assumption lives in one place.
const estAB = (p) => {
  const pa = n(p?.season_pa, 0)
  const bb = n(p?.season_bb_rate, 0)
  if (pa <= 0) return 0
  return pa * (1 - Math.min(0.35, Math.max(0, bb)))
}

const COLUMNS = [
  { key: 'name', label: 'Batter', heat: false, w: 150, bold: true, sticky: true },
  // Team marks on the leaders (2026-09-29, queue batch 5): the shared chip, not a bare code.
  { key: 'team', label: 'Tm',  heat: false, w: 34, mono: true, dim: true, teamMark: 'mlb' },
  { key: 'opp',  label: 'Opp', heat: false, w: 34, mono: true, dim: true },
  { key: 'bats', label: 'B',   heat: false, w: 26, mono: true, dim: true },
  { key: 'pa',   label: 'PA',  w: 46,
    title: 'Season plate appearances — read this before any rate on the row' },
  { key: 'avg',  label: 'AVG', w: 52, dp: 3 },
  { key: 'obp',  label: 'OBP', w: 52, dp: 3 },
  { key: 'slg',  label: 'SLG', w: 52, dp: 3 },
  { key: 'ops',  label: 'OPS', w: 54, dp: 3 },
  { key: 'iso',  label: 'ISO', w: 52, dp: 3,
    title: 'Slugging minus average — raw power with the singles stripped out' },
  { key: 'hr',   label: 'HR',  w: 42 },
  { key: 'rbi',  label: 'RBI', w: 44 },
  { key: 'runs', label: 'R',   w: 42 },
  { key: 'tb',   label: 'TB est', w: 56, dp: 0,
    title: 'DERIVED, not published: SLG × (PA × (1 − BB%)). Ignores HBP and sacrifices.' },
  { key: 'hrPA', label: 'HR/PA', w: 56, dp: 3 },
  { key: 'paHR', label: 'PA/HR', w: 54, dp: 1, invert: true,
    title: 'Plate appearances per home run. Inverted — fewer is better.' },
  { key: 'kPct', label: 'K%',  w: 46, dp: 1, invert: true,
    title: 'Inverted — a low strikeout rate is the good outcome for the hitter' },
  { key: 'bbPct', label: 'BB%', w: 46, dp: 1 },
  { key: 'babip', label: 'BABIP', w: 54, dp: 3,
    title: 'Average on balls in play. Well above .320 tends to come back down.' },
  { key: 'avgL', label: 'AVG vs L', w: 60, dp: 3 },
  { key: 'avgR', label: 'AVG vs R', w: 60, dp: 3 },
  { key: 'isoL', label: 'ISO vs L', w: 58, dp: 3 },
  { key: 'isoR', label: 'ISO vs R', w: 58, dp: 3 },
]

// USABLE, NOT A TROPHY CASE (2026-08-08): the tile is components/LeaderTile.js
// now (shared with TUDDY, 2026-09-29); this is MOONSHOT's meta and matchup
// line for it -- team chip and PA, and the pitcher he faces tonight.
function LeaderTile(props) {
  return (
    <SharedLeaderTile
      {...props}
      meta={(top) => <><MlbTeamMark abbr={top.team} style={{ height: 16, verticalAlign: 'middle' }} /> · {top.pa} PA</>}
      facing={(top) => {
        const facing = clean(top._raw?.pitcher_name, '')
        if (!facing) return null
        const hr9 = n(top._raw?.pitcher_hr9, 0)
        return {
          title: `Tonight: ${top.team} vs ${top.opp} — he faces ${facing}${hr9 ? `, ${hr9.toFixed(2)} HR/9` : ''}`,
          text: (
            <>
              tonight vs {facing.split(' ').slice(-1)[0]}
              {hr9 > 0 && (
                <span style={{ color: hr9Color(hr9, C.text3) }}>
                  {' '}· {hr9.toFixed(2)} HR/9
                </span>
              )}
            </>
          ),
        }
      }}
    />
  )
}

// LEAGUE-WIDE BOARDS (2026-08-08): the slate payload has no stolen-base field
// at all — speed simply had no surface here. These three cards are the actual
// MLB top-10s, live from the StatsAPI (see lib/leaders.js for the verified
// call), NOT filtered to tonight — that's the point. 🤖 marks the ones who ARE
// on tonight's slate, matched by MLB person id, and those rows open the card.
function LeagueLeadersCard({ cat, rows, slateById, onPlayerClick }) {
  return (
    <LeagueTopCard title={`${cat.icon} ${cat.label} — MLB top 10`} unit={cat.unit} rows={rows} mark="🤖"
      open={(r) => { const onSlate = slateById.get(Number(r.id)); return onSlate && onPlayerClick ? () => onPlayerClick(onSlate) : undefined }} />
  )
}

// ── the historical strip ─────────────────────────────────────────────────────
//
// DELIBERATELY NOT TILES. Four boards, each one a sentence saying what it
// covers followed by plain ranked lines — the caption is the point, because
// "most homers" is meaningless without "across the seven graded nights ending
// Friday", and a tile has nowhere to put that. Same reason the rate board
// prints k/n next to the percentage instead of the percentage alone.
function HistBoard({ title, lead, rows, empty, renderRow }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: TYPE.title, fontWeight: 900, color: C.text }}>{title}</div>
      <div style={{ fontSize: TYPE.body, color: C.text3, lineHeight: 1.55, margin: '1px 0 4px' }}>{lead}</div>
      {rows.length === 0
        ? <div style={{ fontSize: TYPE.body, color: C.text3, fontStyle: 'italic' }}>{empty}</div>
        : rows.map(renderRow)}
    </div>
  )
}

// One ranked line: rank, name, the number, and the number's own denominator or
// context underneath it. `onClick` is only wired when the man is on tonight's
// slate — a name from nine nights ago has no card to open.
function HistRow({ i, name, team, main, note, onClick, title, onTeam }) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 6, padding: '1.5px 0',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, width: 13, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
      <span style={{
        fontSize: TYPE.name, fontWeight: onClick ? 800 : 600, color: onClick ? C.text : C.text2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
      }}>
        {name}{onClick ? ' 🤖' : ''}
        {/* THE CLUB OPENS ITS TEAM PAGE (2026-10-04; was its game tonight, from
            09-29 when MOONSHOT had no team page -- a club off tonight's slate went
            nowhere: check-clickable found 16 dead codes). */}
        {team ? <> {onTeam?.(team)
          ? <button type="button" onClick={(e) => { e.stopPropagation(); onTeam(team)() }} title={`${team} team page`}
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', verticalAlign: 'middle' }}>
              <MlbTeamMark abbr={team} style={{ height: 16, verticalAlign: 'middle' }} />
            </button>
          : <MlbTeamMark abbr={team} style={{ height: 16, verticalAlign: 'middle' }} />}</> : null}
      </span>
      <span style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: TYPE.body, fontWeight: 900, color: C.orange }}>{main}</span>
        {note && (
          <span style={{ display: 'block', fontFamily: NUM_FONT, fontSize: TYPE.micro, color: C.text3, marginTop: -1 }}>{note}</span>
        )}
      </span>
    </div>
  )
}

const LEADER_G = {
  who: { key: 'who', label: 'Batter', order: 0 }, line: { key: 'line', label: 'Season line', order: 1 },
  rates: { key: 'rates', label: 'Rates', order: 2 }, split: { key: 'split', label: 'Vs the hand', order: 3 },
}
const LEADER_GROUP_OF = { name: 'who', team: 'who', opp: 'who', bats: 'who', pa: 'line', avg: 'line', obp: 'line', slg: 'line', ops: 'line', iso: 'line', hr: 'line', rbi: 'line', runs: 'line', tb: 'line', hrPA: 'rates', paHR: 'rates', kPct: 'rates', bbPct: 'rates', babip: 'rates', avgL: 'split', avgR: 'split', isoL: 'split', isoR: 'split' }
const LEADER_COLUMNS = COLUMNS.map((c) => ({ ...c, group: LEADER_G[LEADER_GROUP_OF[c.key]] || LEADER_G.rates }))

export default function Leaders({ players = [], onPlayerClick, onNavigate }) {
  const [minPA, setMinPA] = useState(100)
  const [hand, setHand] = useState('all')
  const [query, setQuery] = useState('')

  // League leader boards — undefined while loading, null if the live call
  // failed (the section says so instead of showing nothing silently).
  const [league, setLeague] = useState(undefined)
  useEffect(() => {
    let alive = true
    leagueLeaders().then((d) => { if (alive) setLeague(d) })
    return () => { alive = false }
  }, [])

  // HISTORICAL STRIP — nothing is fetched until the button is pressed. A
  // graded night is ~1 MB and there are up to fourteen of them, so this is the
  // one place on the page where an automatic load would actually be felt.
  // `histState`: idle → loading → done | error. The window that was ASKED for
  // (histN) is kept separately from the window that came BACK (hist.window),
  // because they differ whenever the archive has a gap and the difference is
  // exactly what the caption has to say out loud.
  const [histN, setHistN] = useState(HIST_FIRST)
  const [hist, setHist] = useState(null)
  const [histState, setHistState] = useState('idle')
  const alive = useRef(true)
  // Only the LAST window asked for may land (2026-09-27, audit 00A): a slow
  // 7-night load finishing after the 30-night one would put the old window
  // back. Same stale-response root as LAMP's useLampFetch.
  const ticket = useRef(0)
  useEffect(() => () => { alive.current = false }, [])
  const loadHistory = (nights) => {
    setHistN(nights)
    setHistState('loading')
    const mine = ++ticket.current
    gradedHistory(nights).then((d) => {
      if (!alive.current || mine !== ticket.current) return
      if (d) { setHist(d); setHistState('done'); return }
      // NEVER TRADE DATA FOR AN ERROR MESSAGE. If the extend fails, the seven
      // nights already on screen are still true — keep them and put the window
      // back to what they cover, so a bad connection can't blank the section.
      setHist(hist)
      setHistState(hist ? 'done' : 'error')
      setHistN(hist ? hist.window.nights : nights)
    })
  }

  // MLB person id → slate row, for the 🤖 on-slate marker.
  const slateById = useMemo(() => {
    const m = new Map()
    players.forEach((p) => {
      const id = Number(p?.player_id)
      if (Number.isFinite(id) && id > 0 && !m.has(id)) m.set(id, p)
    })
    return m
  }, [players])

  const all = useMemo(() => players.map((p, i) => {
    const slg = n(p?.season_slg, 0)
    return {
      _key: `${p?.player_id ?? nameOf(p)}-${i}`,
      _raw: p,
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      bats: clean(p?.bats, ''),
      pa: n(p?.season_pa, 0),
      avg: n(p?.season_avg, 0),
      obp: n(p?.season_obp, 0),
      slg,
      ops: n(p?.season_ops, 0),
      iso: n(p?.season_iso, 0),
      hr: n(p?.season_hr, 0),
      rbi: n(p?.season_rbi, 0),
      runs: n(p?.season_runs, 0),
      tb: Math.round(slg * estAB(p)),
      hrPA: n(p?.hr_per_pa, 0),
      paHR: n(p?.pa_per_hr, 0) || null,
      kPct: n(p?.season_k_rate, 0) * 100,
      bbPct: n(p?.season_bb_rate, 0) * 100,
      babip: n(p?.babip, 0),
      avgL: n(p?.avg_vs_lhp, 0) || null,
      avgR: n(p?.avg_vs_rhp, 0) || null,
      isoL: n(p?.iso_vs_lhp, 0) || null,
      isoR: n(p?.iso_vs_rhp, 0) || null,
    }
  }), [players])

  // LENS SHORTCUTS (2026-08-07): one tap re-sorts the table to answer a
  // question — remounting DenseTable via key so initialSort re-applies.
  const [lens, setLens] = useState('ops')
  const LENSES = [
    ['ops', '🏆 Best hitters'], ['hr', '💣 Power'], ['iso', '⚡ Raw power'],
    ['avg', '🎯 Contact'], ['obp', '🚶 On-base'], ['tb', '📦 Total bases'],
  ]
  const rows = useMemo(() => {
    const q = query.toLowerCase().trim()
    return all
      .filter((r) => r.pa >= minPA)
      .filter((r) => hand === 'all' || r.bats.toUpperCase().startsWith(hand))
      .filter((r) => !q || `${r.name} ${r.team} ${r.opp}`.toLowerCase().includes(q))
  }, [all, minPA, hand, query])

  // Clicking a historical name only opens a card if he is playing tonight —
  // otherwise there is no slate row behind him and the click would do nothing.
  // the historical rows' team chips open the club's page (lib/teamNav: Dashboard's team door)
  const teamNav = useTeamNav()
  const openTeam = (team) => (teamNav && isKnownTeam(team) ? () => teamNav(team) : undefined)
  const openIfOnSlate = (pid) => {
    const p = slateById.get(Number(pid))
    return p && onPlayerClick ? () => onPlayerClick(p) : undefined
  }
  const histBtn = {
    padding: '4px 11px', fontSize: TYPE.body, fontWeight: 800, borderRadius: 7, cursor: 'pointer',
    fontFamily: NUM_FONT, border: `1px solid ${C.orange}`,
    background: 'rgba(249,115,22,.12)', color: C.orange,
  }
  const w = hist?.window
  const t = hist?.totals

  // ── #67: THE ARCHIVE SECTION OF THE ARCHIVE PAGE STARTED BLANK ───────────
  //
  // Behind a "Load the last 7 graded nights" button, for a stated and honest
  // reason -- seven files at roughly a megabyte each should not ride every
  // open of this tab. But the cost is paid by the people who came for exactly
  // this, and an empty section is a section that looks broken.
  //
  // Loaded when it SCROLLS INTO VIEW instead. Nobody who never reaches it
  // pays anything, which was the whole point of the button, and nobody who
  // does reach it is met with a blank panel and a chore. The button stays for
  // browsers with no IntersectionObserver and as the retry path.
  const histRef = useRef(null)
  useEffect(() => {
    if (histState !== 'idle') return
    const el = histRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); loadHistory(HIST_FIRST) }
    }, { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
    // loadHistory is stable enough for this: it only ever reads HIST_* consts
    // and setState. Re-running on every render would re-observe endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histState])

  const historyStrip = (
    <div ref={histRef} style={{
      background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: TYPE.title, fontWeight: 900 }}>🗓️ Historical — MOONSHOT&apos;s own graded nights</span>
      </div>
      <div style={{ fontSize: TYPE.body, color: C.text3, lineHeight: 1.6, margin: '4px 0 7px', maxWidth: 780 }}>
        Past graded nights, ranked over time instead of tonight.
        <HelpTip label="About the archive" text="Everybody in these boards was already a MOONSHOT pick, so a rate says how a hitter does once MOONSHOT has liked him; it is not a league rate and can't be compared to one. Nights where a pick never batted are void: counted, shown, and kept out of every denominator, because a scratch is not a loss." />
      </div>

      {histState === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <button style={histBtn} onClick={() => loadHistory(HIST_FIRST)}>
            Load the last {HIST_FIRST} graded nights
          </button>
          <span style={{ fontSize: TYPE.body, color: C.text3 }}>
            Loads when you ask, about a megabyte a night. Extends to {HIST_MAX} once they&apos;re in.
          </span>
        </div>
      )}

      {histState === 'loading' && (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginBottom: hist ? 7 : 0 }}>
          Reading the last {histN} graded nights… (dates the archive never published are skipped, not waited on)
          {hist && <> The boards below are still the {hist.window.loaded}-night window until it lands.</>}
        </div>
      )}

      {histState === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE.body, color: C.text3 }}>
            None of the last {histN} dates came back. Only a rolling window of graded days is kept,
            so an old date may not exist — nothing is shown rather than boards built on no nights.
          </span>
          <button style={histBtn} onClick={() => loadHistory(histN)}>Try again</button>
        </div>
      )}

      {/* Boards stay up while an extend is in flight — the seven nights on
          screen don't stop being true because fourteen are on the way. */}
      {hist && (histState === 'done' || histState === 'loading') && (
        <>
          {/* THE WINDOW AND THE SAMPLE, BEFORE ANY NUMBER. Every board under
              this sentence inherits it — "most homers" means nothing until
              it says across how many nights, out of whose picks, and how many
              of the slots in them were actually judgeable. */}
          <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.6, marginBottom: 8, maxWidth: 780 }}>
            <b style={{ fontFamily: NUM_FONT }}>{w.loaded} graded {w.loaded === 1 ? 'night' : 'nights'}</b>
            {' '}found in the last {w.tried} dates, <span style={{ fontFamily: NUM_FONT }}>{w.from}</span> to{' '}
            <span style={{ fontFamily: NUM_FONT }}>{w.to}</span>
            {w.missing > 0 && (
              <> — {w.missing} {w.missing === 1 ? 'date' : 'dates'} missing <HelpTip label="Missing dates" text="A date with no graded record is a gap in the archive, not a zero for anybody. A hitter with no line on a night simply isn't in that night's numbers." /></>
            )}. <span style={{ fontFamily: NUM_FONT }}>{t.players}</span> hitters appear across{' '}
            <span style={{ fontFamily: NUM_FONT }}>{t.picks}</span> designations:{' '}
            <b style={{ fontFamily: NUM_FONT }}>{t.cleared}/{t.judged}</b> cleared their own bar,{' '}
            <span style={{ fontFamily: NUM_FONT }}>{t.voids}</span> void
            {t.pending > 0 && <>, <span style={{ fontFamily: NUM_FONT }}>{t.pending}</span> never finalised</>}.
          </div>

          <div className="bot-picks-grid" style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          }}>
            <HistBoard
              title="💣 Most home runs"
              lead={`Across the ${w.loaded} nights above. A count, not a rate — the line underneath is how many of those nights he was on the board at all.`}
              rows={hist.homers}
              empty="No homers in the window, which would be a first — check the dates."
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${p.hr} HR`}
                  note={`${p.hrNights}/${p.nights} ${p.nights === 1 ? 'night' : 'nights'}`}
                  onClick={openIfOnSlate(p.pid)} onTeam={openTeam}
                  title={`${p.name} — ${p.hr} home runs over ${w.loaded} graded nights, on ${p.hrNights} of the ${p.nights} nights he was in the file. Deduped per night: the graded file lists a hitter once per pick category, so counting raw rows would give a man picked twice two homers for one swing.`} />
              )} />

            <HistBoard
              title="🎯 Cleared his bar most often"
              lead={<>Picks graded on their own bar.<HelpTip label="About this board" text={`HR and TOP need a homer, HIT a hit, HRR 2+ hits+runs+RBI, CONTACT 2+ total bases. Ranked only at ${HIST_MIN_PICKS}+ judged picks across ${HIST_MIN_NIGHTS}+ separate nights, because one hitter can hold five designations in a single game and they all grade off the same swing. Voids are in neither number.`} /></>}
              rows={hist.rate}
              empty={`Nobody has ${HIST_MIN_PICKS} judged picks over ${HIST_MIN_NIGHTS} nights in a window this short — extend it below rather than reading a 3-for-4 as a rate.`}
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${Math.round((100 * p.cleared) / p.judged)}%`}
                  note={`${p.cleared}/${p.judged} in ${p.pickNights}n${p.voids ? ` · ${p.voids} void` : ''}`}
                  onClick={openIfOnSlate(p.pid)} onTeam={openTeam}
                  title={`${p.name} cleared ${p.cleared} of ${p.judged} judged picks across ${p.pickNights} nights${p.voids ? `, plus ${p.voids} void (tracked, never batted — out of the denominator)` : ''}. Conditional on MOONSHOT having designated him in the first place: this is his rate once picked, not a league rate.`} />
              )} />

            <HistBoard
              title="🤖 Picked most often"
              lead={<>Most often picked in this window.<HelpTip label="About this board" text="Nights first, then slots: one hitter can hold two categories on the same night, and that is two picks but one night." /></>}
              rows={hist.designated}
              empty="No designations in the window."
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${p.pickNights} ${p.pickNights === 1 ? 'night' : 'nights'}`}
                  note={`${p.picks} slots · ${p.cleared}/${p.judged}`}
                  onClick={openIfOnSlate(p.pid)} onTeam={openTeam}
                  title={`${p.name} was designated on ${p.pickNights} of the ${w.loaded} graded nights, ${p.picks} pick slots in total, clearing ${p.cleared} of ${p.judged} judged. Volume, not endorsement — MOONSHOT picks the same names often.`} />
              )} />

            <HistBoard
              title="🚀 Biggest single nights"
              lead={`One player-night each, ranked by total bases across the ${w.loaded} nights. The one board here that is a single game rather than a total.`}
              rows={hist.bigNights}
              empty="Nothing finished in the window."
              renderRow={(b, i) => (
                <HistRow key={`${b.pid}-${b.date}`} i={i} name={b.name} team={b.team}
                  main={`${b.tb} TB`}
                  note={`${b.date.slice(5)} · ${b.h}-${b.ab}${b.hr ? `, ${b.hr} HR` : ''}`}
                  onClick={openIfOnSlate(b.pid)} onTeam={openTeam}
                  title={`${b.name} on ${b.date}${b.opp ? ` vs ${b.opp}` : ''} — ${b.h} for ${b.ab}, ${b.hr} HR, ${b.tb} total bases, ${b.r} R, ${b.rbi} RBI.`} />
              )} />
          </div>

          {histState === 'done' && histN < HIST_MAX && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 9 }}>
              <button style={histBtn} onClick={() => loadHistory(HIST_MAX)}>
                Extend to {HIST_MAX} nights
              </button>
              <span style={{ fontSize: TYPE.body, color: C.text3 }}>
                {HIST_MAX - histN} more nights available. A longer window is the only honest way to make the rate board mean more.
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )

  // A BLANK SLATE IS THE MOMENT HISTORY IS MOST USEFUL. Before lineups land
  // there is nothing to rank tonight, and the page used to be one empty line.
  // The archive doesn't depend on tonight's payload, so it still renders.
  if (!players.length) {
    return (
      <div>
        {historyStrip}
        <Empty text="No players on this slate yet — tonight's boards fill in when MOONSHOT publishes." />
      </div>
    )
  }

  const top3 = (key) => [...rows].sort((a, b) => n(b[key], 0) - n(a[key], 0)).slice(0, 3)
  // Power efficiency — FEWEST plate appearances per homer, and only with a few
  // HR banked so one lucky swing can't own the tile.
  const eff3 = rows.filter((r) => r.paHR != null && r.hr >= 5).sort((a, b) => a.paHR - b.paHR).slice(0, 3)
  // 🎯 SEASON POWER MEETS TONIGHT'S ARM — the actionable cut of this page.
  // Both halves are published fields: his season ISO, the starter's HR/9.
  // No model, no weighting — just the two numbers that, when both are high,
  // are the reason you'd open his card next.
  // THE PRODUCT IS WHAT ORDERS THEM, so the product is now on the chip. Both
  // factors were already printed and the thing that ranked them was not, which
  // reads as "sorted by ISO" and is not — a .205 bat facing a 1.9 HR/9 arm
  // outranks a .260 bat facing a 1.31.
  const collisionPool = [...rows].filter((r) => r.iso >= 0.200 && n(r._raw?.pitcher_hr9, 0) >= 1.3)
  const collisions = collisionPool
    .map((r) => ({ ...r, collide: r.iso * n(r._raw?.pitcher_hr9, 0) }))
    .sort((a, b) => b.collide - a.collide)
    .slice(0, 8)

  return (
    <div>
      <PanelTitle
        title="League Leaders"
        sub="Season stats for tonight's hitters, no model scores."
        // #66: this read as a bare "238 of 266" in the corner with nothing
        // saying what it counted.
        right={(
          <span
            title="Hitters on tonight's slate with a season line, out of every hitter on the slate."
            style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}
          >{rows.length} of {all.length} hitters</span>
        )}
      />

      {historyStrip}

      <LeadersLead>
        Every leader below is <b style={{ color: C.text2 }}>on tonight&apos;s slate</b>, with who he faces and the #2 and #3.
      </LeadersLead>
      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      }}>
        <LeaderTile label="AVG" rows={top3('avg')} fmt={(r) => r.avg.toFixed(3)} color={C.orange} onPlayerClick={onPlayerClick} />
        <LeaderTile label="OPS" rows={top3('ops')} fmt={(r) => r.ops.toFixed(3)} color={C.orange} onPlayerClick={onPlayerClick} />
        <LeaderTile label="Home runs" rows={top3('hr')} fmt={(r) => r.hr} color={C.orange} onPlayerClick={onPlayerClick} />
        <LeaderTile label="RBI" rows={top3('rbi')} fmt={(r) => r.rbi} color={C.orange} onPlayerClick={onPlayerClick} />
        <LeaderTile label="ISO" rows={top3('iso')} fmt={(r) => r.iso.toFixed(3)} color={C.orange} onPlayerClick={onPlayerClick} />
        <LeaderTile label="PA per HR · min 5 HR" rows={eff3} fmt={(r) => r.paHR.toFixed(1)} color={C.orange} onPlayerClick={onPlayerClick} />
      </div>

      {/* League-wide boards, live. The slate payload publishes no stolen-base
          field, so SB (and league R/RBI for context) come straight from the
          MLB StatsAPI leaders endpoint — whole league, not tonight's hitters.
          🤖 = that leader IS on tonight's slate (matched by MLB person id). */}
      <LeadersSection
        title="🏃 League-wide top 10s — speed &amp; run production"
        tint={C.bg2}
        lead={<>
          whole league, live — the only speed read here.
          🤖 = on tonight&apos;s slate (tap to open his card).
        </>}>
        {league === undefined ? (
          <div style={{ fontSize: TYPE.body, color: C.text3, padding: '4px 0' }}>Fetching live league leaders…</div>
        ) : league === null ? (
          <div style={{ fontSize: TYPE.body, color: C.text3, padding: '4px 0' }}>
            The live leaders didn&apos;t load, so there are no numbers rather than stale ones. Reload to retry.
          </div>
        ) : (
          <div className="bot-picks-grid" style={{
            display: 'grid', gap: 8,
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          }}>
            {LEADER_CATS.map((cat) => (
              <LeagueLeadersCard key={cat.cat} cat={cat} rows={league[cat.cat]}
                slateById={slateById} onPlayerClick={onPlayerClick} />
            ))}
          </div>
        )}
      </LeadersSection>

      {/* The actionable cut: season power crossing a homer-prone arm tonight.
          Both numbers are published season fields — his ISO, the starter's
          HR/9 — multiplied only to ORDER the chips, never displayed as a
          score. This is the section that makes the page a tool. */}
      {collisions.length > 0 && (
        <div style={{
          background: C.bg2,
          border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: TYPE.title, fontWeight: 900 }}>⚡ Season power, homer-prone arm</span>
            <span style={{ fontSize: TYPE.body, color: C.text3 }}>
              .200+ ISO facing a starter allowing 1.30+ HR/9 tonight, ordered by{' '}
              <b style={{ color: C.text2 }}>ISO × HR/9</b>; top {collisions.length} of {collisionPool.length} who clear both bars.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {collisions.map((r) => {
              const hr9 = n(r._raw?.pitcher_hr9, 0)
              return (
                <button key={r._key} onClick={() => onPlayerClick?.(r._raw)}
                  title={`${r.name} — season ISO ${r.iso.toFixed(3)} (${r.pa} PA). Faces ${clean(r._raw?.pitcher_name, 'TBD')} tonight, ${hr9.toFixed(2)} HR/9 allowed.`}
                  style={{
                    display: 'flex', gap: 7, alignItems: 'baseline', cursor: 'pointer',
                    border: `1px solid ${alpha(C.orange, 0.27)}`, background: alpha(C.orange, 0.08),
                    borderRadius: 8, padding: '4px 10px',
                  }}>
                  <span style={{ fontSize: TYPE.name, fontWeight: 800, color: C.text }}>{r.name}</span>
                  <span style={{ fontSize: TYPE.body, fontFamily: NUM_FONT, color: tone('green'), fontWeight: 800 }}>ISO {r.iso.toFixed(3)}</span>
                  <span style={{ fontSize: TYPE.body, fontFamily: NUM_FONT, color: C.orange, fontWeight: 800 }}>
                    vs {String(clean(r._raw?.pitcher_name, '?')).split(' ').slice(-1)[0]} {hr9.toFixed(2)} HR/9
                  </span>
                  <span style={{ fontSize: TYPE.body, fontFamily: NUM_FONT, color: C.text3, fontWeight: 800 }}
                    title="ISO × HR/9 — the product these chips are ordered by. Not a rate and not a score: it is the two published numbers multiplied, and it exists so the order is visible rather than implied.">
                    = {r.collide.toFixed(2)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <LeadersFilterBar
        groups={[
          { label: 'Min PA', value: minPA, onChange: setMinPA, options: MIN_PA_STEPS.map((v) => [v, v || 'Any']) },
          { label: 'Bats', value: hand, onChange: setHand, options: [['all', 'All'], ['L', 'LHB'], ['R', 'RHB']] },
          { label: 'Lens', value: lens, onChange: setLens, options: LENSES, wrap: true },
        ]}
        search={{ value: query, onChange: setQuery, placeholder: 'Search a hitter…' }}
      />

      {!rows.length ? (
        <Empty text={`Nobody clears ${minPA} plate appearances with this filter.`} />
      ) : (
        <DenseTable
          heatMode="sorted"
key={lens}
          rows={rows}
          // groups (BATCH-TABLE-SKIN-V2; the v2 skin only): who, the season line,
          // the rates, the splits by the pitcher's hand
          columns={LEADER_COLUMNS}
          onRowClick={onPlayerClick}
          faceOf={(r) => (r._raw?.player_id ? { sport: 'mlb', id: String(r._raw.player_id), name: r.name } : null)}
          initialSort={lens}
          maxHeight={620}
          caption={`Season stats, straight from the box score. Minimum ${minPA} PA, because rates on a small sample are noise. K% and PA/HR are flipped so bright is always good for the hitter. TB is worked out as SLG × (PA × (1 − BB%)), so it runs slightly light: rank by it, don't quote it.`}
        />
      )}
    </div>
  )
}
