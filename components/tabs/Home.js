'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { logUrl, dataUrl } from '../../lib/dataSource'
import { nameOf, teamOf, oppOf, clean, n, obj, hrScore, hitScore, dateText } from '../../lib/player'
import { groupGames } from '../../lib/data'
import { fetchPenFatigue, penTier } from '../../lib/bullpen'
import { teamAbbrs } from '../../lib/gamelogs'
import Storylines from '../Storylines'
import ScoreRail from '../ScoreRail'
import HomerLedger from '../HomerLedger'
import ReadTeaser from '../ReadTeaser'
import { airParts } from '../../lib/conditions'
import { useSetupHomers, backToBack } from '../../lib/b2b'
import { rankArms } from '../../lib/armLeak'
import { slateProjHr } from '../ProjectedOutput'
import { getPicks, CONVICTION } from '../../lib/myPicks'
import { btnStyle } from '../ui'
import Scoreboard from './Scoreboard'
import Boxes from './Boxes'

// HOME — the front porch.
//
// The site used to open on the Scoreboard, 268 rows deep, every column lit.
// Great once you know the house; a wall of stats if you just walked in.
// This tab is the answer to "make the first page welcoming — something good,
// living and breathing": a greeting that knows what time it is, tonight in
// four numbers, the one game worth circling, the bot's own graded record,
// and three doors into the rest of the site. Everything on this page is
// either in the slate payload, the live results file, or the bot's published
// today.txt — nothing invented, and every missing piece says so out loud.
//
// ── FLOW PASS (2026-08-16, Donovan: "lots of the pages seems all over the
// palace or scrroll up to scoll back down" / things should "flow beetter") ──
//
// What was wrong: this page was a stack of eight equal-weight sections with no
// lead. The hero said "the best air is Coors, +14%" and then five hundred
// pixels later a row of three tiles said the same thing again — read the top,
// scroll down, scroll back up to check you'd read it right. The four-tile row
// (GAMES / PROJECTED HR / FIRST PITCH / BOT RECORD) sat between the hero and
// the headline game, so the one thing worth circling tonight was below the
// fold. And the onboarding card rendered on EVERY visit until it was manually
// dismissed, which put a "New here?" panel between the owner and his own data
// every single evening.
//
// What it is now, top to bottom, in descending weight:
//   1. the rail          scores, always. You came to check them.
//   2. THE HERO          the lead: tonight in ONE sentence that swallowed the
//                        entire tile row — games, confirmed lineups, first
//                        pitch, both projections, the power grade, the best
//                        air with its clause, and the bot's graded record.
//   3. the headliner     the game the hero's last clause just named, so the
//                        sentence and its subject sit together.
//   4. the call of the   the lead of The Read — the bot's single most convinced
//      night             pick, in sentences, with a door to the full essay.
//   5. your night        your own calls, when you made any.
//   6. tonight's angles  the narrative lines, air now among them (the tile
//                        row folded into the first one).
//   7. storylines        the full ledger the angles are cherry-picked from.
//   8. the top tens      names, ranked.
//   9. the arms          who they get to attack — read WITH the top tens,
//                        which is why it now sits directly under them.
//  10. the doors         where to go next, onboarding included.
//
// TILES → SENTENCES. Two tile rows died here (the four stat tiles, the three
// best-air tiles). Not one number, caption or tooltip left with them: every
// figure is in the prose, and the hover text that hung off each tile now hangs
// off the number itself. lib/conditions.js speaks the weather/park clause so
// this page is not the fifth surface with its own chip strip.

const greeting = (h) => {
  if (h >= 5 && h < 12) return ['Good morning', '☀️']
  if (h >= 12 && h < 17) return ['Good afternoon', '⚾']
  if (h >= 17 && h < 22) return ['Good evening', '🌆']
  return ['Burning the midnight oil', '🌙']
}

// One line that changes every few seconds — the "living" part. All computed
// from data already on the page; lines that can't be computed simply don't
// enter the rotation.
function useRotating(lines, ms = 6500) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const id = setInterval(() => setI((x) => (x + 1) % lines.length), ms)
    return () => clearInterval(id)
  }, [lines.length, ms])
  return lines.length ? lines[i % lines.length] : null
}

// StatCell (the four-tile row) was deleted in the 2026-08-16 flow pass — see
// the header note. Its four labels, four values, four sub-lines and their
// hover text all live in the hero sentence now. `Fig` is what replaced it: a
// number inside a sentence, still monospaced, still carrying its own tooltip.
function Fig({ children, col = C.text, title }) {
  return (
    <b title={title} style={{ color: col, fontFamily: NUM_FONT, cursor: title ? 'help' : 'inherit' }}>{children}</b>
  )
}

// ── TAB CONSOLIDATION (2026-08-16, owner-approved plan) ─────────────────────
//
// The rule the plan runs on: a TAB is a question you arrive with; a VIEW is an
// answer you switch between once you're there. Home, the Scoreboard and the
// box scores all answer the same question — "what's happening right now" — so
// they are now ONE tab with three views: Tonight (everything this file always
// rendered, untouched), The board (the Scoreboard component, mounted as-is)
// and Box scores (the Boxes component, mounted as-is). Same idiom as the
// VIEWS pill row on the Bot tab, kept quiet — a bare pill row, not another
// bordered box, per the Apple-Sports direction for live surfaces.
//
// ROUTING LANDS SEPARATELY. The tab bar and the #tab= deep links are being
// rewired in Dashboard.js by the session owner; this file only makes Home
// CAPABLE of hosting the three views. That ordering is why every new prop
// below defaults to null/'tonight': the current Dashboard mount passes none
// of them, and Home must render exactly as it did yesterday until the wiring
// arrives. `initial` exists so the old deep links (#tab=scoreboard,
// #tab=boxes) can open Home on the right view once routing maps them here,
// and it beats the remembered view because a link the user just clicked is a
// stronger signal than what he looked at last time.
const HOME_VIEWS = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'board', label: 'The board' },
  { key: 'boxes', label: 'Box scores' },
]
const HOME_VIEW_KEYS = new Set(HOME_VIEWS.map((v) => v.key))

