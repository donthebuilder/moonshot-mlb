'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, n as num } from '../lib/player'
import { teamAbbrs } from '../lib/gamelogs'
import { matchupStories } from '../lib/matchupStory'
import { funFacts } from '../lib/funFacts'
import { dedupeGraded } from '../lib/graded'
import { useSetupHomers, backToBack } from '../lib/b2b'
import { pickSplit, HITTING_FIELDS } from '../lib/seasonSplit'
import { downloadStorylinesCard } from './shareCard'

// 📖 STORYLINES — the human layer (2026-08-06, on request).
//
// Three trackers nobody has to maintain, all live API:
//   🏁 MILESTONE WATCH — slate hitters within striking distance of round
//      numbers tonight, season (200 H, 100 RBI/R, 30/40/50 HR) and career
//      (500/1000/1500/2000... H, every 50th HR, 500-step RBI/R). One batch
//      people call with career+season hitting.
//   🎂 BIRTHDAYS — same call carries birthDate; anyone on the slate blowing
//      out candles gets the shoutout line.
//   🧸 GIVEAWAY NIGHTS — the schedule's own promotions feed: bobbleheads and
//      giveaways tonight, with the folklore flag when a slate hitter's OWN
//      bobblehead is being handed out at his park.
// Narrative on purpose — these are the lines you say out loud on stream.

// 'xbh' is computed (2B+3B+HR); everything else reads straight off the stat.
// 2026-08-09, Donovan: "I want those RBI and total bases for the milestone
// watches." They were already here — and that's exactly why it looked like
// they weren't. Season RBI had ONE rung (100) with a 3-deep window, and runs
// the same, so an RBI milestone could only ever fire for a hitter sitting on
// 97, 98 or 99. That's a handful of players a season for about three days
// each; in practice the line never appeared and the category looked missing.
//
// More rungs, on the numbers people actually mark: RBI and runs every 25 from
// 50 up, total bases every 50 from 200. The counting stats also get slightly
// deeper windows than homers do — nobody says "two homers from 40" and "two
// RBI from 100" with the same voice, because RBI move in bunches.
//
// Clutter is handled by the sort, not by keeping the list short: rows are
// ranked by proximity as a FRACTION of their window, so "1 homer from 40"
// still outranks "7 total bases from 300", and the panel only prints ten.
const S_MILES = [
  { key: 'hits', targets: [100, 150, 200], within: 3, word: 'hits' },
  { key: 'homeRuns', targets: [20, 30, 40, 50, 60], within: 2, word: 'homers' },
  { key: 'rbi', targets: [50, 75, 100, 125, 150], within: 4, word: 'RBI' },
  { key: 'runs', targets: [50, 75, 100, 125], within: 4, word: 'runs' },
  { key: 'stolenBases', targets: [20, 30, 40, 50], within: 2, word: 'steals' },
  { key: 'doubles', targets: [30, 40, 50], within: 2, word: 'doubles' },
  { key: 'triples', targets: [10, 15], within: 1, word: 'triples' },
  { key: 'totalBases', targets: [200, 250, 300, 350, 400], within: 8, word: 'total bases' },
  { key: 'xbh', targets: [50, 60, 70, 80], within: 2, word: 'extra-base hits' },
]
const C_MILES = [
  { key: 'hits', targets: [500, 1000, 1500, 2000, 2500, 3000], within: 5, word: 'career hits' },
  { key: 'homeRuns', targets: Array.from({ length: 14 }, (_, i) => 50 + i * 50), within: 2, word: 'career homers' },
  { key: 'rbi', targets: [500, 1000, 1500, 2000], within: 5, word: 'career RBI' },
  { key: 'runs', targets: [500, 1000, 1500, 2000], within: 5, word: 'career runs' },
  { key: 'doubles', targets: [200, 300, 400, 500], within: 3, word: 'career doubles' },
  { key: 'triples', targets: [50, 100], within: 2, word: 'career triples' },
  { key: 'totalBases', targets: [1000, 2000, 3000, 4000, 5000], within: 10, word: 'career total bases' },
  { key: 'xbh', targets: [300, 500, 700, 1000], within: 4, word: 'career extra-base hits' },
]

const readStat = (st, key) => {
  if (!st) return NaN
  if (key === 'xbh') return (Number(st.doubles) || 0) + (Number(st.triples) || 0) + (Number(st.homeRuns) || 0)
  return Number(st[key])
}

// Curated classics — a rivalry is folklore, not an algorithm.
const RIVALS = [
  ['NYY', 'BOS'], ['LAD', 'SF'], ['LAD', 'SD'], ['CHC', 'STL'], ['CHC', 'CWS'],
  ['NYY', 'NYM'], ['NYM', 'PHI'], ['NYM', 'ATL'], ['HOU', 'TEX'], ['BAL', 'WSH'], ['LAA', 'LAD'],
]

let _cacheByDate = {}
// matchup lines, cached per mount-scope so switching tabs doesn't re-pull the
// gameLogs. Key is the exact set of hitters this mount is showing, so the
// slate panel and each game's deep-dive keep their own.
const _mlineCache = new Map()
// 🎩 fun facts, cached the same way and on the same key shape
const _ffactCache = new Map()

