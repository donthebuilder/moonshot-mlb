'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'
import { nameOf, teamOf, n } from '../lib/player'
import { dedupeGraded } from '../lib/graded'
import { pickSplit } from '../lib/seasonSplit'

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
//   results_live.json   actual_hr per graded player, tonight only (date-gated
//                       the same way the storyline tracker is — the file
//                       holds the last graded slate until a new one starts)
//   MLB people/stats    the AUTHORITATIVE season homer total, which already
//                       includes tonight — so his latest homer simply IS that
//                       number, with no arithmetic to get wrong
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

const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
const ord = (v) => {
  const k = v % 10, h = v % 100
  return `${v}${k === 1 && h !== 11 ? 'st' : k === 2 && h !== 12 ? 'nd' : k === 3 && h !== 13 ? 'rd' : 'th'}`
}

export default function HomerLedger({ players = [], slateDate = '', onPlayerClick }) {
  const dateKey = slateDate || new Date().toLocaleDateString('en-CA')
  const isTmrw = slateDate && slateDate > new Date().toLocaleDateString('en-CA')
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (isTmrw) { setRows(null); return undefined }
    let alive = true
    const pull = () => {
      fetch(bust(dataUrl('current/results_live.json')))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!alive || !j) return
          // date gate — the live file keeps the last graded slate until the
          // next one starts grading, so an ungated read shows a stale night
          if (String(j.date || '') !== String(dateKey)) { setRows(null); return }
          // DEDUPE BY PLAYER (2026-08-09). A hitter designated in two
          // categories (TOP *and* HR, say) gets a graded slot per category,
          // each carrying the same actual_hr — walking the slots naively
          // counted his homer twice and inflated the night's total. The rule
          // now lives in lib/graded.js because it had bitten three components;
          // this call site kept its own copy of it until then.
          setRows(dedupeGraded(j.graded_slots || j.results || [])
            .map((s) => ({ pid: Number(s?.player_id), hr: n(s?.actual_hr, 0) }))
            .filter((x) => x.pid && x.hr > 0))
        })
        .catch(() => {})
    }
    pull()
    // Background tabs don't poll (2026-08-09 scan).
    const t = setInterval(() => { if (!document.hidden) pull() }, 3 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [isTmrw, dateKey])

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
  const hrIds = useMemo(
    () => (rows || []).map((r) => r.pid).filter(Boolean).sort().join(','),
    [rows],
  )
  useEffect(() => {
    if (!hrIds) { setSeasonHr(null); return undefined }
    let alive = true
    const ids = hrIds.split(',')
    ;(async () => {
      const out = new Map()
      for (let i = 0; i < ids.length; i += 100) {
        const url = 'https://statsapi.mlb.com/api/v1/people?personIds='
          + ids.slice(i, i + 100).join(',')
          + '&hydrate=stats(group=[hitting],type=[season])'
          + '&fields=people,id,stats,type,displayName,splits,team,gameType,stat,homeRuns,gamesPlayed'
        try {
          const j = await fetch(url).then((r) => (r.ok ? r.json() : null))
          ;(j?.people || []).forEach((person) => {
            // pickSplit, not splits[0]: a hitter traded mid-season has one
            // row per club and splits[0] is the OLD one, so his Nth-homer
            // number would be short by everything he did after the trade.
            const blk = (person.stats || []).find((s) => s?.type?.displayName === 'season')
            const hr = Number(pickSplit(blk)?.homeRuns)
            if (Number.isFinite(hr)) out.set(Number(person.id), hr)
          })
        } catch { /* fall back to slate arithmetic */ }
      }
      if (alive) setSeasonHr(out.size ? out : null)
    })()
    return () => { alive = false }
  }, [hrIds])

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
    rows.forEach(({ pid, hr }) => {
      const p = byId.get(pid)
      total += hr
      const spot = Number(p?.lineup_spot)
      if (spot >= 1 && spot <= 9) spots[spot] += hr
      // Authoritative first; slate arithmetic only as a marked fallback.
      const exact = seasonHr?.get(pid)
      const pre = p?.season_hr == null ? null : n(p.season_hr, 0)
      const nth = Number.isFinite(exact) ? exact : (pre == null ? null : pre + hr)
      // EVERY number he reached tonight, not just the last one — a two-homer
      // night from 14 covers 15 AND 16, and 15 is the one worth saying.
      const tonightNums = nth == null ? [] : Array.from({ length: hr }, (_, i) => nth - i).filter((v) => v > 0)
      const round = tonightNums.filter((v) => v % 5 === 0)
      cards.push({
        pid, p, hr,
        name: p ? nameOf(p) : `#${pid}`,
        team: p ? teamOf(p) : '',
        spot: spot >= 1 && spot <= 9 ? spot : null,
        nth,
        exact: Number.isFinite(exact),
        tonightNums,
        milestone: round.length > 0,
        roundNum: round[0] ?? null,
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
    const digitRoot = (v) => (v > 0 ? 1 + ((v - 1) % 9) : 0)
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
    cards.forEach((c) => {
      const tags = []
      if (c.nth != null && repeatNums.has(c.nth)) tags.push({ k: 'num', label: `${ord(c.nth)} club`, why: `${byNumber.get(c.nth).length} hitters reached their ${ord(c.nth)} tonight.` })
      if (hotSpot && c.spot === hotSpot) tags.push({ k: 'spot', label: `${ord(hotSpot)} spot`, why: `The ${ord(hotSpot)} spot leads the night with ${spots[hotSpot]} homers.` })
      if (rootNum && c.nth != null && digitRoot(c.nth) === rootNum) tags.push({ k: 'root', label: `root ${rootNum}`, why: `${topRoot.list.length} of tonight's numbered homers reduce to ${rootNum}.` })
      c.tags = tags
    })
    const aligned = cards.filter((c) => c.tags.length >= 2).sort((a, b) => b.tags.length - a.tags.length)

    return { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned, hotSpot }
  }, [rows, players, seasonHr])

  if (isTmrw || !model || !model.total) return null
  const { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned } = model
  const milestones = cards.filter((c) => c.milestone)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>🧾 Homer ledger</span>
        <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
          {total} tonight
        </span>
        <span style={{ fontSize: 9, color: C.text3 }}>builds as the slate plays</span>
      </div>
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
              {aligned.length} homer{aligned.length === 1 ? '' : 's'} sitting inside more than one of tonight&apos;s patterns
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
            Overlap, not evidence. ~25 homers spread over fifty numbers and nine lineup spots will
            line up by arithmetic alone — this is the trend made visible while it forms, never a
            reason to chase one.
          </div>
        </div>
      )}

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
    </div>
  )
}