export default function Home({
  players = [], results, backtest, mode = 'today', slateDate = '', dateLabel = '',
  onNavigate, onPlayerClick,
  // tab-consolidation props (2026-08-16) — every one optional so the current
  // Dashboard mount, which predates the rewiring, keeps rendering untouched.
  // filteredPlayers: the globally-FILTERED list The board runs on; Home's own
  // `players` is allPlayers. Falls back to `players` until Dashboard passes both.
  odds = null, onWatch = null, watchIds = null, filteredPlayers = null,
  initial = 'tonight',
}) {
  // Which view is showing. Server and first client paint always agree on
  // 'tonight'; the effect then applies, in order of authority: an explicit
  // non-default `initial` (a deep link — the user just asked for that view),
  // else this device's remembered choice. Storage reads/writes are wrapped
  // because private mode without localStorage must not take the page down.
  const [view, setView] = useState('tonight')
  useEffect(() => {
    if (initial !== 'tonight' && HOME_VIEW_KEYS.has(initial)) { setView(initial); return }
    try {
      const saved = localStorage.getItem('home_view')
      if (saved && HOME_VIEW_KEYS.has(saved)) setView(saved)
    } catch { /* no storage: open on Tonight */ }
  }, [initial])
  const pickView = (k) => {
    setView(k)
    try { localStorage.setItem('home_view', k) } catch { /* not remembered, still shown */ }
  }

  // ── "New here?" — SHOWN ON THE FIRST VISIT, NOT EVERY VISIT (2026-08-16) ──
  //
  // It used to render until you clicked "Got it, hide this", which meant a
  // returning visitor — the owner, every night — opened his own front page on
  // an onboarding card. The default is now the returning-visitor default: this
  // device has been here before, so the card stays shut and a one-line reopen
  // sits down in the doors block, where "where do I go next" questions belong.
  //
  // Storage is device-local and entirely optional: `home_seen` is stamped on
  // the first render, `home_start_done` is the explicit dismissal that still
  // works. If localStorage throws (private mode, storage disabled) we keep the
  // card SHUT rather than open — an unrememberable dismissal that reappears
  // forever is the exact bug being fixed, and the reopen line means nothing is
  // out of reach. Both reads happen in an effect, never during render, so the
  // server and the first client paint agree.
  const [startOpen, setStartOpen] = useState(false)
  useEffect(() => {
    try {
      const done = localStorage.getItem('home_start_done') === '1'
      const seen = localStorage.getItem('home_seen') === '1'
      if (!done && !seen) setStartOpen(true)
      localStorage.setItem('home_seen', '1')
    } catch { /* no storage: stay shut, the reopen line is always there */ }
  }, [])
  const dismissStart = () => {
    setStartOpen(false)
    try { localStorage.setItem('home_start_done', '1') } catch {}
  }
  const reopenStart = () => {
    setStartOpen(true)
    try { localStorage.removeItem('home_start_done') } catch {}
  }

  const [hour, setHour] = useState(null) // effect-set so server/client agree
  useEffect(() => {
    setHour(new Date().getHours())
    const id = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => clearInterval(id)
  }, [])
  const [hello, icon] = greeting(hour ?? 18)

  // ── projected HR, from the bot's own published sheet (today.txt) ──
  const [proj, setProj] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${logUrl(mode)}?ts=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!alive || !text) return
        const range = text.match(/projected\s+HRs?\s*[:\s]\s*(\d+)\s*[–—-]\s*(\d+)/i)
        const grade = text.match(/power\s+grade\s*[:\s]\s*([A-Za-z ]+)/i)
        if (range) setProj({ low: Number(range[1]), high: Number(range[2]), grade: (grade?.[1] || '').trim() })
      })
      .catch(() => {})
    return () => { alive = false }
  }, [mode])

  const games = useMemo(() => groupGames(players), [players])
  const modelHr = useMemo(() => slateProjHr(players), [players])
  const isLive = results?.live_mode === true

  // First pitch: the earliest game that hasn't started yet, else the earliest.
  const firstPitch = useMemo(() => {
    const now = Date.now()
    const times = games.map((g) => new Date(g.game_time || 0).getTime()).filter((t) => t > 0)
    if (!times.length) return null
    const upcoming = times.filter((t) => t > now).sort((a, b) => a - b)
    return new Date(upcoming[0] ?? Math.min(...times))
  }, [games])

  // THE headline game — the one whose three best power bats sum highest.
  // Same slate scores the boards run on; this is a ranking, not a projection.
  const headline = useMemo(() => {
    let best = null
    games.forEach((g) => {
      const sorted = [...(g.players || [])].sort((a, b) => hrScore(b) - hrScore(a))
      const heat = sorted.slice(0, 3).reduce((s, p) => s + hrScore(p), 0)
      if (!best || heat > best.heat) best = { g, heat, bats: sorted.slice(0, 2) }
    })
    return best
  }, [games])

  // ── STORYLINES, cherry-picked (2026-08-08, "turn it up, maybe some
  // storyline"). Three hero lines, each from a source that already exists:
  //   🔁 back-to-back watch — pure slate field (games_since_last_hr === 0)
  //   🧱 tonight's fence rider — current/fence_board.json, slate-filtered
  //   🚪 pen door — yesterday's reliever workload (lib/bullpen)
  // Lines that can't be computed don't render; nothing here is invented.
  // BACK-TO-BACK, VERIFIED (2026-08-09). This line was reading
  // `games_since_last_hr === 0` raw — the exact bug that was reported and
  // fixed in the Storylines panel, still live on the front page, still telling
  // people a hitter who homered THIS AFTERNOON was chasing an encore. The rule
  // and the proof fetch now live in lib/b2b.js so the two surfaces cannot
  // drift apart again: the setup homer must be proven from a graded file, and
  // without proof the line does not render at all.
  // Fall back to today rather than passing '' — an empty slateDate would make
  // the proof fetch bail and silently hide the line on a normal night.
  const b2bDateKey = slateDate || new Date().toLocaleDateString('en-CA')
  const isTmrwSlate = b2bDateKey > new Date().toLocaleDateString('en-CA')
  const setupHr = useSetupHomers(b2bDateKey)
  const { list: b2b, verified: b2bVerified } = useMemo(
    () => backToBack(players, setupHr, hrScore), [players, setupHr],
  )

  const [fence, setFence] = useState(null)
  useEffect(() => {
    let alive = true
    fetch(`${dataUrl('current/fence_board.json')}?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) setFence(j) })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  // DATE GATE (2026-08-09 audit). The fence board publishes `slate_date`
  // (bots/spray_cache.py writes it) and this line never looked at it. So on a
  // tomorrow slate, or any night the spray-cache job didn't run, the rider was
  // taken from whatever board happened to be on the branch — and it looked
  // legitimate, because the only filter was "is he on tonight's slate", which
  // a hitter from yesterday's board usually still is.
  //
  // Same rule the park board already applies to the context pack: the file has
  // to be FOR the slate on screen, or the line doesn't render. A stale rider
  // quietly presented as tonight's is worse than no rider.
  const fenceApplies = !!fence?.slate_date && String(fence.slate_date) === String(b2bDateKey)
  const fenceRider = useMemo(() => {
    if (!fenceApplies || !fence?.rows?.length || !players.length) return null
    const byId = new Map(players.map((p) => [String(p?.player_id ?? p?.id), p]))
    // Same base fit the Fence Riders board leads with (contact vs the wall),
    // minus the per-park wall pull — this is one hero line, not the board.
    const scored = fence.rows
      .filter((r) => byId.has(String(r.player_id)))
      .map((r) => ({
        r, p: byId.get(String(r.player_id)),
        fit: (r.deep_pull_ct || 0) * 3 + (r.fence_ct || 0) * 1.5 + (r.over_ct || 0) + (r.robbed_ct || 0) * 1.5,
      }))
      .sort((a, b) => b.fit - a.fit)
    return scored[0] || null
  }, [fence, players, fenceApplies])

  // Gassed / worked pens among TONIGHT's teams. Yesterday's workload only
  // means anything for today's slate, so tomorrow mode skips the fetch.
  const [pens, setPens] = useState([])
  const penApplies = !slateDate || slateDate <= new Date().toLocaleDateString('en-CA')
  useEffect(() => {
    if (!penApplies || !players.length) { setPens([]); return undefined }
    let alive = true
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([pen, abbrs]) => {
      if (!alive) return
      const tonight = new Set()
      players.forEach((p) => { [teamOf(p), oppOf(p)].forEach((t) => t && tonight.add(String(t).toUpperCase())) })
      const out = []
      Object.entries(pen || {}).forEach(([tid, t]) => {
        const ab = String(abbrs?.[tid] || '').toUpperCase()
        if (!ab || !tonight.has(ab)) return
        const tier = penTier(t)
        if (tier) out.push({ ab, t, tier })
      })
      out.sort((a, b) =>
        ((a.tier.key === 'gassed' ? 0 : 1) - (b.tier.key === 'gassed' ? 0 : 1)) || b.t.pitches - a.t.pitches)
      setPens(out)
    }).catch(() => {})
    return () => { alive = false }
  }, [penApplies, players.length])

  // ── best air, hoisted (2026-08-15 "make the home page better" pass) ──
  // Was computed inline in the strip's own IIFE; the hero's tonight-sentence
  // needs the same answer, so it's one memo now instead of two computations
  // that could drift.
  // 2026-08-16: each entry keeps its source row (`row`) so lib/conditions can
  // speak that game's air — temp, wind and direction, park, humidity, rain,
  // roof — instead of this file growing a sixth private chip strip.
  const airRanked = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk
      if (pk == null || seen.has(pk)) return
      const parkHR = n(p?.park_hr_factor, n(p?.park_dist_factor, 0))
      const temp = n(p?.weather_temp_f, n(p?.temp_f, 0))
      const wind = n(p?.weather_wind_mph, n(p?.wind_mph, 0))
      const wl = clean(p?.wind_direction_label, '')
      const wxEff = n(p?.weather_hr_effect_pct, n(p?.hr_weather_effect_pct, null))
      const windOut = /out/i.test(wl) ? wind : /in\b/i.test(wl) ? -wind : 0
      const edge = (parkHR > 0 ? (parkHR - 1) * 100 : 0)
        + (wxEff != null ? wxEff : windOut + (temp > 0 ? (temp - 70) / 7 : 0))
      seen.set(pk, { row: p, venue: clean(p?.venue_name, ''), matchup: `${teamOf(p)} vs ${oppOf(p)}`, temp, wind, wl, edge })
    })
    return [...seen.values()].filter((g) => g.venue).sort((a, b) => b.edge - a.edge)
  }, [players])

  // ── 🎟 your own night (2026-08-15). The one thing the front page knew
  // nothing about was the person reading it. If he logged calls for this
  // slate on My Picks, the porch says so and points at the scorecard —
  // and if he didn't, the card doesn't exist. Read in an effect, same
  // hydration rule as startOpen above.
  const [mine, setMine] = useState([])
  useEffect(() => {
    try { setMine(Object.values(getPicks(b2bDateKey) || {})) } catch { setMine([]) }
  }, [b2bDateKey])
  const convWord = (k) => (CONVICTION.find(([key]) => key === k)?.[1] || '').toLowerCase()

  // ── 🧱 near-miss watch — the same bar the Scoreboard board sets (drought
  // + genuinely homer-shaped recent contact), reduced to the single
  // strongest case for one Angles line. close >= 3 here, a notch above the
  // board's 2: a hero line should need a better reason than a board row.
  const nearMiss = useMemo(() => {
    let best = null
    players.forEach((p) => {
      const since = n(p?.games_since_last_hr, 0)
      if (since < 2) return
      const d = n(p?.hr_shape_components?.max_distance, 0)
      const e = n(p?.hr_shape_components?.max_ev, 0)
      const w = n(p?.hr_shape_profile?.wall_scraper, 0)
      const close = (d >= 400 ? 3 : d >= 385 ? 2 : d >= 372 ? 1 : 0)
        + w * 2 + (e >= 110 ? 2 : e >= 106 ? 1 : 0)
        + (n(p?.recent_barrel_rate, 0) >= 0.12 ? 1 : 0)
      if (close >= 3 && (!best || close > best.close || (close === best.close && d > best.d))) {
        best = { p, since, d, e, w, close }
      }
    })
    return best
  }, [players])

  // Bot record from the graded backtest file — the number he can quote.
  const record = useMemo(() => {
    const bt = obj(backtest)
    const acc = n(bt.overall_base_hit_accuracy, null)
    const per = bt.per_day
    const days = Array.isArray(per) ? per.length : Object.keys(obj(per)).length
    return acc != null && acc > 0 ? { acc, days } : null
  }, [backtest])

  // ── the rotating pulse line ──
  const confirmed = useMemo(() => players.filter((p) => p?.lineup_confirmed === true).length, [players])
  const weakStars = useMemo(() => players.filter((p) => p?.weak_spot_flag === true).length, [players])
  const picks = useMemo(() => players.filter((p) => String(p?.game_pick_role || '').trim()).length, [players])
  const homersSoFar = (results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []).length
  const lines = useMemo(() => {
    const out = []
    if (isLive && homersSoFar > 0) out.push(`⚡ ${homersSoFar} ball${homersSoFar > 1 ? 's have' : ' has'} already left a yard tonight — the Scoreboard is grading live.`)
    if (picks > 0) out.push(`🎯 The bot designated ${picks} picks on this slate — The Four on the Scoreboard is the headline cut.`)
    if (weakStars > 0) out.push(`★ ${weakStars} hitters sit in a weak lineup spot against tonight's arm — the stars on every board.`)
    if (confirmed > 0 && players.length > 0) out.push(`✓ ${confirmed} of ${players.length} hitters are in confirmed lineups — confirmed picks homer at a meaningfully higher clip.`)
    // "the projection tile has the range" until 2026-08-16 — there is no tile
    // any more, the range is a clause in the sentence right above this line.
    if (proj?.grade) out.push(`💣 The bot calls tonight's power grade "${proj.grade}" — the range is in the line above.`)
    if (record) out.push(`📈 Every pick gets graded in public — ${record.acc.toFixed(1)}% base-hit accuracy across ${record.days} days is the honest number.`)
    return out
  }, [isLive, homersSoFar, picks, weakStars, confirmed, players.length, proj, record])
  const pulse = useRotating(lines)

  const empty = !players.length

  // ── the numbers the four tiles used to hold ──────────────────────────────
  // confirmedGames was the GAMES tile's sub-line; the rest are already memos
  // above. `airLine` is the spoken air for one game, straight out of
  // lib/conditions — the same clause GameStrip, Games and the park board use.
  const confirmedGames = useMemo(() => games.filter((g) => g.lineup_confirmed).length, [games])
  const airLine = (g) => airParts(g?.row).map((x) => x.text).join(', ')
  const airTitle = (g) => airParts(g?.row).map((x) => `${x.text} — ${x.title}`).join('\n')

  // NEW HERE? (2026-08-09, owner: "people want it spoon-fed"). Three things,
  // in order, each one a link to the tab that does it. Dismissible and
  // remembered, because it's onboarding and onboarding that won't go away
  // becomes furniture. Nothing here is data — it's three sentences and three
  // tab jumps, so it renders on an empty slate too.
  const START = [
    { tab: 'scoreboard', n: 1, title: 'See who the model likes', body: 'Scoreboard, top of the list. You don’t need to read a single column to use the order.' },
    { tab: 'games', n: 2, title: 'Look at one game', body: 'Games — the arm, the park, the lineup, and the pick for that matchup.' },
    { tab: 'results', n: 3, title: 'Check if it’s been right', body: 'Results grades every pick against its own job, every night. Read this before trusting anything above it.' },
  ]

  const DOORS = [
    { tab: 'scoreboard', icon: '📊', title: 'The Scoreboard', color: C.orange,
      body: 'Every hitter on the slate, every column, live once first pitch lands. The Four — the bot’s headline picks — sit right on top.' },
    { tab: 'games', icon: '⚾', title: 'Game by game', color: C.cyan,
      body: 'Tonight matchup by matchup: the arm, the park, the lineup, and the designated picks for each game.' },
    { tab: 'results', icon: '✅', title: 'The receipts', color: C.green,
      body: 'Every pick graded against its own job, every night, wins and losses alike. This is why the record above is quotable.' },
  ]

  return (
    <div>
      {/* ── THE VIEW SWITCHER — three answers to "what's happening right
             now": Tonight (this page as it always was), The board (the
             Scoreboard, whole), Box scores (Boxes, whole). Same pill idiom
             as the Bot tab's VIEWS row; deliberately a bare row, no border,
             no panel — it's navigation, not content. See the consolidation
             note above the component for why these live here and why the
             routing that points at them lands in a separate change. ── */}
      {/* ── NO PILL ROW ON THE FRONT PAGE (2026-08-17) ────────────────────────
          Donovan: "the read on the home page is good. i just dont like how the
          home page has tabs aals wtf."
          The landing page carried a second row of navigation directly beneath
          the main tab bar — the same duplication as the double Pair History row
          on Combos. Home is one page now.
          The `view` state and the `initial` prop STAY, because Dashboard routes
          #tab=scoreboard and #tab=boxes through this component; those links
          still land on the right view. The pills are reached from the Boards
          group's existing row instead, so nothing became unreachable and no new
          row was created to replace this one. Only when a deep link put us on a
          sub-view does a single way back appear, below. */}
      {view !== 'tonight' && (
        <div style={{ marginBottom: 12 }}>
          <button onClick={() => pickView('tonight')} style={btnStyle(C.orange, false)}>
            ← Home
          </button>
        </div>
      )}

      {/* The board runs on the globally-filtered list when Dashboard provides
          it; Boxes takes the full slate (allPlayers), same as its old mount.
          Both are mounted unmodified — they carry their own headers, fetches
          and empty states. */}
      {view === 'board' && (
        <Scoreboard
          players={filteredPlayers ?? players} mode={mode} slateDate={slateDate}
          results={results} backtest={backtest} odds={odds}
          onWatch={onWatch} watchIds={watchIds}
          onPlayerClick={onPlayerClick} onNavigate={onNavigate}
        />
      )}
      {view === 'boxes' && (
        <Boxes players={players} watchIds={watchIds} onPlayerClick={onPlayerClick} />
      )}

      {view === 'tonight' && <>
      <style>{`
        @keyframes homePulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes homeFade { from{opacity:0; transform:translateY(3px)} to{opacity:1; transform:none} }
      `}</style>

      {/* 🛰 THE RAIL — every game, always visible, with your picks in it.
          2026-08-15: taken from ESPN's front-page strip and given the one
          column they can't have. Sits ABOVE the hero because a score is what
          you came to check. */}
      <ScoreRail players={players} results={results} onNavigate={onNavigate} />

      {/* ── 🧾 THE HOMER LEDGER, WHERE PEOPLE ACTUALLY ARE (2026-08-16) ───
          Donovan: "the home run ledger [needs to be] somewhere else as well —
          people are saying they dont see it, or 'i wish i would have seen it
          earlier'."

          It has only ever lived on Home's "The board" view, which is a second
          click almost nobody makes while a game is on. That is the whole
          reason for the complaint: not that the panel is bad, that it is one
          view sideways from where everyone is standing. He picked every
          surface offered, so it now sits on all of them and the component is
          the single source — mount it, do not fork it.

          LIVE ONLY here. Before first pitch it has nothing to say and would
          be an empty box on the busiest screen on the site; the ledger's own
          date gate already returns null, and this gate means it does not even
          mount. It appears when the first game starts, which is exactly the
          moment "I wish I'd seen it earlier" is about. */}
      {/* ── THE GATE ABOVE WAS THE BUG, AND ITS COMMENT WAS THE ARGUMENT FOR IT.
          The reasoning was: don't mount an empty box, it appears when the first
          game starts, "which is exactly the moment 'I wish I'd seen it earlier'
          is about". That is backwards. Nobody can discover a feature inside a
          window they must already be watching to see. Donovan asked where this
          thing is THREE separate times, most recently guessing "maybe it will
          show during the slate" — which was correct, and was the problem.
          The ledger owns an honest waiting state now ("no homers yet tonight",
          plus what it will show and when) and still refuses on tomorrow's
          slate, so there is no empty box to protect against. */}
      {/* The ledger no longer leads the page — see the mount after the hero.
          (2026-08-17, Donovan: "it doesnt need to be at the top of the page on
          the home page, the welcome thing needs to.") */}

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: `linear-gradient(150deg, ${C.bg2}, rgba(249,115,22,.07) 60%, rgba(252,211,77,.05))`,
        border: `1px solid ${C.border}`, borderRadius: 18,
        padding: '26px 24px 22px', marginBottom: 14,
      }}>
        {/* the ember glow — decoration, kept behind the text */}
        <div style={{
          position: 'absolute', right: -60, top: -60, width: 240, height: 240, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(249,115,22,.16), transparent 70%)', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 11, color: C.text3, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>
            {dateLabel || (mode === 'today' ? 'Today' : 'Tomorrow')}{slateDate ? ` · ${slateDate}` : ''}
          </span>
          {isLive && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 4,
              fontSize: 9, fontWeight: 900, color: C.green, letterSpacing: '.1em', fontFamily: NUM_FONT,
              border: `1px solid ${C.green}55`, background: `${C.green}14`, borderRadius: 999, padding: '2px 9px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'homePulse 1.6s infinite' }} />
              LIVE
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-.03em', margin: '0 0 6px', lineHeight: 1.15 }}>
          {hello}.{' '}
          <span style={{ background: 'linear-gradient(90deg, #f97316, #FCD34D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {empty ? 'The slate is still cooking.' : isLive ? 'The slate is live.' : 'Tonight’s sheet is ready.'}
          </span>
        </h1>
        {/* TONIGHT IN ONE SENTENCE (2026-08-15, "make the home page better").
            The old body was the same mission statement every single day —
            furniture. This is the slate itself, assembled from the numbers
            already on this page, so the first paragraph is different every
            night because every night is.

            2026-08-16 — IT ATE THE TILE ROW. Four tiles used to sit under this
            paragraph repeating half of it in 22px numerals: GAMES (+ how many
            lineups are confirmed), PROJECTED HR (the model's own figure, the
            bot's range, the power grade), FIRST PITCH (local time) and BOT
            BASE-HIT RECORD (accuracy + graded days). Every one of those facts
            is a clause here now, every tile's sub-line is either spoken or in
            the hover text, and a clause whose field is missing SAYS SO rather
            than disappearing — that was the whole point of the tiles' honest
            "not published yet" sub-lines and it survives the fold. */}
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.75, maxWidth: 720 }}>
          {empty ? (
            'No hitters on the board yet — the bot builds the slate on its morning run. Everything below fills in on its own once the sheet lands; no refresh ritual required.'
          ) : (
            <>
              {isLive && homersSoFar > 0 && <><b style={{ color: C.orange }}>⚡ {homersSoFar} already gone tonight.</b>{' '}</>}
              {/* GAMES tile + its "N with confirmed lineups" sub-line */}
              <Fig col={C.blue} title="Games on tonight's slate.">{games.length} games</Fig>
              {', '}
              <Fig col={confirmedGames === games.length ? C.green : C.text}
                title="Lineups the league has posted. Confirmed picks homer at a meaningfully higher clip than unconfirmed ones — the Scoreboard's pick strip counts down the ones still open.">
                {confirmedGames}
              </Fig>
              {' of them with confirmed lineups'}
              {/* FIRST PITCH tile — value and its "your local time" sub-line */}
              {firstPitch
                ? <>, first pitch{isLive ? ' was' : ''} <Fig col={C.yellow} title="Your local time — the earliest game that hasn't started yet, or the earliest on the slate once they all have.">{firstPitch.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Fig></>
                : <>, and no game times have been published on the slate yet</>}
              {'. '}
              {/* PROJECTED HR tile — the model's own figure to the decimal
                  (Donovan, 2026-08-15: "should show to the decimal not range"),
                  the bot sheet's range as the second opinion, the power grade,
                  and the tile's empty-state sentence when neither published. */}
              {modelHr != null ? (
                <>The site&apos;s own model projects <Fig col={C.orange} title="The site's model, summed over every hitter on the slate — the same figure the header and the projected-output table quote.">{modelHr.toFixed(1)} homers</Fig>
                  {proj ? <> tonight, against the bot&apos;s own sheet at <Fig col={C.orange} title="The range printed on the bot's published sheet (today.txt) — a second opinion, not the site's number.">{proj.low}–{proj.high}</Fig>{proj.grade ? <> and a power grade of <b style={{ color: C.text }}>{proj.grade}</b></> : ''}</> : ' tonight'}.{' '}</>
              ) : proj ? (
                <>The bot&apos;s own sheet projects <Fig col={C.orange} title="From the bot's published sheet (today.txt). The site's own model figure isn't available for this slate.">{proj.low}–{proj.high} homers</Fig>{proj.grade ? <> at a power grade of <b style={{ color: C.text }}>{proj.grade}</b></> : ''}.{' '}</>
              ) : (
                <>No homer projection yet — that clause appears once the bot publishes its sheet.{' '}</>
              )}
              {/* BEST AIR — the number stays, the conditions are now spoken by
                  lib/conditions instead of a chip strip 500px down the page. */}
              {airRanked[0] && (airRanked[0].edge > 0 ? (
                <>The best air is <b style={{ color: C.text }}>{airRanked[0].venue}</b> at{' '}
                  <Fig col={C.orange} title="Park HR factor plus the published weather effect, as a percentage swing on home-run rate — not a chance of anything. The full ladder is on the Power tab.">+{airRanked[0].edge.toFixed(0)}%</Fig>
                  {airLine(airRanked[0]) ? <> — <span title={airTitle(airRanked[0])} style={{ cursor: 'help' }}>{airLine(airRanked[0])}</span></> : ''}.{' '}</>
              ) : (
                <>No park on the slate is playing above neutral once its factor and air are combined — the best of the <Fig>{airRanked.length}</Fig> is <b style={{ color: C.text }}>{airRanked[0].venue}</b> at <Fig col={C.text3}>{airRanked[0].edge.toFixed(0)}%</Fig>.{' '}</>
              ))}
              {headline && <>The game to circle is <Fig>{clean(headline.g.away, '?')} @ {clean(headline.g.home, '?')}</Fig>, immediately below.{' '}</>}
              {/* BOT BASE-HIT RECORD tile — the quotable number and its
                  denominator, or the tile's honest "not published" line. */}
              {record ? (
                <>The bot grades every pick in public: <Fig col={C.green} title="Base-hit accuracy across every graded pick in the archive — a measured rate, not a projection.">{record.acc.toFixed(1)}%</Fig> base-hit accuracy over <Fig col={C.green}>{record.days}</Fig> graded days, receipts at the foot of this page.</>
              ) : (
                <>The bot grades every pick in public, but the grading archive hasn&apos;t published a base-hit accuracy yet — the receipts door at the foot of this page still has every graded night.</>
              )}
            </>
          )}
        </div>
        {/* the living line — rotates through real facts about tonight */}
        {pulse && (
          <div key={pulse} style={{
            marginTop: 12, fontSize: 11, color: C.text2, fontFamily: NUM_FONT,
            borderLeft: `2px solid ${C.orange}`, paddingLeft: 10, lineHeight: 1.5,
            animation: 'homeFade .5s ease both',
          }}>{pulse}</div>
        )}
      </div>

      {/* 🧾 THE LEDGER — directly under the welcome, per his ordering: the
          greeting owns the top of the page, the ledger is the first thing
          after it. Foldable, and it remembers being closed. */}
      <HomerLedger players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} />

      {/* ── THE HEADLINE GAME — lifted here 2026-08-16 ───────────────
             The hero's last clause names this game; it used to be three
             sections below (past the onboarding card, the tile row and Your
             Night), so reading the sentence meant scrolling down to find the
             matchup and back up to re-read the sentence. Sentence and subject
             now touch. The onboarding card moved to the doors block at the
             foot of the page and the four-tile row is gone into the hero
             sentence — see the notes on both. */}
      {headline && (
        <div style={{
          background: `linear-gradient(155deg, rgba(249,115,22,.1), ${C.bg2} 55%)`,
          border: '1px solid rgba(249,115,22,.35)', borderRadius: 14,
          padding: '13px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: C.orange, letterSpacing: '.1em', fontFamily: NUM_FONT }}>🔥 TONIGHT&apos;S HEADLINER</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>the game whose top power bats stack highest on the board — a ranking, not a promise</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 7 }}>
            <div style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-.02em', fontFamily: NUM_FONT }}>
              {clean(headline.g.away, '?')} <span style={{ color: C.text3, fontWeight: 400 }}>@</span> {clean(headline.g.home, '?')}
            </div>
            <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT }}>{dateText(headline.g.game_time)}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginLeft: 'auto' }}>
              {headline.bats.map((p, i) => (
                <button key={i} onClick={() => onPlayerClick?.(p)} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6, cursor: 'pointer',
                  background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '4px 10px',
                }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{nameOf(p)}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{teamOf(p)}</span>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT }}>{hrScore(p).toFixed(1)}</span>
                </button>
              ))}
              <button onClick={() => onNavigate?.('games')} style={{
                fontSize: 10, fontWeight: 800, color: C.orange, cursor: 'pointer',
                background: 'transparent', border: '1px dashed rgba(249,115,22,.4)', borderRadius: 9, padding: '4px 10px',
              }}>full matchup →</button>
            </div>
          </div>
          {/* WHY THIS GAME, IN A LINE (2026-08-16). The header said "the game
              whose top power bats stack highest" and then never showed the
              stack, and the air for the one game worth circling was only
              readable by scrolling to a tile strip further down the page. Both
              are stated here: the ranking key with its own tooltip, and the
              conditions spoken by lib/conditions (temp, wind and direction,
              park, humidity, rain, roof — whichever the file published for
              this game, and nothing it didn't). */}
          {(() => {
            const row = headline.g.players?.[0]
            const parts = airParts(row)
            const venue = clean(row?.venue_name, '')
            return (
              <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.65, marginTop: 7 }}>
                Its three best power bats sum to{' '}
                <b title="The sum of this game's three highest HR scores — the ranking key for this section. A 0-100 board score, not a chance of anything."
                  style={{ color: C.orange, fontFamily: NUM_FONT, cursor: 'help' }}>{headline.heat.toFixed(1)}</b>
                {', the highest on the slate.'}
                {parts.length > 0 && (
                  <>{' '}{venue ? `${venue} is playing ` : 'The air reads '}
                    <span title={parts.map((x) => `${x.text} — ${x.title}`).join('\n')} style={{ cursor: 'help', color: C.text2 }}>
                      {parts.map((x) => x.text).join(', ')}
                    </span>.
                  </>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── 📰 THE CALL OF THE NIGHT — the lead of The Read (2026-08-16) ─────
             WHY HERE, BELOW THE HEADLINER AND ABOVE YOUR NIGHT.
             Not above it: the hero paragraph ends "The game to circle is X @ Y,
             immediately below", and putting a pick between that sentence and
             its subject would re-open the exact scroll-down-scroll-back-up
             complaint the flow pass was built to close. Not further down
             either: this is the most opinionated thing the site says all night
             and it was buried on a tab. So the page now goes slate → the game
             → the pick → your own calls, which is descending scope and reads as
             one thought — and the bot's single best call sits directly above
             the calls YOU made against it, which is the comparison worth having.
             It is the lead ONLY. The other three calls, the ISO lens and the
             traps stay on the Bot page, so Home keeps its shape and The Read
             keeps its length. Nothing that was on this page moved or left. ── */}
      <ReadTeaser players={players} onNavigate={onNavigate} onPlayerClick={onPlayerClick} />

      {/* ── 🎟 YOUR NIGHT — only exists when he made calls for this slate ── */}
      {mine.length > 0 && (
        <div style={{
          background: `linear-gradient(155deg, rgba(96,165,250,.09), ${C.bg2} 60%)`,
          border: '1px solid rgba(96,165,250,.3)', borderRadius: 14,
          padding: '11px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
            <span style={{ flexShrink: 0 }}>🎟</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ color: '#60a5fa' }}>Your night</b> — you have{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{mine.length}</b> call{mine.length === 1 ? '' : 's'} riding
              against the bot on this slate:{' '}
              {mine.slice(0, 3).map((m, i) => (
                <span key={i}>
                  {i > 0 && ', '}
                  <b style={{ color: C.text }}>{m.name}</b>
                  <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {m.role}{m.conviction ? ` · ${convWord(m.conviction)}` : ''}</span>
                </span>
              ))}
              {mine.length > 3 && <span style={{ color: C.text3 }}> and {mine.length - 3} more</span>}
              .{' '}
              <span onClick={() => onNavigate?.('mypicks')} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 800 }}>
                Grade them on My Picks →
              </span>
            </span>
          </div>
        </div>
      )}

      {/* ── NOTHING BUILT YET. One honest card instead of eight strips each
             quietly rendering nothing — an empty page that says why is a
             different experience from an empty page. ── */}
      {empty && (
        <div style={{
          background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 14,
          padding: '16px 18px', marginBottom: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5 }}>Nothing on the board yet</div>
          <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.65, maxWidth: 620 }}>
            The bot builds the slate on its morning run: every hitter scored, every starter graded,
            the parks and the air read. Once it publishes, this page fills in with tonight&apos;s
            headline game, the angles worth saying out loud, the leakiest arms and the top ten HR and
            hit plays — all of it from that file. Until then the doors below still work, and the
            Results tab still has every graded night behind it.
          </div>
        </div>
      )}

      {/* ── TONIGHT'S ANGLES — hero lines, not tables ─────────────────
          Renamed from "storylines" in the 2026-08-09 polish pass: the full
          Storylines engine renders directly below, and two adjacent panels
          both called storylines made the page look like it was repeating
          itself. These are the three hand-picked lines; that one is the
          whole ledger. */}
      {players.length > 0 && (
        <div style={{
          background: `linear-gradient(155deg, rgba(252,211,77,.06), ${C.bg2} 60%)`,
          border: '1px solid rgba(252,211,77,.25)', borderRadius: 14,
          padding: '13px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: C.yellow, letterSpacing: '.1em', fontFamily: NUM_FONT }}>📖 TONIGHT&apos;S ANGLES</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>every line from tonight&apos;s own data</span>
          </div>

          {/* 🌤 BEST AIR — was a row of three tiles ("BEST AIR TONIGHT") sitting
              below the Storylines panel, four sections under a hero that had
              already named the best park. Same three parks, same three edge
              percentages, same matchups, same temps and winds — now the first
              line of the angles, in the same voice as the four beneath it, with
              the conditions spoken by lib/conditions instead of a fifth private
              chip strip. The old strip's caption and its honest nothing-clears-
              neutral empty state both survive verbatim. Still taps through to
              the full park ladder on Power. */}
          {airRanked.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>{airRanked[0].edge >= 10 ? '🌋' : airRanked[0].edge >= 5 ? '🔥' : '🌤'}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Best air</b> —{' '}
                {airRanked[0].edge <= 0 ? (
                  <>no park on tonight&apos;s slate is playing above neutral once its factor and air are
                    combined; the best of the <b style={{ fontFamily: NUM_FONT }}>{airRanked.length}</b> is{' '}
                    <b style={{ color: C.text }}>{airRanked[0].venue}</b> at{' '}
                    <b style={{ fontFamily: NUM_FONT, color: C.text3 }}>{airRanked[0].edge.toFixed(0)}%</b>
                    {airLine(airRanked[0]) ? <> ({airLine(airRanked[0])})</> : ''}. That is the finding, not a missing section.{' '}</>
                ) : (
                  <>top of the slate is{' '}
                    {airRanked.slice(0, 3).map((g, i) => (
                      <span key={g.venue}>
                        {i === 1 && ', also carrying '}
                        {i === 2 && ' and '}
                        <button
                          onClick={() => onNavigate?.('longest')}
                          title={`${g.matchup}${airTitle(g) ? `\n${airTitle(g)}` : ''}\nPark factor plus the published weather effect, as a percentage swing on home-run rate — tap for the full park ladder.`}
                          style={{
                            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                            fontSize: 12, fontWeight: 800, color: i === 0 ? '#FB923C' : C.text,
                            textDecoration: 'underline', textDecorationColor: 'rgba(249,115,22,.35)',
                          }}
                        >{g.venue}</button>
                        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {g.matchup}</span>
                        {' at '}
                        <b style={{ fontFamily: NUM_FONT, color: '#FB923C' }}>+{g.edge.toFixed(0)}%</b>
                        {airLine(g) ? <span style={{ color: C.text3 }}> ({airLine(g)})</span> : ''}
                      </span>
                    ))}
                    .{' '}</>
                )}
                <span style={{ fontSize: 9.5, color: C.text3 }}>
                  Park factor plus the published weather effect, as a percentage swing on home runs — a swing on the rate,
                  not a chance of one. Tap a park for the full ladder.
                </span>
              </span>
            </div>
          )}

          {!b2b.length && !fenceRider && !pens.length && !nearMiss && (
            <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, padding: '2px 0' }}>
              Beyond the air, none of the angles fired tonight:{' '}
              {b2bVerified
                ? 'nobody on the slate homered in his last game'
                : 'the graded file that proves who went deep last night hasn’t published yet, so the back-to-back watch is being withheld rather than guessed'}
              , {fence?.slate_date && String(fence.slate_date) !== String(b2bDateKey)
                ? `the fence board on the branch is for ${fence.slate_date}, not this slate, so it's being ignored rather than shown`
                : 'the fence board hasn’t published for this date'}, and no bullpen crossed a workload
              threshold yesterday. Empty because the checks came back empty, not because the panel is
              broken — the full storyline ledger is right below.
            </div>
          )}

          {b2b.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🔁</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Back-to-back watch</b> —{' '}
                {b2b.slice(0, 3).map((p, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    <button onClick={() => onPlayerClick?.(p)} style={{
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, color: '#f87171', textDecoration: 'underline', textDecorationColor: 'rgba(248,113,113,.35)',
                    }}>{nameOf(p)}</button>
                    <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(p)}</span>
                  </span>
                ))}
                {b2b.length > 3 && <span style={{ color: C.text3 }}> and {b2b.length - 3} more</span>}
                {/* Names the actual day. "last game" was the ambiguity the bug
                    hid behind — on a rebuilt slate his last game is today. */}
                {' '}went deep {isTmrwSlate ? 'today' : 'last night'} — {isTmrwSlate ? 'tomorrow' : 'tonight'} is the encore try.
                <span title="Every name here is checked against the graded results for that night, by player id. If that file hasn't published, this line doesn't render at all."
                  style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 5, cursor: 'help' }}>✓ verified</span>
              </span>
            </div>
          )}

          {fenceRider && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🧱</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Tonight&apos;s fence rider</b> —{' '}
                <button onClick={() => onPlayerClick?.(fenceRider.p)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 12, fontWeight: 800, color: C.orange, textDecoration: 'underline', textDecorationColor: 'rgba(249,115,22,.35)',
                }}>{fenceRider.r.name}</button>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {fenceRider.r.team}</span>
                {' '}has <b style={{ fontFamily: NUM_FONT, color: '#4ade80' }}>{fenceRider.r.over_ct}</b> balls over 375ft
                and <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{fenceRider.r.fence_ct}</b> pulled into the wall-scraper zone
                in his last <span style={{ fontFamily: NUM_FONT }}>{fenceRider.r.games}</span> games — measured landing data, all wall, no feel.
              </span>
            </div>
          )}

          {/* 🧱 the drought whose contact says it's ending (2026-08-15) —
              the Scoreboard's near-miss board, reduced to its single best
              case. Same statcast fields, a higher bar (close ≥ 3). */}
          {nearMiss && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🧱</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Near-miss watch</b> —{' '}
                <button onClick={() => onPlayerClick?.(nearMiss.p)} style={{
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                  fontSize: 12, fontWeight: 800, color: '#FCD34D', textDecoration: 'underline', textDecorationColor: 'rgba(252,211,77,.35)',
                }}>{nameOf(nearMiss.p)}</button>
                <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}> {teamOf(nearMiss.p)}</span>
                {' '}is <b style={{ fontFamily: NUM_FONT, color: nearMiss.since >= 10 ? '#f87171' : C.orange }}>{nearMiss.since} games</b> without
                a homer, but his recent window holds a <b style={{ fontFamily: NUM_FONT }}>{Math.round(nearMiss.d)} ft</b> ball
                {nearMiss.e > 0 && <> at <b style={{ fontFamily: NUM_FONT }}>{nearMiss.e.toFixed(0)} mph</b></>}
                {nearMiss.w > 0 && <> and <b style={{ fontFamily: NUM_FONT, color: '#FCD34D' }}>{nearMiss.w} wall-scraper{nearMiss.w > 1 ? 's' : ''}</b></>}
                {' '}— drought, not decline. The full board lives on the Scoreboard.
              </span>
            </div>
          )}

          {pens.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', padding: '4px 0', fontSize: 12, lineHeight: 1.6, color: C.text2 }}>
              <span style={{ flexShrink: 0 }}>🚪</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ color: C.text }}>Pen door</b> —{' '}
                {pens.slice(0, 3).map((x, i) => (
                  <span key={x.ab}>
                    {i > 0 && ', '}
                    <b style={{ color: x.tier.col }}>{x.ab}</b>
                    <span title={`${x.ab} bullpen yesterday: ${x.t.used} relievers, ${x.t.pitches} pitches — ${(x.t.names || []).map((r2) => `${String(r2.name).split(' ').slice(-1)[0]} ${r2.pitches}p`).join(', ')}`}
                      style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3 }}> {x.tier.icon} {x.t.used} arms / {x.t.pitches}p yesterday</span>
                  </span>
                ))}
                {' '}— tired relief gives up homers; the late innings are the window.
              </span>
            </div>
          )}
        </div>
      )}

      {/* The full storyline engine — milestones, duels, revenge games,
          birthdays, giveaways. Same panel the Scoreboard carries; collapsed
          by default, the header counts tell you if it's worth opening. It sat
          eight hundred lines further down, below two stat boards, which split
          the narrative half of the page in two. It belongs next to the angles
          it expands on.
          results (2026-08-13): this page already holds it — see the note in
          Storylines.js for why it used to fetch its own copy. */}
      <Storylines players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} />

      {/* ── TOP WEATHER GAMES lived here until 2026-08-16 ───────────────
             Three tiles, ~60 lines, printing the same three parks the hero had
             already named four sections above — the literal scroll-down-then-
             back-up complaint. It is now the first line of TONIGHT'S ANGLES,
             which is where a fact about tonight belongs, and lib/conditions
             speaks the temp/wind/park/humidity/rain/roof clause it used to
             hand-roll. Nothing was dropped: the three edge percentages, the
             matchups, the temps, the winds, the caption, the tap-through to
             the Power ladder and the "nothing clears neutral" empty state all
             moved with it. ── */}

      {/* ── TONIGHT'S TOP TENS, then the arms they attack ──────────────
             Order swapped 2026-08-16. The arms panel used to sit above the
             two top-ten boards, which put the answer to "who do I look at"
             below the answer to "who is he facing" — and every top-ten row
             already prints the arm's HR/9, so you read a name, scrolled UP to
             find that arm in the leak table, then back DOWN for the next name.
             Names first, arms directly under them: the two panels that get
             read together now touch. ── */}

      {/* ── TONIGHT'S TOP 10s (2026-08-08, Donovan: "top 10 hits and hr for
          the home page, awesome but digestible") — two clean boards, ranked
          by the site's own scores, with the ARM each bat gets to attack:
          ★ = weak lineup spot vs this starter, red HR/9 = a leaking arm. */}
      {players.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { title: '💣 Top 10 — HR plays', col: '#FB923C', score: hrScore, door: 'board' },
            { title: '🎯 Top 10 — Hit plays', col: '#60A5FA', score: hitScore, door: 'hitshrr' },
          ].map(({ title, col, score, door }) => {
            const rows = [...players].sort((a, b) => score(b) - score(a)).slice(0, 10)
            const max = score(rows[0]) || 1
            return (
              <div key={title} style={{
                flex: '1 1 340px', minWidth: 0,
                background: `linear-gradient(155deg, ${C.bg2}, ${col}08)`,
                border: `1px solid ${col}30`, borderRadius: 12, padding: '10px 13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>{title}</span>
                  <span onClick={() => onNavigate?.(door)} style={{ marginLeft: 'auto', fontSize: 9, color: C.text3, cursor: 'pointer', fontFamily: NUM_FONT }}>full board →</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {rows.map((p, i) => {
                    const s = score(p)
                    const hr9 = n(p?.pitcher_hr9, 0)
                    const leaky = hr9 >= 1.4
                    return (
                      <div key={i} onClick={() => onPlayerClick?.(p)} className="tap-row" style={{
                        display: 'flex', gap: 7, alignItems: 'center', cursor: 'pointer',
                        padding: '2px 5px', borderRadius: 6, minWidth: 0,
                        background: i === 0 ? `${col}12` : 'transparent',
                      }}>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: i < 3 ? col : C.text3, fontWeight: 900, width: 16, flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                          {nameOf(p)}
                          {p?.weak_spot_flag ? <span title="Weak lineup spot vs this starter — the validated 18.0% vs 13.9% flag" style={{ fontSize: 9 }}> ★</span> : null}
                        </span>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          vs {clean(p?.pitcher_name, 'TBD').split(' ').slice(-1)[0]}
                          {hr9 > 0 && <b style={{ color: leaky ? '#f87171' : C.text3 }} title={leaky ? 'This arm leaks homers — 1.40+ HR/9' : 'Starter HR/9'}> {hr9.toFixed(2)}</b>}
                        </span>
                        <div style={{ flex: '0 0 46px', height: 5, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (100 * s) / max)}%`, height: '100%', background: col, opacity: i < 3 ? 1 : 0.55 }} />
                        </div>
                        <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, color: i < 3 ? col : C.text2, width: 24, textAlign: 'right', flexShrink: 0 }}>
                          {s.toFixed(0)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 8.5, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
                  Ranked by the site&apos;s own score · ★ weak spot vs tonight&apos;s starter ·{' '}
                  <b style={{ color: '#f87171' }}>red HR/9</b> = a leaking arm. Tap a name for his card.
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── WEAKEST ARMS TONIGHT (2026-08-08, Donovan: "top weakest pitchers
          or weak-trending pitchers on the home page") — the attack map. Two
          reads from published fields only: season HR/9 (who always leaks)
          and 📉 last-3-starts HR/9 vs season / the bot's own trend direction
          (who's leaking RIGHT NOW). */}
      {(() => {
        const arms = new Map()
        players.forEach((p) => {
          const nm = clean(p?.pitcher_name, '')
          if (!nm || nm === 'TBD') return
          if (!arms.has(nm)) {
            arms.set(nm, {
              nm, hr9: n(p?.pitcher_hr9, 0), whip: n(p?.pitcher_whip, 0),
              l3hr9: n(p?.pitcher_l3_hr9, null), trend: clean(p?.pitcher_trend_direction, ''),
              vs: teamOf(p), weak: 0, sample: p,
            })
          }
          if (p?.weak_spot_flag) arms.get(nm).weak += 1
        })
        const all = [...arms.values()].filter((a) => a.hr9 > 0)
        // RANKED ON MORE THAN ONE NUMBER (2026-08-09). This panel sorted by
        // season HR/9 alone — the right headline and a poor ranking: it moves
        // slowly, it's blind to contact quality, and it can't tell a fly-ball
        // arm in a bandbox from the same HR/9 in a pitcher's park. lib/armLeak
        // blends eight published fields, ranked against tonight's other
        // starters, and hands back the two terms driving each one. HR/9 stays
        // on the row, so nothing that was readable before got hidden.
        const ranked = rankArms(players)
        const leakBy = new Map(ranked.map((a) => [a.name, a]))
        const weakest = ranked.length
          ? ranked.slice(0, 5).map((a) => ({ ...(arms.get(a.name) || {}), ...a }))
          : [...all].sort((a, b) => b.hr9 - a.hr9).slice(0, 5)
        const trending = all
          .filter((a) => a.trend === 'worsening' || (a.l3hr9 != null && a.hr9 > 0 && a.l3hr9 >= a.hr9 + 0.4))
          .sort((a, b) => (b.l3hr9 ?? b.hr9) - (a.l3hr9 ?? a.hr9)).slice(0, 4)
        if (!weakest.length) {
          // Honest empty state: the slate exists but no starter carries a
          // published HR/9 yet — usually TBD starters early in the morning.
          if (!players.length) return null
          return (
            <div style={{
              background: C.bg2, border: `1px dashed ${C.border2}`, borderRadius: 12,
              padding: '10px 14px', marginBottom: 14, fontSize: 10.5, color: C.text3, lineHeight: 1.6,
            }}>
              🩹 <b style={{ color: C.text2 }}>Weakest arms tonight</b> — no starter on this slate
              carries a published HR/9 yet, which usually means the probables are still TBD. The
              board fills in on its own as they&apos;re announced.
            </div>
          )
        }
        const Arm = ({ a, i, showTrend }) => (
          <div onClick={() => onNavigate?.('pitchers')} className="tap-row" style={{
            display: 'flex', gap: 7, alignItems: 'baseline', cursor: 'pointer',
            padding: '2px 5px', borderRadius: 6, minWidth: 0,
          }} title={`${a.nm} vs ${a.vs}: ${a.hr9.toFixed(2)} HR/9 season${a.l3hr9 != null ? `, ${a.l3hr9.toFixed(2)} over his last 3 starts` : ''}${a.weak ? ` · ${a.weak} weak lineup spots against him` : ''} — tap for the Pitchers workbench`}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, color: i === 0 ? '#f87171' : C.text3, width: 14, flexShrink: 0 }}>{i + 1}</span>
            <span style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
              {a.nm}
              <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>vs {a.vs}</span>
            </span>
            {showTrend && a.l3hr9 != null && (
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: '#f87171', flexShrink: 0 }}>L3 {a.l3hr9.toFixed(2)}</span>
            )}
            <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 900, color: a.hr9 >= 1.6 ? '#f87171' : '#FB923C', flexShrink: 0 }}>
              {a.hr9.toFixed(2)}
            </span>
            {/* The blended rank, plus the one term carrying it — so a row that
                outranks a bigger HR/9 explains itself on the row. */}
            {leakBy.get(a.nm)?.leak != null && (
              <span
                title={`Leak score ${leakBy.get(a.nm).leak}/100 — ranked against tonight's ${ranked.length} starters only, not the league. Built from ${leakBy.get(a.nm).scoredOn} published fields: ${leakBy.get(a.nm).terms.map((t) => `${t.label} ${t.text}`).join(' · ')}.${leakBy.get(a.nm).thin ? ' Small Statcast sample — the contact-quality terms are thin.' : ''} Display ranking only; it never touches a pick.`}
                style={{
                  fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, flexShrink: 0, cursor: 'help',
                  color: '#f87171', border: '1px solid rgba(248,113,113,.4)', background: 'rgba(248,113,113,.1)',
                  borderRadius: 999, padding: '0 6px',
                }}>
                {leakBy.get(a.nm).leak}{leakBy.get(a.nm).thin ? '·' : ''}
              </span>
            )}
            {leakBy.get(a.nm)?.drivers?.[0] && (
              <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>
                {leakBy.get(a.nm).drivers[0].label} {leakBy.get(a.nm).drivers[0].text}
              </span>
            )}
            {a.weak > 0 && <span style={{ fontSize: 8.5, flexShrink: 0 }} title={`${a.weak} weak spots in the lineup he faces`}>★{a.weak}</span>}
          </div>
        )
        return (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{
              flex: '1 1 300px', minWidth: 0,
              background: `linear-gradient(155deg, ${C.bg2}, rgba(248,113,113,.05))`,
              border: '1px solid rgba(248,113,113,.28)', borderRadius: 12, padding: '10px 13px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 900 }}>🩹 Weakest arms tonight</span>
                <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}
                  title="Ranked by a blend of eight published fields — season HR/9, last three starts, barrels and hard contact allowed, fly-ball rate, meatball rate, tonight's park and fastball velocity against his own baseline — each ranked against tonight's other starters, not the league. Hover any arm's red number for its full breakdown. Display ranking only; nothing here feeds a pick.">
                  leak score · HR/9 · ★N weak spots vs him
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {weakest.map((a, i) => <Arm key={a.nm} a={a} i={i} />)}
              </div>
            </div>
            {trending.length > 0 && (
              <div style={{
                flex: '1 1 300px', minWidth: 0,
                background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.05))`,
                border: '1px solid rgba(252,211,77,.28)', borderRadius: 12, padding: '10px 13px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 900 }}>📉 Trending weak</span>
                  <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>last 3 starts leaking harder than his season</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {trending.map((a, i) => <Arm key={a.nm} a={a} i={i} showTrend />)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── WHERE TO GO NEXT — the doors, and the onboarding that used to
             sit between you and your own data ───────────────────────────────
             "New here?" rendered directly under the hero on every visit until
             it was manually dismissed, so the front page opened on a tutorial
             for the one person who least needs one. It is the same three
             steps, the same links, the same Guide line and the same "Got it,
             hide this" button — moved to the foot of the page, next to the
             three doors, because "where do I go next" is one question and it
             gets answered in one place. It opens by itself only on a device
             that has never loaded this page. ── */}
      {/* ── NEW HERE? ────────────────────────────────────────────────── */}
      {startOpen && (
        <div style={{
          background: `linear-gradient(155deg, rgba(249,115,22,.1), ${C.bg2} 60%)`,
          border: `1px solid ${C.orange}4d`, borderRadius: 14,
          padding: '13px 16px', marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>New here? Start with these 3 things</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>in this order — it takes about two minutes</span>
            <button
              onClick={dismissStart}
              title="Hide this. The full five-step version lives on the Guide tab."
              style={{
                marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 999, padding: '2px 10px', cursor: 'pointer',
                fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT,
              }}
            >Got it, hide this</button>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            {START.map((s) => (
              <div
                key={s.tab}
                onClick={() => onNavigate?.(s.tab)}
                style={{
                  flex: '1 1 210px', minWidth: 0, cursor: 'pointer',
                  background: C.bg3, border: `1px solid ${C.border2}`, borderRadius: 11,
                  padding: '10px 13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                  <span style={{
                    width: 19, height: 19, borderRadius: '50%', flexShrink: 0,
                    border: `1px solid ${C.orange}77`, background: `${C.orange}18`, color: C.orange,
                    fontFamily: NUM_FONT, fontWeight: 900, fontSize: 10.5,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{s.n}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{s.title}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: C.orange }}>→</span>
                </div>
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.55 }}>{s.body}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: C.text3, marginTop: 9, lineHeight: 1.5 }}>
            Want the longer version?{' '}
            <span
              onClick={() => onNavigate?.('guide')}
              style={{ color: C.orange, cursor: 'pointer', fontWeight: 700 }}
            >Open the Guide →</span>{' '}
            — five steps, a colour key and a plain-language glossary. Everywhere else on this site,
            hovering a number tells you what it is.
          </div>
        </div>
      )}

      {/* ── THREE DOORS ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {DOORS.map((d) => (
          <div key={d.tab} onClick={() => onNavigate?.(d.tab)} style={{
            flex: '1 1 240px', minWidth: 0, cursor: 'pointer',
            background: `linear-gradient(155deg, ${d.color}12, ${d.color}04)`,
            border: `1px solid ${d.color}3d`, borderRadius: 13, padding: '13px 15px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 15 }}>{d.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 900, color: d.color }}>{d.title}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: d.color }}>→</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.55 }}>{d.body}</div>
          </div>
        ))}
      </div>

      {/* The reopen. A dismissal you can't undo is a deletion, and the whole
          point of defaulting the card shut is that it stays reachable. */}
      {!startOpen && (
        <div style={{ fontSize: 10, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
          New here?{' '}
          <span onClick={reopenStart} style={{ color: C.orange, cursor: 'pointer', fontWeight: 700 }}>
            Start with these 3 things →
          </span>{' '}
          — two minutes, in order. The longer version, with a colour key and a plain-language
          glossary, is on{' '}
          <span onClick={() => onNavigate?.('guide')} style={{ color: C.orange, cursor: 'pointer', fontWeight: 700 }}>
            the Guide
          </span>.
        </div>
      )}

      <div style={{ fontSize: 9, color: C.text3, marginTop: 12, lineHeight: 1.5 }}>
        Everything on this page comes from tonight&apos;s slate file, the live results feed, or the bot&apos;s
        own published sheet — when a number isn&apos;t built yet, the sentence says so instead of guessing.
        Hover any number for what it is and where it came from.
      </div>
      </>}
    </div>
  )
}
