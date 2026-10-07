'use client'
import Tap from '../Tap'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { STATE, alpha } from '../../lib/scales'
import { fetchJSON, groupGames } from '../../lib/data'
import { clean, teamOf } from '../../lib/player'
import { Empty } from '../ui'
import { RunHistogram, runChip as chip, runOdds } from '../runs/RunParts'
import Sparkline from '../Sparkline'
import DenseTable from '../DenseTable'
import { boardRow, boardRowContext, withBoardColumns, placeAfter, BOARD_GROUPS } from '../../lib/boardColumns'
import { useGameNav } from '../../lib/teamNav'
// H and HRR are the game-log column indices donutStats reads. They were NOT in
// this import when DonutLine first shipped — the build compiled clean, and the
// ReferenceError at render killed the ENTIRE Patterns page. Caught by the
// harness reading the body text ("Application error"), not by the build, and
// not even by the pageerror listener. A compile is never evidence.
import { runsPaths, runsLookReal, readRun, marketOf, barLabel, MARKETS, H, HRR } from '../../lib/runs'

// 🔥 RUNS — who is hot, at the bar YOU pick.
//
// 2026-08-15, from the boards Donovan sent: a player board of strips, and a
// "hottest active runs" panel. They're the same object, so this is one page:
// pick a market and a number, and every hitter on tonight's slate sorts by the
// length of his active run with his last thirty games underneath.
//
// THREE THINGS THE ORIGINAL DOESN'T DO.
//
//   1. THE BAR IS YOURS. 1+ Hit and 2+ Hits are different questions and a
//      board that only answers one of them is answering the easy one. Every
//      threshold is a chip and the whole board recomputes on the click,
//      because the payload is raw lines rather than a frozen rate.
//   2. COLD RUNS COUNT. Sort by the drought and you get the fade board — the
//      same information, the other direction, which a "hottest" panel throws
//      away. Nine misses in a row is a position too.
//   3. IT SAYS WHAT A RUN IS WORTH. A five-game run reads like a signal; a
//      hitter who clears the bar 60% of the time makes five in a row roughly
//      one time in thirteen, which is to say regularly. The panel does that
//      arithmetic instead of leaving the streak to speak for itself.
//
// Rides bots/player_splits.py's existing fetch — no new request on either side.
//
// ── SLICING BY TEAM AND BY GAME (2026-08-15, round two) ──────────────────────
//
// Donovan: "the patteren needs more intuvtive things but i like it alot /
// soriting by team and games and sthings like that."
//
// WHAT WAS WRONG: the only way to narrow this board was the free-text box,
// and a search box is not a slice. Typing "STL" got you nine of the eighteen
// hitters in tonight's Cardinals game and no way to see the other nine — you
// cannot type a MATCHUP. So the page could rank the whole slate or one string
// match, with nothing in between, and the thing a bettor actually does — look
// at one game, or one lineup — had no control on it at all.
//
// WHAT CHANGED, all additive:
//   · A TEAM picker and a GAME picker, built off the slate rows this component
//     is already handed. Same dropdown language the header's team filter uses
//     (Controls.js), so team selection means one thing everywhere on the site.
//   · AN ORDER control — by run length (what it always did), by team, or by
//     game. Team and game order also print a quiet rule between groups, so a
//     matchup's whole lineup reads as one block instead of scattered rows.
//   · The featured cards stay run-ordered ALWAYS, and they obey the slice: pick
//     a game and the six cards become that game's six longest runs, which is
//     the read he described wanting.
//   · One sentence under the controls says what is currently being hidden and
//     clears it in one tap. An active filter you can't see is a wrong number.
//
// The free-text box survives untouched — it answers a different question
// (find one man) than the pickers do (show me this slate slice).

// UNIVERSAL FILTER RECIPE (2026-08-23): tint through the theme accent via
// STATE/alpha, not a baked ember rgba — see components/Filters.js.

const RUN_GROUP = { key: 'run', label: 'The run', order: 1 }
const DONUT_GROUP = { key: 'donut', label: 'The donut line', order: 1.3 }
const SPLITS = [['all', 'All games'], ['D', 'Day'], ['N', 'Night'], ['H', 'Home'], ['A', 'Road']]