// PER-GAME MODE (2026-08-08, "every game needs a storyline thing"):
// the same engine, three extra props. `players` scopes what renders;
// `fetchPlayers` (the FULL slate) feeds the API pull so the module cache is
// always slate-wide no matter which mount fires first; `gamePk` narrows
// giveaways to this building; `compact` = the deep-dive skin (always open,
// no collapse persistence, smaller header).
export default function Storylines({ players = [], fetchPlayers = null, gamePk = null, compact = false, slateDate = '', results, onPlayerClick }) {
  const dateKey = slateDate || new Date().toLocaleDateString('en-CA')
  const [data, setData] = useState(_cacheByDate[dateKey] || null)
  // Collapsed by default (2026-08-07, Donovan: "storyline kinda fills the
  // page too much"). The header keeps a live count summary so a closed panel
  // still tells you whether tonight has stories worth opening. Persists.
  const [open, setOpen] = useState(compact)
  useEffect(() => { if (!compact) { try { if (localStorage.getItem('story_open') === '1') setOpen(true) } catch {} } }, [compact])
  const flip = () => {
    if (compact) return
    setOpen((v) => { try { localStorage.setItem('story_open', v ? '0' : '1') } catch {}; return !v })
  }

  const pullFrom = (fetchPlayers && fetchPlayers.length ? fetchPlayers : players)
  useEffect(() => {
    // The slate-wide panel starts collapsed. Do not pull hundreds of MLB API
    // records for content the visitor has not asked to see yet. Compact
    // game-level panels are always open, so their existing behaviour stays
    // unchanged. Once loaded, the module caches below keep reopenings instant.
    if (!open) return undefined
    if (_cacheByDate[dateKey] || !pullFrom.length) { setData(_cacheByDate[dateKey] || null); return }
    let alive = true
    ;(async () => {
      try {
        const ids = [...new Set(pullFrom.map((p) => Number(p?.player_id ?? p?.id)).filter(Boolean))]
        const people = []
        for (let i = 0; i < ids.length; i += 100) {
          const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=stats(group=[hitting],type=[career,season])&fields=people,id,fullName,birthDate,currentAge,stats,type,displayName,splits,team,gameType,stat,${HITTING_FIELDS}`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
          people.push(...(j?.people || []))
        }
        const promos = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${dateKey}&hydrate=game(promotions)`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        // Team history (revenge games): yearByYear trimmed to season+team —
        // a few KB for the whole slate. Verified live 2026-08-06.
        const history = {}
        for (let i = 0; i < ids.length; i += 100) {
          const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=stats(group=[hitting],type=[yearByYear])&fields=people,id,stats,type,displayName,splits,season,team,id,name`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
          ;(j?.people || []).forEach((person) => {
            const blk = (person.stats || []).find((x) => x?.type?.displayName === 'yearByYear')
            history[person.id] = (blk?.splits || [])
              .map((sp) => ({ season: sp.season, teamId: sp?.team?.id }))
              .filter((x) => x.teamId)
          })
        }
        const abbrs = (await teamAbbrs().catch(() => null)) || {}
        if (alive) { _cacheByDate[dateKey] = { people, promos, history, abbrs }; setData(_cacheByDate[dateKey]) }
      } catch { if (alive) setData({ people: [], promos: null }) }
    })()
    return () => { alive = false }
  }, [open, pullFrom.length, dateKey])

  // ── ⚾ TONIGHT'S MATCHUP LINES (2026-08-09) — the lead section ──
  //
  // The panel used to open with slate trivia (most homers on the slate, most
  // career homers). Donovan: "most hr on the slate and most career hrs is not
  // what I'm looking for." True and useless — the leaderboard already says it,
  // and neither line was about TONIGHT'S MATCHUP.
  //
  // What he asked for instead, verbatim: "Alonso has 4 HR in his last 6 at
  // Citi and Gore has given up 3 in two starts here." THIS hitter, THIS park,
  // THIS arm, a real count on both sides. lib/matchupStory.js assembles it
  // from live game logs (hitting AND pitching, joined to venue IDs) and
  // refuses to write a clause whose sample doesn't exist — see that file for
  // the rules. It returns null far more often than not, which is the point.
  //
  // SCOPE: this reads `players`, not `fetchPlayers`, so the deep-dive mount
  // shows the lines for THAT game's hitters and the slate panel shows the
  // slate's. Cost is controlled inside the lib — a short candidate list, small
  // batches, and one cached pitcher pull shared by his whole lineup.
  const [mlines, setMlines] = useState([])
  const mkey = players.map((p) => Number(p?.player_id ?? p?.id) || 0).join(',')
  useEffect(() => {
    if (!open) return undefined
    if (!mkey) { setMlines([]); return undefined }
    const cached = _mlineCache.get(mkey)
    if (cached) { setMlines(cached); return undefined }
    let alive = true
    setMlines([])
    matchupStories(players, { look: compact ? 12 : 20, limit: compact ? 3 : 5 })
      .then((r) => { const out = r || []; _mlineCache.set(mkey, out); if (alive) setMlines(out) })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mkey, compact])

  // ── 🎩 FUN FACTS (2026-08-10) ──
  //
  // Donovan: "I want to know in-game storylines like 'Mr. Sunday' — Christian
  // Walker, he's got the most HRs on Sunday in the game. Fun things like that,
  // whimsical stats that help." lib/funFacts.js computes them off the hitting
  // game logs the props grid already caches, and refuses to crown anybody on a
  // thin number — see that file for the floors and the tie handling.
  //
  // 🏟 THE PARK FAMILY (2026-08-16, "storyline like top hitters with no hrs in
  // a park. or things like that can we add something like those too"). Same
  // lib, four more sentences, all about THIS BUILDING: a power bat who hasn't
  // gone deep here, a bat who does his damage here, an arm that keeps getting
  // tagged here, an arm nobody has taken deep here. Every one of them prints
  // its denominator — "0 HR in 41 PA there" — because two seasons at one park
  // is a handful of dates. `limit` went 4 → 6 the same day: ten builders
  // competing for four slots would have quietly retired the older facts on
  // busy nights, and nothing in this panel is allowed to disappear because
  // something new arrived.
  //
  // `skipPitchers` hands the lib the arms the matchup lines are already
  // talking about, so the same starter's park record can't appear twice in one
  // panel. It's part of the fun-facts cache key, so when the matchup lines land
  // after the facts do, the facts recompute — and that recompute is nearly
  // free, since every underlying pull is cached per player+park inside
  // lib/venueHr.js and lib/pitcherVenueHr.js.
  //
  // SCOPE IS ALWAYS THE SLATE, NEVER THIS MOUNT. Unlike the matchup lines,
  // these carry "most of the N bats we checked tonight", so the pool has to be
  // the same wherever the panel renders — it reads `pullFrom` (the full slate)
  // rather than `players`. And the per-game deep-dive skin doesn't show them at
  // all: a slate-wide superlative on a single game's card is a category error.
  const [ffacts, setFfacts] = useState([])
  const fkey = pullFrom.map((p) => Number(p?.player_id ?? p?.id) || 0).join(',')
  // the arms already spoken for by the matchup lines above
  const armSkipKey = mlines.map((m) => Number(m?.player?.pitcher_id) || 0).filter(Boolean).join(',')
  // Which SLATE the on-screen facts belong to. A recompute triggered only by
  // the arm-skip list is the same slate, so the facts already on screen stay
  // up while it runs — blanking them would make the section flicker every time
  // the matchup lines land. A new slate or a new date does clear them, because
  // then they really are the wrong facts.
  const ffScope = useRef('')
  useEffect(() => {
    if (!open) return undefined
    if (compact || !fkey) { setFfacts([]); return undefined }
    const ck = `${dateKey}|${fkey}|${armSkipKey}`
    const cached = _ffactCache.get(ck)
    if (cached) { ffScope.current = `${dateKey}|${fkey}`; setFfacts(cached); return undefined }
    let alive = true
    if (ffScope.current !== `${dateKey}|${fkey}`) setFfacts([])
    ffScope.current = `${dateKey}|${fkey}`
    funFacts(pullFrom, { look: 40, limit: 6, slateDate: dateKey, skipPitchers: armSkipKey ? armSkipKey.split(',').map(Number) : [] })
      .then((r) => { const out = r || []; _ffactCache.set(ck, out); if (alive) setFfacts(out) })
      .catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fkey, dateKey, compact, armSkipKey])

  // ── BACK-TO-BACK WATCH (2026-08-07) — pure slate field, no API needed.
  // games_since_last_hr === 0 means he homered in his most recent game;
  // tonight is the back-to-back try. Sorted by the bot's own HR score so the
  // list leads with hitters the model still likes tonight, not just anyone
  // who ran into one. Computed before the API guard on purpose: this section
  // must survive a failed people fetch.
  const isTmrw = slateDate && slateDate > new Date().toLocaleDateString('en-CA')
  const dayWord = isTmrw ? 'tomorrow' : 'tonight'

  // ── STORYLINE TRACKER (2026-08-08, Donovan: "storylines need a tracker —
  // nothing too crazy, just something if it happens during the day").
  // The published live results already grade every slate player, so this is
  // one small fetch on a 5-minute loop: pid → today's actual line. A
  // storyline that CASHES gets a ✅ on its row and counts in the header —
  // the page stops being a promise and starts being a scoreboard.
  //
  // VERIFIED SEMANTICS OF THE ✅ (audited 2026-08-09, and it was wrong):
  //
  //   1. THE JOIN IS BY player_id, never by name. results_live.json publishes
  //      player_id on every graded row and so does the slate, so `actuals` is
  //      keyed on the numeric id and looked up the same way. Names are never
  //      compared here — two Will Smiths is a real thing.
  //
  //   2. THE FILE MUST BE FOR THE SLATE ON SCREEN. This is the bug that was
  //      firing false ✅s. results_live.json carries a top-level `date`, and
  //      the bot leaves the LAST graded slate in that file until the next one
  //      starts grading — on 2026-08-09 it still held 2026-07-26. The tracker
  //      read `actual_hr` out of it unconditionally, so a hitter flagged for
  //      back-to-back watch (games_since_last_hr === 0, i.e. he homered in his
  //      most recent game) was matched against a stale file that recorded that
  //      very homer, and got a "✅ DID IT AGAIN" for the homer that put him on
  //      the list in the first place. Now the payload is dropped unless
  //      j.date === the slate date being viewed, so a ✅ can only ever mean a
  //      homer hit TODAY, in a game on TODAY's slate.
  //
  //   3. THE LABEL SAYS WHICH DAY IT MEANS. "DID IT AGAIN" was ambiguous; the
  //      b2b row now reads "HOMERED AGAIN TODAY".
  //
  //   4. Cache-busted, because raw.githubusercontent serves a five-minute
  //      max-age and the 5-minute poll was re-reading its own cached copy.
  //
  //   SOURCED FROM THE PROP NOW, NOT ITS OWN FETCH (2026-08-13, same "load
  //   faster" pass as HomerLedger.js — see the note there). Every one of
  //   this component's mounts sits on a page that already holds this exact
  //   results_live.json payload on the same refresh schedule this effect
  //   used to run on its own: Scoreboard.js and Home.js both already thread
  //   it through as `results`, and the per-game deep-dive now gets it via
  //   GameDeepDive → Games → Dashboard.js the same way. This was a second,
  //   independent fetch with its own 5-minute timer and its own
  //   cache-buster, fully duplicating a request the page already makes (and
  //   Dashboard's own poll is not gated to a foreground tab the way this
  //   one was, so it could actually be staler, not fresher). No fallback
  //   fetch if a caller doesn't have `results` to pass: the ✅ checkmarks
  //   below simply don't render, same as HomerLedger when it has none —
  //   every other section of this panel (matchup lines, fun facts,
  //   milestones, duels, revenge, birthdays, giveaways) reads nothing from
  //   this and renders exactly the same either way.
  const actuals = useMemo(() => {
    if (isTmrw || !results) return null
    // (2) the gate. No date, or a date that isn't this slate's, means we
    // have no graded results for tonight — show none rather than
    // yesterday's.
    if (String(results.date || '') !== String(dateKey)) return null
    // ONE ROW PER PLAYER (dedupeGraded — see lib/graded.js for why the
    // file has two rows for a hitter designated in two categories).
    // The old Map.set let the LAST category silently overwrite the
    // first; on a mid-grading file where one category was a step ahead
    // of the other, that could hand back the lower line.
    const m = new Map()
    dedupeGraded(results.graded_slots || results.results || []).forEach((s) => {
      const pid = Number(s?.player_id)
      if (pid) m.set(pid, { hr: Number(s?.actual_hr) || 0, hits: Number(s?.actual_hits) || 0 })
    })
    return m.size ? m : null
  }, [results, isTmrw, dateKey])
  // (1) id join, both sides numeric.
  const lineOf = (p) => {
    const pid = Number(p?.player_id ?? p?.id)
    return (pid && actuals?.get(pid)) || null
  }
  const hrToday = (p) => (lineOf(p)?.hr || 0) > 0
  const Cashed = ({ children }) => (
    <b style={{ color: '#4ade80', fontFamily: NUM_FONT, fontSize: 10, marginLeft: 4, whiteSpace: 'nowrap' }}
      title={`Graded from today's live results (${dateKey}) — a homer hit today, not the one that put him on this list.`}>✅ {children}</b>
  )
  // ── THE SAME-HOMER TRAP (fixed properly 2026-08-09, second report) ──
  // `games_since_last_hr === 0` means "he homered in his most recent game".
  // On a slate rebuilt after an early game has already finished, THAT GAME
  // IS TODAY — so a hitter who went deep in the 12:05 window enters the B2B
  // list because of today's homer, and then the tracker matches him against
  // that very same homer in today's graded file and awards ✅. One homer,
  // counted as both the setup and the payoff. The date gate couldn't catch
  // it: both halves genuinely are today.
  //
  // The fix is to demand independent proof that the SETUP homer happened
  // YESTERDAY, from yesterday's own graded file. A hitter only joins the
  // back-to-back watch if yesterday's results say he homered. When that file
  // hasn't published, the section still renders (it must survive a missing
  // file) but the ✅ is withheld — an unverifiable claim doesn't get a check.
  // ROUND TWO (2026-08-10) — a user reported Chourio on the back-to-back
  // watch when he had NOT homered the night before; he homered that same
  // day. Two holes were left:
  //
  //   (a) TOMORROW SLATES SKIPPED VERIFICATION ENTIRELY. The effect bailed on
  //       `isTmrw`, so every candidate rendered unchecked — which is exactly
  //       the report. On a tomorrow slate the SETUP homer is TODAY's, so the
  //       proof lives in today's live results, not in a graded file.
  //   (b) A MISSING FILE MEANT "SHOW EVERYTHING". The filter passed rows
  //       through whenever proof was unavailable, so an outage silently
  //       became a page full of unverifiable claims.
  //
  // Both are now closed the same way: the proof source follows the slate, and
  // WITHOUT PROOF THE SECTION DOES NOT RENDER. A back-to-back watch nobody
  // can stand behind is worse than no back-to-back watch — this panel's whole
  // value is that its claims are checkable.
  // LIFTED TO lib/b2b.js (2026-08-09). This exact rule had to exist on the
  // Home tab's "Tonight's angles" too, and when it was written here only, the
  // front page kept publishing the unverified version of the same claim for
  // days. One implementation, two callers, no drift.
  const setupHr = useSetupHomers(dateKey)
  const { list: b2bAll, verified: b2bVerified } = backToBack(players, setupHr)
  const b2b = b2bAll
    .sort((a, b) => num(b?.hr_score, 0) - num(a?.hr_score, 0))

  // The matchup lines are their own pull, so they must survive a failed
  // people fetch the same way the b2b watch does.
  if (compact && !data?.people?.length && !b2b.length && !mlines.length && !ffacts.length) return null

  const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const statOf = (person, type) => {
    const block = (person.stats || []).find((s) => s?.type?.displayName === type)
    // pickSplit, not splits[0] — see lib/seasonSplit.js. For a hitter traded
    // mid-season splits[0] is his OLD CLUB'S partial line, so his milestones
    // were computed off half a season and could never fire.
    return pickSplit(block)
  }

  // 👑 SLATE HR LEADERS: REMOVED, INCLUDING THE WORK (2026-08-09 audit).
  // Donovan cut these lines a while back ("most HR on the slate and most
  // career HRs is not what I'm looking for") but only the RENDER was removed —
  // it was left as `{false && (…)}` while homerLeaders() still walked every
  // hitter twice on every render to compute two values nothing read. Dead
  // code that still costs something is worse than dead code.

  // ── milestones ──
  const miles = []
  ;(data?.people || []).forEach((person) => {
    const p = byId.get(person.id)
    if (!p) return
    const season = statOf(person, 'season')
    const career = statOf(person, 'career')
    S_MILES.forEach((m) => {
      const v = readStat(season, m.key)
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, within: m.within, word: `${m.word} this season`, prox: need / m.within })
      })
    })
    C_MILES.forEach((m) => {
      const v = readStat(career, m.key)
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, within: m.within, word: m.word, prox: need / m.within })
      })
    })
  })
  // ONE ROW PER PLAYER (2026-08-09 audit). Widening the rungs made it
  // genuinely possible for one hitter to be near a homer number AND an RBI
  // number AND a total-bases number, and the ten-row panel could fill up with
  // three men. Sort by closeness first, then keep each player's nearest.
  miles.sort((a, b) => a.prox - b.prox)
  {
    const seen = new Set()
    const one = []
    miles.forEach((m) => {
      const pid = Number(m.p?.player_id ?? m.p?.id)
      if (!pid || seen.has(pid)) return
      seen.add(pid)
      one.push(m)
    })
    miles.length = 0
    miles.push(...one)
  }

  // ── BvP duels — free, straight off the slate's bvp_* fields ──
  const duels = []
  players.forEach((p) => {
    const pa = num(p?.bvp_pa, 0), h = num(p?.bvp_hits, 0), hr = num(p?.bvp_hr, 0)
    const ab = num(p?.bvp_ab, pa), avg = num(p?.bvp_avg, 0), ops = num(p?.bvp_ops, 0)
    const arm = String(p?.pitcher_name || '').split(' ').slice(-1)[0]
    if (!arm) return
    if (pa >= 8 && (hr >= 2 || ops >= 1.05)) {
      duels.push({ p, own: true, hr, text: `${h}-for-${ab}${hr ? `, ${hr} HR` : ''} lifetime vs ${arm}` })
    } else if (pa >= 10 && avg <= 0.125 && hr === 0) {
      duels.push({ p, own: false, hr: 0, text: `${h}-for-${ab} lifetime vs ${arm}` })
    }
  })
  duels.sort((a, b) => (b.own === true) - (a.own === true) || b.hr - a.hr)

  // ── revenge games — facing a team he used to wear ──
  const revenge = []
  if (data?.history && data?.abbrs) {
    players.forEach((p) => {
      const hist = data.history[Number(p?.player_id ?? p?.id)] || []
      const opp = oppOf(p), own = teamOf(p)
      const yrs = hist.filter((x) => data.abbrs[x.teamId] === opp && opp !== own).map((x) => Number(x.season))
      // RECENCY GATE (2026-08-09 audit). Any appearance for that organisation
      // counted, so a cup of coffee eight years ago rendered as tonight's
      // "revenge game". Nobody in the park remembers that, which makes it the
      // opposite of a storyline. Four seasons is the window where the crowd,
      // the clubhouse and the broadcast still treat it as a homecoming.
      const thisYear = Number(String(dateKey).slice(0, 4)) || new Date().getFullYear()
      const recent = yrs.filter((y) => y >= thisYear - 4)
      if (recent.length) {
        const span = recent.length > 1 ? `${Math.min(...recent)}–${String(Math.max(...recent)).slice(2)}` : recent[0]
        revenge.push({ p, opp, span, last: Math.max(...recent) })
      }
    })
    revenge.sort((a, b) => b.last - a.last)
  }

  // ── rivalry nights — from the curated classics ──
  const matchups = new Set()
  players.forEach((p) => {
    const a2 = teamOf(p), b2 = oppOf(p)
    if (a2 && b2) matchups.add([a2, b2].sort().join('|'))
  })
  const rivalries = RIVALS.filter(([a2, b2]) => matchups.has([a2, b2].sort().join('|')))

  // ── birthdays ──
  const mmdd = dateKey.slice(5)
  // AGE FROM THE BIRTHDATE, NOT currentAge (2026-08-09 audit). currentAge is
  // "how old he is right now", which on a TOMORROW slate is still his old age —
  // so the tomorrow panel said "turns 29 tomorrow" for a man turning 30. The
  // birth year and the slate year answer it exactly, on either slate.
  const bdays = (data?.people || [])
    .filter((person) => String(person.birthDate || '').slice(5) === mmdd && byId.has(person.id))
    .map((person) => {
      const born = Number(String(person.birthDate || '').slice(0, 4))
      const yr = Number(String(dateKey).slice(0, 4))
      const age = Number.isFinite(born) && Number.isFinite(yr) ? yr - born : person.currentAge
      return { p: byId.get(person.id), age }
    })
    .filter((b) => Number.isFinite(b.age))

  // ── giveaways ──
  // SURNAME MATCHING, SCOPED TO THE RIGHT CLUBHOUSE (2026-08-09 audit).
  //
  // Two faults in one line. The Map was keyed by bare surname, so two Martes
  // on the slate silently collapsed into whichever was iterated last — and the
  // match then ran against EVERY hitter on the slate, so a "Marte Bobblehead"
  // in Arizona could be credited to a Mets outfielder. A giveaway is thrown by
  // one club for one of its own players, so the candidate pool is that game's
  // home roster and nothing else.
  //
  // Ambiguity inside one clubhouse is left unresolved rather than guessed: if
  // two home hitters share the surname in the promo, no star is attached and
  // the giveaway still renders as a giveaway.
  const byTeamSurname = new Map()
  players.forEach((p) => {
    const tm = String(teamOf(p) || '').toUpperCase()
    const ln = String(nameOf(p)).split(' ').slice(-1)[0].toLowerCase()
    if (!tm || ln.length <= 3) return
    const k = `${tm}|${ln}`
    if (byTeamSurname.has(k)) byTeamSurname.set(k, null)   // collision: unresolvable
    else byTeamSurname.set(k, p)
  })
  const giveaways = []
  ;(data?.promos?.dates?.[0]?.games || [])
    .filter((g) => !gamePk || Number(g?.gamePk) === Number(gamePk))
    .forEach((g) => {
    const home = g?.teams?.home?.team?.name || ''
    const homeAbbr = String(data?.abbrs?.[g?.teams?.home?.team?.id] || '').toUpperCase()
    ;(g.promotions || []).forEach((pr) => {
      const nm = String(pr.name || '')
      const isBobble = /bobble/i.test(nm)
      if (pr.offerType !== 'Giveaway' && !isBobble) return
      let star = null
      if (homeAbbr) {
        const low = nm.toLowerCase()
        for (const [k, p] of byTeamSurname) {
          if (!p || !k.startsWith(`${homeAbbr}|`)) continue
          if (low.includes(k.slice(homeAbbr.length + 1))) { star = p; break }
        }
      }
      giveaways.push({ home, nm, isBobble, star, dist: pr.distribution || '' })
    })
  })
  // CURATION (2026-08-08, Donovan: "less of the second unless major or
  // player oriented"): a giveaway earns a line only when it's about a
  // PLAYER (his own night, a bobblehead, a jersey/replica) — generic polos
  // and tees are stadium ops, not storylines.
  const majorGiveaways = giveaways.filter((g) =>
    g.star || g.isBobble || /jersey|replica|figurine|poster|card|banner|ring|trophy/i.test(g.nm))
  majorGiveaways.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (b.isBobble ? 1 : 0) - (a.isBobble ? 1 : 0))

  // tracker tally: unique players whose storyline actually happened today
  // Same id join as the ✅ itself; a row with no id can't be graded and is not
  // counted (rather than collapsing into one NaN bucket, which it used to).
  const cashedIds = new Set()
  const mark = (p, ok) => { const pid = Number(p?.player_id ?? p?.id); if (pid && ok) cashedIds.add(pid) }
  if (actuals) {
    // the leader going deep tonight is that storyline landing, same as any
    // other row — cashedIds is a Set of ids, so a player already counted
    // elsewhere doesn't get counted twice
    mlines.forEach((m) => mark(m.player, hrToday(m.player)))
    b2b.forEach((p) => mark(p, b2bVerified && hrToday(p)))
    miles.forEach((m) => mark(m.p, /homer/i.test(m.word) && hrToday(m.p)))
    duels.forEach((d) => mark(d.p, d.own ? hrToday(d.p) : (lineOf(d.p)?.hits || 0) > 0))
    revenge.forEach((r) => mark(r.p, hrToday(r.p) || (lineOf(r.p)?.hits || 0) > 0))
  }

  // The homer leaders keep the slate-wide panel alive on a quiet night, but
  // they do NOT count for the per-game skin: "most homers in this game" is
  // true of every game ever played, so letting it count would retire the
  // honest "no storylines in this one — just baseball" line entirely.
  const hasLeaders = false   // slate HR leaders retired 2026-08-09
  const empty = !hasLeaders && !mlines.length && !ffacts.length && !b2b.length && !miles.length && !bdays.length && !majorGiveaways.length && !duels.length && !revenge.length && !rivalries.length
  if (empty && compact) {
    return (
      <div style={{ fontSize: 10, color: C.text3, margin: '6px 0 10px', fontStyle: 'italic' }}>
        📖 no storylines in this one — just baseball
      </div>
    )
  }

  // Both the matchup lines and the fun facts return the same tagged `parts`
  // array, so they render through one component: names bold, every COUNTED
  // number in the mono font. That contrast is doing real work — it lets a
  // reader see at a glance which words are claims and which are prose.
  const Parts = ({ parts: bits }) => bits.map((x, j) => (
    x.type === 'name'
      ? <b key={j} style={{ color: C.text }}>{x.text}</b>
      : x.type === 'num'
        ? <b key={j} style={{ fontFamily: NUM_FONT, color: C.orange }}>{x.text}</b>
        : <span key={j}>{x.text}</span>
  ))

  // className="tap-row" (2026-08-10 phone pass): every line in this panel is a
  // clickable div at 11px with 3px of padding — about 21px tall, sitting flush
  // against the next one. On a phone that's a coin toss between two players.
  // .tap-row is the existing hook that floors it at 44px on a touch device.
  const Row = ({ icon, children, p, title, style = {} }) => {
    const interactive = Boolean(p && onPlayerClick)
    const Tag = interactive ? 'button' : 'div'
    return (
      <Tag
        type={interactive ? 'button' : undefined}
        onClick={interactive ? () => onPlayerClick(p) : undefined}
        className={interactive ? 'tap-row' : undefined}
        title={title}
        style={{
          display: 'flex', gap: 8, alignItems: 'baseline', width: '100%',
          font: 'inherit', fontSize: 11, lineHeight: 1.55, textAlign: 'left',
          padding: '3px 0', border: 'none', background: 'transparent',
          cursor: interactive ? 'pointer' : 'default', color: C.text2,
          ...style,
        }}
      >
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ minWidth: 0 }}>{children}</span>
      </Tag>
    )
  }

  const StoryHeader = compact ? 'div' : 'button'

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: open ? 6 : 0, flexWrap: 'wrap' }}>
        <StoryHeader
          type={compact ? undefined : 'button'}
          onClick={compact ? undefined : flip}
          aria-expanded={compact ? undefined : open}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 8, flex: '1 1 auto',
            minWidth: 0, flexWrap: 'wrap', padding: 0, border: 'none',
            background: 'transparent', color: 'inherit', font: 'inherit',
            textAlign: 'left', cursor: compact ? 'default' : 'pointer',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>📖 {compact ? 'This game\u2019s storylines' : 'Storylines'} {compact ? '' : (open ? '▾' : '▸')}</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
            {[
              mlines.length && `⚾ ${mlines.length} matchup line${mlines.length > 1 ? 's' : ''}`,
              ffacts.length && `🎩 ${ffacts.length} fun fact${ffacts.length > 1 ? 's' : ''}`,
              b2b.length && `🔁 ${b2b.length} b2b`,
              miles.length && `🏁 ${miles.length} milestone${miles.length > 1 ? 's' : ''}`,
              duels.length && `⚔ ${duels.length} duel${duels.length > 1 ? 's' : ''}`,
              revenge.length && `😤 ${revenge.length} revenge`,
              rivalries.length && `🔥 ${rivalries.length} rivalry`,
              bdays.length && `🎂 ${bdays.length}`,
              majorGiveaways.length && `🎁 ${majorGiveaways.length} giveaway${majorGiveaways.length > 1 ? 's' : ''}`,
            ].filter(Boolean).join(' · ')}
          </span>
          {cashedIds.size > 0 && (
            <span style={{ fontSize: 9.5, fontWeight: 900, color: '#4ade80', fontFamily: NUM_FONT }}
              title={`Storylines that actually happened on ${dateKey} — from that day's live graded results, refreshed every 5 minutes. Nothing is counted unless the graded file is for this slate.`}>
              ✅ {cashedIds.size} came true
            </span>
          )}
          {!open && <span style={{ fontSize: 9, color: C.text3 }}>— open to load live matchup stories</span>}
        </StoryHeader>
        {/* 📸 SHARE (2026-08-23) — tonight's matchup lines as a PNG, zero
            backend. stopPropagation so it doesn't also flip the panel. */}
        {mlines.length > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); downloadStorylinesCard(mlines, { note: compact ? 'this game' : 'the slate' }) }}
            title="Download tonight's matchup lines as a PNG for posting"
            aria-label="Download storylines as image"
            style={{
              marginLeft: 'auto', background: 'transparent', border: `1px solid ${C.border}`, color: C.text2,
              borderRadius: 6, padding: '1px 8px', fontSize: 11, lineHeight: 1.4, cursor: 'pointer',
            }}>📸</button>
        )}
      </div>

      {/* The strongest matchup line stays visible even when the panel is
          shut. The panel is collapsed by default because it "kinda fills the
          page" (2026-08-07), but a closed panel hiding the one line that IS
          about tonight's matchup defeats the point of writing it. One line,
          no chrome, tap to open the rest. */}
      {!open && mlines.length > 0 && (
        <Row icon="⚾" p={mlines[0].player} style={{ marginTop: 4 }}>
          <Parts parts={mlines[0].parts} />
        </Row>
      )}

      {/* THE COMPACT FUN FACT — this is the Home-page version. Home renders
          this panel collapsed, so without a peek line the whimsical layer would
          only exist for people who open a shut panel. One fact, the rarest one,
          no chrome, tap for his card. A park fact about a starting pitcher has
          no slate row to open, so that peek line is simply not clickable —
          `f.player` is null and the tap is skipped rather than opening
          somebody else's card. */}
      {!open && ffacts.length > 0 && (
        <Row
          icon={ffacts[0].icon}
          p={ffacts[0].player}
          title={ffacts[0].source || `Counted from his published game log — ${ffacts[0].sample}. Nothing here is modelled.`}
          style={{ marginTop: 4 }}
        >
          <Parts parts={ffacts[0].parts} />
        </Row>
      )}

      {open && (<>
      {/* HERO LINES — the two biggest bats in the building, stated plainly.
          These lead because they're the only storylines that are true every
          single night, and they're the ones a viewer can hold onto. */}

      {/* ⚾ THE MATCHUP LINES — one clean sentence per hitter, this park,
          this arm. Name bold, every counted number in the mono font, whole
          row clickable through to his card. */}
      {mlines.length > 0 && (
        <div style={{ marginBottom: 5 }}>
          {mlines.map((m) => (
            <Row
              key={`mx${m.pid}`}
              icon="⚾"
              p={m.player}
              title={`Game logs, ${m.seasons || 'this season and last'} — his at ${m.venue}, the starter's at ${m.venue}. Counted from published game logs, not modelled.`}
              style={{ fontSize: 11.5 }}
            >
              <Parts parts={m.parts} />
              {hrToday(m.player) && <Cashed>WENT DEEP</Cashed>}
            </Row>
          ))}
        </div>
      )}

      {/* 🎩 FUN FACTS — the whimsical layer. Sorted rarest-first by the lib, so
          the line that leads is the one worth saying out loud. Each states its
          own sample in the sentence and carries the full provenance in the
          tooltip; every "most" claim was checked across the whole set of
          hitters the lib actually computed, and the line says how many that
          was. See lib/funFacts.js for the floors — a two-homer Sunday does not
          get a nickname.

          The park facts (🧊 🏟 💣 🔒) come back through this same list because
          they are the same kind of thing: one sentence, its denominator said
          out loud, no causal claim about the building attached. Two details
          they add — a fact can carry its own `source` string, since "his
          hitting game log this season" is the wrong provenance for a
          two-season park record or for a pitcher's log; and a fact can have no
          `player`, because the two arm facts are about somebody who has no row
          on the hitters slate. Those rows don't open a card and don't pretend
          to be tappable. */}
      {ffacts.length > 0 && (
        <div style={{ marginBottom: 5 }}>
          <div style={{
            fontSize: 8.5, fontWeight: 900, letterSpacing: '.1em', color: C.text3,
            fontFamily: NUM_FONT, margin: '4px 0 2px',
          }}>🎩 FUN FACTS</div>
          {ffacts.map((f) => (
            <Row
              key={`ff${f.key}`}
              icon={f.icon}
              p={f.player}
              title={f.source || `Counted from his published hitting game log this season — ${f.sample}. Any “most” was checked across every hitter this panel actually computed tonight, and the line names how many that was. Nothing here is modelled or estimated.`}
              style={{ fontSize: 11.5 }}
            >
              <Parts parts={f.parts} />
              {hrToday(f.player) && <Cashed>WENT DEEP TONIGHT</Cashed>}
            </Row>
          ))}
        </div>
      )}

      {b2b.slice(0, 6).map((x, i) => (
        <Row key={`bb${i}`} icon="🔁" p={x}>
          {/* the day is NAMED, so nobody has to guess which night the setup
              homer was (2026-08-10 user report). On a tomorrow slate the
              setup is today's game; on a today slate it's last night's. */}
          <b style={{ color: C.text }}>{nameOf(x)}</b> homered{' '}
          <b style={{ color: '#f87171' }}>{isTmrw ? 'today' : 'last night'}</b> — back-to-back watch for {dayWord}
          <span style={{ fontFamily: NUM_FONT, color: C.text3 }}> · {num(x?.season_hr, 0)} HR szn{num(x?.hr_score, 0) ? ` · bot ${num(x.hr_score, 0).toFixed(0)}` : ''}</span>
          {b2bVerified && hrToday(x) && <Cashed>HOMERED AGAIN TODAY</Cashed>}
        </Row>
      ))}
      {!compact && b2b.length > 6 && (
        <Row icon="🔁">
          <span style={{ color: C.text3 }}>+ {b2b.length - 6} more homered their last game — full list lives on the Due tab at window 1</span>
        </Row>
      )}

      {miles.slice(0, 10).map((m, i) => (
        <Row key={`m${i}`} icon="🏁" p={m.p}>
          <b style={{ color: C.text, display: 'inline-block', minWidth: 138, verticalAlign: 'top' }}>{nameOf(m.p)}</b>
          {' '}is <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{m.need}</b> away
          from <b style={{ fontFamily: NUM_FONT }}>{m.t.toLocaleString()}</b> {m.word}
          {m.need === 1 ? ` — could land ${dayWord}` : ''}
          {/* THE WINDOW, WRITTEN DOWN (2026-08-22) — AND THEN SAID IN WORDS
              (2026-08-29). These rungs are ordered by need ÷ window, not by
              need, and the two disagree constantly: 3 homers from 40 (a
              5-homer window) sits BELOW 8 hits from 500 (a 20-hit window).
              The row printed the 3 and the 8 and none of the windows, so the
              order looked broken. It was not — it was just never drawn.

              Drawing it as "1/2 of the window" fixed the ordering complaint
              and created a new one. Donovan: "the window thing on the
              storyline, what does that mean." Fair — "window" is this file's
              private word for the per-stat cutoff in RUNGS above (homers make
              the list at 2 away, RBI at 4, total bases at 8), and nothing on
              screen said so. The row already prints how far away he is, so
              the only thing left to say is where the list ends. It now says
              that, in words, and the ranking rule stays in the tooltip. */}
          <span
            title={`He needs ${m.need}, and a ${m.word.replace(/^career /, '')} chase only makes this list at ${m.within} or fewer away — so he is ${(100 * (1 - m.prox)).toFixed(0)}% of the way through the stretch that counts as close. That fraction is what orders these rows, not the raw gap: a big number inside a wide cutoff can be nearer than a small one inside a tight cutoff, which is why 3 homers can rank above 8 hits.`}
            style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, marginLeft: 6, cursor: 'help' }}
          >this list stops at {m.within}</span>
          {/homer/i.test(m.word) && hrToday(m.p) && (
            <Cashed>{m.need <= (lineOf(m.p)?.hr || 0) ? 'HIT THE NUMBER' : `homered — ${m.need - (lineOf(m.p)?.hr || 0)} to go`}</Cashed>
          )}
        </Row>
      ))}

      {duels.slice(0, 4).map((d, i) => (
        <Row key={`d${i}`} icon={d.own ? '⚔' : '🥶'} p={d.p}>
          {d.own
            ? <><b style={{ color: C.text }}>{nameOf(d.p)}</b> owns this matchup — <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{d.text}</b></>
            : <><b style={{ color: C.text }}>{nameOf(d.p)}</b> has never solved him: <span style={{ fontFamily: NUM_FONT }}>{d.text}</span> — tiny samples, big folklore</>}
          {d.own && hrToday(d.p) && <Cashed>OWNED HIM AGAIN</Cashed>}
          {!d.own && (lineOf(d.p)?.hits || 0) > 0 && <Cashed>finally solved him — {lineOf(d.p).hits} hit{lineOf(d.p).hits > 1 ? 's' : ''}</Cashed>}
        </Row>
      ))}

      {revenge.slice(0, 4).map((r, i) => (
        <Row key={`r${i}`} icon="😤" p={r.p}>
          <b style={{ color: C.text }}>{nameOf(r.p)}</b> faces his old team — wore <b>{r.opp}</b> in{' '}
          <span style={{ fontFamily: NUM_FONT }}>{r.span}</span>. Revenge games are theater, and theater sells.
          {hrToday(r.p) ? <Cashed>GOT &apos;EM</Cashed>
            : (lineOf(r.p)?.hits || 0) > 0 ? <Cashed>{lineOf(r.p).hits} hit{lineOf(r.p).hits > 1 ? 's' : ''} off the old team</Cashed> : null}
        </Row>
      ))}

      {rivalries.slice(0, 3).map(([a2, b2], i) => (
        <Row key={`rv${i}`} icon="🔥">
          Rivalry night: <b style={{ color: C.text }}>{a2} vs {b2}</b> — the games that never need a storyline get one anyway
        </Row>
      ))}

      {bdays.map((b, i) => (
        <Row key={`b${i}`} icon="🎂" p={b.p}>
          <b style={{ color: C.text }}>{nameOf(b.p)}</b> turns <b style={{ fontFamily: NUM_FONT }}>{b.age}</b> {isTmrw ? 'tomorrow' : 'today'} —
          birthday bombs are folklore, not physics, but nobody fades the birthday boy on stream
        </Row>
      ))}

      {majorGiveaways.slice(0, 3).map((g, i) => (
        <Row key={`g${i}`} icon={g.isBobble ? '🧸' : '🎁'} p={g.star}>
          <b style={{ color: C.text }}>{g.home}</b>: {g.nm}
          {g.dist ? <span style={{ color: C.text3, fontFamily: NUM_FONT }}> · {g.dist}</span> : ''}
          {g.star && <b style={{ color: C.orange }}> — {nameOf(g.star)}&apos;s own night, the folklore game</b>}
        </Row>
      ))}

      {/* AN OPEN PANEL WITH NOTHING IN IT (2026-08-09 audit).
          Every section here renders conditionally, so when the league call
          fails — or the slate is empty — opening the panel showed a header and
          a blank space. That reads as a broken component, and the difference
          between "no stories tonight" and "we couldn't load them" is exactly
          the kind of thing this panel is supposed to be careful about. Both
          are now said out loud, and they say different things. */}
      {!mlines.length && !ffacts.length && !b2b.length && !miles.length && !duels.length
        && !revenge.length && !rivalries.length && !bdays.length && !majorGiveaways.length && (
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, padding: '4px 0' }}>
          {!data ? (
            <>Still reading the league&apos;s player files for this slate — milestones, birthdays and
            giveaways all come from that one call, so they appear together when it lands. If it never
            does, nothing here gets invented to fill the space.</>
          ) : !players.length ? (
            <>No hitters on this slate to tell stories about yet.</>
          ) : (
            <>Nothing tonight: nobody on the slate is near a round number, nobody has a birthday, no
            player-oriented giveaways, and no matchup carried a big enough sample to be worth a
            sentence. Empty because the checks came back empty.</>
          )}
        </div>
      )}
      </>)}
    </div>
  )
}
