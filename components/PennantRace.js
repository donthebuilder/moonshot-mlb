'use client'

// ── ONE PANEL, EVERY LEAGUE (2026-10-13) ────────────────────────────────────
// Donovan: "we need model predictions for the championship just like the MLB did." This
// is that panel for all four sports. `sport` picks the words, columns and accent from
// lib/championship.js (CHAMPIONSHIP) and lib/sportAccent.js; the file it reads is
// championshipPaths(sport). MLB's output is unchanged (its config reproduces the
// table, the live-standings merge and the footer it always had). The other three
// hide until their file exists (components/ChampionshipFold.js) and have no live-standings feed
// yet, so their "Now" column appears only when the bot's own `race` snapshot is in the file.
//
// ── 🏆 OCTOBER, FROM TONIGHT'S STANDINGS ────────────────────────────────────
//
// Donovan asked for a playoff predictor and a World Series champion. They are
// one machine (bots/playoff_odds.py simulates the rest of the season ten
// thousand times and runs the bracket each run), so they are one panel.
//
// WHY IT IS FOLDED ON HOME AND NOT A TAB. "You can get lost on the site very
// easily, especially the MLB side, and I don't want that to happen when NFL
// starts." A new tab costs every visitor a decision forever; a fold costs the
// people who open it. This is a September-to-October curiosity next to a
// product about tonight's home runs, so it lives where the seasonal things
// live and stays shut until asked for. <Fold> does not render its children
// when closed, so a reader who never opens it never fetches this file either.
//
// WHAT IT REFUSES TO DO. It does not print a favourite as a headline, and it
// does not round 3% up to "a real chance". A 16% favourite is the normal shape
// of a baseball October -- the sport's whole character is that the best team
// usually loses -- and a panel that dressed that up would be making the same
// mistake the site spends the rest of its pages avoiding. So the method line
// is always visible, not behind a tooltip, and the numbers are printed at the
// precision they are actually known to.

import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { Empty } from './ui'
import { ShowMoreButton } from './ListPreview'
import { championshipConfig, loadChampionship, sharePct } from '../lib/championship'
import { SPORT_ACCENT } from '../lib/sportAccent'
import DenseTable from './DenseTable'
import TeamMark from './TeamMark'
import { onLiveRefresh } from '../lib/liveRefresh'
import { localTime, localDayTime } from '../lib/localTime'


// ── THE LIVE RACE, NOT LAST NIGHT'S ─────────────────────────────────────────
//
// 2026-09-05, Donovan: "always use the live snapshot of the playoff race
// until everything is locked in." The bot's odds are a nightly file — it
// simulates from the standings at 00:22 UTC and the file sits still until the
// next run. Meanwhile the race moves every night. So the ODDS stay the bot's
// (only the bot can run 10,000 seasons), but the STANDING beside them — the
// record, the seed, games back, and whether the league has already stamped
// the team clinched or eliminated — is read live from the same statsapi feed
// the live slate already pulls, straight from the browser, on every open.
//
// And the lock rule: a team the league marks clinched is 100% to make the
// field whatever the simulation printed, and a team marked eliminated from
// both the division and the wild card is 0. The sim is allowed to disagree
// with the standings page about the future, never about the present.
const STANDINGS_FIELDS = 'records,division,id,league,teamRecords,team,id,name,abbreviation,wins,losses,clinchIndicator,divisionRank,wildCardRank,gamesBack,wildCardGamesBack,eliminationNumber,wildCardEliminationNumber,streak,streakCode'

async function fetchLiveStandings(season) {
  const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team&fields=${STANDINGS_FIELDS}`
  const r = await fetch(url, { cache: 'no-store' })
  if (!r.ok) throw new Error(`standings ${r.status}`)
  const j = await r.json()
  const out = new Map()
  for (const rec of j?.records || []) {
    for (const tr of rec?.teamRecords || []) {
      const id = Number(tr?.team?.id)
      if (!id) continue
      const clinch = String(tr.clinchIndicator || '')
      const divE = String(tr.eliminationNumber || '') === 'E'
      const wcE = String(tr.wildCardEliminationNumber || '') === 'E'
      out.set(id, {
        abbr: String(tr?.team?.abbreviation || ''),
        name: String(tr?.team?.name || ''),
        wins: Number(tr.wins) || 0,
        losses: Number(tr.losses) || 0,
        clinch,                    // '', 'w' wild card, 'x' berth, 'y' division, 'z' best record
        eliminated: divE && wcE,
        divisionRank: Number(tr.divisionRank) || 0,
        wildCardRank: Number(tr.wildCardRank) || 0,
        gamesBack: String(tr.gamesBack || '-'),
        wildCardGamesBack: String(tr.wildCardGamesBack || '-'),
        streak: String(tr?.streak?.streakCode || ''),
      })
    }
  }
  return out
}

const CLINCH_WORD = { w: 'clinched wild card', x: 'clinched a berth', y: 'clinched division', z: 'clinched best record' }

/** Where a team stands tonight, in the fewest words that are still true. */
function raceWord(r) {
  if (!r) return ''
  if (r.eliminated) return 'out'
  if (r.seed) return `#${r.seed}`   // the bot's snapshot for leagues with no live feed here
  if (r.divisionRank === 1) return 'leads div'
  if (r.wildCardRank >= 1 && r.wildCardRank <= 3) return `WC ${r.wildCardRank}`
  const gb = r.wildCardGamesBack && r.wildCardGamesBack !== '-' ? r.wildCardGamesBack : r.gamesBack
  return gb && gb !== '-' ? `${gb} back` : ''
}