/** A dropdown that looks like the header's team filter, at board scale. */
function Picker({ label, value, onChange, options, title }) {
  const on = !!value
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} title={title}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="moon-select"
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          background: on ? alpha(STATE.on().color, 0.14) : 'transparent',
          border: `1px solid ${on ? STATE.on().borderColor : C.border}`,
          color: on ? C.orange : C.text3,
          fontWeight: on ? 800 : 700,
          borderRadius: 999, padding: '3px 21px 3px 10px',
          fontSize: TYPE.label, fontFamily: NUM_FONT, outline: 'none', cursor: 'pointer',
          maxWidth: 172, textOverflow: 'ellipsis',
        }}
      >
        <option value="">{label}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <span style={{
        position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
        fontSize: 8, color: on ? C.orange : C.text3, pointerEvents: 'none',
      }}>▾</span>
    </span>
  )
}


// ── THE MATCHUP LINE (2026-08-17) ────────────────────────────────────────────
// Donovan: "i see no upgrades to the streaks page. add more stats to the streaks
// page look at the streaks page i sent as reference just add some of the stats
// to ours."
//
// His reference had five columns this page never showed: the opposing pitcher,
// the hitter's average against that pitcher's HAND, and his record against that
// specific arm. Every one of them is already on the slate row — avg_vs_rhp /
// avg_vs_lhp, and the whole bvp_* set — so this was published data the page
// simply never read.
//
// Rendered as one line under the run, not as four columns, because these cards
// are 240px wide. Same rule as everywhere else: the denominator travels with the
// number, so a 1-for-2 against an arm reads as "2 AB" and never as ".500".
const av = (v) => {
  const x = Number(v)
  if (!Number.isFinite(x) || x <= 0) return ''
  return x.toFixed(3).replace(/^0\./, '.')
}

function MatchupLine({ row, onOpenPitcher = null }) {
  if (!row) return null
  const arm = clean(row.pitcher_name, '')
  const throws = String(row.pitcher_throws || '').toUpperCase().startsWith('L') ? 'L' : 'R'
  const side = throws === 'L' ? row.avg_vs_lhp : row.avg_vs_rhp
  const sideTxt = av(side)
  const ab = Number(row.bvp_ab) || 0
  const hits = Number(row.bvp_hits) || 0
  const hr = Number(row.bvp_hr) || 0
  if (!arm && !sideTxt && !ab) return null
  return (
    <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.body, color: C.text3, marginTop: 3, lineHeight: 1.5 }}>
      {arm && (
        <span title={`Tonight's starter${throws ? ` — throws ${throws}HP` : ''}`}>
          {/* the pitcher opens the PITCHER, not the hitter whose row this is
              (audit 00A P0: "Parker Messick" opened Jac Caglianone) */}
          vs <Tap onClick={onOpenPitcher && row.pitcher_id ? () => onOpenPitcher(row.pitcher_id) : null}><b style={{ color: C.text2 }}>{arm}</b></Tap>{throws ? ` (${throws})` : ''}
        </span>
      )}
      {sideTxt && (
        <span title={`His season average against ${throws}HP — the side this arm throws from`}>
          {arm ? ' · ' : ''}<b style={{ color: C.text2 }}>{sideTxt}</b> vs {throws}HP
        </span>
      )}
      {ab > 0 ? (
        <span title={`This season against this pitcher: ${hits} for ${ab}${hr ? `, ${hr} HR` : ''}. Small samples are the norm here — the raw fraction is shown instead of an average for exactly that reason.`}>
          {' · '}<b style={{ color: C.text2 }}>{hits}/{ab}</b> off him{hr ? `, ${hr} HR` : ''}
        </span>
      ) : arm ? (
        <span title="No plate appearances against this pitcher on record">{' · '}never faced him</span>
      ) : null}
    </div>
  )
}


