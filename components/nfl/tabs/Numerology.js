'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../../lib/nfl/theme'
import { AXIS_META, alignedWith, slateAlignments, dateDigitRoot, shiftDateKey } from '../../../lib/nfl/alignments'
import AlignmentsView, { ROOT_COLORS } from '../../numerology/AlignmentsView'
import { useNflWatchlist } from '../../../lib/nfl/watchlist'
import PageHeader from '../../PageHeader'
import { etToday } from '../../../lib/freshness'
import TonightsNumbers from '../../numerology/TonightsNumbers'
import { easternDate } from '../../../lib/data'
import LaneTable from '../../numerology/LaneTable'
import { fromNfl } from '../../../lib/numerology/adapters'
import HotNumbers from '../../numerology/HotNumbers'
import { FilterSearch } from '../../Filters'
import { useIsPhone } from '../../MobileFold'

// 🔮 NUMEROLOGY — B10(d), 2026-09-15. TUDDY's clone of MLB's Alignments view
// (components/Alignments.js + lib/alignments.js). Donovan approved shipping
// it as disclosed flavor, same line MLB already carries: MLB's own 08-28
// sweep tested 18 axes -- gematria, birthdate eight ways, jersey, lineup-spot
// root, season-HR root, letters -- against 4,238 real player-nights and
// found ZERO significant axes. This is not a claim that any of the numbers
// below predict a touchdown. Pattern watching, not evidence, same as MLB.
//
// FIVE AXES, NOT MLB'S SEVEN. Batting-order "spot" and fielding "position
// code" are both real 1-9 numbers baseball already publishes for every
// plate appearance; football has nothing structurally equivalent to either,
// so lib/nfl/alignments.js drops them rather than inventing a stand-in. See
// that file's header for the full account, and bots/nfl/nfl_numerology.py's
// for where jersey_number/birth_date/season_td actually come from.
//
// WHAT'S DEFERRED, NOT FORGOTTEN. MLB's Alignments also reads back a live
// "aligned with tonight's number" archive that HomerLedger writes off real
// graded results, and lets a picked name seed the Builder view. Neither
// exists for NFL yet -- no per-game live results writer at TUDDY's weekly
// cadence, no Builder-equivalent to hand names to -- so this ships the
// pregame slate engine only, the same core MLB's own page leads with.
//
// YOUR WATCHLIST, ALIGNING -- ONE THIRD OF MLB's CHECK, NOT ALL THREE
// (2026-09-16). MLB's own section checks a watched hitter's own axes
// against YESTERDAY's and TODAY's archived leading root (both read
// HomerLedger's live graded-results archive -- the same missing writer
// named above) AND against TOMORROW's date, reduced -- pure calendar
// arithmetic on a player's own unchanging numbers, needing no archive at
// all. Only the third one ports honestly here. Building fake yesterday/
// today checks off a results writer TUDDY doesn't have would be exactly
// the invented-data rule #16 exists to stop.

// Roots 1-7 are the site's own C (lib/theme.js), spelled out by hand until
// 2026-09-23; same values, now following the theme. 8 and 9 have no token.
const SEARCH_MAX = 5

// THROUGH MOONSHOT'S ALIGNMENTS (2026-09-29, numerology parity). The sections
// are components/numerology/AlignmentsView.js -- the same clubs, braids,
// names and "the date's number" panel MOONSHOT shows -- fed TUDDY's rows
// (lib/nfl/alignments.js axesOf: next TD, season TD, jersey, birth day, life
// path), ranked by the TD score. What TUDDY adds sits in the head: the search
// box, the root-1 note, HotNumbers; LaneTable at the bottom. No yesterday /
// today archive (MOONSHOT's comes from its live HR ledger) and no builder.
const WORDS = {
  person: 'player', persons: 'players', night: 'this week', NIGHT: 'GAME DAY', unit: 'week',
  axesWord: 'five', slate: <>this week&apos;s slate</>, onSlate: 'this week', empty: 'Waiting for this week\u2019s slate.',
  scoreName: <>bot&apos;s TD score</>, scoreShort: 'TD score',
  scoreRecord: 'the model this site grades every week',
  carrying: <>Carrying the game day&apos;s number, highest TD score first</>,
  watchLegend: <>Checked against his own jersey / birthday / life-path roots -- <b style={{ color: C.green }}>+1</b> means
    tomorrow&apos;s date reduces to a root his own numbers touch. No yesterday / today check: those read a live
    results archive MOONSHOT has and TUDDY doesn&apos;t, at its weekly cadence.</>,
  braidNote: 'Two or more of his own numbers on one root. The rarest read here, and still arithmetic.',
  namesNote: 'Shared surnames (2+) and first names (3+; a pair of common first names is arithmetic).',
}

