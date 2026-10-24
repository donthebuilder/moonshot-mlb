'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { thresholdRates, staffQuality, teamAbbrs, starterHands } from '../lib/gamelogs'

// 🍩 THE COLD CASE — the argument AGAINST him.
//
// 2026-08-15, Donovan: "Last zero game where player recored no stats h r r …
// seeing the distance from the donut game to them getting a hit and or 1+hrr.
// I'm wondering about that and then thinking bout the hit, like a batters form
// on why they should not get a hit since a re hitting at a 70 ish clip. I
// think there should be data supporting why players didn't get hit."
//
// Every other panel on this site argues FOR a hitter. It ranks him, it finds
// the split that flatters him, it tells you he is 7-for-10. None of them can
// answer the only question that matters at the window: what does the other 30%
// look like, and is tonight shaped like it.
//
// A DONUT is a game he came to the plate and produced nothing at all — no hit,
// no run, no RBI. Donovan's "0/5 or 00000 across the board". Not a strikeout
// count, not a bad night at the plate: a night that returned zero to every
// prop you could have played on him.
//
// FOUR THINGS THIS ANSWERS, and they are all checkable from his own log:
//
//   1. HOW OFTEN, AND HOW LONG SINCE. The donut rate, the date of the last
//      one, and the typical gap between them — so "he's due for a quiet one"
//      stops being a feeling.
//   2. THE BOUNCE. His 1+ hit and 1+ HRR rate in the game IMMEDIATELY after a
//      donut, against his baseline. This is the one with money in it: if he
//      answers a donut 80% of the time and his baseline is 65%, the night
//      after a blank is the night to play him — and if it's the other way, a
//      donut is the start of a slump rather than the end of one.
//   3. WHERE DONUTS COME FROM. The conditions his blanks share and his other
//      games don't — road, arm side, staff quality — ranked by how far apart
//      the two rates actually are.
//   4. LOST AT-BATS. A 0-for-2 and a 0-for-5 are not the same failure. The
//      first is a night he barely got a chance at.
//
// EVERYTHING HERE IS HIS OWN GAME LOG, the same fetch the props grid already
// makes (lib/gamelogs.js), so opening this costs nothing extra.

const DONUT = (g) => (g.h + g.r + g.rbi) === 0
const GOT_HIT = (g) => g.h >= 1
const GOT_HRR = (g) => (g.h + g.r + g.rbi) >= 1

const pct = (a, b) => (b ? (100 * a) / b : null)
const fmt = (v) => (v == null ? '—' : `${v.toFixed(0)}%`)

// Binomial error bar, in points — the same gate the True Price page uses, and
// for the same reason: at eleven games a twenty-point split is a coin flip
// wearing a costume.
const se = (p, n) => (n > 0 && p != null ? 100 * Math.sqrt(Math.max((p / 100) * (1 - p / 100), 1e-6) / n) : null)

