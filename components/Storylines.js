'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, n as num } from '../lib/player'
import { teamAbbrs } from '../lib/gamelogs'
import { dataUrl } from '../lib/dataSource'
import { matchupStories } from '../lib/matchupStory'
import { dedupeGraded } from '../lib/graded'

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
const S_MILES = [
  { key: 'hits', targets: [200], within: 3, word: 'hits' },
  { key: 'homeRuns', targets: [30, 40, 50, 60], within: 2, word: 'homers' },
  { key: 'rbi', targets: [100], within: 3, word: 'RBI' },
  { key: 'runs', targets: [100], within: 3, word: 'runs' },
  { key: 'stolenBases', targets: [30, 40, 50], within: 2, word: 'steals' },
  { key: 'doubles', targets: [30, 40, 50], within: 2, word: 'doubles' },
  { key: 'triples', targets: [10, 15], within: 1, word: 'triples' },
  { key: 'totalBases', targets: [300, 350, 400], within: 8, word: 'total bases' },
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

// PER-GAME MODE (2026-08-08, "every game needs a storyline thing"):
// the same engine, three extra props. `players` scopes what renders;
// `fetchPlayers` (the FULL slate) feeds the API pull so the module cache is
// always slate-wide no matter which mount fires first; `gamePk` narrows
// giveaways to this building; `compact` = the deep-dive skin (always open,
// no collapse persistence, smaller header).
export default function Storylines({ players = [], fetchPlayers = null, gamePk = null, compact = false, slateDate = '', onPlayerClick }) {
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
    if (_cacheByDate[dateKey] || !pullFrom.length) { setData(_cacheByDate[dateKey] || null); return }
    let alive = true
    ;(async () => {
      try {
        const ids = [...new Set(pullFrom.map((p) => Number(p?.player_id ?? p?.id)).filter(Boolean))]
        const people = []
        for (let i = 0; i < ids.length; i += 100) {
          const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=stats(group=[hitting],type=[career,season])`)
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
  }, [pullFrom.length, dateKey])

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
  }, [mkey, compact])

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
  const [actuals, setActuals] = useState(null)
  useEffect(() => {
    setActuals(null)
    if (isTmrw) return undefined
    let alive = true
    const pull = () => {
      const u = dataUrl('current/results_live.json')
      fetch(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return
          // (2) the gate. No date, or a date that isn't this slate's, means we
          // have no graded results for tonight — show none rather than
          // yesterday's.
          if (String(j.date || '') !== String(dateKey)) { setActuals(null); return }
          // ONE ROW PER PLAYER (dedupeGraded — see lib/graded.js for why the
          // file has two rows for a hitter designated in two categories).
          // The old Map.set let the LAST category silently overwrite the
          // first; on a mid-grading file where one category was a step ahead
          // of the other, that could hand back the lower line.
          const m = new Map()
          dedupeGraded(j.graded_slots || j.results || []).forEach((s) => {
            const pid = Number(s?.player_id)
            if (pid) m.set(pid, { hr: Number(s?.actual_hr) || 0, hits: Number(s?.actual_hits) || 0 })
          })
          setActuals(m.size ? m : null)
        })
        .catch(() => {})
    }
    pull()
    const t = setInterval(pull, 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [isTmrw, dateKey])
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
  const [ydayHr, setYdayHr] = useState(undefined)   // undefined = unknown
  useEffect(() => {
    if (isTmrw) { setYdayHr(undefined); return undefined }
    let alive = true
    const d = new Date(new Date(`${dateKey}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10)
    const u = dataUrl(`current/graded_results_${d}.json`)
    fetch(`${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return
        const s = new Set()
        dedupeGraded(j.graded_slots || j.results || []).forEach((r2) => {
          const pid = Number(r2?.player_id)
          if (pid && Number(r2?.actual_hr) > 0) s.add(pid)
        })
        setYdayHr(s)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [isTmrw, dateKey])

  const b2b = players
    .filter((p) => Number(p?.games_since_last_hr) === 0)
    // when yesterday's file is available, the setup homer must be IN it
    .filter((p) => !(ydayHr instanceof Set) || ydayHr.has(Number(p?.player_id ?? p?.id)))
    .sort((a, b) => num(b?.hr_score, 0) - num(a?.hr_score, 0))
  // ✅ only when the setup is verified — otherwise we can't tell the two
  // homers apart, and a check we can't defend is worse than no check.
  const b2bVerified = ydayHr instanceof Set

  // The matchup lines are their own pull, so they must survive a failed
  // people fetch the same way the b2b watch does.
  if (!data?.people?.length && !b2b.length && !mlines.length) return null

  const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const statOf = (person, type) => {
    const block = (person.stats || []).find((s) => s?.type?.displayName === type)
    return block?.splits?.[0]?.stat || null
  }

  // ── 👑 BEST HOMER BATS (2026-08-09) ──
  //
  // The milestone tracker only fires when someone is within two of a round
  // number, so on most nights the panel never said the simplest true thing
  // about the slate: who hits the most homers. The people call already pulls
  // career + season hitting for every hitter on the board, so both leaders are
  // free — no new fetch, no new field, no estimate.
  //
  // Ties are named as ties. "Judge — 41 this season" when three men are on 41
  // is a lie of omission, and this is the one line people repeat out loud.
  // Anyone the people call didn't return, or who has zero homers, simply isn't
  // a candidate; if nobody qualifies the row doesn't render.
  const homerLeaders = (type) => {
    let bestHr = 0
    let list = []
    ;(data?.people || []).forEach((person) => {
      const p = byId.get(person.id)
      if (!p) return
      const hr = readStat(statOf(person, type), 'homeRuns')
      if (!Number.isFinite(hr) || hr <= 0) return
      if (hr > bestHr) { bestHr = hr; list = [p] }
      else if (hr === bestHr) list.push(p)
    })
    return list.length ? { hr: bestHr, list } : null
  }
  const seasonKing = homerLeaders('season')
  const careerKing = homerLeaders('career')

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
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: `${m.word} this season`, prox: need / m.within })
      })
    })
    C_MILES.forEach((m) => {
      const v = readStat(career, m.key)
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: m.word, prox: need / m.within })
      })
    })
  })
  miles.sort((a, b) => a.prox - b.prox)

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
      const yrs = hist.filter((x) => data.abbrs[x.teamId] === opp && opp !== own).map((x) => x.season)
      if (yrs.length) {
        const span = yrs.length > 1 ? `${Math.min(...yrs)}–${String(Math.max(...yrs)).slice(2)}` : yrs[0]
        revenge.push({ p, opp, span, last: Math.max(...yrs) })
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
  const bdays = (data?.people || [])
    .filter((person) => String(person.birthDate || '').slice(5) === mmdd && byId.has(person.id))
    .map((person) => ({ p: byId.get(person.id), age: person.currentAge }))

  // ── giveaways ──
  const lastNames = new Map(players.map((p) => [String(nameOf(p)).split(' ').slice(-1)[0].toLowerCase(), p]))
  const giveaways = []
  ;(data?.promos?.dates?.[0]?.games || [])
    .filter((g) => !gamePk || Number(g?.gamePk) === Number(gamePk))
    .forEach((g) => {
    const home = g?.teams?.home?.team?.name || ''
    ;(g.promotions || []).forEach((pr) => {
      const nm = String(pr.name || '')
      const isBobble = /bobble/i.test(nm)
      if (pr.offerType !== 'Giveaway' && !isBobble) return
      let star = null
      for (const [ln, p] of lastNames) {
        if (ln.length > 3 && nm.toLowerCase().includes(ln)) { star = p; break }
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
  const empty = !hasLeaders && !mlines.length && !b2b.length && !miles.length && !bdays.length && !majorGiveaways.length && !duels.length && !revenge.length && !rivalries.length
  if (empty && !compact) return null
  if (empty && compact) {
    return (
      <div style={{ fontSize: 10, color: C.text3, margin: '6px 0 10px', fontStyle: 'italic' }}>
        📖 no storylines in this one — just baseball
      </div>
    )
  }

  const Row = ({ icon, children, p }) => (
    <div onClick={() => p && onPlayerClick?.(p)} style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, lineHeight: 1.55,
      padding: '3px 0', cursor: p ? 'pointer' : 'default', color: C.text2,
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div onClick={flip} style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: open ? 6 : 0, cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📖 {compact ? 'This game\u2019s storylines' : 'Storylines'} {compact ? '' : (open ? '▾' : '▸')}</span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          {[
            mlines.length && `⚾ ${mlines.length} matchup line${mlines.length > 1 ? 's' : ''}`,
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
        {!open && <span style={{ fontSize: 9, color: C.text3 }}>— the human layer, tap to open</span>}
      </div>

      {/* The strongest matchup line stays visible even when the panel is
          shut. The panel is collapsed by default because it "kinda fills the
          page" (2026-08-07), but a closed panel hiding the one line that IS
          about tonight's matchup defeats the point of writing it. One line,
          no chrome, tap to open the rest. */}
      {!open && mlines.length > 0 && (
        <div
          onClick={() => onPlayerClick?.(mlines[0].player)}
          style={{ fontSize: 11, lineHeight: 1.55, color: C.text2, marginTop: 4, cursor: 'pointer' }}
        >
          ⚾{' '}
          {mlines[0].parts.map((x, j) => (
            x.type === 'name'
              ? <b key={j} style={{ color: C.text }}>{x.text}</b>
              : x.type === 'num'
                ? <b key={j} style={{ fontFamily: NUM_FONT, color: C.orange }}>{x.text}</b>
                : <span key={j}>{x.text}</span>
          ))}
        </div>
      )}

      {open && (<>
      {/* HERO LINES — the two biggest bats in the building, stated plainly.
          These lead because they're the only storylines that are true every
          single night, and they're the ones a viewer can hold onto. */}
      {false && (
        {/* 👑/🏛 slate HR leaders REMOVED (2026-08-09, Donovan: "most
            hr on the slate and most career hrs is not what I'm looking
            for"). They were true and useless — the leaderboard says the
            same thing, and neither line was about TONIGHT'S matchup,
            which is what a storyline has to be. The ⚾ block below is
            what replaced them. */}
      )}

      {/* ⚾ THE MATCHUP LINES — one clean sentence per hitter, this park,
          this arm. Name bold, every counted number in the mono font, whole
          row clickable through to his card. */}
      {mlines.length > 0 && (
        <div style={{ marginBottom: 5 }}>
          {mlines.map((m) => (
            <div
              key={`mx${m.pid}`}
              onClick={() => onPlayerClick?.(m.player)}
              title={`Game logs, ${m.seasons || 'this season and last'} — his at ${m.venue}, the starter's at ${m.venue}. Counted from published game logs, not modelled.`}
              style={{
                display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5, lineHeight: 1.55,
                padding: '3px 0', cursor: 'pointer', color: C.text2,
              }}
            >
              <span style={{ flexShrink: 0 }}>⚾</span>
              <span style={{ minWidth: 0 }}>
                {m.parts.map((x, j) => (
                  x.type === 'name'
                    ? <b key={j} style={{ color: C.text }}>{x.text}</b>
                    : x.type === 'num'
                      ? <b key={j} style={{ fontFamily: NUM_FONT, color: C.orange }}>{x.text}</b>
                      : <span key={j}>{x.text}</span>
                ))}
                {hrToday(m.player) && <Cashed>WENT DEEP</Cashed>}
              </span>
            </div>
          ))}
        </div>
      )}

      {b2b.slice(0, 6).map((x, i) => (
        <Row key={`bb${i}`} icon="🔁" p={x}>
          <b style={{ color: C.text }}>{nameOf(x)}</b> went deep <b style={{ color: '#f87171' }}>last game</b> — back-to-back watch
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
      </>)}
    </div>
  )
}