// ── 🍩 THE DONUT LINE (2026-08-17) ──────────────────────────────────────────
// Donovan: "Stat needed: last zero game where player recorded no stats — H, R,
// RBI. and seeing the distance from the donut game to them getting a hit and
// or 1+ HRR."
//
// A DONUT is stricter than the blank board's blank: not just hitless, but a
// game with NOTHING — no hit AND no run AND no RBI (H = 0 and the combined
// H+R+RBI count = 0 in the same game). The blank board asks "did he get a hit
// after an 0-fer"; this asks the emptier question and measures the BOUNCE:
// after each of his donuts this window, how many games until a hit landed, and
// until a 1+ H+R+RBI game landed.
//
// Everything is counted off the same game log the streaks already run on
// (newest first; H at index 2, the combined HRR count at index 4). Distances
// are in GAMES HE PLAYED, denominators always shown, and a donut with no
// bounce yet inside the window is counted as unresolved rather than dropped —
// "2/3 bounced" with one still open is the honest read.
function donutStats(g) {
  const log = Array.isArray(g) ? g : []
  if (!log.length) return null
  const isDonut = (row) => Number(row?.[H]) === 0 && Number(row?.[HRR]) === 0
  let last = -1
  const donuts = []
  log.forEach((row, i) => {
    if (!isDonut(row)) return
    if (last < 0) last = i
    donuts.push(i)
  })
  if (!donuts.length) return { last: null, n: 0 }
  // Bounce: from each donut, walk toward NOW (lower index = newer game).
  let hitBounced = 0; let hitDistSum = 0; let hitResolved = 0
  let hrrBounced = 0; let hrrDistSum = 0; let hrrResolved = 0
  donuts.forEach((i) => {
    let hd = null; let rd = null
    for (let j = i - 1; j >= 0; j -= 1) {
      if (hd == null && Number(log[j]?.[H]) >= 1) hd = i - j
      if (rd == null && Number(log[j]?.[HRR]) >= 1) rd = i - j
      if (hd != null && rd != null) break
    }
    if (hd != null) { hitBounced += 1; hitDistSum += hd; hitResolved += 1 }
    else if (i > 0) hitResolved += 1          // newer games exist and none had a hit
    if (rd != null) { hrrBounced += 1; hrrDistSum += rd; hrrResolved += 1 }
    else if (i > 0) hrrResolved += 1
  })
  return {
    last,                          // games since his most recent donut (index = distance)
    n: donuts.length,
    hit: { bounced: hitBounced, resolved: hitResolved, avg: hitBounced ? hitDistSum / hitBounced : null },
    hrr: { bounced: hrrBounced, resolved: hrrResolved, avg: hrrBounced ? hrrDistSum / hrrBounced : null },
  }
}

function DonutLine({ g }) {
  const d = donutStats(g)
  if (!d) return null
  if (!d.n) {
    return (
      <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.body, color: C.text3, marginTop: 2 }}
        title="A donut is a game with no hit, no run and no RBI — emptier than the blank board's 0-fer, which only requires no hit.">
        🍩 no donut games in this window
      </div>
    )
  }
  const f1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString())
  return (
    <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.body, color: C.text3, marginTop: 2, lineHeight: 1.55 }}
      title={`A donut is a game with no hit, no run and no RBI. He has ${d.n} in this window. After each one: how many games he took to record a hit, and to record a 1+ hits+runs+RBI game. A donut with no bounce yet in the window counts as unresolved, not dropped.`}>
      🍩 last donut <b style={{ color: d.last === 0 ? C.red : C.text2 }}>{d.last === 0 ? 'his most recent game' : `${d.last} game${d.last === 1 ? '' : 's'} ago`}</b>
      {' · '}{d.n} in window
      {d.hit.resolved > 0 && (
        <> · hit after <b style={{ color: C.text2 }}>{d.hit.bounced}/{d.hit.resolved}</b>
          {d.hit.avg != null && <> in <b style={{ color: C.text2 }}>{f1(d.hit.avg)}</b> gm avg</>}
        </>
      )}
      {d.hrr.resolved > 0 && (
        <> · 1+HRR after <b style={{ color: C.text2 }}>{d.hrr.bounced}/{d.hrr.resolved}</b>
          {d.hrr.avg != null && <> in <b style={{ color: C.text2 }}>{f1(d.hrr.avg)}</b> gm avg</>}
        </>
      )}
    </div>
  )
}