export default function ColdCase({ playerId, player, onlyLine = false }) {
  const [data, setData] = useState(undefined)
  const [staff, setStaff] = useState(null)
  const [abbrs, setAbbrs] = useState(null)
  const [hands, setHands] = useState(null)

  useEffect(() => {
    let alive = true
    setData(undefined); setHands(null)
    thresholdRates(playerId).then((d) => { if (alive) setData(d || null) })
    staffQuality().then((d) => { if (alive) setStaff(d) })
    teamAbbrs().then((d) => { if (alive) setAbbrs(d) })
    // Arm side needs a second call (one schedule pull for his games), so it
    // loads behind the rest and the panel simply gains a row when it lands.
    starterHands(playerId).then((h) => { if (alive) setHands(h) }).catch(() => {})
    return () => { alive = false }
  }, [playerId])

  const read = useMemo(() => {
    const log = data?.logAll || data?.log || []
    if (log.length < 8) return null
    // Newest first, as thresholdRates returns it.
    const donuts = log.filter(DONUT)
    const n = log.length
    const rate = pct(donuts.length, n)

    // ── how long since ────────────────────────────────────────────────────
    const sinceIdx = log.findIndex(DONUT)          // 0 = his last game was one
    const last = sinceIdx >= 0 ? log[sinceIdx] : null

    // Typical gap: the distances between consecutive donuts, in games.
    const idxs = log.map((g, i) => (DONUT(g) ? i : -1)).filter((i) => i >= 0)
    const gaps = idxs.slice(1).map((v, i) => v - idxs[i])
    const median = gaps.length
      ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
      : null

    // ── the bounce: the game AFTER a donut ────────────────────────────────
    // The log is newest-first, so the game that FOLLOWED log[i] is log[i-1].
    const after = idxs.map((i) => log[i - 1]).filter(Boolean)
    const baseHit = pct(log.filter(GOT_HIT).length, n)
    const baseHrr = pct(log.filter(GOT_HRR).length, n)
    const afterHit = after.length ? pct(after.filter(GOT_HIT).length, after.length) : null
    const afterHrr = after.length ? pct(after.filter(GOT_HRR).length, after.length) : null

    // ── lost at-bats ──────────────────────────────────────────────────────
    // A blank on two trips is a night he never really got. Counting it the
    // same as an 0-for-5 is the thing that makes a donut rate look scarier
    // than it is.
    const shortDonuts = donuts.filter((g) => g.ab <= 2).length
    const avgAbDonut = donuts.length
      ? donuts.reduce((a, g) => a + g.ab, 0) / donuts.length : null
    const avgAbOther = n - donuts.length
      ? log.filter((g) => !DONUT(g)).reduce((a, g) => a + g.ab, 0) / (n - donuts.length) : null

    // ── where donuts come from ────────────────────────────────────────────
    // Each split compares HIS DONUT RATE in one condition against the other,
    // and only speaks when the gap clears both error bars and both sides have
    // a real sample.
    const splits = []
    const push = (label, a, b, aLabel, bLabel, note) => {
      if (a.n < 6 || b.n < 6) return
      const pa = pct(a.k, a.n)
      const pb = pct(b.k, b.n)
      const gap = pa - pb
      const bar = Math.sqrt((se(pa, a.n) || 0) ** 2 + (se(pb, b.n) || 0) ** 2)
      if (Math.abs(gap) < Math.max(12, bar)) return
      splits.push({
        label, note,
        hi: gap > 0 ? aLabel : bLabel,
        lo: gap > 0 ? bLabel : aLabel,
        hiPct: Math.max(pa, pb), loPct: Math.min(pa, pb),
        hiN: gap > 0 ? a.n : b.n, loN: gap > 0 ? b.n : a.n,
        gap: Math.abs(gap),
      })
    }
    const tally = (rows) => ({ n: rows.length, k: rows.filter(DONUT).length })
    push('venue', tally(log.filter((g) => !g.home)), tally(log.filter((g) => g.home)),
      'on the road', 'at home', 'blanks travel')
    if (staff) {
      push('opposing staff',
        tally(log.filter((g) => staff[g.oppId]?.soft <= 0.33)),
        tally(log.filter((g) => staff[g.oppId]?.soft >= 0.67)),
        'against good staffs', 'against soft staffs', 'the arms he sees')
    }
    if (hands) {
      push('arm side',
        tally(log.filter((g) => hands[g.gamePk] === 'L')),
        tally(log.filter((g) => hands[g.gamePk] === 'R')),
        'vs lefties', 'vs righties', 'starter-arm basis')
    }
    splits.sort((a, b) => b.gap - a.gap)

    // ── recent form vs the season, which is the "why not tonight" ─────────
    const l10 = log.slice(0, 10)
    const l10Hit = l10.length >= 8 ? pct(l10.filter(GOT_HIT).length, l10.length) : null

    return {
      n, donuts: donuts.length, rate, sinceIdx, last, median,
      after: after.length, afterHit, afterHrr, baseHit, baseHrr,
      shortDonuts, avgAbDonut, avgAbOther, splits, l10Hit,
      baseHitSe: se(baseHit, n), afterHitSe: se(afterHit, after.length),
    }
  }, [data, staff, hands])

  if (data === undefined) {
    return <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, padding: '6px 0' }}>Reading his log…</div>
  }
  if (!read) {
    return (
      <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.5, padding: '6px 0' }}>
        Not enough games logged this season to build a cold case.
      </div>
    )
  }

  const ab = abbrs?.[read.last?.oppId] || read.last?.opp || ''
  // The bounce only means something once it has a sample, and it needs a wider
  // gap than it looks like it does: it's one small n against another.
  const bounceGap = read.afterHit != null ? read.afterHit - read.baseHit : null
  const bounceBar = Math.sqrt((read.afterHitSe || 0) ** 2 + (read.baseHitSe || 0) ** 2)
  const bounceReal = bounceGap != null && read.after >= 6 && Math.abs(bounceGap) >= Math.max(10, bounceBar)

  // A one-line version for the row surfaces — the whole panel is too much
  // inside a card that is already dense.
  if (onlyLine) {
    return (
      <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, whiteSpace: 'nowrap' }}
        title={`He has ${read.donuts} blank games in ${read.n} — no hit, no run, no RBI. Typical gap between them: ${read.median ?? '—'} games.`}>
        🍩 {read.sinceIdx === 0 ? 'blanked last game' : `${read.sinceIdx}g since a blank`}
        <span style={{ color: C.text3 }}> · {fmt(read.rate)} of his games</span>
      </span>
    )
  }

  // TILES, NOT SENTENCES (2026-10-23, Donovan on The Read: "make that not just sentences"; this replaces the 08-15 sentence rule). Each finding
  // is a tile: the label, one big number, a short line under it; a tile that matters tonight lights in the accent. Same numbers, same gates
  // (a split shows only when it clears both error bars; the bounce only when it has 6+ games and clears its own bar).
  const tiles = []
  tiles.push({
    k: 'last', label: 'LAST BLANK', big: read.sinceIdx === 0 ? 'Last game' : `${read.sinceIdx} G ago`,
    small: [read.last ? `${read.last.date} ${read.last.home ? 'vs' : '@'} ${ab}, ${read.last.h}-for-${read.last.ab}` : null, read.median != null ? `one every ~${read.median} games` : null].filter(Boolean).join(' · '),
    on: read.sinceIdx === 0 || Boolean(read.median && read.sinceIdx > read.median),
  })
  tiles.push({ k: 'rate', label: 'BLANK RATE', big: fmt(read.rate), small: `${read.donuts} of ${read.n} games`, on: false })
  if (read.after > 0) {
    tiles.push({
      k: 'after', label: 'HIT AFTER A BLANK', big: fmt(read.afterHit),
      small: read.after < 6 ? `${read.after} chances: too few to read` : bounceReal ? (bounceGap > 0 ? `vs ${fmt(read.baseHit)} normally · he answers one` : `vs ${fmt(read.baseHit)} normally · blanks travel`) : `vs ${fmt(read.baseHit)} normally · no real difference`,
      on: bounceReal,
    })
  }
  if (read.avgAbDonut != null) {
    tiles.push({ k: 'ab', label: 'AT-BATS IN A BLANK', big: read.avgAbDonut.toFixed(1), small: [read.avgAbOther != null ? `${read.avgAbOther.toFixed(1)} otherwise` : null, read.shortDonuts ? `${read.shortDonuts} on 2 trips or fewer` : null].filter(Boolean).join(' · '), on: false })
  }
  for (const s2 of read.splits.slice(0, 3)) {
    tiles.push({ k: `split-${s2.label}`, label: `BLANKS ${s2.hi.toUpperCase()}`, big: `${s2.hiPct.toFixed(0)}%`, small: `vs ${s2.loPct.toFixed(0)}% ${s2.lo} · ${s2.hiN}/${s2.loN} games`, on: true })
  }
  if (read.l10Hit != null && read.l10Hit >= 65) {
    tiles.push({ k: 'form', label: 'HIT, LAST 10', big: fmt(read.l10Hit), small: `${(read.l10Hit - read.baseHit).toFixed(0)} pts over his season · ±${(se(read.l10Hit, 10) || 0).toFixed(0)} is noise`, on: false })
  }
  return (
    <div style={{ marginTop: 8, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 800 }}>The cold case</span>
        <span style={{ fontSize: 11, color: C.text3 }}>a blank = no hit, no run, no RBI</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 170px), 1fr))', gap: 6 }}>
        {tiles.map((t) => (
          <div key={t.k} style={{ border: `1px solid ${t.on ? C.orange : C.border}`, borderRadius: 3, padding: '7px 9px 8px', minWidth: 0 }}>
            <div style={{ font: `800 10px/1.1 ${NUM_FONT}`, letterSpacing: '.07em', color: t.on ? C.orange : C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
            <div style={{ font: `900 20px/1.15 ${NUM_FONT}`, color: t.on ? C.text : C.text2, marginTop: 4, whiteSpace: 'nowrap' }}>{t.big}</div>
            {t.small ? <div style={{ fontSize: 11, lineHeight: 1.3, color: C.text3, marginTop: 2 }}>{t.small}</div> : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.text3, marginTop: 6 }}>His game log this season, {read.n} games. A split shows only when it clears its error bars.</div>
    </div>
  )
}
