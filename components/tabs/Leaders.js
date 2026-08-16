'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, clean, nameOf, teamOf, oppOf } from '../../lib/player'
import { PanelTitle, Empty } from '../ui'
import DenseTable from '../DenseTable'
import {
  leagueLeaders, LEADER_CATS,
  gradedHistory, HIST_FIRST, HIST_MAX, HIST_MIN_PICKS, HIST_MIN_NIGHTS,
} from '../../lib/leaders'

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
  { key: 'team', label: 'Tm',  heat: false, w: 34, mono: true, dim: true },
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

// USABLE, NOT A TROPHY CASE (2026-08-08, "needs something usable"): a tile
// that only names the #1 guy answers a trivia question. Each tile now says
// WHO HE FACES TONIGHT — the leader with his matchup attached is a lead you
// can act on — and carries the two runners-up, because the interesting names
// are usually #2 and #3, not the Judge everybody already knows about.
function LeaderTile({ label, rows, fmt, color, onPlayerClick }) {
  if (!rows?.length) return null
  const [top, ...rest] = rows
  const facing = clean(top._raw?.pitcher_name, '')
  return (
    <div
      onClick={onPlayerClick ? () => onPlayerClick(top._raw) : undefined}
      title={onPlayerClick ? `Open ${top.name}` : undefined}
      style={{
        background: `linear-gradient(155deg, ${color}1e, ${color}06)`,
        border: `1px solid ${color}44`, borderRadius: 11, padding: '8px 12px', minWidth: 0,
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}>
      <div style={{
        fontSize: 8.5, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.09em', fontWeight: 800,
      }}>{label}</div>
      <div style={{
        fontSize: 13, fontWeight: 800, marginTop: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{top.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color }}>{fmt(top)}</span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
          {top.team} · {top.pa} PA
        </span>
      </div>
      {facing && (
        <div style={{ fontSize: 9, color: C.text2, fontFamily: NUM_FONT, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={`Tonight: ${top.team} vs ${top.opp} — he faces ${facing}${n(top._raw?.pitcher_hr9, 0) ? `, ${n(top._raw.pitcher_hr9, 0).toFixed(2)} HR/9` : ''}`}>
          tonight vs {facing.split(' ').slice(-1)[0]}
          {n(top._raw?.pitcher_hr9, 0) > 0 && (
            <span style={{ color: n(top._raw.pitcher_hr9, 0) >= 1.4 ? C.orange : C.text3 }}>
              {' '}· {n(top._raw.pitcher_hr9, 0).toFixed(2)} HR/9
            </span>
          )}
        </div>
      )}
      {rest.length > 0 && (
        <div style={{ fontSize: 8.5, color: C.text3, marginTop: 3, lineHeight: 1.5 }}>
          {rest.map((r) => (
            <span key={r._key}
              onClick={(e) => { e.stopPropagation(); onPlayerClick?.(r._raw) }}
              style={{ cursor: onPlayerClick ? 'pointer' : 'default', marginRight: 8, whiteSpace: 'nowrap' }}>
              {r.name.split(' ').slice(-1)[0]} <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{fmt(r)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// LEAGUE-WIDE BOARDS (2026-08-08): the slate payload has no stolen-base field
// at all — speed simply had no surface here. These three cards are the actual
// MLB top-10s, live from the StatsAPI (see lib/leaders.js for the verified
// call), NOT filtered to tonight — that's the point. 🤖 marks the ones who ARE
// on tonight's slate, matched by MLB person id, and those rows open the card.
function LeagueLeadersCard({ cat, rows, slateById, onPlayerClick }) {
  if (!rows?.length) return null
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`,
      borderRadius: 11, padding: '8px 12px', minWidth: 0,
    }}>
      <div style={{
        fontSize: 9, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.09em', fontWeight: 800, marginBottom: 5,
      }}>{cat.icon} {cat.label} — MLB top 10</div>
      {rows.map((r, i) => {
        const onSlate = slateById.get(Number(r.id))
        return (
          <div key={r.id}
            onClick={onSlate && onPlayerClick ? () => onPlayerClick(onSlate) : undefined}
            title={`${r.name} — ${r.team} · ${r.value} ${cat.unit}${onSlate ? ' · on tonight’s slate — click to open his card' : ''}`}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6, padding: '1.5px 0',
              cursor: onSlate && onPlayerClick ? 'pointer' : 'default',
            }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 14, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
            <span style={{
              fontSize: 10.5, fontWeight: onSlate ? 800 : 600,
              color: onSlate ? C.text : C.text2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
            }}>{r.name}{onSlate ? ' 🤖' : ''}</span>
            <span style={{ marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: onSlate ? C.orange : C.text2, flexShrink: 0 }}>
              {r.value}
            </span>
          </div>
        )
      })}
    </div>
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
      <div style={{ fontSize: 10.5, fontWeight: 900, color: C.text }}>{title}</div>
      <div style={{ fontSize: 9, color: C.text3, lineHeight: 1.55, margin: '1px 0 4px' }}>{lead}</div>
      {rows.length === 0
        ? <div style={{ fontSize: 9.5, color: C.text3, fontStyle: 'italic' }}>{empty}</div>
        : rows.map(renderRow)}
    </div>
  )
}

// One ranked line: rank, name, the number, and the number's own denominator or
// context underneath it. `onClick` is only wired when the man is on tonight's
// slate — a name from nine nights ago has no card to open.
function HistRow({ i, name, team, main, note, onClick, title }) {
  return (
    <div
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 6, padding: '1.5px 0',
        cursor: onClick ? 'pointer' : 'default',
      }}>
      <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 13, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
      <span style={{
        fontSize: 10.5, fontWeight: onClick ? 800 : 600, color: onClick ? C.text : C.text2,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
      }}>
        {name}{onClick ? ' 🤖' : ''}
        {team ? <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 9 }}> {team}</span> : null}
      </span>
      <span style={{ marginLeft: 'auto', textAlign: 'right', flexShrink: 0 }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: C.orange }}>{main}</span>
        {note && (
          <span style={{ display: 'block', fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginTop: -1 }}>{note}</span>
        )}
      </span>
    </div>
  )
}

export default function Leaders({ players = [], onPlayerClick }) {
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
  useEffect(() => () => { alive.current = false }, [])
  const loadHistory = (nights) => {
    setHistN(nights)
    setHistState('loading')
    gradedHistory(nights).then((d) => {
      if (!alive.current) return
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
  const openIfOnSlate = (pid) => {
    const p = slateById.get(Number(pid))
    return p && onPlayerClick ? () => onPlayerClick(p) : undefined
  }
  const histBtn = {
    padding: '4px 11px', fontSize: 10.5, fontWeight: 800, borderRadius: 7, cursor: 'pointer',
    fontFamily: NUM_FONT, border: `1px solid ${C.orange}`,
    background: 'rgba(249,115,22,.12)', color: C.orange,
  }
  const w = hist?.window
  const t = hist?.totals

  const historyStrip = (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(96,165,250,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 12px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🗓️ Historical — the bot&apos;s own graded nights</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          every other board on this page is tonight; this one is the archive
        </span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.6, margin: '4px 0 7px', maxWidth: 780 }}>
        After each slate the bot publishes a graded file — who it designated, what each designation needed, and
        what the hitter actually did. These boards read those files back and rank them over TIME instead of over
        tonight. <b style={{ color: C.text2 }}>Everybody in here was already a bot pick</b>, so a rate below says
        how a hitter does once the bot has liked him; it is not a league rate and can&apos;t be compared to one.
        Nights where a pick never batted are <b style={{ color: C.text2 }}>void</b> — counted, shown, and kept out
        of every denominator, because a scratch is not a loss.
      </div>

      {histState === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <button style={histBtn} onClick={() => loadHistory(HIST_FIRST)}>
            Load the last {HIST_FIRST} graded nights
          </button>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            {HIST_FIRST} files, one per night, roughly a megabyte each — so they load on request rather than every
            time this tab opens. Extends to {HIST_MAX} once they&apos;re in.
          </span>
        </div>
      )}

      {histState === 'loading' && (
        <div style={{ fontSize: 10, color: C.text3, marginBottom: hist ? 7 : 0 }}>
          Reading the last {histN} graded nights… (dates the archive never published are skipped, not waited on)
          {hist && <> The boards below are still the {hist.window.loaded}-night window until it lands.</>}
        </div>
      )}

      {histState === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: C.text3 }}>
            Not one of the last {histN} dates came back. The published branch only keeps a rolling window of graded
            days, so an old date genuinely may not exist — but nothing is shown rather than boards built on no nights.
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
          <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.6, marginBottom: 8, maxWidth: 780 }}>
            <b style={{ fontFamily: NUM_FONT }}>{w.loaded} graded {w.loaded === 1 ? 'night' : 'nights'}</b>
            {' '}found in the last {w.tried} dates, <span style={{ fontFamily: NUM_FONT }}>{w.from}</span> to{' '}
            <span style={{ fontFamily: NUM_FONT }}>{w.to}</span>
            {w.missing > 0 && (
              <> — {w.missing} {w.missing === 1 ? 'date' : 'dates'} in that stretch published no file, which is a
                gap in the archive and not a zero for anybody</>
            )}. <span style={{ fontFamily: NUM_FONT }}>{t.players}</span> hitters appear across{' '}
            <span style={{ fontFamily: NUM_FONT }}>{t.picks}</span> designations:{' '}
            <b style={{ fontFamily: NUM_FONT, color: C.green }}>{t.cleared}/{t.judged}</b> cleared their own bar,{' '}
            <span style={{ fontFamily: NUM_FONT }}>{t.voids}</span> void
            {t.pending > 0 && <>, <span style={{ fontFamily: NUM_FONT }}>{t.pending}</span> never finalised</>}.
            A hitter with no line in a night&apos;s file simply isn&apos;t in that night&apos;s numbers.
          </div>

          <div className="bot-picks-grid" style={{
            display: 'grid', gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          }}>
            <HistBoard
              title="💣 Most home runs"
              lead={`Across the ${w.loaded} nights above. A count, not a rate — the line underneath is how many of those nights he was on the sheet at all.`}
              rows={hist.homers}
              empty="No homers in the window, which would be a first — check the dates."
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${p.hr} HR`}
                  note={`${p.hrNights}/${p.nights} nights`}
                  onClick={openIfOnSlate(p.pid)}
                  title={`${p.name} — ${p.hr} home runs over ${w.loaded} graded nights, on ${p.hrNights} of the ${p.nights} nights he was in the file. Deduped per night: the graded file lists a hitter once per pick category, so counting raw rows would give a man picked twice two homers for one swing.`} />
              )} />

            <HistBoard
              title="🎯 Cleared his bar most often"
              lead={`Designated picks graded on their own bar — HR and TOP need a homer, HIT a hit, HRR 2+ hits+runs+RBI, CONTACT 2+ total bases. Ranked only at ${HIST_MIN_PICKS}+ judged picks across ${HIST_MIN_NIGHTS}+ separate nights, because one hitter can hold five designations in a single game and they all grade off the same swing. Voids are in neither number.`}
              rows={hist.rate}
              empty={`Nobody has ${HIST_MIN_PICKS} judged picks over ${HIST_MIN_NIGHTS} nights in a window this short — extend it below rather than reading a 3-for-4 as a rate.`}
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${Math.round((100 * p.cleared) / p.judged)}%`}
                  note={`${p.cleared}/${p.judged} in ${p.pickNights}n${p.voids ? ` · ${p.voids} void` : ''}`}
                  onClick={openIfOnSlate(p.pid)}
                  title={`${p.name} cleared ${p.cleared} of ${p.judged} judged picks across ${p.pickNights} nights${p.voids ? `, plus ${p.voids} void (tracked, never batted — out of the denominator)` : ''}. Conditional on the bot having designated him in the first place: this is his rate once picked, not a league rate.`} />
              )} />

            <HistBoard
              title="🤖 Picked most often"
              lead="How often the bot has designated him in this window. Nights first, then slots — one hitter can hold two categories on the same night, and that is two picks but one night."
              rows={hist.designated}
              empty="No designations in the window."
              renderRow={(p, i) => (
                <HistRow key={p.pid} i={i} name={p.name} team={p.team}
                  main={`${p.pickNights} ${p.pickNights === 1 ? 'night' : 'nights'}`}
                  note={`${p.picks} slots · ${p.cleared}/${p.judged}`}
                  onClick={openIfOnSlate(p.pid)}
                  title={`${p.name} was designated on ${p.pickNights} of the ${w.loaded} graded nights, ${p.picks} pick slots in total, clearing ${p.cleared} of ${p.judged} judged. Volume, not endorsement — the bot picks the same names often.`} />
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
                  onClick={openIfOnSlate(b.pid)}
                  title={`${b.name} on ${b.date}${b.opp ? ` vs ${b.opp}` : ''} — ${b.h} for ${b.ab}, ${b.hr} HR, ${b.tb} total bases, ${b.r} R, ${b.rbi} RBI.`} />
              )} />
          </div>

          {histState === 'done' && histN < HIST_MAX && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginTop: 9 }}>
              <button style={histBtn} onClick={() => loadHistory(HIST_MAX)}>
                Extend to {HIST_MAX} nights
              </button>
              <span style={{ fontSize: 9.5, color: C.text3 }}>
                {HIST_MAX - histN} more files — the {histN} already here are cached and won&apos;t be fetched again.
                A longer window is the only honest way to make the rate board mean more.
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
        <Empty text="No players on this slate yet — tonight's boards fill in when the bot publishes." />
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
  const collisions = [...rows]
    .filter((r) => r.iso >= 0.200 && n(r._raw?.pitcher_hr9, 0) >= 1.3)
    .sort((a, b) => (b.iso * n(b._raw?.pitcher_hr9, 0)) - (a.iso * n(a._raw?.pitcher_hr9, 0)))
    .slice(0, 8)

  const chip = (on) => ({
    padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6, cursor: 'pointer',
    fontFamily: NUM_FONT,
    border: `1px solid ${on ? C.orange : C.border}`,
    background: on ? 'rgba(249,115,22,.12)' : 'transparent',
    color: on ? C.orange : C.text3,
  })
  const lbl = {
    fontSize: 8, color: C.text3, textTransform: 'uppercase',
    letterSpacing: '.09em', fontWeight: 800,
  }

  return (
    <div>
      <PanelTitle
        title="League Leaders"
        sub="Season stats for tonight's hitters, plus historical boards off the graded archive — no model scores on this page"
        right={<span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} of {all.length}</span>}
      />

      <div style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.6, margin: '6px 0 12px',
        borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, maxWidth: 700,
      }}>
        Straight season numbers — the batting line, nothing weighted or projected. Every other board
        here ranks by the model; this one doesn&apos;t. It&apos;s the page for what a hitter has actually
        done, rather than what the bot thinks of him tonight. The strip directly below is the same idea
        stretched over time — the last week of graded nights, on request.
      </div>

      {historyStrip}

      <div style={{ fontSize: 9.5, color: C.text3, margin: '0 0 6px' }}>
        Every leader below is <b style={{ color: C.text2 }}>on tonight&apos;s slate</b> — tiles show who
        each one faces, plus the #2 and #3 so the tile is a lead, not a trivia answer.
      </div>
      <div className="bot-picks-grid" style={{
        display: 'grid', gap: 8, marginBottom: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      }}>
        <LeaderTile label="AVG" rows={top3('avg')} fmt={(r) => r.avg.toFixed(3)} color="#a78bfa" onPlayerClick={onPlayerClick} />
        <LeaderTile label="OPS" rows={top3('ops')} fmt={(r) => r.ops.toFixed(3)} color="#f97316" onPlayerClick={onPlayerClick} />
        <LeaderTile label="Home runs" rows={top3('hr')} fmt={(r) => r.hr} color="#f87171" onPlayerClick={onPlayerClick} />
        <LeaderTile label="RBI" rows={top3('rbi')} fmt={(r) => r.rbi} color="#22d3ee" onPlayerClick={onPlayerClick} />
        <LeaderTile label="ISO" rows={top3('iso')} fmt={(r) => r.iso.toFixed(3)} color="#4ade80" onPlayerClick={onPlayerClick} />
        <LeaderTile label="PA per HR · min 5 HR" rows={eff3} fmt={(r) => r.paHR.toFixed(1)} color="#FCD34D" onPlayerClick={onPlayerClick} />
      </div>

      {/* League-wide boards, live. The slate payload publishes no stolen-base
          field, so SB (and league R/RBI for context) come straight from the
          MLB StatsAPI leaders endpoint — whole league, not tonight's hitters.
          🤖 = that leader IS on tonight's slate (matched by MLB person id). */}
      <div style={{
        background: `linear-gradient(155deg, ${C.bg2}, rgba(74,222,128,.04))`,
        border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 11.5, fontWeight: 900 }}>🏃 League-wide top 10s — speed &amp; run production</span>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            whole league, live from the MLB StatsAPI — the slate publishes no stolen bases, so this
            board is the only speed read here. 🤖 = on tonight&apos;s slate (click to open his card).
          </span>
        </div>
        {league === undefined ? (
          <div style={{ fontSize: 10, color: C.text3, padding: '4px 0' }}>Fetching live league leaders…</div>
        ) : league === null ? (
          <div style={{ fontSize: 10, color: C.text3, padding: '4px 0' }}>
            The live MLB StatsAPI leaders call didn&apos;t come back — nothing cached, so no numbers
            rather than stale ones. Reload to retry.
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
      </div>

      {/* The actionable cut: season power crossing a homer-prone arm tonight.
          Both numbers are published season fields — his ISO, the starter's
          HR/9 — multiplied only to ORDER the chips, never displayed as a
          score. This is the section that makes the page a tool. */}
      {collisions.length > 0 && (
        <div style={{
          background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
          border: `1px solid ${C.border}`, borderRadius: 11, padding: '8px 12px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 900 }}>⚡ Season power, homer-prone arm</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>
              .200+ ISO facing a starter allowing 1.30+ HR/9 tonight — two published numbers, no model
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
                    border: `1px solid ${C.orange}44`, background: 'rgba(249,115,22,.08)',
                    borderRadius: 8, padding: '4px 10px',
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{r.name}</span>
                  <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: '#4ade80', fontWeight: 800 }}>ISO {r.iso.toFixed(3)}</span>
                  <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: C.orange, fontWeight: 800 }}>
                    vs {String(clean(r._raw?.pitcher_name, '?')).split(' ').slice(-1)[0]} {hr9.toFixed(2)} HR/9
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12,
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 11px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={lbl}>Min PA</span>
          {MIN_PA_STEPS.map((v) => (
            <button key={v} onClick={() => setMinPA(v)} style={chip(minPA === v)}>{v || 'Any'}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={lbl}>Bats</span>
          {[['all', 'All'], ['L', 'LHB'], ['R', 'RHB']].map(([k, l]) => (
            <button key={k} onClick={() => setHand(k)} style={chip(hand === k)}>{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={lbl}>Lens</span>
          {LENSES.map(([k, l]) => (
            <button key={k} onClick={() => setLens(k)} style={chip(lens === k)}>{l}</button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a hitter…"
          style={{
            flex: 1, minWidth: 150, background: C.bg3, border: `1px solid ${C.border}`,
            borderRadius: 7, padding: '5px 10px', fontSize: 11, color: C.text,
            outline: 'none', fontFamily: NUM_FONT,
          }}
        />
      </div>

      {!rows.length ? (
        <Empty text={`Nobody clears ${minPA} plate appearances with this filter.`} />
      ) : (
        <DenseTable
          key={lens}
          rows={rows}
          columns={COLUMNS}
          onRowClick={onPlayerClick}
          initialSort={lens}
          maxHeight={620}
          caption={`Season stats, unmodelled. Minimum PA is set to ${minPA} because rate stats on a small sample are noise — a .400 average on 30 plate appearances belongs to nobody. K% and PA/HR are inverted so bright still means good for the hitter; every other column reads high-is-good. TB is the one derived number: the payload has no season hits or at-bats, so it's SLG × (PA × (1 − BB%)), which ignores hit-by-pitch and sacrifices and runs slightly light. Rank by it, don't quote it.`}
        />
      )}
    </div>
  )
}
