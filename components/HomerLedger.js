'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, n, clean } from '../lib/player'
import { dedupeGraded } from '../lib/graded'
import { pickSplit } from '../lib/seasonSplit'
import { hrShapeMeta, hrLine } from '../lib/hrShape'
import { fetchLiveSlate } from '../lib/liveSlate'
import { easternToday } from '../lib/data'
import { pitcherTags } from '../lib/pitcherTags'
import { pregameLedger } from '../lib/pregameLedger'
import { writeAlignArchive, readAlignArchive, shiftDateKey, usePeople, axesOf } from '../lib/alignments'
import { findNameEchoes, nameParts } from '../lib/namePatterns'
import NamePatterns from './NamePatterns'

// 🧾 THE HOMER LEDGER (2026-08-09, Donovan: "somewhere showing what number
// home run people are hitting — like if you notice more people getting their
// 15th, or a certain batting order spot getting more HRs on the day. More of
// something that builds and runs for each slate.")
//
// WHAT THIS ANSWERS: as tonight's homers land, which ones they were in each
// hitter's season (his 15th, his 5th) and where in the batting order they're
// coming from — a picture that fills in through the evening instead of a
// verdict handed down at the end.
//
// SOURCES, nothing invented:
//   results (prop)       actual_hr per graded player, tonight only (date-gated
//                       the same way the storyline tracker is — the file
//                       holds the last graded slate until a new one starts).
//                       Handed down from Scoreboard.js, which already has it —
//                       see the 2026-08-13 note below the imports for why this
//                       used to be its own fetch and isn't anymore.
//   MLB people/stats    the AUTHORITATIVE season homer total, which already
//                       includes tonight — so his latest homer simply IS that
//                       number, with no arithmetic to get wrong. Same call
//                       also carries his jersey number and birthdate
//                       (2026-08-13, see below) — nothing extra to fetch.
//   the slate row       lineup_spot, and season_hr as a marked fallback only
//
// THE NUMBER (rewritten 2026-08-09 — see the audit note above the fetch).
// It used to be slate.season_hr + tonight's homers, which double-counted any
// hitter whose slate row had already been rebuilt after he went deep, and
// which could only test the LAST number for a milestone so multi-homer nights
// skipped round numbers. Both were confidently-stated wrong numbers, which is
// the worst thing a panel like this can do. It asks the league now.
// A hitter with no total from either source shows "—"; an approximate one is
// marked with ≈ and says why in its tooltip.
//
// THE SPOT BARS: nine buckets, one per lineup slot, counting tonight's
// homers. Sample sizes are tiny by nature — a full slate is ~25 homers across
// nine spots — so the strip states the count and explicitly refuses to call
// three homers from the 2-hole a trend. It's a picture of tonight, not a
// finding about baseball.
//
// NUMEROLOGY (2026-08-13, Donovan sent gematrinator.com screenshots — jersey
// numbers, birthdays, "life path" numbers, matched player to player "just
// like the batting order thing" [LineupSlotMatchup's slot+side braid]).
// Confirmed scope, from his own answers: lives HERE, inside "Aligning with
// tonight" — not a new panel, not the bot's pick scoring. Jersey + birthday
// only for now; the deeper gematria-cipher treatment from the screenshots is
// a later step if this one earns it. See the longer note above digitRoot()
// below for why this isn't the first time a jersey/date signal was tried in
// this codebase, and why that history doesn't disqualify watching it here.

const ord = (v) => {
  const k = v % 10, h = v % 100
  return `${v}${k === 1 && h !== 11 ? 'st' : k === 2 && h !== 12 ? 'nd' : k === 3 && h !== 13 ? 'rd' : 'th'}`
}

// ── NUMEROLOGY, ONE RULE FOR EVERYTHING (2026-08-13) ────────────────────
//
// Donovan sent gematrinator.com screenshots and wants jersey numbers and
// birthdays tracked "with the numerology," matched against players the same
// way the ledger already matches season-homer numbers — and he confirmed
// this belongs INSIDE the ledger's existing "Aligning with tonight" section,
// not a new panel, and not the bot's pick scoring.
//
// Worth knowing before reading further: a jersey/date numerology signal was
// already tried in the bot (numerology_score, numerology_pair_score, up to
// 84% of one pairing formula) and pulled in a 2026-06-27 audit — the note
// says "no statistical basis," and more precisely, nothing downstream ever
// actually called it. That's a note about orphaned code, not a verdict on
// whether the patterns are worth watching — this stays exactly where the
// digit-root strip already lives: pattern spotting, disclosed as such,
// never fed into a score.
//
// digitRoot() below is the SAME reduction the homer-count pattern already
// uses (17 → 1+7 = 8) — moved up from inside model() so the fetch effect can
// use it too. One definition of "numerology" for the whole panel: a jersey,
// a birthday, and a homer count all reduce the same way, so a match across
// different kinds of number means what it looks like it means.
const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)

// Birthday reductions. "day number" is Donovan's own example — Jan 2 → 2 —
// which digitRoot already gives you for single-digit days; this just extends
// it to two-digit days (the 26th → 2+6 → 8) instead of inventing a second
// rule. Life path is the standard numerology sum of every digit in the full
// date, reduced the same way. Both read straight off the league's
// birthDate string (YYYY-MM-DD) — no local birthday database to maintain or
// get stale.
const dayRootOf = (birthDate) => {
  const d = Number(String(birthDate || '').slice(8, 10))
  return d > 0 ? digitRoot(d) : null
}
const lifePathOf = (birthDate) => {
  const digits = String(birthDate || '').replace(/[^0-9]/g, '')
  if (digits.length < 8) return null
  const sum = digits.split('').reduce((a, c) => a + Number(c), 0)
  return sum > 0 ? digitRoot(sum) : null
}

// "show players who landed that hit and possible align[ment]" — the why
// text under each tag names the other hitter(s), not just a count.
const joinNames = (names) => {
  if (names.length <= 1) return names[0] || ''
  if (names.length === 2) return names.join(' and ')
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

// Season-HR + jersey + birthday lookup cache (2026-08-13, "load faster" —
// see below). Keyed by pid, holding the last authoritative values AND how
// many of his tonight homers had already happened when it was fetched, so a
// cache hit only counts if it's at least that current — a real second homer
// always forces a fresh ask instead of quietly serving a total that's now
// one light. Jersey/birthday never change mid-season, so they just ride
// along in the same cached record rather than needing their own freshness
// rule. Module-level on purpose: it should survive this component
// unmounting when you leave the Scoreboard tab, not reset every time you
// come back to it.
const seasonHrCache = new Map()   // pid -> { hr, jersey, dayRoot, lifePath, atCount, ts }
const SEASON_HR_TTL = 10 * 60 * 1000


// ══ THE LOOK-OUT (rebuilt 2026-08-23; the 08-22 build was lost) ═════════════
// Donovan reframed the ledger as "both recap and predictive, read as a live
// look-out": WHO NEEDS WHAT (milestones), WHICH ARMS ARE TIRING (the tag
// rules, live), and pool load. Pool load needs pair/pool membership the
// slate rows don't carry — deliberately absent rather than faked; it lands
// when the bot publishes pool membership per row (rule: no data, no panel).
// Everything here is a LOOKUP, not a statistical claim — the pair-rhythm
// null test (claude/moonshot-pair-rhythm-null-test.md) is why this panel
// makes no per-night rate claims.
function LookOut({ players }) {
  const model = useMemo(() => {
    // one row per distinct starter, carrying the pitcher_* stat fields
    const byArm = new Map()
    for (const p of players) {
      const pid = Number(p?.pitcher_id)
      if (!pid || byArm.has(pid)) continue
      if (p?.pitcher_hr9 == null) continue
      byArm.set(pid, p)
    }
    const arms = []
    for (const [pid, row] of byArm) {
      const t = pitcherTags(row)
      const wear = t.tags.filter((x) => x.key === 'velo_down' || x.key === 'getting_hit' || x.key === 'era_spiking')
      if (t.leaks >= 2 || wear.length) {
        arms.push({
          pid,
          name: clean(row.pitcher_name, 'Unknown'),
          team: clean(row.pitcher_team, ''),
          opp: clean(row.team, ''),
          leaks: t.leaks,
          blowup: t.blowup,
          tiring: wear.length > 0,
          evidence: (wear[0] || t.tags.find((x) => x.tone === 'leak'))
            ? `${(wear[0] || t.tags.find((x) => x.tone === 'leak')).label} ${(wear[0] || t.tags.find((x) => x.tone === 'leak')).evidence}`
            : '',
        })
      }
    }
    arms.sort((a, b) => b.leaks - a.leaks)

    // WHO NEEDS WHAT — a bat one homer from a round number tonight.
    const seen = new Set()
    const milestones = []
    for (const p of players) {
      const pid = Number(p?.player_id)
      if (!pid || seen.has(pid)) continue
      seen.add(pid)
      const hr = n(p?.season_hr, null)
      if (hr == null) continue
      const next = Math.ceil((hr + 1) / 10) * 10
      if (next - hr === 1) {
        milestones.push({ pid, name: nameOf(p), team: teamOf(p), hr, next })
      }
    }
    milestones.sort((a, b) => b.hr - a.hr)
    return { arms: arms.slice(0, 8), milestones: milestones.slice(0, 8) }
  }, [players])

  if (!model.arms.length && !model.milestones.length) return null
  return (
    <div style={{
      background: 'rgba(255,255,255,.02)', border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '8px 11px', marginBottom: 9,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.07em', color: C.text3, textTransform: 'uppercase', marginBottom: 5 }}>
        👀 The look-out — tonight, before it happens
      </div>
      {model.arms.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.7 }}>
          <b style={{ color: C.text }}>Arms to watch:</b>{' '}
          {model.arms.map((a, i) => (
            <span key={a.pid} title={`${a.leaks} independent alarms${a.tiring ? ' · wear signal live' : ''}`}>
              {i > 0 && ' · '}
              <b style={{ color: a.blowup ? C.orange : C.text }}>{a.name}</b>
              {a.team ? ` (${a.team}${a.opp ? ` vs ${a.opp}` : ''})` : ''}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}>
                {' '}— {a.blowup ? `BLOWUP RISK, ${a.leaks} alarms` : a.evidence}
              </span>
            </span>
          ))}
        </div>
      )}
      {model.milestones.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.7, marginTop: model.arms.length ? 4 : 0 }}>
          <b style={{ color: C.text }}>Who needs what:</b>{' '}
          {model.milestones.map((m, i) => (
            <span key={m.pid}>
              {i > 0 && ' · '}
              {m.name}{m.team ? ` (${m.team})` : ''}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3 }}> sits on {m.hr} — one swing from {m.next}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4 }}>
        lookups, not predictions — the arms row is the tag rules run live (hover for the alarm count); pool load arrives when the bot publishes pool membership
      </div>
    </div>
  )
}

