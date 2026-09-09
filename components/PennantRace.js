'use client'

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
import { fetchJSON } from '../lib/data'
import { playoffOddsPaths } from '../lib/dataSource'
import { Empty } from './ui'
import { useSort } from '../lib/useSort'
import SortTh from './SortTh'

const PR_SORT = { key: 'win_world_series', dir: 'desc' }
const PR_GET = { wl: (t) => Number(t.wins) - Number(t.losses), now: (t) => (t.race?.divisionRank || 9) * 10 + (t.race?.wildCardRank || 9) }
const PR_OPTS = { text: new Set(['abbr']) }

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
  if (r.divisionRank === 1) return 'leads div'
  if (r.wildCardRank >= 1 && r.wildCardRank <= 3) return `WC ${r.wildCardRank}`
  const gb = r.wildCardGamesBack && r.wildCardGamesBack !== '-' ? r.wildCardGamesBack : r.gamesBack
  return gb && gb !== '-' ? `${gb} back` : ''
}

const pct = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n <= 0) return '—'
  // Below 1% the difference between 0.4% and 0.9% is noise at 10,000 sims, so
  // it says "<1%" rather than inventing a decimal it cannot support.
  if (n < 0.01) return '<1%'
  return `${Math.round(n * 100)}%`
}

const tone = (v) => {
  const n = Number(v) || 0
  if (n >= 0.15) return C.orange
  if (n >= 0.06) return C.yellow
  if (n >= 0.01) return C.text2
  return C.text3
}

// Scaled to the FIELD'S favourite, not a fixed 25%: a 30% favourite used to
// clip at full width and read the same as a 25% one. The leader fills the
// bar; everyone else is a fraction of him.
function Bar({ v, color, top = 0.25 }) {
  const scale = Math.max(Number(top) || 0, 0.05)
  const w = Math.max(2, Math.min(100, Math.round((Number(v) || 0) / scale * 100 * 100) / 100))
  return (
    <i style={{
      display: 'block', height: 3, marginTop: 3, borderRadius: 2,
      width: `${w}%`, background: color, opacity: .55,
    }} />
  )
}