export default function Runs({ players = [], onPlayerClick, onOpenPitcher = null }) {
  const [data, setData] = useState(undefined)
  const [mk, setMk] = useState('hit')
  const [thr, setThr] = useState(1)
  const [split, setSplit] = useState('all')
  const [dir, setDir] = useState('hot')
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [game, setGame] = useState('')
  // 2026-08-24: "Breaks Allowed" — reuses the same 0/1/2/3 idiom as the
  // other streak board's tolerance control (the gold streaks board), wired
  // into Patterns specifically since it only ever lived on that other
  // board. 0 is the strict, original definition of a run.
  const [breaks, setBreaks] = useState(0)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let alive = true
    fetchJSON(runsPaths(), runsLookReal)
      .then((j) => { if (alive) setData(j || null) })
      .catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [])

  const market = marketOf(mk)
  const bar = market.lines.includes(thr) ? thr : market.lines[0]

  // Only hitters actually on tonight's card. The payload is built from the
  // slate, but a slate rebuild between the splits job and now can leave a name
  // in it who has since been scratched — and a run board is a board about
  // tonight.
  const onSlate = useMemo(() => {
    const s = new Set((players || []).map((p) => Number(p?.player_id ?? p?.id)).filter(Boolean))
    return s.size ? s : null
  }, [players])

  // Tonight's matchups, from the same grouping every other page uses
  // (lib/data groupGames — away is the first row's team, home its opponent).
  // Deriving them here rather than taking a games prop keeps Runs mountable
  // from anywhere with nothing but the slate, which is how HitsHRR mounts it.
  const games = useMemo(() => groupGames(players || []).map((g) => ({
    key: String(g.game_pk),
    away: clean(g.away, ''),
    home: clean(g.home, ''),
    label: `${clean(g.away, '—')} @ ${clean(g.home, '—')}`,
  })).filter((g) => g.away || g.home), [players])

  const teams = useMemo(() => {
    const s = new Set()
    ;(players || []).forEach((p) => { const t = teamOf(p); if (t) s.add(t) })
    return Array.from(s).sort()
  }, [players])

  // team → its game. A doubleheader would put a team in two games and this
  // map keeps the later one; the slate payload has never carried both halves
  // at once, and a wrong game label is a smaller lie than a missing picker.
  const byTeam = useMemo(() => {
    const m = new Map()
    games.forEach((g, i) => {
      if (g.away) m.set(g.away, { key: g.key, label: g.label, i })
      if (g.home) m.set(g.home, { key: g.key, label: g.label, i })
    })
    return m
  }, [games])

  // A team and a game that don't overlap can only ever produce an empty board,
  // so each picker releases the other when they disagree. A control that can
  // dead-end you into "no rows" is the opposite of intuitive.
  const pickTeam = (t) => {
    setTeam(t); setOpen(null)
    if (t && game && byTeam.get(t)?.key !== game) setGame('')
  }
  const pickGame = (k) => {
    setGame(k); setOpen(null)
    if (k && team && byTeam.get(team)?.key !== k) setTeam('')
  }
  const clearSlice = () => { setTeam(''); setGame(''); setOpen(null) }

  // Everything except the team/game slice, already ranked by run length. Held
  // separately so the slice sentence can say "18 of 214" honestly — the
  // denominator has to be the board you'd see without the slice, not the
  // whole payload.
  const base = useMemo(() => {
    if (!data?.players) return []
    const needle = q.trim().toLowerCase()
    return data.players
      .filter((p) => !onSlate || onSlate.has(Number(p.player_id)))
      .filter((p) => !needle
        || String(p.name || '').toLowerCase().includes(needle)
        || String(p.team || '').toLowerCase().includes(needle))
      .map((p) => ({ p, r: readRun(p.g, market.col, bar, split, dir === 'hot' ? breaks : 0) }))
      .filter((x) => x.r && x.r.n >= 5)
      .sort((a, b) => (dir === 'hot'
        ? (b.r.run - a.r.run) || (b.r.l15?.pct ?? 0) - (a.r.l15?.pct ?? 0)
        : (a.r.run - b.r.run) || (a.r.l15?.pct ?? 0) - (b.r.l15?.pct ?? 0)))
  }, [data, market, bar, split, dir, breaks, q, onSlate])

  const gameTeams = useMemo(() => {
    if (!game) return null
    const g = games.find((x) => x.key === game)
    return g ? new Set([g.away, g.home].filter(Boolean)) : null
  }, [game, games])

  const rows = useMemo(() => base
    .filter((x) => !team || String(x.p.team) === team)
    .filter((x) => !gameTeams || gameTeams.has(String(x.p.team))), [base, team, gameTeams])

  const openGame = useGameNav()
  const bctx = useMemo(() => boardRowContext(players || []), [players])

  // THE BOARD AS ONE TABLE (2026-10-07, Donovan: "big boxes look outdated -> dense table"). The six leader
  // cards and the grid of row cards are gone; every hitter is one row of the site's table, the header
  // sorts (team, game, run, each window), the best fifth of every column glows. The run's strip, the
  // "once every N stretches" arithmetic, the donut line and the matchup line are columns now.
  const tableRows = useMemo(() => rows.map(({ p, r }, i) => {
    const sr = slateRow(players, p)
    const d = donutStats(p.g)
    const hot = r.run > 0
    const ab = Number(sr?.bvp_ab) || 0
    return {
      ...(sr ? boardRow(sr, i, bctx) : {}),
      _key: `${p.player_id}`,
      _raw: sr || p,
      name: p.name,
      team: p.team,
      opp: p.opp || sr?.opponent || '',
      run: r.run,
      best: hot ? r.bestHit : r.bestMiss,
      prev: hot ? r.prevBestHit : r.prevBestMiss,
      l5: r.l5 ? r.l5.pct : null, l10: r.l10 ? r.l10.pct : null, l15: r.l15 ? r.l15.pct : null, l30: r.l30 ? r.l30.pct : null,
      _r: r,
      strip: r.run,
      stretch: runOdds(Math.abs(r.run), r.l30 || r.l15),
      donutLast: d && d.n ? d.last : null,
      donutN: d ? d.n : null,
      donutHit: d && d.hit?.avg != null ? Math.round(d.hit.avg * 10) / 10 : null,
      facing: clean(sr?.pitcher_name, ''),
      facingId: sr?.pitcher_id ?? null,
      bvp: ab > 0 ? `${Number(sr?.bvp_hits) || 0}/${ab}` : '',
    }
  }), [rows, players, bctx])
  const columns = useMemo(() => placeAfter(withBoardColumns([
    { key: 'opp', label: 'Vs', heat: false, w: 40, mono: true, dim: true, link: (pp) => (openGame && pp?.game_pk ? () => openGame(pp.game_pk) : null) },
    { key: 'run', group: RUN_GROUP, label: dir === 'hot' ? 'Run' : 'Drought', w: 60, dp: 0, invert: dir !== 'hot', primary: true,
      fmt: (v) => (v == null ? '—' : v > 0 ? `+${v}` : `\u2212${-v}`),
      title: 'Games running that he cleared the bar (+) or missed it (\u2212), counted back from his most recent game. Tap a row for his card.' },
    { key: 'best', group: RUN_GROUP, label: 'His best', w: 56, dp: 0, title: 'His longest run of the same kind inside this window (strict, consecutive).' },
    { key: 'prev', group: RUN_GROUP, label: 'Before', w: 52, dp: 0, title: 'The longest one he has that is NOT the one he is on.' },
    { key: 'strip', group: RUN_GROUP, label: 'Last games', heat: false, numeric: false, w: 112,
      fmt: (v, r) => <Sparkline strip={r._r.strip} run={r._r.run} size={6} max={15} />,
      title: 'His last games, newest on the right; bright is the active run.' },
    { key: 'l5', group: RUN_GROUP, label: 'L5', w: 44, dp: 0, fmt: (v) => (v == null ? '\u2014' : `${Number(v).toFixed(0)}%`), title: 'Share of his last 5 games that cleared the bar' },
    { key: 'l10', group: RUN_GROUP, label: 'L10', w: 46, dp: 0, fmt: (v) => (v == null ? '\u2014' : `${Number(v).toFixed(0)}%`), title: 'Share of his last 10 games that cleared the bar' },
    { key: 'l15', group: RUN_GROUP, label: 'L15', w: 46, dp: 0, fmt: (v) => (v == null ? '\u2014' : `${Number(v).toFixed(0)}%`), title: 'Share of his last 15 games that cleared the bar' },
    { key: 'l30', group: RUN_GROUP, label: 'L30', w: 46, dp: 0, fmt: (v) => (v == null ? '\u2014' : `${Number(v).toFixed(0)}%`), title: 'Share of his last 30 games that cleared the bar' },
    { key: 'stretch', group: RUN_GROUP, label: '1 in', w: 52, dp: 0, fmt: (v) => (v == null ? '\u2014' : `1 in ${v}`),
      title: 'At his own rate, a run this long comes up about once every N stretches. A small N is ordinary; a big N is an unusual stretch — and still only a stretch, not a forecast.' },
    { key: 'donutLast', group: DONUT_GROUP, label: 'Last donut', w: 62, dp: 0, fmt: (v) => (v == null ? '\u2014' : v === 0 ? 'last gm' : `${v}g`), title: 'Games since his last donut: a game with no hit, no run and no RBI.' },
    { key: 'donutN', group: DONUT_GROUP, label: 'Donuts', w: 50, dp: 0, invert: true, title: 'Donut games (no hit, no run, no RBI) in this window.' },
    { key: 'donutHit', group: DONUT_GROUP, label: 'To a hit', w: 56, dp: 1, invert: true, title: 'After a donut: games, on average, until he recorded a hit.' },
    { key: 'facing', group: BOARD_GROUPS.arm, label: 'Facing', heat: false, w: 116, dim: true, link: (pp) => (onOpenPitcher && pp?.pitcher_id ? () => onOpenPitcher(pp.pitcher_id) : null) },
    { key: 'bvp', group: BOARD_GROUPS.arm, label: 'Off him', heat: false, w: 58, mono: true, dim: true, title: 'This season against this pitcher: hits for at-bats.' },
  ], {}), 'opp', 'team'), [dir, openGame, onOpenPitcher])

  if (data === undefined) {
    return <div style={{ fontSize: TYPE.body, color: C.text3, fontFamily: NUM_FONT, padding: 18 }}>Loading the run board…</div>
  }
  if (!data) {
    return (
      <div>
        <Head />
        <Empty text="No run board published yet. It's written by the splits job on the Today workflow — one run and this fills in." />
      </div>
    )
  }

  const label = barLabel(market, bar)
  const sliceName = game ? (games.find((g) => g.key === game)?.label || game) : team

  return (
    <div>
      <Head stamp={data.slate_date} n={rows.length} span={data.games_per_player} />

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 7 }}>
        {MARKETS.map((m) => (
          <button key={m.key} onClick={() => { setMk(m.key); setThr(m.lines[0]); setOpen(null) }}
            style={chip(mk === m.key)}>{m.label}</button>
        ))}
        <span style={{ width: 8 }} />
        <span style={{ fontSize: TYPE.label, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Bar</span>
        {market.lines.map((v) => (
          <button key={v} onClick={() => { setThr(v); setOpen(null) }} style={chip(bar === v)}>{v}+</button>
        ))}
        <span style={{ width: 8 }} />
        {SPLITS.map(([k, l]) => (
          <button key={k} onClick={() => { setSplit(k); setOpen(null) }} style={chip(split === k)}
            title="The windows are computed on what survives this filter — 'his last 10 night games', not 'his last 10 games'.">{l}</button>
        ))}
        <span style={{ width: 8 }} />
        <button onClick={() => setDir('hot')} style={chip(dir === 'hot')}>Hot</button>
        <button onClick={() => setDir('cold')} style={chip(dir === 'cold')}
          title="The same board, the other direction — who has missed this bar the most times running.">Cold</button>
        {/* BREAKS ALLOWED (2026-08-24). Cold is defined as consecutive misses,
            so tolerance has no meaning there — the control only touches the
            Hot run length, and is disabled rather than hidden on Cold so its
            state survives a toggle back. */}
        <span style={{ width: 8 }} />
        <span style={{ fontSize: TYPE.label, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Breaks Allowed</span>
        {[0, 1, 2, 3].map((n2) => (
          <button key={n2} onClick={() => setBreaks(n2)} disabled={dir !== 'hot'}
            style={{ ...chip(dir === 'hot' && breaks === n2), opacity: dir === 'hot' ? 1 : 0.4, cursor: dir === 'hot' ? 'pointer' : 'default' }}
            title="How many non-qualifying games the active run can absorb without ending it. 0 is the strict streak — any miss ends it.">{n2}</button>
        ))}
      </div>

      {/* ── SECOND LINE: which slice of the slate, and in what order ──────
          Kept off the market/bar line on purpose. The row above chooses the
          QUESTION (which bar, hot or cold); this one chooses WHO you're
          asking it about. Mixing the two into one long wrapping row is how
          the page got called "all over the place". */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 9 }}>
        <Picker label="⚾ All teams" value={team} onChange={pickTeam}
          title="Show only this team's hitters. Same team list as the header filter."
          options={teams.map((t) => [t, t])} />
        <Picker label="🆚 All games" value={game} onChange={pickGame}
          title="Show both lineups in one matchup — the whole game on one board."
          options={games.map((g) => [g.key, g.label])} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="player or team"
          title="Free-text search. To slice the slate rather than hunt one name, use the team and game pickers."
          style={{
            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: TYPE.body, padding: '4px 9px',
            borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text, minWidth: 128, outline: 'none',
          }} />
      </div>

      {/* The slice, as a sentence you can undo. A filter you can't see is a
          wrong number waiting to happen — this is the same lesson that put
          allPlayers into HitsHRR's Runs mount. */}
      {(team || game) && (
        <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.6, marginBottom: 9 }}>
          Showing <b style={{ color: C.orange, fontFamily: NUM_FONT }}>{sliceName}</b> only —{' '}
          <b style={{ fontFamily: NUM_FONT, color: C.text }}>{rows.length}</b> of the{' '}
          <b style={{ fontFamily: NUM_FONT }}>{base.length}</b> hitters this board would otherwise show.{' '}
          <button onClick={clearSlice} style={{
            background: 'transparent', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer',
            color: C.orange, fontWeight: 800, borderBottom: `1px dashed ${C.orange}66`,
          }}>show everyone</button>
        </div>
      )}

      {!rows.length ? (
        <Empty text={team || game
          ? `Nobody in ${sliceName} has five ${split === 'all' ? '' : 'qualifying '}games logged for ${label}. Clear the slice to see the rest of the card.`
          : `Nobody on tonight's card has five ${split === 'all' ? '' : 'qualifying '}games logged for ${label}.`} />
      ) : (
        <>
          {/* ── WHERE TONIGHT'S RUNS ACTUALLY SIT (2026-08-31) ────────────
              Donovan: "make the patters page cooler."

              The cards were six big numbers with nothing to be big AGAINST.
              A 13 and a 4 sat in the same row wearing the same green, and the
              only way to learn that 13 was the tail of the board was to scroll
              the whole board. This is that scroll, as one row: every hitter's
              active run on this bar, stacked by length.

              It is a histogram of the thing the board is sorted by, so it can
              never disagree with the cards under it — same rows, same `run`,
              just counted. Hot to the right, cold to the left, and the column
              a card belongs to is the one wearing its own colour. */}
          <RunHistogram runs={rows.map(({ r }) => r.run)} label={label} />   {/* components/runs/RunParts.js */}

          <DenseTable
            key={dir}
            rows={tableRows}
            columns={columns}
            onRowClick={(row) => onPlayerClick?.(row)}
            initialSort={dir === 'hot' ? 'run' : { key: 'run', dir: 'asc' }}
            maxHeight={640}
            maxRows={Math.max(tableRows.length, 1)}
            sortUrlKey={null}
            caption={`Every hitter on tonight's card with five games logged for ${label}, ranked by his active run. Pattern watching, not evidence: a run is a record of games already played, and the 1 in column says how often a hitter of his own rate puts one together. A donut is a game with no hit, no run and no RBI. Tap a row for his card.`}
          />
        </>
      )}
    </div>
  )
}

