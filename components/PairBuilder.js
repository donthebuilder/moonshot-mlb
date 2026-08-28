'use client'
import { useMemo, useState, useEffect } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { arr, obj, n, clean, nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore } from '../lib/player'
import DenseTable from './DenseTable'
import { WhatThis } from './ui'

// Pair Builder — pick one or more hitters, get the partners they share tonight.
//
// Two things have to be combined and they are not the same kind of evidence:
//
//   HISTORY  — how often these two have actually gone deep together. Backward
//              looking, and mostly coincidence unless it happened in the SAME
//              GAME. Two hitters homering on the same date in different parks
//              is two independent events.
//   TONIGHT  — what the slate says about each of them right now: HR score,
//              weak spot, the arm they're facing.
//
// A partner needs both. History alone is survivorship; tonight alone ignores
// everything the season showed. The fit score below is deliberately weighted
// toward tonight, because the history sample per pair is tiny — most of these
// pairs have single-digit co-HR days across a whole season.
//
// MULTI-ANCHOR. Selecting several hitters answers a different question than
// selecting one: not "who goes with him" but "who goes with all of them". A
// partner who shares history with three of your anchors is worth more than one
// who shares a longer history with a single anchor, so matched-anchor count
// sorts above fit. Partners matching only some of the selection are still
// listed — they're just labelled as such rather than silently mixed in.
//
// MATCHING IS BY player_id. The history file publishes player_id on every
// entry (350 of 350 pairs), and joining on a normalised name string is how you
// end up with two Will Smiths and a missing Peña.

// MARKETS — carried over from the retired ticket builder, because it was the
// one part of that page worth keeping: build a pair for the outcome you're
// actually betting, not always home runs. The market changes the TONIGHT half
// of the fit (which score ranks anchors and partners); the HISTORY half is
// co-HR days in every market, because that's the only pair history the bot
// publishes. The caption says so when it matters.
export const PAIR_MARKETS = [
  { key: 'hr',  label: 'Home run', short: 'HR',  score: hrScore,   needs: '1+ HR' },
  { key: 'hit', label: '1+ hit',   short: 'Hit', score: hitScore,  needs: '1+ hit' },
  { key: 'hrr', label: 'HRR',      short: 'HRR', score: prodScore, needs: '2+ H+R+RBI' },
  { key: 'tb',  label: '2+ bases', short: 'TB',  score: tbScore,   needs: '2+ TB' },
]
const MARKETS = PAIR_MARKETS

const nameKey = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

// ── GROUP + SHAPE TAGS (2026-08-18) ─────────────────────────────────────────
// Donovan: "it should have the ability to just build around player and use
// filter tags like groups singles or shape." Two tag rows, both off fields
// already on the slate row — no new fetch, same rule every other pass this
// round followed.
//
//   GROUP — the bot's own designation (TOP/HR/HIT/HRR/CONTACT), the same five
//   slots Results grades and GroupTicketBuilder builds legs from. Narrows the
//   partner table to hitters the bot actually singled out tonight, in a
//   specific role — not just "on the slate".
//
//   SHAPE — his recent batted-ball shape, the same three buckets NearMisses
//   reads off hr_shape_profile: a no-doubter/moonshot bat, a wall-scraper
//   (contact that's been JUST missing), or neither published/neutral. Lets
//   you ask "who pairs with him AND has been hitting them deep lately" versus
//   "...AND has had a lot of near misses" without reading every row's shape
//   column by eye.
const GROUP_TAGS = [
  { key: 'TOP',     label: 'Top',     color: '#FCD34D' },
  { key: 'HR',      label: 'HR',      color: '#FB923C' },
  { key: 'HIT',     label: 'Hit',     color: '#60A5FA' },
  { key: 'HRR',     label: 'HRR',     color: '#22d3ee' },
  { key: 'CONTACT', label: 'Contact', color: '#A78BFA' },
]
const groupTagsOf = (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).filter(Boolean)

const SHAPE_TAGS = [
  { key: 'moonshot', label: '💣 Moonshot', title: 'Recent contact includes a moonshot (well past the fence) — hr_shape_profile.moonshot' },
  { key: 'wall',      label: '🧱 Wall scraper', title: 'Recent contact includes a wall-scraper — a real near miss — hr_shape_profile.wall_scraper' },
]
const shapeTagsOf = (raw) => {
  const prof = raw?.hr_shape_profile || {}
  const out = []
  if (n(prof?.moonshot, 0) + n(prof?.no_doubter, 0) > 0) out.push('moonshot')
  if (n(prof?.wall_scraper, 0) > 0) out.push('wall')
  return out
}

