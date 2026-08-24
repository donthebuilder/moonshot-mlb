'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { STATE, alpha } from '../../lib/scales'
import { fetchJSON, groupGames } from '../../lib/data'
import { clean, teamOf } from '../../lib/player'
import { Empty } from '../ui'
import Sparkline, { GameStrip } from '../Sparkline'
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
const chip = (on) => {
  const st = on ? STATE.on() : STATE.off()
  return {
    padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
    fontWeight: st.fontWeight, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
    border: `1px solid ${st.borderColor}`,
    background: on ? alpha(st.color, 0.14) : 'transparent',
    color: st.color,
  }
}

const SPLITS = [['all', 'All games'], ['D', 'Day'], ['N', 'Night'], ['H', 'Home'], ['A', 'Road']]
const ORDERS = [['run', 'Run length'], ['team', 'Team'], ['game', 'Game']]
const pct = (w) => (w ? `${w.pct.toFixed(0)}%` : '—')

/**
 * How ordinary is this run?
 *
 * If he clears the bar at rate p, an active run of k is roughly a p^k event on
 * any given stretch — so a 5-game run for a 60% hitter happens about one
 * stretch in 13, which is to say most weeks. Saying so is the difference
 * between a board that finds signal and one that manufactures it.
 */
function runOdds(run, base) {
  if (!base || run <= 1) return null
  const p = base.pct / 100
  if (!(p > 0 && p < 1)) return null
  const one = Math.pow(p, run)
  if (one <= 0) return null
  return Math.round(1 / one)
}

/**
 * The same arithmetic as a sentence, for anywhere the number alone is mute.
 *
 * This used to render only on the six featured cards, which meant the one
 * genuinely honest thing this page computes was unavailable for the other two
 * hundred hitters — you could open a row, see "7▲", and get no help at all
 * deciding whether seven is remarkable for THAT hitter. It now backs every
 * expanded row too. Phrasing stays descriptive of his own past rate; nothing
 * here says a run continues.
 */
function RunOddsLine({ run, base, size = 9 }) {
  const k = Math.abs(run)
  const odds = runOdds(k, base)
  if (!odds) return null
  return (
    <div style={{ fontSize: size, color: C.text3, marginTop: 3, lineHeight: 1.45 }}>
      At his own {pct(base)} rate, {k} in a row comes up about once every{' '}
      <b style={{ color: C.text2 }}>{odds}</b> stretches
      {odds <= 20 ? ' — which is to say regularly.' : ' — an unusual stretch at that rate, and still only a stretch.'}
    </div>
  )
}

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
          fontSize: 9.5, fontFamily: NUM_FONT, outline: 'none', cursor: 'pointer',
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

function MatchupLine({ row }) {
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
    <div style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginTop: 3, lineHeight: 1.5 }}>
      {arm && (
        <span title={`Tonight's starter${throws ? ` — throws ${throws}HP` : ''}`}>
          vs <b style={{ color: C.text2 }}>{arm}</b>{throws ? ` (${throws})` : ''}
        </span>
      )}
      {sideTxt && (
        <span title={`His season average against ${throws}HP — the side this arm throws from`}>
          {arm ? ' · ' : ''}<b style={{ color: C.text2 }}>{sideTxt}</b> vs {throws}HP
        </span>
      )}
      {ab > 0 ? (
        <span title={`Career against this pitcher: ${hits} for ${ab}${hr ? `, ${hr} HR` : ''}. Small samples are the norm here — the raw fraction is shown instead of an average for exactly that reason.`}>
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
      <div style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginTop: 2 }}
        title="A donut is a game with no hit, no run and no RBI — emptier than the blank board's 0-fer, which only requires no hit.">
        🍩 no donut games in this window
      </div>
    )
  }
  const f1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString())
  return (
    <div style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, marginTop: 2, lineHeight: 1.55 }}
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