export default function HomerLedger({ players = [], slateDate = '', results, onPlayerClick }) {
  // ── CLOSEABLE, AND IT REMEMBERS (2026-08-17) ──────────────────────────────
  // Donovan, twice: "hr ledger on home page should be close able just like a
  // the other things", "yeah like the ledger need to be colasbple".
  // It sits at the top of Home, which is where he wants it — so on the nights
  // he does not want it there, it has to fold. Stored per device like the other
  // dismissibles, so closing it once is closing it for good.
  const [open, setOpen] = useState(true)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('ms_ledger_open')
      if (v === '0') setOpen(false)
    } catch { /* private mode */ }
  }, [])
  const toggle = () => {
    setOpen((v) => {
      const next = !v
      try { window.localStorage.setItem('ms_ledger_open', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }
  const Chevron = () => (
    <span
      onClick={(e) => { e.stopPropagation(); toggle() }}
      title={open ? 'Hide the ledger' : 'Show the ledger'}
      style={{ marginLeft: 'auto', cursor: 'pointer', color: C.text3, fontSize: 11, padding: '0 2px' }}
    >{open ? '▾' : '▸'}</span>
  )

  const dateKey = slateDate || easternToday()
  // COMPARED IN THE SAME FRAME THE SLATE DATE IS BUILT IN (2026-08-17).
  // This read `> new Date().toLocaleDateString('en-CA')` — the viewer's local
  // day — against a slateDate that lib/data.js derives from the games. With the
  // old max-game_time-in-local-time rule, tonight's slate came back as tomorrow
  // for anyone at UTC or east of it, so this was true all day and the component
  // returned null before doing anything. Both sides are US Eastern now, which
  // is the only frame in which "is this slate tomorrow's" has one answer for
  // every viewer.
  const isTmrw = slateDate && slateDate > easternToday()

  // SOURCED FROM THE PROP NOW, NOT ITS OWN FETCH (2026-08-13, Donovan: "it
  // need to load faster"). Scoreboard.js already holds this exact payload —
  // Dashboard.js fetches it once and polls it every 45s live / 5min idle,
  // shared with LiveWire, SlatePulse and the gone-yard tracker on the same
  // page — and was simply never handing it down here. This component had its
  // own copy of the same fetch, its own 3-minute timer, and its own
  // cache-buster, fully duplicating a request the page already makes (and
  // refreshes faster than this one did on its own, while live). Reusing the
  // prop deletes a redundant network round-trip on every mount for free —
  // the shape is identical (fetchJSON in lib/data.js returns the raw parsed
  // JSON, no transform), so nothing below needed to change to read it.
  // ── DETECTION: THE LEAGUE, NOT THE BOT (2026-08-16) ─────────────────────
  //
  // Donovan: "people are saying they dont see it or i wish i would have seen
  // it earlier... the detection has to be better and faster updating too."
  //
  // Both halves of that were structural, and neither was about polling harder.
  //
  // SLOWER THAN THE PAGE IT SITS ON. This panel read tonight's homers out of
  // the bot's graded file, so a homer only appeared here after the whole
  // chain: the ball lands, live_results_tracker.py writes the file, the data
  // branch propagates, and Dashboard's 45s poll picks it up. Minutes, and none
  // of them ours. Meanwhile lib/liveSlate.js is ALREADY polling the league
  // boxscore every 35 seconds for MiniWire, off a module-level cache — and
  // that snapshot carries homeRuns per batter. The fast number was on the page
  // the whole time; the ledger just wasn't reading it.
  //
  // AND IT COULD NOT SEE HALF THE HOMERS. The graded file only holds the ~85
  // hitters the bot designated. A homer from anyone else — most of a slate —
  // was invisible to this panel by construction. `lines` in the live snapshot
  // is EVERY batter in EVERY game, with a name attached, which is why an
  // off-slate homer can render at all now instead of silently not existing.
  //
  // So: the LIVE snapshot decides WHO homered and HOW MANY, because it is
  // faster and more complete. The GRADED file is still read, for one thing it
  // uniquely has — hr_events, the launch speed / angle / distance the grader
  // stamps on each homer, which is what lets a card say what KIND of homer it
  // was. A homer the live feed has and the grader hasn't reached yet simply
  // shows no band, which is the same honest gap an older night already had.
  // BIRTHDAYS FOR THE WHOLE SLATE, not just the men who already went deep
  // (2026-08-23). The people map the ledger fetches below covers the hitters
  // in the ledger; the watch needs the same two numbers for everybody who has
  // NOT homered yet, which is the entire point of a watch. usePeople is the
  // batched, module-cached call Alignments already makes for exactly this, so
  // this is a shared cache hit rather than a second round of requests.
  const { people, loaded: peopleLoaded } = usePeople(players)

  const [live, setLive] = useState(null)
  const [liveErr, setLiveErr] = useState(null)   // last league-call failure, surfaced
  useEffect(() => {
    if (isTmrw) return undefined
    let alive = true
    const pull = () => fetchLiveSlate()
      .then((s) => { if (alive) { setLive(s); setLiveErr(null) } })
      .catch((e) => { if (alive) setLiveErr(String(e?.message || e || 'league call failed')) })
    pull()
    // 30s, matched to the shared snapshot's own TTL — this does NOT add a
    // request per tick. fetchLiveSlate hands back the cached snapshot when it
    // is fresh, so with MiniWire on the page these two callers share one poll.
    // 12s, was 30 (2026-08-17, "the hr ledger is not updating fast enough").
    // One slim boxscore sweep per tick; 12s keeps a homer's appearance inside
    // half an at-bat without hammering statsapi.
    const id = setInterval(() => { if (!document.hidden) pull() }, 12_000)
    const onVis = () => { if (!document.hidden) pull() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isTmrw])

  // ── THE LEDGER REMEMBERS (2026-08-17) ─────────────────────────────────────
  // Donovan, diagnosing his own bug correctly: "the ledger is live and when
  // the game goes off the player disappears. i dont want it like that."
  //
  // He was right. The ledger rebuilt itself from the CURRENT snapshot every
  // tick, and a player was only "a homer tonight" for as long as his game was
  // in that snapshot. Three ways out of it: his game goes Final past the
  // viewer's midnight (the viewer-local date filter in liveSlate — fixed
  // there too), his game's single boxscore call fails one tick, or the feed
  // hiccups entirely. Each one silently un-homered a man who had homered.
  //
  // A ledger is a RECORD. Once a homer is seen it is written down — keyed by
  // slate date, max-HR-per-player so a late correction can only add, persisted
  // to localStorage so a page reload mid-slate does not start the night over.
  // Nothing is ever removed until the date key changes. Yesterday's entries
  // are dropped by key, not by feed behaviour.
  const seenRef = useMemo(() => {
    const store = { key: `ms_ledger_seen_${dateKey}`, map: new Map() }
    try {
      // prune any other night's record while loading tonight's
      for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('ms_ledger_seen_') && k !== store.key) window.localStorage.removeItem(k)
      }
      const raw = window.localStorage.getItem(store.key)
      if (raw) Object.entries(JSON.parse(raw)).forEach(([pid, rec]) => store.map.set(Number(pid), rec))
    } catch { /* private mode: memory-only, still sticky for the session */ }
    return store
  }, [dateKey])

  const rows = useMemo(() => {
    if (isTmrw) return null

    // hr_events by pid, from the graded file when it is for tonight. This is
    // the ONLY thing taken from the bot now, and its absence is survivable.
    const eventsById = new Map()
    if (results && String(results.date || '') === String(dateKey)) {
      dedupeGraded(results.graded_slots || results.results || []).forEach((s) => {
        const pid = Number(s?.player_id)
        if (pid && Array.isArray(s?.hr_events) && s.hr_events.length) eventsById.set(pid, s.hr_events)
      })
    }

    // THE LIVE PATH — write what the snapshot shows into the record, then
    // RENDER THE RECORD. The snapshot can only ever add or raise; a player
    // missing from this tick keeps last tick's entry.
    const lines = live?.lines
    if (lines && Object.keys(lines).length) {
      Object.entries(lines).forEach(([id, l]) => {
        const pid = Number(id)
        const hr = n(l?.hr, 0)
        if (!pid || hr <= 0) return
        const prev = seenRef.map.get(pid)
        if (!prev || hr > prev.hr) {
          seenRef.map.set(pid, { hr, name: String(l?.name || prev?.name || '') })
        }
      })
      try {
        window.localStorage.setItem(seenRef.key,
          JSON.stringify(Object.fromEntries([...seenRef.map].map(([k, v]) => [k, v]))))
      } catch { /* full or private: the in-memory record still holds */ }
    }
    if (seenRef.map.size) {
      return [...seenRef.map].map(([pid, rec]) => ({
        pid, hr: rec.hr, events: eventsById.get(pid) || [], liveName: rec.name, fromLive: true,
      }))
    }
    if (lines && Object.keys(lines).length) {
      // Snapshot loaded, record empty: a real zero once games have started;
      // indistinguishable from "not loaded" before first pitch.
      const started = Object.values(live?.games || {}).some((g) => g?.state && g.state !== 'Preview')
      if (started) return []
    }

    // FALLBACK: the graded file, exactly as before. Reached before first pitch,
    // when the league call fails, and on any archived night.
    if (!results) return null
    // date gate — the live file keeps the last graded slate until the next
    // one starts grading, so an ungated read shows a stale night
    if (String(results.date || '') !== String(dateKey)) return null
    // DEDUPE BY PLAYER (2026-08-09). A hitter designated in two categories
    // (TOP *and* HR, say) gets a graded slot per category, each carrying the
    // same actual_hr — walking the slots naively counted his homer twice and
    // inflated the night's total. The rule now lives in lib/graded.js because
    // it had bitten three components; this call site kept its own copy of it
    // until then.
    return dedupeGraded(results.graded_slots || results.results || [])
      // hr_events rides along from 2026-08-11: the grader now records each
      // homer's launch speed, angle and distance, so the ledger can say WHAT
      // KIND of homer it was and not just that one happened. Older nights
      // have no hr_events and simply show no band — an untracked homer and a
      // wall-scraper are different claims.
      .map((s) => ({ pid: Number(s?.player_id), hr: n(s?.actual_hr, 0), events: s?.hr_events || [] }))
      .filter((x) => x.pid && x.hr > 0)
  }, [results, isTmrw, dateKey, live, seenRef])

  // ── THE NUMBER HAS TO BE RIGHT, OR THE PANEL IS WORSE THAN NOTHING ───────
  //
  // AUDIT 2026-08-09. `nth` was computed as slate.season_hr + tonight's homers,
  // and that arithmetic is wrong in two ways that both produce a confidently
  // stated false number — the worst failure mode for a panel whose entire job
  // is to print a number.
  //
  //   1. season_hr IS NOT ALWAYS PREGAME. The slate republishes thirteen times
  //      a day. A hitter who goes deep in the 1:05 window gets a rebuilt slate
  //      row at 4pm whose season_hr ALREADY counts that homer — so pre + hr
  //      counts it twice and the ledger says "his 31st" for his 30th. Nothing
  //      in the payload distinguishes a pregame count from a refreshed one.
  //
  //   2. MULTI-HOMER GAMES SKIPPED ROUND NUMBERS. Only the final number was
  //      tested for a milestone, so a hitter sitting on 14 who hit two tonight
  //      reached 15 and 16 — and 16 isn't round, so his 15th went unmarked.
  //
  // Both disappear if we stop doing arithmetic and ask the league. One batched
  // people/stats call returns the AUTHORITATIVE season total, already including
  // tonight, so his latest homer IS that number and the ones he hit tonight
  // are the range below it. Same endpoint Storylines already uses.
  //
  // The slate arithmetic survives only as the fallback when the call fails,
  // and rows sourced that way are marked approximate in their tooltip rather
  // than presented with the same confidence.
  const [seasonHr, setSeasonHr] = useState(null)   // pid -> authoritative total
  // KEYED ON pid:hr, NOT JUST pid (2026-08-13, same "load faster" pass). The
  // old key was the pid list alone, so a SECOND homer from someone already on
  // tonight's list didn't change the key and never re-asked the league — his
  // season total could sit one light until some other, unrelated player's
  // homer happened to change the pid set. Encoding tonight's own count per
  // pid means an actual change to what we need to know is the only thing
  // that retriggers a check, and it's what the cache below keys against.
  const hrKey = useMemo(
    () => (rows || []).map((r) => `${r.pid}:${r.hr}`).sort().join(','),
    [rows],
  )
  useEffect(() => {
    if (!rows?.length) { setSeasonHr(null); return undefined }
    let alive = true
    const tonightCount = new Map(rows.map((r) => [r.pid, r.hr]))
    ;(async () => {
      const out = new Map()
      const now = Date.now()
      const need = []
      // CACHED PER PID (2026-08-13, "load faster"). Switching tabs away from
      // Scoreboard and back used to re-ask the league for every hitter's
      // season total from scratch, even seconds later. A season total is
      // final the moment his homer lands, so it's safe to hold for a few
      // minutes — only served from cache when we last fetched at or after his
      // CURRENT tonight tally, so a fresh homer always forces a fresh ask.
      tonightCount.forEach((hr, pid) => {
        const hit = seasonHrCache.get(pid)
        if (hit && hit.atCount >= hr && now - hit.ts < SEASON_HR_TTL) {
          out.set(pid, { hr: hit.hr, jersey: hit.jersey, dayRoot: hit.dayRoot, lifePath: hit.lifePath })
        } else need.push(pid)
      })
      for (let i = 0; i < need.length; i += 100) {
        const batch = need.slice(i, i + 100)
        // primaryNumber + birthDate (2026-08-13, numerology): both ride the
        // SAME batched call the season total already makes — nothing new to
        // fetch, just two more field names in the sparse-fieldset. Both are
        // base `people` fields (same level as `id`), not nested under stats.
        const url = 'https://statsapi.mlb.com/api/v1/people?personIds='
          + batch.join(',')
          + '&hydrate=stats(group=[hitting],type=[season])'
          + '&fields=people,id,primaryNumber,birthDate,stats,type,displayName,splits,team,gameType,stat,homeRuns,gamesPlayed'
        try {
          const j = await fetch(url).then((r) => (r.ok ? r.json() : null))
          ;(j?.people || []).forEach((person) => {
            // pickSplit, not splits[0]: a hitter traded mid-season has one
            // row per club and splits[0] is the OLD one, so his Nth-homer
            // number would be short by everything he did after the trade.
            const blk = (person.stats || []).find((s) => s?.type?.displayName === 'season')
            const hr = Number(pickSplit(blk)?.homeRuns)
            const pid = Number(person.id)
            const jerseyNum = Number(person.primaryNumber)
            // '' !== null but Number('') is 0 — without the empty-string
            // guard, "no number on file" would silently become "wears #0."
            const jersey = person.primaryNumber != null && person.primaryNumber !== '' && Number.isFinite(jerseyNum) ? jerseyNum : null
            const dayRoot = dayRootOf(person.birthDate)
            const lifePath = lifePathOf(person.birthDate)
            if (Number.isFinite(hr)) {
              out.set(pid, { hr, jersey, dayRoot, lifePath })
              seasonHrCache.set(pid, { hr, jersey, dayRoot, lifePath, atCount: tonightCount.get(pid) ?? 0, ts: now })
            }
          })
        } catch { /* fall back to slate arithmetic for these ids */ }
      }
      if (alive) setSeasonHr(out.size ? out : null)
    })()
    return () => { alive = false }
  }, [hrKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => {
    if (!rows?.length) return null
    // THE BUG THAT BLANKED EVERY NUMBER (2026-08-09): this keyed the map with
    // playerId(), which returns a COMPOSITE "id-gamePk" string — Number() of
    // that is NaN, so every lookup missed, every season count fell back to
    // "—" and every lineup spot vanished. The graded rows publish the plain
    // numeric player_id; the slate rows carry the same one. Join on it.
    const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
    const spots = Array(10).fill(0)          // index 1..9
    const cards = []
    let total = 0
    rows.forEach(({ pid, hr, events, liveName }) => {
      const p = byId.get(pid)
      total += hr
      const spot = Number(p?.lineup_spot)
      if (spot >= 1 && spot <= 9) spots[spot] += hr
      // Authoritative first; slate arithmetic only as a marked fallback.
      const numRec = seasonHr?.get(pid) || null
      const exact = numRec?.hr
      const pre = p?.season_hr == null ? null : n(p.season_hr, 0)
      const nth = Number.isFinite(exact) ? exact : (pre == null ? null : pre + hr)
      // EVERY number he reached tonight, not just the last one — a two-homer
      // night from 14 covers 15 AND 16, and 15 is the one worth saying.
      const tonightNums = nth == null ? [] : Array.from({ length: hr }, (_, i) => nth - i).filter((v) => v > 0)
      const round = tonightNums.filter((v) => v % 5 === 0)
      const jersey = numRec?.jersey ?? null
      cards.push({
        pid, p, hr, events: events || [],
        // The live feed carries fullName, so a homer from a hitter the bot
        // never scored renders as a person instead of as "#650968".
        name: p ? nameOf(p) : (clean(liveName, '') || `#${pid}`),
        team: p ? teamOf(p) : '',
        spot: spot >= 1 && spot <= 9 ? spot : null,
        nth,
        exact: Number.isFinite(exact),
        tonightNums,
        milestone: round.length > 0,
        roundNum: round[0] ?? null,
        // numerology (2026-08-13) — jersey + birthday, reduced the same way
        // as the homer-count root above. null when the league has no number
        // on file for him (rare) rather than guessed.
        jersey,
        jerseyRoot: jersey != null ? digitRoot(jersey) : null,
        dayRoot: numRec?.dayRoot ?? null,
        lifePath: numRec?.lifePath ?? null,
      })
    })
    cards.sort((a, b) => (b.nth ?? -1) - (a.nth ?? -1))
    const spotMax = Math.max(...spots.slice(1), 1)
    const placed = spots.slice(1).reduce((a, b) => a + b, 0)
    const topSpot = spots.indexOf(Math.max(...spots.slice(1)))

    // ── THE REPEATS (2026-08-09, Donovan: "if 8 people hit their 17th, does
    // that make sense") — the whole point of the ledger. Two lenses:
    //
    //   SAME NUMBER  three hitters all notching their 17th tonight is the
    //                pattern he's watching for, stated plainly with the names.
    //   DIGIT ROOT   standard numerology: sum the digits until one remains
    //                (17 → 1+7 = 8). The bot already speaks this language —
    //                numerology_score ships on every slate row — so the
    //                ledger reads the night the same way.
    //
    // Both are PATTERN SPOTTING, not evidence, and the strip says so. A
    // slate is ~25 homers over numbers 1–50; clusters happen by arithmetic
    // alone. It's here because it's fun to watch and Donovan wanted the
    // trend visible, not because it predicts anything.
    const numbered = cards.filter((c) => c.nth != null)
    const byNumber = new Map()
    const byRoot = new Map()
    // digitRoot lives at module scope now (2026-08-13) — the fetch effect
    // above needs it too, for jersey/birthday reduction.
    numbered.forEach((c) => {
      if (!byNumber.has(c.nth)) byNumber.set(c.nth, [])
      byNumber.get(c.nth).push(c)
      const r = digitRoot(c.nth)
      if (!byRoot.has(r)) byRoot.set(r, [])
      byRoot.get(r).push(c)
    })
    const repeats = [...byNumber.entries()]
      .filter(([, list]) => list.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([num, list]) => ({ num, list }))
    const roots = [...byRoot.entries()]
      .map(([root, list]) => ({ root, list }))
      .sort((a, b) => b.list.length - a.list.length)
    const topRoot = roots[0] && roots[0].list.length >= 3 ? roots[0] : null

    // ── JERSEY + BIRTHDAY CLUSTERS (2026-08-13) ───────────────────────────
    // Same shape as byNumber/byRoot above, three more lenses: the literal
    // jersey number, its digit root, and the two birthday reductions. Built
    // over ALL cards, not just `numbered` — a jersey and a birthday exist
    // whether or not his season-HR count came back.
    const byJersey = new Map(), byJerseyRoot = new Map(), byDayRoot = new Map(), byLifePath = new Map()
    const bucket = (map, key, c) => { if (key == null) return; if (!map.has(key)) map.set(key, []); map.get(key).push(c) }
    cards.forEach((c) => {
      bucket(byJersey, c.jersey, c)
      bucket(byJerseyRoot, c.jerseyRoot, c)
      bucket(byDayRoot, c.dayRoot, c)
      bucket(byLifePath, c.lifePath, c)
    })
    const topOf = (map, min) => {
      const best = [...map.entries()].map(([root, list]) => ({ root, list })).sort((a, b) => b.list.length - a.list.length)[0]
      return best && best.list.length >= min ? best : null
    }
    // Same >=3 bar as topRoot for the root-level lenses (nine buckets, small
    // sample — a real bar to clear before it's "the" root of the night).
    // Exact jersey number is a much rarer coincidence, so two is enough.
    const topJerseyRoot = topOf(byJerseyRoot, 3)
    const topDayRoot = topOf(byDayRoot, 3)
    const topLifePath = topOf(byLifePath, 3)

    // ── 🧲 WHO IS ALIGNING WITH THE NIGHT (2026-08-09) ────────────────────
    //
    // Donovan: "the ledger is supposed to show people who are aligning with
    // what's going on."
    //
    // The panel had all the raw material — the shared numbers, the hot lineup
    // spot, the digit root — but it printed each as its own separate strip and
    // left you to cross-reference them yourself. The question it should answer
    // in one look is the other way round: WHICH HITTERS TONIGHT SIT INSIDE
    // MORE THAN ONE OF THOSE PATTERNS.
    //
    // Three tags, all computed from what's already here:
    //   #N     his homer number is one several hitters reached tonight
    //   SPOT   he hit from the lineup spot leading the night (3+ homers)
    //   ROOT   his number reduces to the digit root the night keeps landing on
    //
    // Ranked by how many he carries. This is PATTERN SPOTTING and the strip
    // says so — a slate is ~25 homers over numbers 1–50 and nine lineup spots,
    // so overlaps happen by arithmetic alone. It's here because Donovan wants
    // the trend visible while it forms, not because it predicts anything.
    const repeatNums = new Set(repeats.map((r) => r.num))
    const hotSpot = spots[topSpot] >= 3 ? topSpot : null
    const rootNum = topRoot ? topRoot.root : null
    const others = (list, self) => list.filter((x) => x.pid !== self.pid).map((x) => x.name)
    cards.forEach((c) => {
      const tags = []
      if (c.nth != null && repeatNums.has(c.nth)) tags.push({ k: 'num', label: `${ord(c.nth)} club`, why: `${joinNames(others(byNumber.get(c.nth), c))} also reached ${ord(c.nth)} tonight.` })
      if (hotSpot && c.spot === hotSpot) tags.push({ k: 'spot', label: `${ord(hotSpot)} spot`, why: `The ${ord(hotSpot)} spot leads the night with ${spots[hotSpot]} homers.` })
      if (rootNum && c.nth != null && digitRoot(c.nth) === rootNum) tags.push({ k: 'root', label: `root ${rootNum}`, why: `${topRoot.list.length} of tonight's numbered homers reduce to ${rootNum}.` })

      // NUMEROLOGY (2026-08-13) — jersey + birthday, same "Aligning" home as
      // the three above, not a separate section. Two flavors:
      //
      //   OWN    self-alignment, no other hitter needed — his own jersey
      //          number lines up with the homer he just hit. The single
      //          most "aligning" thing this panel can say, so it alone is
      //          enough to earn a spot below (see the `aligned` filter).
      //   jersey/bday   the same cross-hitter clustering as `num`/`root`,
      //          just two more lenses on top of the homer count.
      if (c.jersey != null && c.nth != null && (c.jersey === c.nth || (c.jerseyRoot != null && c.jerseyRoot === digitRoot(c.nth)))) {
        tags.push({
          k: 'own',
          label: `own #${c.jersey}`,
          why: c.jersey === c.nth
            ? `He wears #${c.jersey} — this was his ${ord(c.nth)} homer of the season.`
            : `He wears #${c.jersey} (reduces to ${c.jerseyRoot}), the same root as his ${ord(c.nth)} homer tonight.`,
        })
      }
      const jerseyMates = c.jersey != null ? others(byJersey.get(c.jersey) || [c], c) : []
      if (jerseyMates.length) {
        tags.push({ k: 'jersey', label: `#${c.jersey} too`, why: `${joinNames(jerseyMates)} also wears #${c.jersey} tonight.` })
      } else if (topJerseyRoot && c.jerseyRoot === topJerseyRoot.root) {
        tags.push({ k: 'jroot', label: `#→${topJerseyRoot.root}`, why: `${topJerseyRoot.list.length} jersey numbers tonight reduce to ${topJerseyRoot.root}: ${joinNames(others(topJerseyRoot.list, c))}.` })
      }
      if (topDayRoot && c.dayRoot === topDayRoot.root) {
        tags.push({ k: 'bday', label: `day ${topDayRoot.root}`, why: `${topDayRoot.list.length} birthdays tonight reduce to day-number ${topDayRoot.root}: ${joinNames(others(topDayRoot.list, c))}.` })
      }
      if (topLifePath && c.lifePath === topLifePath.root) {
        tags.push({ k: 'path', label: `path ${topLifePath.root}`, why: `${topLifePath.list.length} life-path numbers tonight land on ${topLifePath.root}: ${joinNames(others(topLifePath.list, c))}.` })
      }
      c.tags = tags
    })
    // `own` alone qualifies — it doesn't need a second, unrelated tag to be
    // worth showing (see the comment above). Everything else still needs
    // two or more to clear the "more than arithmetic" bar.
    const aligned = cards
      .filter((c) => c.tags.length >= 2 || c.tags.some((t) => t.k === 'own'))
      .sort((a, b) => b.tags.length - a.tags.length)

    // ── WHO LINES UP NEXT (2026-08-17) ─────────────────────────────────────
    // Donovan: "i need the ledger to have some prediction of players that
    // align as well." The alignment strip only ever looked BACKWARD — it
    // tagged men after they homered. This looks at the same three numbers the
    // night is landing on and asks who on the slate, not yet in the ledger,
    // is standing on one of them:
    //   · his NEXT homer (season_hr + 1) reduces to tonight's leading root
    //   · his next homer is a number several hitters already reached tonight
    //   · he bats in the spot leading the night (3+ homers)
    //   · his jersey reduces to tonight's leading root
    // Every reason is stated on the chip. This is the same pattern-watching
    // the strip above discloses — counted, never scored, and the panel says
    // so. Ranked by the bot's HR score among the aligned, because if the
    // night's numbers are calling somebody, the bat still has to answer.
    const homered = new Set(cards.map((c) => c.pid))

    // ── THE NAME LENS, WIRED INTO THE WATCH (2026-08-23) ───────────────────
    // Donovan: "the patterns being seen numerology and gematria and names wise
    // — all the J names are going, who's a J tonight that looks good that can
    // go later or now."
    //
    // findNameEchoes already answers the backward half every night ("5 of the
    // 13 who homered have B surnames") and NamePatterns.js renders it. What it
    // never did was turn around: if the J names are running, WHO ELSE IS A J
    // and still has bats coming. That turn is the whole ask, and it is one
    // function call plus a match, because the echo already knows which letter
    // or which shared name it fired on.
    //
    // The deliberate line from NamePatterns.js still holds: a name never
    // touches a SCORE, and it never becomes a tag on a man who already
    // homered. It lives here, in the watch, where the whole panel is disclosed
    // as pattern-watching and nothing is graded.
    const nameAxes = []
    findNameEchoes(cards, players).forEach((e) => {
      if (e.kind === 'initial') {
        const bits = String(e.cell || '').split(':')
        const side = bits[1]; const letter = bits[2]
        if (!letter) return
        const where = side === 'f' ? 'first names' : 'surnames'
        nameAxes.push({
          letterKey: `${side}:${letter}`,
          chip: `${letter.toUpperCase()} ${side === 'f' ? 'name' : 'surname'}`,
          why: `${e.count} of tonight's homers have ${where} starting with ${letter.toUpperCase()} — ${joinNames(e.names)} — and so does he`,
          test: (parts) => !!parts && String((side === 'f' ? parts.firstKey : parts.lastKey) || '').slice(0, 1) === letter,
        })
      } else if (e.kind === 'shared-first' || e.kind === 'shared-last') {
        // Keyed off the echo's OWN names rather than its cell string, so a
        // change to how cells are spelled upstream can never silently turn
        // this into a match on nothing.
        const last = e.kind === 'shared-last'
        const seed = nameParts(e.names?.[0] || '')
        const key = seed && (last ? seed.lastKey : seed.firstKey)
        if (!key) return
        const shown = String(e.names?.[0] || '').split(' ')
        nameAxes.push({
          chip: last ? `the ${shown[shown.length - 1]}s` : `the ${shown[0]}s`,
          why: `${e.count} hitters sharing that ${last ? 'surname' : 'first name'} went deep tonight — ${joinNames(e.names)} — and he is one too`,
          test: (parts) => !!parts && String((last ? parts.lastKey : parts.firstKey) || '') === key,
        })
      }
    })

    // THE PLAIN HOT INITIAL, BELOW THE STATISTICAL BAR (2026-08-23).
    //
    // findNameEchoes is deliberately strict: it runs a null against the
    // night's own pool and stays silent unless the run is genuinely striking,
    // which is the right bar for a panel that PRINTS A FINDING. It is the
    // wrong bar for a watch. Three J names out of thirteen is exactly what
    // Donovan means by "all the J names are going" and it will usually not
    // clear a p-value — refusing to look at it is not honesty, it is just a
    // different way of being unhelpful.
    //
    // So: if a letter has three or more of tonight's homers and the strict
    // pass did not already fire on that letter, it still becomes an axis —
    // wearing the count, and saying in its own tooltip that a run this size is
    // ordinary. Watched, disclosed, never scored. Same posture as the digit
    // roots two strips up.
    const strictInitials = new Set(nameAxes.map((ax) => ax.letterKey).filter(Boolean))
    ;['f', 'l'].forEach((side) => {
      const tally = new Map()
      cards.forEach((c) => {
        const parts = nameParts(c.name)
        const letter = String((side === 'f' ? parts?.firstKey : parts?.lastKey) || '').slice(0, 1)
        if (!letter) return
        if (!tally.has(letter)) tally.set(letter, [])
        tally.get(letter).push(c.name)
      })
      const best = [...tally.entries()].sort((a, b) => b[1].length - a[1].length)[0]
      if (!best || best[1].length < 3) return
      const [letter, names] = best
      if (strictInitials.has(`${side}:${letter}`)) return
      const where = side === 'f' ? 'first names' : 'surnames'
      nameAxes.push({
        letterKey: `${side}:${letter}`,
        chip: `${letter.toUpperCase()} ${side === 'f' ? 'name' : 'surname'} ${names.length}`,
        why: `${names.length} of tonight's homers have ${where} starting with ${letter.toUpperCase()} — ${joinNames(names)} — and so does he. A run this size is ordinary on a full slate; it is being watched, not counted as evidence`,
        test: (parts) => !!parts && String((side === 'f' ? parts.firstKey : parts.lastKey) || '').slice(0, 1) === letter,
      })
    })

    // ── WHO LINES UP NEXT (2026-08-17, widened 2026-08-23) ─────────────────
    // The strip above only ever looked BACKWARD — it tagged men after they
    // homered. This asks who on the slate is standing on whatever the night is
    // landing on, and has not gone yet:
    //   · his NEXT homer (season_hr + 1) reduces to tonight's leading root
    //   · his next homer is a number several hitters already reached tonight
    //   · he bats in the spot leading the night
    //   · his jersey reduces to tonight's leading root
    //   · his birth day reduces to the day-number the night keeps landing on
    //   · his life path is the life path the night keeps landing on
    //   · his name carries tonight's running echo (the J names, the Petes)
    // Every reason is stated on the chip. Counted and disclosed, never scored.
    // Ranked by how many axes he sits on, then by the bot's HR score — if the
    // night's numbers are calling somebody, the bat still has to answer.
    const nextUp = []
    if (rootNum || hotSpot || repeatNums.size || nameAxes.length || topDayRoot || topLifePath) {
      players.forEach((pl) => {
        const pid = Number(pl?.player_id)
        if (!pid || homered.has(pid)) return
        const a = axesOf(pl, people)
        const nextHr = n(pl?.season_hr, 0) + 1
        const spot = Number(pl?.lineup_spot)
        const jersey = n(pl?.jersey_number, 0)
        const why = []
        const chips = []
        if (rootNum && digitRoot(nextHr) === rootNum) { chips.push(`root ${rootNum}`); why.push(`his next homer (#${nextHr}) lands on tonight's root ${rootNum}`) }
        if (repeatNums.has(nextHr)) { chips.push(`#${nextHr} again`); why.push(`his next is #${nextHr} — a number already hit ${(repeats.find((r) => r.num === nextHr)?.list.length) || 2}× tonight`) }
        if (hotSpot && spot === hotSpot) { chips.push(`${ord(hotSpot)} spot`); why.push(`bats ${ord(hotSpot)} — the spot leading the night with ${spots[hotSpot]}`) }
        if (rootNum && jersey > 0 && digitRoot(jersey) === rootNum) { chips.push(`#${jersey}→${rootNum}`); why.push(`jersey #${jersey} reduces to tonight's root ${rootNum}`) }
        if (topDayRoot && a.axes.day && a.axes.day === topDayRoot.root) { chips.push(`day ${topDayRoot.root}`); why.push(`born on the ${String(a.birthDate).slice(8, 10)} — day-number ${topDayRoot.root}, where ${topDayRoot.list.length} of tonight's homers sit`) }
        if (topLifePath && a.axes.path && a.axes.path === topLifePath.root) { chips.push(`path ${topLifePath.root}`); why.push(`life path ${topLifePath.root} — the path ${topLifePath.list.length} of tonight's homers land on`) }
        nameAxes.forEach((ax) => { if (ax.test(a.parts)) { chips.push(ax.chip); why.push(ax.why) } })
        if (!why.length) return
        nextUp.push({ p: pl, pid, name: nameOf(pl), why, chips, count: why.length, hrScore: n(pl?.hr_score, 0) })
      })
      nextUp.sort((a, b) => (b.count - a.count) || (b.hrScore - a.hrScore))
    }

    // topJerseyRoot/topDayRoot/topLifePath carried into the return (2026-08-18)
    // — they used to be local to this memo, only feeding the per-card `tags`
    // above. The archive effect below needs them too, so today's numerology
    // leaders (not just the homer-count root) can be written out for
    // Alignments to read back tomorrow.
    return { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned, hotSpot, nextUp: nextUp.slice(0, 20), topJerseyRoot, topDayRoot, topLifePath }
  }, [rows, players, seasonHr, peopleLoaded])   // peopleLoaded, not people: the Map is stable, the tick is what changes

  // ── THE ARCHIVE WRITE (2026-08-18) ────────────────────────────────────────
  // Donovan: "the data can be stored in alignment for use, if need have the
  // data for archive as well." This is the one place on the site that knows
  // what ACTUALLY happened numerology-wise tonight — everywhere else
  // (Alignments.js) only ever sees the pregame slate. So this writes a small
  // summary under today's date every time the model changes with real homers
  // in it; Alignments reads it back as "today's number so far" live, and as
  // "yesterday's number" the next day, once this key stops being touched and
  // is effectively frozen. Guarded to the REAL live date — a look at a past
  // slateDate must never overwrite that day's own already-frozen archive.
  useEffect(() => {
    if (dateKey !== easternToday() || !model || !model.total) return
    writeAlignArchive(dateKey, {
      total: model.total,
      topRoot: model.topRoot ? { root: model.topRoot.root, names: model.topRoot.list.map((c) => c.name) } : null,
      topJerseyRoot: model.topJerseyRoot ? { root: model.topJerseyRoot.root, names: model.topJerseyRoot.list.map((c) => c.name) } : null,
      topDayRoot: model.topDayRoot ? { root: model.topDayRoot.root, names: model.topDayRoot.list.map((c) => c.name) } : null,
      topLifePath: model.topLifePath ? { root: model.topLifePath.root, names: model.topLifePath.list.map((c) => c.name) } : null,
      roots: model.roots.map((r) => ({ root: r.root, n: r.list.length })),
      aligned: model.aligned.slice(0, 15).map((c) => ({
        pid: c.pid, name: c.name, team: c.team,
        tags: c.tags.map((t) => t.label),
      })),
    })
  }, [model, dateKey])

  // ── WHY THIS NOW RENDERS BEFORE THE FIRST HOMER (2026-08-17) ──────────────
  //
  // Donovan, for the third time: "im also looking for that home run ledger
  // thing maybe it will show during the slate". His guess was exactly right,
  // and that WAS the bug. Earlier: "people are saying they dont see it or i
  // wish i would have seen it earlier."
  //
  // Two gates were hiding it, and moving it onto five surfaces fixed neither:
  //   1. Every mount site required `results?.live_mode === true`, so during the
  //      day the component was not on the page at all.
  //   2. This line returned null whenever the night's homer count was 0 — so
  //      even once live, it stayed invisible until the first ball left the yard.
  //
  // Between them, the ledger only existed in the window after the first homer
  // of the night. Nobody can learn that a feature exists inside a window they
  // have to already be watching to see. A thing you cannot find before it has
  // content is a thing you never find.
  //
  // So: tomorrow still returns null, because there is nothing to say about a
  // slate that has not happened. But today with zero homers renders a WAITING
  // strip — it names itself, says what it will show, and says when. That is
  // information, not decoration: "no homers yet" is a fact about tonight.
  if (isTmrw) return null

  if (!model || !model.total) {
    // ── PREGAME: THE LEDGER'S OWN QUESTIONS, ASKED FORWARD ──────────────────
    // Donovan: "pregame numerology suggestions like the storylines would be
    // helpful for the ledger, that way i can see where it lies even when slate
    // hasnt fully kicked off."
    //
    // Not a placeholder. The same three things the ledger reports after a homer
    // — what number it was, which lineup spot it came from, whether the names
    // rhyme — stated about tonight's board before anything has happened. Every
    // line is a countable fact with its denominator on it, and the header says
    // outright that none of it is graded or fed into a score, because numerology
    // presented without that sentence is the most misleading thing here.
    const pre = pregameLedger(players)
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '9px 14px 11px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', cursor: 'pointer' }}
          onClick={toggle}>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>💥 Homer ledger</span>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            no homers yet tonight — it fills as they land, on its own, every few seconds
          </span>
          {/* ── YESTERDAY'S ALIGNMENT (2026-08-23) ─────────────────────────
              Donovan: "when all the games are final look at the running themes
              document, keep for tomorrow as yesterday's alignment, then same
              thing." The ledger is keyed to ONE slate date and prunes every
              other night's record on load, so at the 3:30am rollover last
              night stopped existing here — which is what "the players
              disappear" was. The archive the ledger already writes every night
              (writeAlignArchive, 2026-08-18) is the running record; it was
              only ever read by Alignments. Reading it back here means the
              blank before tonight's first homer is no longer blank: it is
              what last night landed on, which is the thing you carry in. */}
          {(() => {
            const y = readAlignArchive(shiftDateKey(dateKey, -1))
            if (!y || !y.total) return null
            const bits = []
            if (y.topRoot) bits.push(`root ${y.topRoot.root}`)
            if (y.topLifePath) bits.push(`life path ${y.topLifePath.root}`)
            if (y.topDayRoot) bits.push(`day ${y.topDayRoot.root}`)
            if (y.topJerseyRoot) bits.push(`jerseys on ${y.topJerseyRoot.root}`)
            return (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}
                title={y.topRoot ? `Last night's root ${y.topRoot.root}: ${(y.topRoot.names || []).join(', ')}` : undefined}>
                · yesterday: {y.total} homers{bits.length ? ` on ${bits.join(' · ')}` : ''}
              </span>
            )
          })()}
          {/* ── THE BLANK EXPLAINS ITSELF (2026-08-17) ─────────────────────
              Donovan: "one person went yard and the hr ledger has not
              populated with anything." A blank that might mean "no homers",
              "league call failing", or "still waiting on the first pull" is
              three different problems wearing one face. Say which. */}
          {(() => {
            if (liveErr) {
              return <span style={{ fontSize: 9, color: C.yellow }} title={liveErr}>⚠ league feed failing — retrying</span>
            }
            if (!live) return <span style={{ fontSize: 9, color: C.text3 }}>· first check pending…</span>
            const games = Object.values(live?.games || {})
            const started = games.filter((g) => g?.state && g.state !== 'Preview').length
            const lines = Object.keys(live?.lines || {}).length
            return (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}
                title="What the league feed is showing this panel right now. If a homer has landed and this still reads 0, the boxscore has not caught up yet — it usually lags the broadcast by under a minute.">
                · watching {started}/{games.length} games · {lines} live batting lines
              </span>
            )
          })()}
          <Chevron />
        </div>
        {!open ? null : !pre ? (
          <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.6 }}>
            When one goes, this is where it shows up: who hit it, what number home
            run it was for him, which lineup spot it came from, whether the bot had
            him, and the shape of the swing.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 9.5, color: C.text3, margin: '5px 0 6px', lineHeight: 1.6, maxWidth: 820 }}>
              <b style={{ color: C.text2 }}>Until then — what it is watching.</b>{' '}
              Countable facts about tonight&apos;s board, not forecasts:{' '}
              <b style={{ color: C.text2 }}>none of this is graded and none of it feeds any score.</b>{' '}
              Read it as where the interesting numbers already sit.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <LookOut players={players} />
              {pre.milestones.length > 0 && (
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                  <b style={{ color: '#FCD34D' }}>One away from a round number.</b>{' '}
                  {pre.milestones.length} of tonight&apos;s {pre.total} hitters — closest to the
                  bot&apos;s picks:{' '}
                  {pre.milestones.slice(0, 4).map((m, i) => (
                    <span key={`${m.name}-${m.next}`}>
                      {i > 0 && ' · '}
                      <span
                        onClick={onPlayerClick ? () => onPlayerClick(m._raw) : undefined}
                        style={{ cursor: onPlayerClick ? 'pointer' : 'default', color: C.text, fontWeight: 700 }}
                      >{m.name}</span>
                      <span style={{ color: C.text3, fontFamily: NUM_FONT }}>
                        {' '}{m.at}→{m.next}{m.designated ? ' ★' : ''}
                      </span>
                    </span>
                  ))}
                </div>
              )}
              {pre.jerseys.length > 0 && (
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                  <b style={{ color: '#38bdf8' }}>Number meets number.</b>{' '}
                  {pre.jerseys.length} hitters whose home run count is level with their
                  shirt or one short of it:{' '}
                  {pre.jerseys.slice(0, 3).map((j, i) => (
                    <span key={`${j.name}-${j.jersey}`}>
                      {i > 0 && ' · '}
                      <span
                        onClick={onPlayerClick ? () => onPlayerClick(j._raw) : undefined}
                        style={{ cursor: onPlayerClick ? 'pointer' : 'default', color: C.text, fontWeight: 700 }}
                      >{j.name}</span>
                      <span style={{ color: C.text3, fontFamily: NUM_FONT }}>
                        {' '}#{j.jersey}, {j.hr} HR{j.kind === 'reaches' ? ' — one to match' : ' — level'}
                      </span>
                    </span>
                  ))}
                  <span style={{ color: C.text3 }}> · coincidence, and labelled as one.</span>
                </div>
              )}
              {pre.stack && (
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                  <b style={{ color: '#f97316' }}>Where the picks are batting.</b>{' '}
                  The <span style={{ fontFamily: NUM_FONT }}>#{pre.stack.spot}</span> hole holds{' '}
                  <span style={{ fontFamily: NUM_FONT }}>{pre.stack.count}</span> of the{' '}
                  <span style={{ fontFamily: NUM_FONT }}>{pre.stack.placed}</span> designated
                  hitters with a confirmed spot — the ledger reports the spot every homer
                  came from, so this is the same column, before the fact.
                </div>
              )}
              {pre.echoes.length > 0 && (
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                  <b style={{ color: '#c084fc' }}>Names that rhyme tonight.</b>{' '}
                  {pre.echoes.map((e, i) => (
                    <span key={`${e.kind}-${e.key}`}>
                      {i > 0 && ' · '}
                      <span style={{ color: C.text, fontWeight: 700 }}>{e.names.join(' + ')}</span>
                      <span style={{ color: C.text3 }}>{` (same ${e.kind === 'first' ? 'first name' : 'surname'})`}</span>
                    </span>
                  ))}
                  <span style={{ color: C.text3 }}>
                    {' '}· raw counts among the {pre.picks} picks. No significance test is
                    possible before the fact — the sample and the population would be the
                    same people — so this claims nothing about likelihood.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }
  const { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned, nextUp = [] } = model
  const milestones = cards.filter((c) => c.milestone)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2, cursor: 'pointer' }}
        onClick={toggle}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🧾 Homer ledger</span>
        <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
          {total} tonight
        </span>
        <span style={{ fontSize: 9, color: C.text3 }}>builds as the slate plays</span>
        <Chevron />
      </div>
      {/* Everything below the header folds. The count stays visible closed, so
          a shut ledger still tells you how many have landed. */}
      {open && (
      <>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, marginBottom: 8, maxWidth: 640 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> which homer of the season each one was, and
        where in the order tonight&apos;s power is coming from.
      </div>

      {milestones.length > 0 && (
        <div style={{ fontSize: 10.5, color: C.text2, marginBottom: 8, lineHeight: 1.6 }}>
          🎯 <b style={{ color: C.orange }}>Round number tonight:</b>{' '}
          {milestones.map((c, i) => (
            <span key={c.pid}>
              {i > 0 ? ' · ' : ''}
              <b onClick={() => c.p && onPlayerClick?.(c.p)} style={{ color: C.text, cursor: c.p ? 'pointer' : 'default' }}>
                {c.name}
              </b>{' '}<span style={{ fontFamily: NUM_FONT }}>{ord(c.roundNum ?? c.nth)}</span>
            </span>
          ))}
        </div>
      )}

      {/* ── DID TONIGHT'S HOMERS HIT THE PREGAME WATCHLIST? (2026-08-17) ─────
          Donovan: "home rundegler sshould also knwo todals numeroldy and see if
          any player algin with them ass well."
          The pregame panel names who is one homer from a round number, whose
          shirt matches his homer count, and which names rhyme. When the slate
          starts, that list stops being visible — so the ledger never checked
          its own predictions against what actually happened. It does now.
          This is a HIT/MISS on a list stated in advance, which makes it the one
          numerology claim on the site that is falsifiable. It says the miss
          count too, because a watchlist that only reports its hits is a horoscope. */}
      {(() => {
        const pre = pregameLedger(players)
        if (!pre) return null
        const homered = new Map()
        cards.forEach((c) => { if (c.pid != null) homered.set(String(c.pid), c) })
        const nameHit = new Set(cards.map((c) => String(c.name || '').toLowerCase()))
        const hitMs = pre.milestones.filter((m) => homered.has(String(m._raw?.player_id)))
        const hitJs = pre.jerseys.filter((j) => homered.has(String(j._raw?.player_id)))
        const hitEch = pre.echoes.filter((e) => e.names.some((nm) => nameHit.has(String(nm).toLowerCase())))
        const hits = hitMs.length + hitJs.length + hitEch.length
        const watched = pre.milestones.length + pre.jerseys.length + pre.echoes.length
        if (!watched) return null
        return (
          <div style={{
            background: 'rgba(192,132,252,.06)', border: '1px solid rgba(192,132,252,.25)',
            borderRadius: 10, padding: '7px 11px', marginBottom: 9,
          }}>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
              🔮 <b style={{ color: '#c084fc' }}>Tonight&apos;s watchlist:</b>{' '}
              <b style={{ color: hits ? C.text : C.text3, fontFamily: NUM_FONT }}>{hits}</b>
              <span style={{ color: C.text3, fontFamily: NUM_FONT }}>/{watched}</span>{' '}
              <span style={{ color: C.text3 }}>
                {hits === 0
                  ? 'landed so far — stated before first pitch, and none of it has come in yet.'
                  : 'landed so far, off a list written before first pitch.'}
              </span>
              {hitMs.map((m) => (
                <span key={`m-${m.name}`}>
                  {' · '}<b onClick={() => m._raw && onPlayerClick?.(m._raw)}
                    style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{m.name}</b>
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}> got his {ord(m.next)}</span>
                </span>
              ))}
              {hitJs.map((j) => (
                <span key={`j-${j.name}`}>
                  {' · '}<b onClick={() => j._raw && onPlayerClick?.(j._raw)}
                    style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{j.name}</b>
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}> #{j.jersey}, now level</span>
                </span>
              ))}
              {hitEch.map((e) => (
                <span key={`e-${e.key}`}>
                  {' · '}<span style={{ color: C.text }}>{e.names.join(' + ')}</span>
                  <span style={{ color: C.text3 }}> — one of the rhyme went</span>
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 🧲 ALIGNING WITH THE NIGHT — the lead, because it's the question.
          Everything below this is the raw material; this is the answer. */}
      {aligned.length > 0 && (
        <div style={{
          background: 'rgba(249,115,22,.07)', border: '1px solid rgba(249,115,22,.32)',
          borderRadius: 10, padding: '8px 11px', marginBottom: 9,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontSize: 10.5, fontWeight: 900, color: C.orange }}>🧲 Aligning with tonight</span>
            <span style={{ fontSize: 9, color: C.text3 }}>
              {aligned.length} homer{aligned.length === 1 ? '' : 's'} lining up with tonight&apos;s numbers
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {aligned.map((c) => (
              <button key={`al${c.pid}`} onClick={() => c.p && onPlayerClick?.(c.p)}
                title={c.tags.map((t) => t.why).join(' ')}
                style={{
                  display: 'flex', gap: 6, alignItems: 'baseline', cursor: c.p ? 'pointer' : 'default',
                  border: '1px solid rgba(249,115,22,.45)', background: 'rgba(249,115,22,.10)',
                  borderRadius: 8, padding: '4px 10px',
                }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
                {c.tags.map((t) => (
                  <span key={t.k} style={{
                    fontSize: 8.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.orange,
                    border: '1px solid rgba(249,115,22,.4)', borderRadius: 999, padding: '0 6px',
                  }}>{t.label}</span>
                ))}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 5, lineHeight: 1.5 }}>
            Overlap, not evidence. ~25 homers spread over fifty numbers, nine lineup spots, jersey
            numbers and birthdays will line up by arithmetic alone — this is the trend made visible
            while it forms, never a reason to chase one.
          </div>
        </div>
      )}

      {/* ── 🔤 NAME ECHOES (2026-08-16) ───────────────────────────────────
          Donovan: "all track common names or names that vibe together like
          bobby witt tommy white 2 sylablas or like bryce and brice... maybe
          all the j names are going... austin riley riley greene or pete
          alonso pete crow."

          Sibling of the numerology block directly above, and held to the
          same standard, which for this one is the entire difficulty: with
          ~25 names you will ALWAYS find some shared initial or rhyme, so a
          panel that prints whatever it found is a noise generator. It is
          baselined against everyone who batted tonight and only speaks when
          a pattern beats chance — three J-names is nothing if a sixth of the
          league is a J. `population` is not optional dressing: without it the
          initial family cannot be rated at all and drops out. See
          lib/namePatterns.js, which measured its own false-positive rate
          against 300 synthetic nights rather than assuming one.

          Renders nothing when nothing clears. That is the normal state. */}
      <LookOut players={players} />

      <NamePatterns homers={model.cards} population={players} />

      {/* 🔮 WHO LINES UP NEXT — the forward half of the alignment strip.
          "i need the ledger to have some prediction of players that align as
          well." Same three numbers the night is landing on, asked forward:
          who has NOT homered yet and is standing on one of them. Each chip
          carries its reasons in the tooltip and the strongest one inline.
          Pattern-watching, counted and disclosed — never fed to a score. */}
      {nextUp.length > 0 && (() => {
        // ── NOW, LATER, OR NOT AT ALL (2026-08-23) ────────────────────────
        // Donovan: "who's a J that looks good tonight that can go later or
        // now." A watch list that keeps naming men whose game ended two hours
        // ago is a list you stop reading, so the game state decides both who
        // survives and what order they stand in: still batting first, then
        // first pitch to come, and anybody already final is simply gone. The
        // state comes off the same live snapshot the ledger already holds —
        // `lines[pid].state` — so this costs nothing.
        const lines = live?.lines || {}
        const upcoming = nextUp
          .map((x) => {
            const st = String(lines[x.pid]?.state || '')
            return { ...x, when: st === 'Final' ? 'done' : st === 'Live' ? 'now' : 'later' }
          })
          .filter((x) => x.when !== 'done')
          .sort((a, b) => (a.when === b.when ? 0 : a.when === 'now' ? -1 : 1))
          .slice(0, 8)
        if (!upcoming.length) return null
        return (
          <div style={{
            background: 'rgba(34,211,238,.06)', border: '1px solid rgba(34,211,238,.28)',
            borderRadius: 10, padding: '7px 11px', marginBottom: 9,
          }}>
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.9 }}>
              🔮 <b style={{ color: C.cyan }}>Fits tonight&apos;s pattern, hasn&apos;t gone yet:</b>{' '}
              {upcoming.map((x, i) => (
                <span key={x.pid}>
                  {i > 0 && ' · '}
                  <b
                    onClick={() => onPlayerClick?.(x.p)}
                    title={`${x.why.join('. ')}. Bot HR score ${x.hrScore.toFixed(0)}.`}
                    style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}
                  >{x.name}</b>
                  <span style={{
                    fontSize: 8.5, fontFamily: NUM_FONT, marginLeft: 4,
                    color: x.when === 'now' ? '#4ade80' : C.text3,
                  }}>{x.when === 'now' ? '⚡ batting' : '⏳ later'}</span>
                  {x.chips.map((c) => (
                    <span key={c} style={{
                      fontSize: 8.5, fontFamily: NUM_FONT, marginLeft: 4, padding: '1px 5px',
                      borderRadius: 5, border: `1px solid ${C.cyan}44`, color: C.cyan,
                    }}>{c}</span>
                  ))}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.6, marginTop: 4 }}>
              Hitters not in the ledger who sit on whatever tonight is landing on — the leading root, a
              repeated number, the hot lineup spot, a jersey, a birth day, a life path, or the name echo
              running tonight. ⚡ means his game is live, ⏳ means first pitch is still ahead. Ranked by how
              many of those he sits on, then by HR score. A watch, not a prediction — nothing here is graded,
              scored, or fed to a pick.
            </div>
          </div>
        )
      })()}

      {/* 🔢 THE REPEATS — the number pattern, which is the whole reason this
          panel exists. Same-number clusters first, then the digit root. */}
      {(repeats.length > 0 || topRoot) && (
        <div style={{
          background: 'rgba(167,139,250,.07)', border: '1px solid rgba(167,139,250,.3)',
          borderRadius: 10, padding: '7px 11px', marginBottom: 9,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: '#a78bfa', marginBottom: 3 }}>
            🔢 The number pattern
          </div>
          {repeats.map(({ num, list }) => (
            <div key={num} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{list.length} hitters</b> notched their{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{ord(num)}</b> tonight —{' '}
              {list.map((c, i) => (
                <span key={c.pid}>
                  {i > 0 ? ', ' : ''}
                  <span onClick={() => c.p && onPlayerClick?.(c.p)} style={{ cursor: c.p ? 'pointer' : 'default', color: C.text }}>{c.name}</span>
                </span>
              ))}
            </div>
          ))}
          {topRoot && (
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: repeats.length ? 3 : 0 }}
              title={`Digit root: add the digits of the homer number until one digit is left (17 → 1+7 = 8). ${topRoot.list.length} of tonight's ${numbered.length} numbered homers land on ${topRoot.root}.`}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{topRoot.list.length}</b> of tonight&apos;s{' '}
              {numbered.length} numbered homers reduce to{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{topRoot.root}</b>{' '}
              <span style={{ color: C.text3 }}>
                ({topRoot.list.slice(0, 5).map((c) => c.nth).join(', ')}{topRoot.list.length > 5 ? '…' : ''})
              </span>
            </div>
          )}
          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            Pattern watching, not evidence — ~25 homers spread over numbers 1–50 cluster by arithmetic
            alone. Digit root = add the digits until one is left (17 → 8). Fun to track, never a reason to bet.
          </div>
        </div>
      )}

      {/* every homer tonight, numbered */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {cards.map((c) => (
          <button key={c.pid} onClick={() => c.p && onPlayerClick?.(c.p)}
            title={`${c.name}${c.team ? ` (${c.team})` : ''}${c.spot ? ` · batting ${ord(c.spot)}` : ''}${
              c.nth == null
                ? ' — no season HR count available for him, so the number is left blank rather than guessed'
                : ` — his ${ord(c.nth)} homer of the season${c.hr > 1 ? ` (${c.tonightNums.slice().reverse().map(ord).join(' and ')} tonight)` : ''}. ${
                    c.exact
                      ? 'Season total read straight from the league, so it already includes tonight.'
                      : 'APPROXIMATE — the league total could not be read, so this is the slate’s pregame count plus tonight’s homers, which can run one high if the slate was rebuilt after he went deep.'}`}`}
            style={{
              display: 'flex', gap: 6, alignItems: 'baseline', cursor: c.p ? 'pointer' : 'default',
              border: `1px solid ${c.milestone ? 'rgba(249,115,22,.6)' : C.border}`,
              background: c.milestone ? 'rgba(249,115,22,.10)' : C.bg2,
              borderRadius: 8, padding: '4px 10px',
            }}>
            <span style={{ fontSize: 10 }}>💥</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>{c.name}</span>
            {c.hr > 1 && <span style={{ fontSize: 9, fontFamily: NUM_FONT, color: C.orange, fontWeight: 900 }}>×{c.hr}</span>}
            <span style={{ fontSize: 9.5, fontFamily: NUM_FONT, color: c.milestone ? C.orange : C.text3, fontWeight: c.milestone ? 900 : 600 }}>
              {c.nth != null ? `${ord(c.nth)}${c.exact ? '' : '≈'}` : '—'}
            </span>
            {c.spot && <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3 }}>#{c.spot}</span>}
            {/* WHAT KIND of homer (2026-08-11). Only renders when the ball was
                actually tracked — hr_events is absent on every night graded
                before the backfill, and an untracked homer is not a
                wall-scraper. The band is a PERCENTILE slice, not physics; the
                tooltip carries the real numbers so the label is never the only
                thing on offer. See lib/hrShape.js. */}
            {(c.events || []).map((e, i) => {
              const m = hrShapeMeta(e)
              if (!m) return null
              return (
                <span key={i} title={`${m.label} — ${hrLine(e)}. ${m.blurb}`}
                  style={{
                    fontSize: 8, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.04em',
                    color: m.color, border: `1px solid ${m.color}55`, borderRadius: 4, padding: '1px 4px',
                  }}>{m.short}</span>
              )
            })}
            {c.tags?.length > 0 && (
              <span title={c.tags.map((t) => t.why).join(' ')} style={{ fontSize: 8.5, color: C.orange }}>
                🧲{c.tags.length > 1 ? c.tags.length : ''}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* where in the order tonight's power came from */}
      {placed > 0 && (
        <>
          <div style={{ fontSize: 9.5, color: C.text3, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 4 }}>
            Homers by lineup spot
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 46 }}>
            {spots.slice(1).map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                title={`${v} homer${v === 1 ? '' : 's'} tonight from the ${ord(i + 1)} spot, out of ${placed} placed`}>
                <span style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: v ? C.text2 : C.text3, fontWeight: 800 }}>{v || ''}</span>
                <div style={{
                  width: '100%', height: `${Math.max(3, (26 * v) / spotMax)}px`, borderRadius: 3,
                  background: v === spotMax && v > 0 ? C.orange : v ? 'rgba(249,115,22,.45)' : 'rgba(255,255,255,.06)',
                }} />
                <span style={{ fontSize: 8, fontFamily: NUM_FONT, color: C.text3 }}>{i + 1}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 9, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
            {placed} of {total} homers have a known lineup spot.
            {spots[topSpot] >= 3 && <> The <b style={{ color: C.text2 }}>{ord(topSpot)} spot</b> leads tonight with {spots[topSpot]}.</>}
            {' '}A full slate is ~25 homers across nine spots, so a tall bar is a picture of tonight,
            not a finding about baseball — read it as texture, never as a signal to chase.
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}