// WHY THIS PARTNER — the sentence the table made you assemble yourself
// (2026-08-09). Nothing new is computed: every clause below is a column that
// was already on the row, said in words and ordered by how much it actually
// argues for the pair. Same-game history leads because it's the only version
// that implies correlation; a soft opposing arm and a strong board score are
// tonight's evidence; recency is a nudge and is written as one. If a partner
// has nothing but his own score, the sentence says exactly that rather than
// dressing up an absence.
function whyPartner(p, mkt, anchorLabel) {
  const parts = []
  if (p.sameGame > 0) {
    parts.push(`they've gone deep in the same game ${p.sameGame}×`)
  } else if (p.days > 0) {
    parts.push(`${p.days} shared homer day${p.days === 1 ? '' : 's'}, none in the same game`)
  }
  if (p.hr >= 60) parts.push(`he's a ${p.hr.toFixed(0)} on tonight's ${mkt.label} board`)
  if (p.hr9 >= 1.4) parts.push(`the arm he faces gives up ${p.hr9.toFixed(2)} HR/9`)
  if (p.weak) parts.push('he sits in a weak spot against that starter')
  if (p.since != null && p.since <= 21) {
    parts.push(p.since === 0 ? 'they did it today' : `last together only ${p.since}d ago`)
  }
  if (!parts.length) {
    return `No shared history worth the word and no standout matchup — he's here on his ${mkt.label} score alone (${p.hr.toFixed(0)}).`
  }
  const s = parts.join('; ')
  return `With ${anchorLabel}: ${s.charAt(0).toUpperCase()}${s.slice(1)}.`
}

// id when we have one, normalised name only as a fallback.
function refKey(o) {
  const id = o?.player_id ?? o?.id
  if (id !== undefined && id !== null && String(id) !== '') return `id:${id}`
  const k = nameKey(o?.name || o?.player_name)
  return k ? `nm:${k}` : ''
}