export default function Runs({ players = [], onPlayerClick }) {
  const [data, setData] = useState(undefined)
  const [mk, setMk] = useState('hit')
  const [thr, setThr] = useState(1)
  const [split, setSplit] = useState('all')
  const [dir, setDir] = useState('hot')
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [game, setGame] = useState('')
  const [order, setOrder] = useState('run')
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

  // The board list, re-ordered. The featured cards below deliberately do NOT
  // use this — they are "the longest runs in what you're looking at", and
  // sorting them alphabetically would turn the page's answer into a roster.
  const ordered = useMemo(() => {
    if (order === 'run') return rows
    const idx = (t) => byTeam.get(String(t))?.i ?? 999
    return [...rows].sort((a, b) => {
      if (order === 'team') {
        const c = String(a.p.team || '').localeCompare(String(b.p.team || ''))
        if (c) return c
      } else {
        const c = idx(a.p.team) - idx(b.p.team)
        if (c) return c
        const t = String(a.p.team || '').localeCompare(String(b.p.team || ''))
        if (t) return t
      }
      return dir === 'hot' ? b.r.run - a.r.run : a.r.run - b.r.run
    })
  }, [rows, order, dir, byTeam])

  const groupOf = (x) => {
    if (!x || order === 'run') return null
    if (order === 'team') return String(x.p.team || '—')
    return byTeam.get(String(x.p.team))?.label || 'Not on tonight’s card'
  }
  const groupCounts = useMemo(() => {
    const m = new Map()
    if (order !== 'run') ordered.forEach((x) => { const k = groupOf(x); m.set(k, (m.get(k) || 0) + 1) })
    return m
  }, [ordered, order]) // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) {
    return <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, padding: 18 }}>Loading the run board…</div>
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
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Bar</span>
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
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Breaks Allowed</span>
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
        <span style={{ width: 8 }} />
        <span style={{ fontSize: 8, color: C.text3, textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 800 }}>Order</span>
        {ORDERS.map(([k, l]) => (
          <button key={k} onClick={() => { setOrder(k); setOpen(null) }} style={chip(order === k)}
            title={k === 'run'
              ? 'Longest active run first — the ranking this board has always used.'
              : `Group the board by ${k}, longest run first inside each group. The cards up top stay ranked by run.`}>
            {l}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="player or team"
          title="Free-text search. To slice the slate rather than hunt one name, use the team and game pickers."
          style={{
            marginLeft: 'auto', fontFamily: NUM_FONT, fontSize: 10.5, padding: '4px 9px',
            borderRadius: 999, border: `1px solid ${C.border}`, background: 'transparent',
            color: C.text, minWidth: 128, outline: 'none',
          }} />
      </div>

      {/* The slice, as a sentence you can undo. A filter you can't see is a
          wrong number waiting to happen — this is the same lesson that put
          allPlayers into HitsHRR's Runs mount. */}
      {(team || game) && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginBottom: 9 }}>
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
          {/* ── the leaders, as cards ── */}
          <div style={{
            display: 'grid', gap: 7, marginBottom: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))',
          }}>
            {rows.slice(0, 6).map(({ p, r }) => {
              const hot = r.run > 0
              return (
                <div key={p.player_id} onClick={() => onPlayerClick?.(slateRow(players, p))} className="tap-row"
                  style={{
                    border: `1px solid ${hot ? 'rgba(74,222,128,.3)' : 'rgba(248,113,113,.28)'}`,
                    borderRadius: 12, padding: '9px 12px', cursor: 'pointer',
                    background: hot ? 'rgba(74,222,128,.05)' : 'rgba(248,113,113,.04)',
                  }}>
                  <div style={{ fontFamily: NUM_FONT, fontSize: 8, color: C.text3, letterSpacing: '.08em', textTransform: 'uppercase' }}>
                    {p.team}{p.opp ? ` vs ${p.opp}` : ''} · {label}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginTop: 1 }}>{p.name}</div>
                  <div style={{
                    fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, marginTop: 2,
                    color: hot ? '#4ade80' : '#f87171',
                  }}>
                    {Math.abs(r.run)} game {hot ? 'run' : 'drought'}
                  </div>
                  <div style={{ margin: '5px 0 4px' }}
                    title={`His last ${Math.min(r.strip.length, 30)} games for ${label} — oldest on the left, tonight would come next on the right. Bright green is the active run.`}>
                    <Sparkline strip={r.strip} run={r.run} />
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                    <span title={r.l5 ? `${r.l5.ok} of ${r.l5.n} games` : ''}>L5 <b style={{ color: C.text2 }}>{pct(r.l5)}</b></span>
                    <span title={r.l10 ? `${r.l10.ok} of ${r.l10.n} games` : ''}>L10 <b style={{ color: C.text2 }}>{pct(r.l10)}</b></span>
                    <span title={r.l15 ? `${r.l15.ok} of ${r.l15.n} games` : ''}>L15 <b style={{ color: C.text2 }}>{pct(r.l15)}</b></span>
                    <span title={r.l30 ? `${r.l30.ok} of ${r.l30.n} games` : ''}>L30 <b style={{ color: C.text2 }}>{pct(r.l30)}</b></span>
                  </div>
                  {/* The one honest line on this page, at 9.5 rather than 9 —
                      it is the reason to trust or discount the big green
                      number directly above it, so it should not read as fine
                      print. */}
                  <RunOddsLine run={r.run} base={r.l30 || r.l15} size={9.5} />
                  <MatchupLine row={slateRow(players, p)} />
                  <DonutLine g={p.g} />
                </div>
              )
            })}
          </div>

          {/* ── the full board ── */}
          <div style={{ display: 'grid', gap: 4, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
            {ordered.map((x, i) => {
              const { p, r } = x
              const isOpen = open === p.player_id
              const g = groupOf(x)
              const newGroup = g && g !== groupOf(ordered[i - 1])
              const verb = r.run > 0 ? 'cleared' : 'missed'
              return (
                <Fragment key={p.player_id}>
                  {newGroup && (
                    /* A rule with a name on it, not a header tile. */
                    <div style={{
                      gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 9,
                      padding: i === 0 ? '2px 2px 1px' : '11px 2px 1px',
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT, color: C.text2, letterSpacing: '.05em' }}>{g}</span>
                      <span style={{ flex: 1, height: 1, background: C.border }} />
                      <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>{groupCounts.get(g)} hitters</span>
                    </div>
                  )}
                  <div style={{
                    border: `1px solid ${isOpen ? `${C.orange}55` : C.border}`, borderRadius: 9,
                    background: isOpen ? 'rgba(249,115,22,.05)' : C.bg2,
                    padding: '6px 9px', gridColumn: isOpen ? '1 / -1' : 'auto',
                  }}>
                    <div onClick={() => setOpen(isOpen ? null : p.player_id)} className="tap-row"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', minWidth: 0 }}>
                      <span
                        title={`${p.name} ${verb} ${label} in each of his last ${Math.abs(r.run)} ${split === 'all' ? '' : `${SPLITS.find(([k]) => k === split)?.[1].toLowerCase()} `}games. Tap for the log.`}
                        style={{
                          fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, minWidth: 26, textAlign: 'right',
                          color: r.run > 0 ? '#4ade80' : r.run < 0 ? '#f87171' : C.text3,
                        }}>{r.run > 0 ? `${r.run}▲` : `${-r.run}▼`}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                        {p.name}
                        <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 5 }}>{p.team}</span>
                      </span>
                      <Sparkline strip={r.strip} run={r.run} size={6} max={15} />
                      <span title={r.l15 ? `${r.l15.ok} of his last ${r.l15.n} games cleared ${label}` : ''}
                        style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3, minWidth: 30, textAlign: 'right' }}>
                        {pct(r.l15)}
                      </span>
                    </div>
                    {isOpen && (
                      <div style={{ paddingTop: 8 }}>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 7, flexWrap: 'wrap', fontFamily: NUM_FONT, fontSize: 10, color: C.text3 }}>
                          {[['L5', r.l5], ['L10', r.l10], ['L15', r.l15], ['L30', r.l30]].map(([l, w]) => (
                            <span key={l} title={w ? `${w.ok} of ${w.n}` : ''}>
                              {l} <b style={{ color: C.text, fontSize: 12 }}>{pct(w)}</b>
                            </span>
                          ))}
                          <button onClick={(e) => { e.stopPropagation(); onPlayerClick?.(slateRow(players, p)) }}
                            style={{ ...chip(false), marginLeft: 'auto' }}>open his card →</button>
                        </div>
                        <GameStrip strip={r.strip} max={15} />
                        <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5 }}>
                          {label} · newest on the right · green cleared it
                          {split !== 'all' ? ` · ${SPLITS.find(([k]) => k === split)?.[1].toLowerCase()} only` : ''}
                        </div>
                        <RunOddsLine run={r.run} base={r.l30 || r.l15} size={9.5} />
                      </div>
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
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
        <span style={{ fontSize: 14, fontWeight: 900 }}>🔥 Patterns</span>
        {n != null && (
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {n} hitters · last {span || 30} games{stamp ? ` · ${stamp}` : ''}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, maxWidth: 780, marginBottom: 9 }}>
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