// The board's rows come from the published payload; the modal needs a SLATE
// row. Falling back to a synthesised one would open a card with no matchup,
// no scores and no detail file, which reads as a broken modal rather than a
// missing player.
function slateRow(players, p) {
  return (players || []).find((x) => Number(x?.player_id ?? x?.id) === Number(p.player_id)) || null
}

function Head({ stamp, n, span }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
        <span style={{ fontSize: TYPE.name, fontWeight: 900 }}>🔥 Patterns</span>
        {n != null && (
          <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
            {n} hitters · last {span || 30} games{stamp ? ` · ${stamp}` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: TYPE.body, color: C.text2, lineHeight: 1.6, maxWidth: 780, marginBottom: 9 }}>
        Everyone on tonight&apos;s card, sorted by how many games running they&apos;ve cleared the bar you
        pick. <b style={{ color: C.text }}>Cold</b> flips it to the drought board — nine misses in a row
        is a position too. The strip is his last games, newest on the right, and the active run is the
        bright end of it. Narrow it to one <b style={{ color: C.text }}>team</b> or one{' '}
        <b style={{ color: C.text }}>game</b> with the pickers below, and every card, count and ranking
        on the page recomputes to that slice.{' '}
        <span style={{ color: C.text3 }}>
          Pattern watching, not evidence — a run is a record of games already played, and the line under
          each card says how often a hitter of his own rate puts one together.
        </span>
      </div>
    </>
  )
}