// `initialAnchors` seeds the selection — the Watchlist passes its saved
// hitters here so "build pairs from the names I already like" is one click of
// zero clicks. Seeding re-runs when the watchlist itself changes (star a new
// name, it joins the anchors), but manual edits inside the builder win until
// the list changes again — reasserting the seed on every render would fight
// the user's own clicks.
// `bare` (2026-08-23) — rendered INSIDE the merged builder, where the anchor
// picker, the search box and the "Pair Builder" heading already exist one
// block up. Donovan's note was that a page carrying two headings and two name
// pickers reads as two machines however shared the state underneath is, so in
// bare mode this panel draws neither: it takes its anchors from initialAnchors
// and its market from the parent, and renders only the answer.
export default function PairBuilder({ summary, players = [], onPlayerClick, initialAnchors = [],
  bare = false, marketKey: marketProp = null, onMarketChange = null }) {
  const [anchorKeys, setAnchorKeys] = useState([])
  const [query, setQuery] = useState('')
  const [requireAll, setRequireAll] = useState(false)
  const [marketOwn, setMarketOwn] = useState('hr')
  const marketKey = marketProp || marketOwn
  const setMarketKey = (k) => { setMarketOwn(k); onMarketChange?.(k) }
  const [showAllChips, setShowAllChips] = useState(false)

  // Seed the anchors from initialAnchors (see prop note above). Keyed on the
  // ids so it re-seeds only when the LIST changes, not on every render.
  const seedKey = initialAnchors.map((p) => refKey(p)).filter(Boolean).sort().join('|')
  useEffect(() => {
    if (!seedKey) return
    setAnchorKeys(seedKey.split('|'))
  }, [seedKey])
  const mkt = MARKETS.find((x) => x.key === marketKey) || MARKETS[0]
  const mScore = mkt.score

  const pairs = arr(obj(summary).top_pairs)

  // Slate rows keyed by id AND by normalised name, so a history entry can find
  // tonight's row either way.
  const slate = useMemo(() => {
    const m = new Map()
    players.forEach((p) => {
      const id = p?.player_id ?? p?.id
      if (id != null && String(id) !== '') m.set(`id:${id}`, p)
      const k = nameKey(nameOf(p))
      if (k && !m.has(`nm:${k}`)) m.set(`nm:${k}`, p)
    })
    return m
  }, [players])

  const lookupToday = (ref) => slate.get(refKey(ref)) || slate.get(`nm:${nameKey(ref?.name || ref?.player_name)}`)

  // EVERY hitter on tonight's slate is selectable — not just the ones with
  // pair history.
  //
  // This list used to be built by walking top_pairs and keeping whoever was
  // also on the slate. On tonight's slate that's 55 of 143 hitters: the history
  // file holds 350 pairs covering 118 distinct players, and 88 of tonight's
  // bats appear in none of them. Those 88 had no chip at all, so there was no
  // way to click them — which reads as the page being broken rather than as
  // "this hitter has no co-HR history", and those are very different things.
  //
  // A hitter with no history is still a legitimate anchor: you may want his
  // partners ranked on tonight's form alone, and in a multi-select he simply
  // contributes nothing. So everyone is offered, and the ones with history are
  // marked rather than being the only ones that exist.
  const historyKeys = useMemo(() => {
    const s = new Set()
    pairs.forEach((pr) => arr(pr?.players).forEach((pl) => {
      const today = lookupToday(pl)
      if (today) s.add(refKey(today))
    }))
    return s
  }, [pairs, slate])

  const anchors = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const k = refKey(p)
      if (!k || seen.has(k)) return
      seen.set(k, {
        key: k,
        name: nameOf(p),
        team: teamOf(p),
        today: p,
        hasHistory: historyKeys.has(k),
      })
    })
    return [...seen.values()].sort((a, b) => mScore(b.today) - mScore(a.today))
  }, [players, historyKeys, mScore])

  const selected = useMemo(
    () => anchorKeys.map((k) => anchors.find((a) => a.key === k)).filter(Boolean),
    [anchorKeys, anchors],
  )
  // Default to the top hitter so the panel is never empty on arrival, matching
  // how it behaved when it was single-select.
  const active = selected.length ? selected : (anchors[0] ? [anchors[0]] : [])
  const activeKeys = useMemo(() => new Set(active.map((a) => a.key)), [active])

  const toggleAnchor = (k) => setAnchorKeys((prev) => {
    if (prev.includes(k)) return prev.filter((x) => x !== k)
    // If nothing was explicitly chosen yet, the implicit default was anchors[0];
    // clicking a different hitter should select that hitter, not add to a
    // selection the user never made.
    return prev.length ? [...prev, k] : [k]
  })

  // HISTORY-ONLY FILTER (2026-08-09 — see the partners memo below for why the
  // pool stopped being history-gated). `null` means "no opinion yet", which
  // resolves to ON for the HR market (the old behaviour, and the only market
  // where the co-HR history IS the market) and OFF everywhere else. Once the
  // user clicks it, the click wins on every market.
  const [histOverride, setHistOverride] = useState(null)
  const histOnly = histOverride == null ? marketKey === 'hr' : histOverride
  // GROUP + SHAPE filters (2026-08-18, see the note above GROUP_TAGS). Both
  // null means "no filter" — off by default, same pattern as histOverride.
  const [groupFilter, setGroupFilter] = useState(null)
  const [shapeFilter, setShapeFilter] = useState(null)

  // partnerKey -> { today, per: [{ anchorKey, anchorName, fit, sameGame, ... }] }
  //
  // THE PARTNER POOL IS TONIGHT'S SLATE, NOT THE HISTORY FILE (fixed
  // 2026-08-09). This used to be built by walking `top_pairs` and keeping
  // whoever was also playing, which meant a hitter with no co-HR history had
  // literally zero partners on EVERY market. On the HR market that was at
  // least defensible. On 1+ hit / HRR / 2+ bases it was just broken: the
  // market switch re-sorts the anchor chips by hit/prod/tb score, so the
  // default anchor (anchors[0]) becomes a different hitter — usually a
  // contact bat with no homer history at all — and the panel went blank. The
  // owner read that as "only Home run works", and he was right.
  //
  // pair_history_summary is HR-only by construction, so it can never be a
  // requirement for a non-HR market. Now every hitter on the slate is a
  // candidate, ranked by tonight's score in the market you picked, and the
  // co-HR history is a BONUS inside Fit (and a badge) rather than a gate.
  const partners = useMemo(() => {
    if (!active.length) return []
    const acc = new Map()

    active.forEach((anchor) => {
      pairs.forEach((pr) => {
        const ps = arr(pr?.players)
        if (ps.length < 2) return
        const mine = ps.filter((x) => refKey(lookupToday(x) || x) === anchor.key
          || nameKey(x?.name || x?.player_name) === nameKey(anchor.name))
        if (!mine.length) return
        const other = ps.find((x) => !mine.includes(x))
        if (!other) return
        const today = lookupToday(other)
        if (!today) return                       // not playing tonight
        const k = refKey(today)
        if (!k || activeKeys.has(k)) return      // don't offer an anchor as its own partner

        // Per-market history, if the bot ever publishes it (checklist #15 in
        // BOT-DATA-REQUESTS.md): on the hit market prefer same_game_hit_count,
        // on HRR prefer same_day_hrr_count, and so on. Until those fields
        // exist this falls back to the co-HR counts, which the caption
        // discloses. The moment the bot writes them, the builder uses them
        // with no site change.
        const mkHist = (base) => {
          const alt = marketKey === 'hit' ? pr?.[`${base}_hit_count`]
            : marketKey === 'hrr' ? pr?.[`${base}_hrr_count`]
            : marketKey === 'tb' ? pr?.[`${base}_tb_count`]
            : null
          return alt != null && Number(alt) > 0 ? n(alt, 0) : null
        }
        const days = mkHist('same_day') ?? n(pr?.repeat_count, 0)
        const sameGame = mkHist('same_game') ?? n(pr?.same_game_hr_count, 0)
        const since = n(pr?.days_since_last_hit, 99)
        // The market picks which score "tonight" means — HR score on the HR
        // market, hit score on 1+ hit, and so on.
        const hr = mScore(today)

        // FIT = TONIGHT'S SCORE, FULL STOP (2026-08-28 correction).
        //
        // This used to weight sameGame/days/since history in here at
        // 25%/10%/10%, on the belief that "only the same-game version is
        // correlated." That belief is the exact one lib/pairEvidence.js's
        // header disproves: 186,000 same-night pairs, 58 graded nights —
        // same game comes out at 1.05x independence, same team 1.04x, i.e.
        // 1.00 to within noise. Two hitters in the same ballpark are two
        // independent coin flips. sameGame/days/since are still shown as
        // their own DenseTable columns below (they're real, measured facts
        // about the pair) — they just don't get to move the number that
        // ranks the list anymore, since the archive says they shouldn't. See
        // lib/pairEvidence.js for the full study and the validated
        // PAIR_RULES this site actually uses elsewhere for a real bonus.
        const fit = hr

        if (!acc.has(k)) {
          acc.set(k, {
            _key: k,
            _raw: today,
            name: clean(other?.name || other?.player_name, '') || nameOf(today),
            team: teamOf(today) || clean(other?.team, ''),
            opp: oppOf(today),
            pitcher: clean(today?.pitcher_name, 'TBD'),
            hr,
            weak: today?.weak_spot_flag ? 1 : 0,
            hr9: n(today?.pitcher_hr9, 0),
            per: [],
          })
        }
        acc.get(k).per.push({
          anchorKey: anchor.key, anchorName: anchor.name,
          fit, sameGame, days, since: since >= 99 ? null : since,
          boost: n(pr?.history_boost, 0), pairScore: n(pr?.pair_score, 0),
        })
      })
    })

    // EVERYONE ELSE ON THE SLATE. Same row shape, empty `per` — no history,
    // so every history column reads 0 / "never" and Fit is 55% of tonight's
    // market score and nothing else. Nothing is invented: an absent pair
    // history is shown as an absent pair history.
    players.forEach((today) => {
      const k = refKey(today)
      if (!k || acc.has(k) || activeKeys.has(k)) return
      acc.set(k, {
        _key: k,
        _raw: today,
        name: nameOf(today),
        team: teamOf(today),
        opp: oppOf(today),
        pitcher: clean(today?.pitcher_name, 'TBD'),
        hr: mScore(today),
        weak: today?.weak_spot_flag ? 1 : 0,
        hr9: n(today?.pitcher_hr9, 0),
        per: [],
      })
    })

    const total = active.length
    const rows = [...acc.values()].map((r) => {
      const matched = new Set(r.per.map((x) => x.anchorKey)).size
      const sum = (f) => r.per.reduce((a, x) => a + n(f(x), 0), 0)
      const sinces = r.per.map((x) => x.since).filter((v) => v != null)
      return {
        ...r,
        matched,
        hist: r.per.length ? 1 : 0,
        all: matched > 0 && matched === total,
        with: r.per.map((x) => x.anchorName.split(' ').slice(-1)[0]).join(', '),
        // Mean fit, not sum — a sum would just rank by how many anchors matched,
        // which `matched` already carries as its own column. Fit is just
        // tonight's score now (see the fit formula above), so a partner with
        // per.length === 0 gets exactly r.hr — no separate case to keep in sync.
        fit: r.per.length ? sum((x) => x.fit) / r.per.length : r.hr,
        sameGame: sum((x) => x.sameGame),
        days: sum((x) => x.days),
        since: sinces.length ? Math.min(...sinces) : null,
        boost: sum((x) => x.boost),
        pairScore: sum((x) => x.pairScore) / Math.max(1, r.per.length),
      }
    })

    // "Shared history only" never empties the panel: if the filter would
    // return nothing (the anchor has no co-HR history, which is the normal
    // case for 88 of tonight's 143 bats) it is ignored and the caller is told
    // so. A blank panel is not an answer.
    let filtered = rows
    if (histOnly && rows.some((r) => r.hist)) filtered = filtered.filter((r) => r.hist)
    // requireAll stays strict — it's an explicit click, and its empty state
    // below says exactly why it's empty.
    if (requireAll && total > 1) filtered = filtered.filter((r) => r.all)
    // GROUP / SHAPE. Unlike histOnly, these stay strict when they empty the
    // list — same choice as requireAll just above — because "no partner
    // tonight is BOTH a bot HR pick AND a wall-scraper" is itself a real,
    // useful answer, not a filter to silently drop. The empty state below
    // names whichever tag is on so it's obvious what to loosen.
    if (groupFilter) filtered = filtered.filter((r) => groupTagsOf(r._raw).includes(groupFilter))
    if (shapeFilter) filtered = filtered.filter((r) => shapeTagsOf(r._raw).includes(shapeFilter))
    return filtered.sort((a, b) => (b.matched - a.matched) || (b.fit - a.fit))
  }, [active, activeKeys, players, pairs, slate, requireAll, histOnly, mScore, marketKey, groupFilter, shapeFilter])

  const shown = useMemo(() => {
    const q = query.toLowerCase().trim()
    return q ? anchors.filter((a) => a.name.toLowerCase().includes(q)) : anchors
  }, [anchors, query])

  // A missing pair-history file is survivable now that the pool is the slate:
  // the builder degrades into a market-score partner finder and the 🤝 column
  // simply never lights. An empty SLATE is not survivable, and says so.
  if (!anchors.length) {
    return (
      <div style={{ fontSize: 11.5, color: C.text3, padding: '10px 0' }}>
        No hitters published for this slate yet, so there&apos;s nothing to build from.
      </div>
    )
  }

  const multi = active.length > 1
  const sharedByAll = partners.filter((p) => p.all).length
  const withHistory = partners.filter((p) => p.hist).length
  // The "shared history only" filter was asked for but had nothing to keep.
  const histIgnored = histOnly && partners.length > 0 && withHistory === 0

  return (
    <div style={{ marginBottom: 22 }}>
      {!bare && <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Pair Builder</div>}
      <WhatThis maxWidth={660}>
        who to put next to a hitter you already like, for the market you&apos;re actually betting.{' '}
        {bare
          ? <>Your anchors are the hitters pinned above — <b style={{ color: C.text2 }}>tap more names up there</b> to add them.{' '}</>
          : <>Click hitters to add them — <b style={{ color: C.text2 }}>you can select several</b>; click a selected hitter again to drop him.{' '}</>}
        Partners are <b style={{ color: C.text2 }}>every hitter on tonight&apos;s slate</b>,
        ranked on tonight&apos;s score in the market below. Shared homer history shows up as
        its own columns — <b style={{ color: C.text2 }}>informational, not a ranking factor</b> —
        because the measured archive found it isn&apos;t predictive (see lib/pairEvidence.js).
      </WhatThis>

      {/* THE MARKET — promoted to the top of the panel and given its own card
          (2026-08-09). It was a row of four small pills that looked like a tag
          filter, so nobody switched it, and the one line explaining it said
          only "each leg needs 1+ HR". It is the most consequential control on
          this page: it changes the score that ranks the anchor chips, the
          partner table's Fit, and the score column itself. The card now says
          exactly what moves and — just as important — what doesn't. */}
      <div style={{
        background: `linear-gradient(155deg, rgba(249,115,22,.07), ${C.bg2} 65%)`,
        border: `1px solid ${C.orange}3d`, borderRadius: 12,
        padding: '10px 14px', marginBottom: 11,
      }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 9.5, color: C.text2, textTransform: 'uppercase', letterSpacing: '.09em', fontWeight: 900, fontFamily: NUM_FONT }}>
            Building for
          </span>
          {MARKETS.map((x) => {
            const on = marketKey === x.key
            return (
              <button
                key={x.key}
                onClick={() => setMarketKey(x.key)}
                title={`Rank every anchor and partner on tonight's ${x.label} score. Each leg needs ${x.needs}.`}
                style={{
                  padding: '6px 14px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.16)' : C.bg3,
                  boxShadow: on ? '0 0 12px rgba(249,115,22,.16)' : 'none',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 900, color: on ? C.orange : C.text2, lineHeight: 1.2 }}>{x.label}</div>
                <div style={{ fontSize: 8.5, fontFamily: NUM_FONT, color: C.text3, letterSpacing: '.04em' }}>{x.needs}</div>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: 10, color: C.text2, lineHeight: 1.6, marginTop: 8 }}>
          <b style={{ color: C.orange }}>{mkt.label}</b> is selected, so every leg has to deliver{' '}
          <b style={{ color: C.text }}>{mkt.needs}</b>. Switching this changes{' '}
          <b style={{ color: C.text }}>two things</b>: the score on the hitter chips {bare ? 'above' : 'below'}, and the{' '}
          <b style={{ color: C.text }}>{mkt.short}</b>/<b style={{ color: C.text }}>Fit</b> columns in
          the partner table — Fit <i>is</i> tonight&apos;s score now, full stop (2026-08-28:
          shared-history bonuses stopped moving it once the archive showed they don&apos;t predict
          anything).
          {' '}It changes <b style={{ color: C.text }}>nothing else</b>: the history columns keep
          counting co-<i>homer</i> days regardless of market, because co-HR days are the only pair
          history the bot publishes — shown for reference now, not folded into anyone&apos;s fit.
        </div>
      </div>

      {!bare && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find any hitter on tonight's slate…"
          style={{
            width: '100%', maxWidth: 300, background: C.bg2, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '6px 11px', fontSize: 12, color: C.text,
            outline: 'none', fontFamily: NUM_FONT, marginBottom: 8,
          }}
        />
      )}

      {/* The picker — chips and their caption — belongs to whichever block owns
          the anchors. Inside the merged builder that is the shared block above,
          so bare mode draws none of it. Standalone, it draws all of it. */}
      {!bare && (
        <>
        {/* CHIP ROW, capped in HEIGHT rather than in count (2026-08-09 — it was
            wrapping to four lines and pushing the actual answer below the fold).
            Two rows tall by default, scrolls inside itself, expands to a taller
            scroll box on request. Nothing is removed from the list; it just
            stops being the tallest thing on the panel. */}
        <div style={{
          display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-start',
          maxHeight: showAllChips ? 190 : 62, overflowY: 'auto',
          paddingRight: 2,
        }}>
          {shown.slice(0, 200).map((a) => {
            const on = activeKeys.has(a.key)
            const implicit = on && !anchorKeys.length
            return (
              <button
                key={a.key}
                onClick={() => toggleAnchor(a.key)}
                title={implicit ? 'Shown by default — click another hitter to choose your own' : (on ? 'Click to remove' : 'Click to add')}
                style={{
                  padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 10.5, fontWeight: 700, whiteSpace: 'nowrap',
                  border: `1px solid ${on ? C.orange : C.border}`,
                  background: on ? 'rgba(249,115,22,.12)' : C.bg2,
                  color: on ? C.orange : C.text2,
                  opacity: implicit ? 0.8 : 1,
                }}
              >
                {on && !implicit ? '✓ ' : ''}{a.name}
                <span style={{ color: C.text3, fontFamily: NUM_FONT, marginLeft: 5, fontSize: 9.5 }}>
                  {mScore(a.today).toFixed(0)}
                </span>
                {!a.hasHistory && (
                  <span title="No co-HR history on file — his partners are ranked on tonight's market score alone"
                    style={{ color: C.text3, marginLeft: 4, fontSize: 9 }}>·</span>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
          {shown.length > 18 && (
            <button
              onClick={() => setShowAllChips((v) => !v)}
              style={{
                padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                fontWeight: 700, fontFamily: NUM_FONT,
                border: `1px solid ${C.border}`, background: 'transparent', color: C.text2,
              }}
            >{showAllChips ? '▴ Collapse the list' : `▾ Taller list (${shown.length} hitters, scrolls)`}</button>
          )}
          <span style={{ fontSize: 9.5, color: C.text3, lineHeight: 1.5 }}>
            Sorted by tonight&apos;s {mkt.label} score. A <b style={{ color: C.text2 }}>·</b> means no
            co-HR history on file — still selectable, he just brings no partners of his own.
          </span>
        </div>
        </>
      )}

      {(
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          {/* Clearing the selection here would silently disagree with the pins
              shown above, so in bare mode the parent's "clear all" is the only
              one. */}
          {!bare && anchorKeys.length > 0 && (
            <button
              onClick={() => setAnchorKeys([])}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
              }}
            >Clear selection</button>
          )}
          <button
            onClick={() => setHistOverride(!histOnly)}
            title={histOnly
              ? 'Showing only partners with a shared co-HOMER history. Turn off to rank the whole slate on tonight’s market score.'
              : 'Showing every hitter on tonight’s slate. Turn on to keep only partners with a shared co-HOMER history.'}
            style={{
              padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
              fontFamily: NUM_FONT,
              border: `1px solid ${histOnly ? C.orange : C.border}`,
              background: histOnly ? 'rgba(249,115,22,.12)' : 'transparent',
              color: histOnly ? C.orange : C.text3,
            }}
          >{histOnly ? '✓ Shared homer history only' : 'Shared homer history only'}</button>
          {multi && (
            <button
              onClick={() => setRequireAll((v) => !v)}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: NUM_FONT,
                border: `1px solid ${requireAll ? C.orange : C.border}`,
                background: requireAll ? 'rgba(249,115,22,.12)' : 'transparent',
                color: requireAll ? C.orange : C.text3,
              }}
            >Shared by all {active.length} only</button>
          )}
        </div>
      )}

      {/* GROUP + SHAPE TAGS (2026-08-18) — see the note above GROUP_TAGS.
          Two independent rows, AND'd together with everything above: narrow
          the partner table to a bot-designated role, a recent contact shape,
          or both. Off by default — the table is every hitter on the slate
          until you tag it down. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Group</span>
        {GROUP_TAGS.map((t) => {
          const on = groupFilter === t.key
          return (
            <button key={t.key} onClick={() => setGroupFilter(on ? null : t.key)}
              title={`Only partners the bot designated tonight's ${t.label} pick`}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: NUM_FONT,
                border: `1px solid ${on ? t.color : C.border}`,
                background: on ? `${t.color}22` : 'transparent',
                color: on ? t.color : C.text3,
              }}
            >{t.label}</button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Shape</span>
        {SHAPE_TAGS.map((t) => {
          const on = shapeFilter === t.key
          return (
            <button key={t.key} onClick={() => setShapeFilter(on ? null : t.key)}
              title={t.title}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >{t.label}</button>
          )
        })}
        {(groupFilter || shapeFilter) && (
          <button onClick={() => { setGroupFilter(null); setShapeFilter(null) }} style={{
            padding: '3px 9px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700,
            border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, fontFamily: NUM_FONT,
          }}>clear tags</button>
        )}
      </div>

      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.orange}`,
        borderRadius: 12, padding: '11px 15px', marginBottom: 12,
      }}>
        <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Building around {active.length > 1 ? `${active.length} hitters` : ''}
        </div>
        <div style={{ fontSize: multi ? 14 : 17, fontWeight: 800, margin: '2px 0 2px' }}>
          {active.map((a) => a.name).join('  +  ')}
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
          {active.map((a) => (
            <div key={a.key}>
              {a.name} — {teamOf(a.today)} vs {oppOf(a.today)} · {clean(a.today?.pitcher_name, 'TBD')} · {mkt.short} {mScore(a.today).toFixed(1)}
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.text2, fontFamily: NUM_FONT, marginTop: 4 }}>
          {partners.length} partner{partners.length === 1 ? '' : 's'} playing tonight
          {multi && <> · <b style={{ color: sharedByAll ? C.orange : C.text3 }}>{sharedByAll}</b> shared by all {active.length}</>}
          {' '}· <b style={{ color: withHistory ? C.orange : C.text3 }}>{withHistory}</b> with shared homer history
          {' '}· {partners.filter((p) => p.sameGame > 0).length} same-game
        </div>
        {histIgnored && (
          <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            &ldquo;Shared homer history only&rdquo; is on, but{' '}
            {multi ? 'none of your anchors have' : `${active[0].name} has`} a co-HR partner playing
            tonight — so it&apos;s being ignored and the list is ranked on tonight&apos;s{' '}
            {mkt.label} score alone.
          </div>
        )}
      </div>

      {!partners.length ? (
        <div style={{ fontSize: 11.5, color: C.text3 }}>
          {groupFilter || shapeFilter
            ? <>Nobody left matches{groupFilter ? ` the ${GROUP_TAGS.find((t) => t.key === groupFilter)?.label} group` : ''}
                {groupFilter && shapeFilter ? ' and' : ''}{shapeFilter ? ` the ${SHAPE_TAGS.find((t) => t.key === shapeFilter)?.label.replace(/^\S+\s/, '')} shape` : ''} tag
                {(groupFilter && shapeFilter) ? 's' : ''} tonight — clear the tag{(groupFilter && shapeFilter) ? 's' : ''} above to see everyone again.</>
            : multi && requireAll
            ? `No single hitter on tonight's slate shares homer history with all ${active.length} of them. Turn off "shared by all ${active.length}" to see partial matches.`
            : 'Nobody else is on tonight’s slate to pair with.'}
        </div>
      ) : (
        <>
          {/* BEST RIGHT NOW — the top of the table, said in a sentence, so
              the page answers its own question before you read a single
              column. The heatmap that used to sit here repeated the table's
              columns in chart form; the callout + table is the cleaner pair. */}
          {(() => {
            const top = partners[0]
            const single = active.length === 1
            const anchorName = single ? active[0].name : `${active.length} anchors`
            const anchorScore = active.reduce((s, a) => s + mScore(a.today), 0) / Math.max(1, active.length)
            const anchorSub = single
              ? `${teamOf(active[0].today)} vs ${oppOf(active[0].today)} · ${clean(active[0].today?.pitcher_name, 'TBD')}`
              : active.map((a) => a.name.split(' ').slice(-1)[0]).join(', ')
            const Side = ({ label, name, score, sub, onClick }) => (
              <div
                onClick={onClick}
                style={{ flex: '1 1 190px', minWidth: 0, cursor: onClick ? 'pointer' : 'default' }}
              >
                <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>
                  {label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 14, fontWeight: 900, color: C.orange, flexShrink: 0 }}>
                    {score.toFixed(0)}
                  </span>
                  <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{mkt.short}</span>
                </div>
                <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
              </div>
            )
            return (
              /* BEST RIGHT NOW, as a hero card (2026-08-09). It was one line of
                 small text that read like a caption for the table under it, so
                 the page's own answer looked like a footnote. Now it's the two
                 hitters side by side with their scores, the fit between them as
                 the headline number, and the one-line reason underneath. */
              <div style={{
                background: 'linear-gradient(155deg, rgba(249,115,22,.16), rgba(249,115,22,.04) 65%)',
                border: `1px solid ${C.orange}77`, borderRadius: 14,
                padding: '12px 16px', marginBottom: 12,
                boxShadow: '0 0 22px rgba(249,115,22,.12)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
                  <span style={{ fontSize: 9.5, color: C.orange, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 900, fontFamily: NUM_FONT }}>
                    ⚡ Best right now
                  </span>
                  <span style={{ fontSize: 9, color: C.text3 }}>
                    top of the table on the {mkt.label} market — {mkt.needs} from each side
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Side
                    label={single ? 'Anchor' : `Anchors (${active.length}, avg)`}
                    name={anchorName}
                    score={anchorScore}
                    sub={anchorSub}
                    onClick={single && onPlayerClick ? () => onPlayerClick(active[0].today) : null}
                  />
                  <span style={{ fontSize: 20, color: C.text3, fontWeight: 300, flexShrink: 0 }}>+</span>
                  <Side
                    label="Partner"
                    name={top.name}
                    score={top.hr}
                    sub={`${top.team} vs ${top.opp} · ${top.pitcher}${top.hr9 ? ` · ${top.hr9.toFixed(2)} HR/9` : ''}`}
                    onClick={onPlayerClick ? () => onPlayerClick(top._raw) : null}
                  />
                  <div style={{
                    flexShrink: 0, textAlign: 'center', paddingLeft: 14,
                    borderLeft: `1px solid ${C.orange}44`, minWidth: 78,
                  }}>
                    <div style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: NUM_FONT }}>Fit</div>
                    <div style={{ fontFamily: NUM_FONT, fontSize: 28, fontWeight: 900, color: C.orange, lineHeight: 1.1 }}>
                      {top.fit.toFixed(1)}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6, marginTop: 8, paddingTop: 7, borderTop: `1px solid ${C.orange}33` }}>
                  {whyPartner(top, mkt, single ? active[0].name.split(' ').slice(-1)[0] : `your ${active.length}`)}
                </div>
              </div>
            )
          })()}

          {/* WHY THESE THREE — the same sentence for the runners-up, so the
              top of the table explains itself before you start reading
              columns. Reasons only; the numbers behind them are the columns. */}
          {partners.length > 1 && (
            <div style={{
              background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11,
              padding: '9px 14px', marginBottom: 11,
            }}>
              <div style={{ fontSize: 9, color: C.text3, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', fontFamily: NUM_FONT, marginBottom: 5 }}>
                Why the top {Math.min(3, partners.length)}
              </div>
              {partners.slice(0, 3).map((p, i) => (
                <div key={p._key} style={{
                  display: 'flex', gap: 9, alignItems: 'baseline', flexWrap: 'wrap',
                  padding: '4px 0', borderTop: i ? `1px solid ${C.border}` : 'none',
                }}>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, color: i === 0 ? C.orange : C.text3, width: 14, flexShrink: 0 }}>{i + 1}</span>
                  <span
                    onClick={() => onPlayerClick?.(p._raw)}
                    style={{ fontSize: 12, fontWeight: 800, cursor: onPlayerClick ? 'pointer' : 'default', flexShrink: 0 }}
                  >{p.name}</span>
                  <span style={{ fontFamily: NUM_FONT, fontSize: 9.5, color: C.text3, flexShrink: 0 }}>
                    fit {p.fit.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.55, flex: '1 1 240px', minWidth: 0 }}>
                    {whyPartner(p, mkt, multi ? `your ${active.length}` : active[0].name.split(' ').slice(-1)[0])}
                  </span>
                </div>
              ))}
            </div>
          )}

          <DenseTable
            heatMode="sorted"