export default function PennantRace() {
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')
  const [live, setLive] = useState(null)   // Map(team_id → tonight's standing), or null if unreachable
  const [liveAt, setLiveAt] = useState(null)

  useEffect(() => {
    let alive = true
    const season = Number(data?.season) || new Date().getFullYear()
    const pull = () => fetchLiveStandings(season)
      .then((m) => { if (alive && m.size) { setLive(m); setLiveAt(new Date()) } })
      .catch(() => {})
    pull()
    // Standings only change when games end; five minutes is plenty and it is
    // the same "not while hidden" guard every live surface on Home uses.
    const t = setInterval(() => { if (!document.hidden) pull() }, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [data?.season])

  useEffect(() => {
    let alive = true
    fetchJSON(playoffOddsPaths())
      .then((j) => {
        if (!alive) return
        if (j && Array.isArray(j.teams) && j.teams.length) { setData(j); setState('ok') }
        else setState('empty')
      })
      .catch(() => { if (alive) setState('empty') })
    return () => { alive = false }
  }, [])


  // Merge: the bot's odds, tonight's standing. The payload's own `race` field
  // (bot-side snapshot, same shape) is the fallback when the browser cannot
  // reach statsapi, so the lock rule still holds offline.
  const teams = [...(data?.teams || [])].map((t) => {
    const lv = live?.get(Number(t.team_id)) || null
    const race = lv || (t.race ? {
      clinch: t.race.clinch || '', eliminated: !!t.race.eliminated,
      divisionRank: t.race.division_rank || 0, wildCardRank: t.race.wild_card_rank || 0,
      gamesBack: t.race.games_back || '-', wildCardGamesBack: t.race.wild_card_games_back || '-',
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
  // Header clicks sort (lib/useSort.js); the default is the Series column,
  // playoff odds as the tie-break -- the order the table always had.
  const { sorted: teamsSorted, thProps } = useSort(teams, PR_SORT, PR_GET, PR_OPTS)

  if (state === 'loading') return <div style={{ fontSize: 11, color: C.text3, padding: '6px 2px' }}>Simulating…</div>
  if (state === 'empty' || !data) {
    return <Empty text="No playoff odds published yet — the bot writes this on its next run." />
  }

  const shown = teamsSorted.filter((t) => t.make_playoffs > 0.005 || t.locked === 'in').slice(0, 16)
  const leftOut = teams.length - shown.length
  const clinchedN = teams.filter((t) => t.locked === 'in').length
  const fieldLocked = clinchedN >= 12
  const topWs = Math.max(0.05, ...teams.map((t) => Number(t.win_world_series) || 0))

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
      <div className="pr-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: NUM_FONT, minWidth: 340 }}>
        <caption className="sr-only">
          Playoff, pennant and World Series odds by team, from {Number(data.sims).toLocaleString()} simulations
        </caption>
        <thead>
          <tr>
            {[['', 'left', '', null], ['Team', 'left', '', 'abbr'], ['W-L', 'right', 'sm-hide', 'wl'], ['Now', 'left', '', null], ['Proj', 'right', 'sm-hide', 'proj_wins'],
              ['Playoffs', 'right', '', 'make_playoffs'], ['Division', 'right', 'sm-hide', 'win_division'], ['Pennant', 'right', 'sm-hide', 'win_league'], ['Series', 'right', '', 'win_world_series']]
              .map(([label, align, cls, key], i) => (
                <SortTh key={label + i} label={label} align={align} className={cls || undefined} {...(key ? thProps(key) : {})} />
              ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <tr key={t.team_id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '5px 6px', fontSize: 9.5, color: C.text3, width: 18 }}>{i + 1}</td>
              <td style={{ padding: '5px 6px', minWidth: 0 }}>
                <b style={{ fontSize: 11.5, color: C.text }}>{t.abbr || t.name || t.team_id}</b>
                <span className="sm-hide" style={{ fontSize: 9, color: C.text3, marginLeft: 6 }}>{t.division}</span>
              </td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2, whiteSpace: 'nowrap' }}>
                {t.wins}-{t.losses}
              </td>
              {/* NOW — tonight's standing, live. Clinched and eliminated are
                  the league's own stamps, not the model's. */}
              <td style={{ padding: '5px 6px', fontSize: 9.5, whiteSpace: 'nowrap',
                           color: t.locked === 'in' ? C.green : t.locked === 'out' ? C.text3 : C.text2 }}
                  title={t.race?.clinch ? CLINCH_WORD[t.race.clinch] || 'clinched' : t.race?.eliminated ? 'Eliminated' : (t.race ? `${t.race.gamesBack} GB in the division, ${t.race.wildCardGamesBack} in the wild card` : undefined)}>
                {t.locked === 'in' ? `✓ ${t.race.clinch === 'y' || t.race.clinch === 'z' ? 'div' : t.race.clinch === 'w' ? 'WC' : 'in'}`
                  : t.locked === 'out' ? '✗ out'
                    : raceWord(t.race) || '—'}
                {t.race?.streak && t.locked !== 'out' ? <span style={{ color: C.text3, marginLeft: 5 }}>{t.race.streak}</span> : null}
              </td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text3 }}
                  title="Average wins across every simulated season">
                {Number(t.proj_wins).toFixed(0)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11, color: tone(t.make_playoffs) }}>
                {pct(t.make_playoffs)}
              </td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>
                {pct(t.win_division)}
              </td>
              <td className="sm-hide" style={{ padding: '5px 6px', textAlign: 'right', fontSize: 10.5, color: C.text2 }}>
                {pct(t.win_league)}
              </td>
              <td style={{ padding: '5px 6px', textAlign: 'right', fontSize: 11.5, fontWeight: 800, color: tone(t.win_world_series), minWidth: 54 }}>
                {pct(t.win_world_series)}
                <Bar v={t.win_world_series} color={tone(t.win_world_series)} top={topWs} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '9px 2px 0', maxWidth: 720 }}>
        {fieldLocked
          ? <b style={{ color: C.green }}>The field is locked — all twelve spots are clinched. Odds below are the bracket only. </b>
          : live
            ? `Standings are live (${liveAt ? liveAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now'}); ${clinchedN} of 12 spots clinched. `
            : 'Standings are from the bot\u2019s last run — live feed unreachable right now. '}
        {leftOut > 0 ? `${leftOut} teams with no realistic path are not listed. ` : ''}
        {data.method}
        {data.note ? ` ${data.note}` : ''}
      </p>
      <p style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.55, margin: '6px 2px 0', maxWidth: 720 }}>
        A 15–20% favourite is what a real baseball October looks like. The best team
        usually does not win it — that is the sport, not a weakness in the number.
      </p>
    </div>
  )
}