// share formatting lives in lib/championship.js (sharePct): "<1%" below one percent, ">99%" below a lock, never rounded up
const pct = sharePct

const tone = (v, accent) => {
  const n = Number(v) || 0
  if (n >= 0.15) return accent
  if (n >= 0.06) return C.yellow
  if (n >= 0.01) return C.text2
  return C.text3
}

// Scaled to the FIELD'S favourite, not a fixed 25%: a 30% favourite used to
// clip at full width and read the same as a 25% one. The leader fills the
// bar; everyone else is a fraction of him.

export default function PennantRace({ sport = 'mlb' }) {
  const cfg = championshipConfig(sport)
  const accent = SPORT_ACCENT[sport] || SPORT_ACCENT.mlb   // C.orange for MOONSHOT: the tones below are what they were
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [live, setLive] = useState(null)   // Map(team_id → tonight's standing), or null if unreachable
  const [liveAt, setLiveAt] = useState(null)
  const [allOpen, setAllOpen] = useState(false)   // the rows past the preview (DenseTable's own "more" is not drawn on a bare sheet)

  useEffect(() => {
    let alive = true
    if (!cfg.liveStandings) return undefined
    const season = Number(data?.season) || new Date().getFullYear()
    const pull = () => fetchLiveStandings(season)
      .then((m) => { if (alive && m.size) { setLive(m); setLiveAt(new Date()) } })
      .catch(() => {})
    pull()
    // Standings only change when games end; five minutes is plenty and it is
    // the same "not while hidden" guard every live surface on Home uses.
    const t = onLiveRefresh(pull)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    return () => { alive = false; t() }
  }, [data?.season, cfg.liveStandings])

  useEffect(() => {
    let alive = true
    loadChampionship(sport)
      .then((r) => {
        if (!alive) return
        if (r.ok) { setData(r); setState('ok') }
        else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [sport])


  // Merge: the bot's odds, tonight's standing. The payload's own `race` field
  // (bot-side snapshot, same shape) is the fallback when the browser cannot
  // reach statsapi, so the lock rule still holds offline.
  const teams = [...(data?.teams || [])].map((t) => {
    const lv = live?.get(Number(t.team_id)) || null
    const race = lv || (t.race ? {
      clinch: t.race.clinch || '', eliminated: !!t.race.eliminated,
      divisionRank: t.race.division_rank || 0, wildCardRank: t.race.wild_card_rank || 0,
      gamesBack: t.race.games_back || '-', wildCardGamesBack: t.race.wild_card_games_back || '-',
      seed: t.race.seed || 0,
    } : null)
    const locked = race?.clinch ? 'in' : race?.eliminated ? 'out' : ''
    return {
      ...t,
      abbr: t.abbr || lv?.abbr || t.name || String(t.team_id),
      wins: lv ? lv.wins : t.wins,
      losses: lv ? lv.losses : t.losses,
      race,
      locked,
      make_playoffs: locked === 'in' ? 1 : locked === 'out' ? 0 : t.make_playoffs,
      win_division: race?.clinch === 'y' || race?.clinch === 'z' ? 1 : t.win_division,
    }
  })
  // The order the table always had: Series, playoff odds as the tie-break.
  const CH = cfg.champion
  const teamsSorted = [...teams].sort((a, b) => (Number(b[CH]) - Number(a[CH])) || (Number(b.make_playoffs) - Number(a.make_playoffs)))

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Simulating…</div>
  if (state === 'empty' || !data) {
    return cfg.empty ? <Empty text={cfg.empty} /> : null
  }

  const shown = teamsSorted.filter((t) => t.make_playoffs > 0.005 || t.locked === 'in').slice(0, cfg.shownMax)
  const leftOut = teams.length - shown.length
  const rowsShown = allOpen ? shown : shown.slice(0, cfg.previewRows)
  const restN = shown.length - rowsShown.length
  const clinchedN = teams.filter((t) => t.locked === 'in').length
  const fieldLocked = clinchedN >= cfg.fieldSize
  const topWs = Math.max(0.05, ...teams.map((t) => Number(t[CH]) || 0))
  // the "Now" column needs something true to say: the live feed (MLB) or the bot's own snapshot
  const showNow = cfg.liveStandings || teams.some((t) => t.race)

  return (
    <div>
      {/* A SCROLLER, NOT A CLIP. MobileCSS sets body { overflow-x: clip }, which
          means a table wider than the phone does not scroll -- its right-hand
          columns are simply cut off with no way to reach them. Every other wide
          table on the site (BoxTable, DenseTable) wraps itself for exactly this
          reason and these three new ones did not, which was mine to fix before
          anybody opened the fold on a phone.

          The wrapper is the safety net. The real fix is the `sm-hide` classes
          below: at phone width the columns that only matter when you are
          comparing teams closely are dropped, so the common case needs no
          sideways scrolling at all. */}
      {/* THE SHARED SHEET (2026-10-01, BATCH-TABLE-SKIN-V2 4b; Donovan: "convert
          them all to the new sortable sheet"). Was a hand-rolled <table> on
          SortTh. Same columns, same Series-first order, every header sorts. */}
      <DenseTable bare noGroups accent={cfg.tableAccent ? accent : null}
        rows={rowsShown.map((t, i) => ({ ...t, _key: t.team_id, rank: i + 1, wlN: Number(t.wins) - Number(t.losses), nowN: t.race?.seed ? t.race.seed : (t.race?.divisionRank || 9) * 10 + (t.race?.wildCardRank || 9) }))}
        columns={[
          { key: 'rank', label: '#', group: 'Team', heat: false, w: 26 },
          { key: 'abbr', label: 'Team', group: 'Team', heat: false, sticky: true, w: 120, fmt: (v, t) => (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <TeamMark sport={cfg.teamMark} abbr={v} variant="logo" px={16} /><b>{v || t.name || t.team_id}</b>
              <span style={{ fontSize: cfg.tagPx, color: C.text3 }}>{t.division}</span>
            </span>) },
          { key: 'wlN', label: 'W-L', group: 'Team', w: cfg.recordW, fmt: (_, t) => [t.wins, t.losses, t.otl ?? (t.ties > 0 ? t.ties : null)].filter((x) => x != null).join('-') /* NHL's OT losses always; NFL's ties only when there are some */ },
          ...(showNow ? [{ key: 'nowN', label: 'Now', group: 'Now', heat: false, numeric: false, w: 86, fmt: (_, t) => (
            <span title={t.race?.clinch ? CLINCH_WORD[t.race.clinch] || 'clinched' : t.race?.eliminated ? 'Eliminated' : (t.race && cfg.liveStandings ? `${t.race.gamesBack} GB in the division, ${t.race.wildCardGamesBack} in the wild card` : undefined)}
              style={{ color: t.locked === 'in' ? C.green : t.locked === 'out' ? C.text3 : C.text2 }}>
              {t.locked === 'in' ? `✓ ${t.race.clinch === 'y' || t.race.clinch === 'z' ? 'div' : t.race.clinch === 'w' ? 'WC' : 'in'}`
                : t.locked === 'out' ? '✗ out' : raceWord(t.race) || '—'}
              {t.race?.streak && t.locked !== 'out' ? <span style={{ color: C.text3, marginLeft: 5 }}>{t.race.streak}</span> : null}
            </span>) }] : []),
          { key: 'proj_wins', label: 'Proj', group: 'Odds', w: 44, dp: 0, title: 'Average wins across every simulated season' },
          { key: 'make_playoffs', label: 'Playoffs', group: 'Odds', w: 62, fmt: (v) => pct(v), tone: (n) => ({ color: tone(n, accent) }) },
          ...cfg.cols.map((c) => ({ key: c.field, label: c.label, group: 'Odds', w: 62, title: c.title, fmt: (v) => pct(v) })),
          { key: CH, label: cfg.championLabel, group: 'Odds', w: 76, primary: true, bar: 'primary', domain: [0, topWs], title: cfg.championTitle, fmt: (v) => pct(v), tone: (n) => ({ color: tone(n, accent), weight: 800 }) },
        ]}
        initialSort={{ key: CH, dir: 'desc' }} heatMode="sorted" maxHeight={9999} maxRows={cfg.shownMax}
        caption={`${cfg.captionWords} odds by team, from ${Number(data.sims).toLocaleString()} simulations`} />
      <ShowMoreButton open={allOpen} restN={restN} toggle={() => setAllOpen((v) => !v)} itemWord="teams" />
      <p style={{ fontSize: cfg.notePx, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {fieldLocked
          ? <b style={{ color: C.green }}>The field is locked — all {cfg.fieldWord} spots are clinched. Odds below are the bracket only. </b>
          : cfg.liveStandings
            ? (live
              ? `Standings are live (${liveAt ? localTime(liveAt) : 'now'}); ${clinchedN} of ${cfg.fieldSize} spots clinched. `
              : 'Standings are from the last update — live standings unreachable right now. ')
            : [
              data.asOf && localDayTime(data.asOf) ? `Simulated ${localDayTime(data.asOf)}. ` : '',
              clinchedN > 0 ? `${clinchedN} of ${cfg.fieldSize} spots clinched. ` : '',
            ].join('')}
        {leftOut > 0 ? `${leftOut} teams with no realistic path are not listed. ` : ''}
        {data.method}
        {data.note ? ` ${data.note}` : ''}
      </p>
      {cfg.reality ? (
        <p style={{ fontSize: cfg.notePx, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
          {cfg.reality}
        </p>
      ) : null}
    </div>
  )
}