rows={partners.map((p) => ({
              ...p,
              iso: n(p._raw?.season_iso, 0) * 100,
              hrw: n(p._raw?.hrw_score, 0),
              l5: `${n(p._raw?.last5_hits, 0)}H/${n(p._raw?.last5_hr, 0)}HR`,
              spot: clean(p._raw?.lineup_spot, ''),
              isPick: String(p._raw?.game_pick_role || '').trim() ? 1 : 0,
            }))}
            columns={[
              { key: 'name',     label: 'Partner', heat: false, w: 148, bold: true, sticky: true },
              ...(multi ? [
                { key: 'matched', label: 'Anchors', w: 52,
                  title: 'How many of your selected hitters this partner shares history with' },
                { key: 'with',    label: 'With',    heat: false, w: 128, dim: true },
              ] : []),
              { key: 'team',     label: 'Tm',      heat: false, w: 34, mono: true, dim: true },
              { key: 'opp',      label: 'Opp',     heat: false, w: 34, mono: true, dim: true },
              { key: 'spot',     label: '#',       heat: false, w: 28, mono: true, dim: true,
                title: 'Lineup spot tonight' },
              { key: 'pitcher',  label: 'Facing',  heat: false, w: 124, dim: true },
              { key: 'isPick',   label: '🤖',      flag: true, mark: '●', w: 32,
                title: 'One of the bot’s designated picks tonight' },
              { key: 'weak',     label: '★',       flag: true, mark: '★', w: 30,
                title: 'Weak lineup spot against tonight’s starter' },
              ...(histOnly ? [] : [
                { key: 'hist', label: '🤝', flag: true, mark: '●', w: 30,
                  title: 'These two have homered on the same day at least once this season. Informational only (2026-08-28: the archive found shared history isn\'t predictive) — not a bonus inside Fit, and not a requirement for being on this list.' },
              ]),
              { key: 'fit',      label: 'Fit',     w: 46, dp: 1,
                title: `Tonight's ${mkt.label} score, full stop — same-game/shared-day history no longer weighted in (2026-08-28: measured, not predictive — see lib/pairEvidence.js)`,
                // 2026-08-12: 'Fit' collided with the single-player GLOSSARY
                // entry ("how well this hitter fits what the board is
                // looking for") plus its ranking/percentage caveat, both
                // written for a different, one-hitter score. This is a
                // two-hitter pairing score — own explanation now.
                //
                // 2026-08-28: dropped the sameGame/days/since weighting (was
                // 25%/10%/10%). It was built on "only the same-game version
                // is correlated," which lib/pairEvidence.js's own 186k-pair
                // study disproves (same game measures at 1.05x independence
                // — noise). Fit === tonight's score now; the history fields
                // moved to display-only columns below.
                explain: 'How well he pairs with your anchor — tonight\'s own score for this market. Shared homer history shows up in its own columns but no longer moves this number; the archive found it isn\'t predictive.' },
              { key: 'hr',       label: mkt.short, w: 44, dp: 1,
                title: `Tonight's ${mkt.label} score — the market you picked above` },
              { key: 'l5',       label: 'L5',      heat: false, w: 58, mono: true, dim: true,
                title: 'Last five games — hits / homers' },
              { key: 'iso',      label: 'ISO',     w: 44, dp: 0,
                title: 'Season ISO ×100 — the archive’s strongest HR predictor' },
              { key: 'hrw',      label: 'HRW',     w: 46, dp: 0 },
              { key: 'sameGame', label: 'Same gm', w: 50,
                title: 'Times he and your anchor homered in the SAME GAME this season — a real count, but measured at 1.05x independence (i.e. not correlated). Reference only, not a Fit input.' },
              { key: 'days',     label: 'Same day', w: 54,
                title: 'Times they homered on the same DATE — includes different ballparks, so it’s coincidence-friendly, and even Same gm already tests as noise. Reference only, not a Fit input.' },
              { key: 'since',    label: 'Last together', w: 72,
                invert: true, fmt: (v) => (v == null ? 'never' : v === 0 ? 'today' : `${v}d ago`),
                title: 'How long since the two of them last homered on the same day. "12d ago" = still warm; months = a stat, not a streak. Inverted so recent reads bright. Reference only, not a Fit input.' },
              { key: 'hr9',      label: 'Opp HR/9', w: 50, dp: 2,
                title: 'The starter this partner faces tonight' },
            ]}
            onRowClick={onPlayerClick}
            initialSort={multi ? 'matched' : 'fit'}
            maxHeight={400}
            caption={`${histOnly ? '' : 'Every hitter on tonight’s slate is listed — 🤝 marks the ones who share a co-homer history with your selection. Shown for reference, not folded into Fit (2026-08-28: measured, not predictive). '}"Last together" is how long since these two last homered on the same day — "12d ago" is a live pairing, "60d ago" is a memory; it's inverted so recent reads bright. Same gm and Same day are both raw counts now, not ranking inputs — Boost and the bot's raw pair score came off the board earlier for the same reason, as their own reference columns.${mkt.key !== 'hr' ? ` On the ${mkt.label} market, tonight's score is on your market but the history columns still count co-HOMER days — that's the only pair history the bot publishes.` : ''}${multi ? ' With multiple anchors, Same gm / Same day sum across matched anchors and Last together is the most recent.' : ''}`}
          />
        </>
      )}
    </div>
  )
}