export default function Numerology({ data, onPlayerClick }) {
  const watchlist = useNflWatchlist(data)
  const phone = useIsPhone()
  const [query, setQuery] = useState('')
  const players = data?.players || []
  const byId = useMemo(() => new Map(players.map((p) => [String(p.player_id), p])), [players])
  const open = (a) => { const p = byId.get(String(a.pid)); if (p) onPlayerClick?.(p) }
  const btn = { background: 'transparent', font: 'inherit', cursor: onPlayerClick ? 'pointer' : 'default', textAlign: 'left', minHeight: 0 }

  const model = useMemo(() => slateAlignments(players), [players])
  // The next game day this week, on the game's own (Eastern) date.
  const nextGameDay = useMemo(() => {
    const today = easternDate(Date.now())
    const days = (data?.games || []).map((g) => easternDate(Date.parse(g?.kickoff || ''))).filter(Boolean).sort()
    return days.find((d) => d >= today) || days.at(-1) || null
  }, [data])
  const { rows, totalMemberships } = model
  const dayRoot = nextGameDay ? dateDigitRoot(nextGameDay) : null
  const tonight = useMemo(() => (dayRoot ? alignedWith(dayRoot, rows) : null), [dayRoot, rows])
  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return rows.filter((a) => String(a.name || '').toLowerCase().includes(q)).slice(0, SEARCH_MAX + 1)
  }, [rows, query])
  const zeroTdCount = useMemo(() => rows.filter((a) => a.seasonTd === 0).length, [rows])
  // TONIGHT'S PLAYERS ON THE LANES (2026-10-07): the men whose club plays on the next game day, in the lanes' adapter shape
  const laneTonight = useMemo(() => {
    if (!nextGameDay) return null
    const playing = new Set()
    for (const g of data?.games || []) if (easternDate(Date.parse(g?.kickoff || '')) === nextGameDay) { playing.add(g.home); playing.add(g.away) }
    return { date: nextGameDay, items: players.filter((p) => playing.has(p.team)).map((p) => ({ id: p.player_id, name: p.name, team: p.team, a: fromNfl({ ...p, opp: p.opp }), score: p.scores?.TD })) }
  }, [data, players, nextGameDay])
  const expected = totalMemberships / 9
  // Tomorrow's date, reduced, on the Eastern game-day clock (see header).
  const tomorrowRoot = dateDigitRoot(shiftDateKey(etToday(), 1))
  const watchedRows = useMemo(() => rows
    .filter((a) => watchlist.isPinned(a.pid))
    .map((a) => {
      const ownRoots = new Set(Object.values(a.axes).filter((v) => v != null))
      const hitsTomorrow = tomorrowRoot != null && ownRoots.has(tomorrowRoot)
      return { a, hitsYesterday: false, hitsToday: false, hitsTomorrow, any: hitsTomorrow }
    }), [rows, watchlist, tomorrowRoot])

  if (!players.length) {
    return (
      <div style={{
        border: `1px dashed ${C.border}`, borderRadius: 10, padding: '22px 16px',
        textAlign: 'center', color: C.text3, fontSize: TYPE.body,
      }}>
        Waiting for this week&apos;s slate.
      </div>
    )
  }

  return (
    <AlignmentsView
      model={model} tonight={tonight} todayKey={nextGameDay} todayRoot={dayRoot}
      AXIS_META={AXIS_META} scoreOf={(a) => a.tdScore}
      onName={onPlayerClick ? (a) => { const pl = (data?.players || []).find((x) => String(x.player_id) === String(a.pid)); if (pl) onPlayerClick(pl) } : undefined}
      watchedRows={watchedRows} hasWatch={watchlist.pins.length > 0}
      // Six on a phone: the full 24 added ~1,000px above the clubs.
      chipLimit={phone ? 6 : 24} compact={phone}
      words={WORDS} onName={open} theme={C} numFont={NUM_FONT} accent={C.green} sport="nfl"
      head={(
        <>
      <PageHeader
        title="🔮 Numerology"
        sub={`${rows.length} players this week · five axes, one reduction`}
        theme={C}
        numFont={NUM_FONT}
        right={<FilterSearch value={query} onChange={setQuery} placeholder="Find a player's numbers…" width={190} />}
      />
      {found.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, background: C.bg2, borderRadius: 10, padding: '8px 11px', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {found.slice(0, SEARCH_MAX).map((a) => (
            <div key={a.pid} style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.5 }}>
              <button type="button" onClick={() => open(a)} style={{ ...btn, border: 'none', padding: 0, color: C.text, fontWeight: 800 }}>{a.name}</button>
              <span style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro }}> {a.team} · </span>
              {Object.entries(a.axes).filter(([, v]) => v != null).map(([k, root], i) => {
                const raw = AXIS_META[k]?.raw ? AXIS_META[k].raw(a) : null
                return (
                  <span key={k} title={AXIS_META[k]?.why(a)} style={{ fontFamily: NUM_FONT, fontSize: TYPE.micro }}>
                    {i > 0 && ' · '}{AXIS_META[k]?.label || k} {raw != null ? `${raw}→` : ''}<b style={{ color: ROOT_COLORS[root] }}>{root}</b>
                  </span>
                )
              })}
            </div>
          ))}
          {found.length > SEARCH_MAX && <div style={{ fontSize: TYPE.micro, color: C.text3 }}>More match — keep typing.</div>}
        </div>
      )}
      {query.trim().length >= 2 && !found.length && (
        <div style={{ fontSize: TYPE.micro, color: C.text3, marginBottom: 10 }}>No one on this week&apos;s slate matches “{query.trim()}”.</div>
      )}
      {nextGameDay ? <TonightsNumbers date={nextGameDay} theme={C} numFont={NUM_FONT} accent={C.green} label={`next game day · ${nextGameDay.slice(5).replace('-', '/')}`} /> : null}
      <HotNumbers sport="nfl" theme={C} numFont={NUM_FONT} accent={C.green} eventWord="TDs" />
      <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.65, maxWidth: 860, marginBottom: 12 }}>
        <b style={{ color: C.text }}>One page: the next game day&apos;s numbers, the hot numbers, the alignments and the lanes.</b>{' '}
        Five numbers a player carries -- the <b style={{ color: C.text }}>touchdowns he&apos;s sitting on</b>, his{' '}
        <b style={{ color: C.text }}>next touchdown</b>, <b style={{ color: C.text }}>jersey</b>,{' '}
        <b style={{ color: C.text }}>birth day</b> and <b style={{ color: C.text }}>life path</b> -- each added down to one
        digit (17 → 8). Pattern watching, not evidence: {rows.length} players over nine roots put ~{Math.round(expected)} in
        every club by arithmetic alone, so read the <b style={{ color: C.text2 }}>×</b> against that. MLB tested this method
        on 4,238 player-nights and found nothing significant. Nothing here feeds any score, board or call.
      </div>
      {zeroTdCount > 0 && (
        <div style={{
          border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.text3}`,
          background: C.bg2, borderRadius: 8, padding: '7px 11px', marginBottom: 12,
          fontSize: TYPE.micro, color: C.text3, lineHeight: 1.6, maxWidth: 860,
        }}>
          <b style={{ color: C.text2 }}>Root 1 is crowded for a boring reason.</b>{' '}
          {zeroTdCount} players haven&apos;t scored yet, so each sits on 0 and his next touchdown is #1 --
          the calendar, not a cluster. It thins out as the season goes.
        </div>
      )}
        </>
      )}
    >
      <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 4, lineHeight: 1.6, maxWidth: 760 }}>
        No batting-order or fielding-position axis -- football has no honest equivalent to either, so they&apos;re left
        out rather than faked. Season TD only counts completed weeks, so a player&apos;s count here always describes
        games already played.
      </div>
      {/* WHICH LANES RUN HOT (numerology v2 step 6), at the bottom. */}
      <LaneTable sport="nfl" theme={C} numFont={NUM_FONT} accent={C.green} tonight={laneTonight} />
    </AlignmentsView>
  )
}
