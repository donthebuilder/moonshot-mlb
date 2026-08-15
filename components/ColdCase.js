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

// The Storylines shape: an icon, then a line you can read. A number with its
// clause attached beats a number in a box, because every number here needs one.
function Line({ icon, children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11,
      lineHeight: 1.55, padding: '3px 0', color: C.text2,
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

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

  return (
    <div style={{ marginTop: 13, paddingTop: 11, borderTop: `1px dashed ${C.border2}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🍩 The cold case</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          the argument against him — a <b style={{ color: C.text2 }}>blank</b> is a game he batted and
          produced nothing at all: no hit, no run, no RBI
        </span>
      </div>

      {/* SENTENCES, NOT TILES (2026-08-15). Donovan: "i dont like the tile
          style id rather text just like the storylines section." Four big
          numbers in four boxes made you decode a dashboard; every one of them
          needed a clause anyway — "31%" is not the finding, "he blanks 31% of
          the time, one every ~3 games" is. Same shape Storylines uses: an
          icon, then a line. */}
      <div style={{ marginBottom: 9 }}>
        <Line icon="🍩">
          <b style={{ color: C.text }}>Last blank</b>{' '}
          {read.sinceIdx === 0
            ? <>was <b style={{ color: '#f87171' }}>his last game</b></>
            : <><b style={{ fontFamily: NUM_FONT, color: read.median && read.sinceIdx > read.median ? C.orange : C.text }}>{read.sinceIdx}</b> games ago</>}
          {read.last && <> — {read.last.date} {read.last.home ? 'vs' : '@'} {ab}, {read.last.h}-for-{read.last.ab}</>}
          {read.median != null && <>. He has one every <b style={{ fontFamily: NUM_FONT }}>~{read.median}</b> games</>}.
        </Line>
        <Line icon="📉">
          <b style={{ color: C.text }}>Blank rate</b>{' '}
          <b style={{ fontFamily: NUM_FONT, color: C.text }}>{fmt(read.rate)}</b> —{' '}
          {read.donuts} of his {read.n} games this season.
        </Line>
        {read.after > 0 && (
          <Line icon="↩️">
            <b style={{ color: C.text }}>After one</b> he gets a hit{' '}
            <b style={{ fontFamily: NUM_FONT, color: !bounceReal ? C.text : bounceGap > 0 ? '#4ade80' : '#f87171' }}>{fmt(read.afterHit)}</b>{' '}
            of the time ({read.after} chances), against <b style={{ fontFamily: NUM_FONT }}>{fmt(read.baseHit)}</b> normally.
          </Line>
        )}
        {read.avgAbDonut != null && (
          <Line icon="🪑">
            <b style={{ color: C.text }}>Blank at-bats</b>{' '}
            <b style={{ fontFamily: NUM_FONT }}>{read.avgAbDonut.toFixed(1)}</b>
            {read.avgAbOther != null && <> against <b style={{ fontFamily: NUM_FONT }}>{read.avgAbOther.toFixed(1)}</b> otherwise</>}
            {read.shortDonuts ? <> — <b style={{ fontFamily: NUM_FONT }}>{read.shortDonuts}</b> of them came on two trips or fewer, which is a night he barely got</> : ''}.
          </Line>
        )}
      </div>

      {/* THE BOUNCE, said in words, because the number alone doesn't say which
          way to act on it. */}
      <div style={{
        fontSize: 11, color: C.text2, lineHeight: 1.6, padding: '8px 11px',
        borderRadius: 9, background: 'rgba(255,255,255,.03)',
        border: `1px solid ${bounceReal ? (bounceGap > 0 ? 'rgba(74,222,128,.35)' : 'rgba(248,113,113,.35)') : C.border}`,
      }}>
        {read.after < 6 ? (
          <>Only <b style={{ color: C.text }}>{read.after}</b> of his blanks have a game after them in this
            log — not enough to say whether he answers one.</>
        ) : bounceReal && bounceGap > 0 ? (
          <><b style={{ color: '#4ade80' }}>He answers a blank.</b> After a game with nothing, he gets a hit{' '}
            <b style={{ color: C.text }}>{fmt(read.afterHit)}</b> of the time against{' '}
            <b style={{ color: C.text }}>{fmt(read.baseHit)}</b> normally
            {read.afterHrr != null && <> — and clears 1+ H+R+RBI <b style={{ color: C.text }}>{fmt(read.afterHrr)}</b> vs {fmt(read.baseHrr)}</>}.
            The night after a blank is his best night to back, on this sample.</>
        ) : bounceReal ? (
          <><b style={{ color: '#f87171' }}>A blank travels with him.</b> The game after one, he gets a hit
            only <b style={{ color: C.text }}>{fmt(read.afterHit)}</b> of the time against{' '}
            <b style={{ color: C.text }}>{fmt(read.baseHit)}</b> normally. For him a blank is the start of a
            quiet run, not the end of one — fade the bounce-back.</>
        ) : (
          <>His rate the game after a blank (<b style={{ color: C.text }}>{fmt(read.afterHit)}</b>, {read.after} of
            them) is inside the error bar of his normal rate (<b style={{ color: C.text }}>{fmt(read.baseHit)}</b>).
            A blank tells you nothing about his next game — which is itself worth knowing, because
            &ldquo;due for a bounce&rdquo; is the most common thing said about a hitter who just went 0-for-4.</>
        )}
      </div>

      {read.splits.length > 0 && (
        <div style={{ marginTop: 9 }}>
          <div style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800, marginBottom: 5 }}>
            Where his blanks come from
          </div>
          {read.splits.slice(0, 3).map((s2) => (
            <Line key={s2.label} icon="🔻">
              He blanks <b style={{ color: '#f87171', fontFamily: NUM_FONT }}>{s2.hiPct.toFixed(0)}%</b> {s2.hi} against{' '}
              <b style={{ fontFamily: NUM_FONT }}>{s2.loPct.toFixed(0)}%</b> {s2.lo}
              <span style={{ color: C.text3 }}> — {s2.hiN}/{s2.loN} games, {s2.note}</span>.
            </Line>
          ))}
        </div>
      )}

      {/* THE FORM TRAP — his own hot streak, priced honestly. */}
      {read.l10Hit != null && read.l10Hit >= 65 && (
        <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 9 }}>
          <b style={{ color: C.orange }}>Reading his form honestly:</b> he has a hit in{' '}
          <b style={{ color: C.text }}>{fmt(read.l10Hit)}</b> of his last ten, against{' '}
          <b style={{ color: C.text }}>{fmt(read.baseHit)}</b> across the season — so the last ten are
          running <b style={{ color: C.text }}>{(read.l10Hit - read.baseHit).toFixed(0)} points</b> hot.
          Ten games carries an error bar of about <b style={{ color: C.text }}>±{(se(read.l10Hit, 10) || 0).toFixed(0)}</b>{' '}
          points on its own, so most of that gap is the sample rather than the hitter. He still blanks{' '}
          <b style={{ color: C.text }}>{fmt(read.rate)}</b> of the time, and nothing in a hot ten changes that number.
        </div>
      )}

      <div style={{ fontSize: 8.5, color: C.text3, marginTop: 8, lineHeight: 1.5 }}>
        His own game log this season, {read.n} games. A split only appears when the two rates are
        further apart than their own error bars allow — which is why most hitters show none. Lineup
        spot isn&apos;t in the league&apos;s game log, so &ldquo;he only blanks batting 7th&rdquo; is a
        question this panel can&apos;t answer yet.
      </div>
    </div>
  )
}
