'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, arr, txt, nameOf, teamOf, oppOf } from '../../lib/player'
import { catColor, alpha, score as fmtScore } from '../../lib/scales'
import { FilterPill } from '../Filters'

// ══ PROPS GRID — THE MOBILE PILOT PAGE ══════════════════════════════════════
// built 2026-08-23 · REDRAWN 2026-08-23 (Donovan: "make the props page better
// and more futuristic looking but still simple … i dont see it on the props
// page or the use of it … make it look visually different")
//
// The first build answered the BRIEF (verdict first, depth on tap) and lost
// the LOOK: the cards were the same 1px-border, 10px-type, bg2 rectangles as
// every other list on the site, sitting under ~500px of page furniture —
// hero tiles, search, team dropdown, tab bar, a three-line paragraph, TWO
// rows of pills and a SECOND search box that duplicated the one at the top
// of every page. On a phone you scrolled half a screen to reach the first
// card, and when you got there nothing told you this page was new. That is
// what "I don't see it" meant.
//
// This pass changes three things and nothing else about the contract:
//
//   1. THE DIAL. One number per card, drawn as a ring that fills to the
//      score — an instrument, not a table cell. It is the only loud thing on
//      the card and the only thing on this site that looks like this, which
//      is the whole point: the page announces itself.
//   2. AIR. Card padding, name size and tile size all step up; each card
//      carries a soft wash of its own badge colour so a board of them reads
//      as a stack of distinct decisions rather than one grey list.
//   3. THE FURNITURE IS GONE. The second search box is deleted (Controls at
//      the top of the page already filters `players` by name/team/pitcher —
//      this one filtered the same rows a second time), the paragraph is one
//      line, and the two pill rows are one sideways-scrolling rail on the
//      standard .chip-row. First card starts ~200px sooner on a phone.
//
// WHY-THIS-ONE (open question #7) — Donovan, asked directly: "idk please make
// simple". So: the badge's own market score leads (a pick always wears its
// own market's score — the house rule), and under it ONE sentence. For the
// power slots that sentence is the bot's own plain-English line
// (`simple_reason_1`: "Reached 442 feet recently — true leave-yard power"),
// which the first build computed nothing from and threw away. The other
// markets keep a generated stat line, because their *_reason fields are
// boilerplate — "Low K + split BA + recent hits" is the same string on every
// hitter in the file and would be a sentence that decides nothing.
//
// Everything else is unchanged and deliberate: default population is the
// decision-ready set (badge holders + WATCH), "Everyone" is one pill away,
// ranking is per-market so two yardsticks never sort against each other, and
// the drill-down is the existing player modal — the full grid, splits and
// zone map already live there.

const ROLE_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT', 'WATCH']

const rolesOf = (r) => String(r?.game_pick_role || '')
  .split('/').map((t) => t.trim().toUpperCase()).filter(Boolean)

const primaryRole = (r) => {
  const toks = rolesOf(r)
  for (const k of ROLE_ORDER) if (toks.includes(k)) return k
  return null
}

// WATCH is coverage, never a pick (the standing decision), so it never wears
// a market hue — it stays in the greys and lets the badges own the colour.
const roleColor = (role) => ((role === 'WATCH' || role === 'NONE') ? C.text3 : catColor('role', role))

const avg3 = (v) => (n(v, 0)).toFixed(3).replace(/^0/, '')

// The slate publishes doubles, triples and homers but no season XBH total, so
// the first build printed an em-dash on every CONTACT card. It is a sum.
const seasonXBH = (r) => n(r?.season_xbh, 0)
  || (n(r?.season_doubles, 0) + n(r?.season_triples, 0) + n(r?.season_hr, 0))

// The verdict registry — one entry per badge: which score leads the card,
// which counts back it up, and the sentence that does the deciding.
const VERDICTS = {
  TOP: {
    score: (r) => n(r?.overall_score, null),
    market: 'best bat',
    // NOT `plain`: simple_reason_1 is the bot's POWER line, and a column of
    // fifteen "Reached NNN feet recently" reads as boilerplate even though
    // the number is real. The best-bat slot is about the whole bat, so it
    // says what the whole bat did.
    why: (r) => `the game's best bat — ${n(r?.season_hr, 0)} HR season, ${n(r?.last10_hits, 0)} hits in his last 10`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)}H·${n(r?.last5_hr, 0)}HR` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)}H·${n(r?.last10_hr, 0)}HR` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
  HR: {
    score: (r) => n(r?.hr_score, null),
    market: 'home run',
    plain: true,
    why: (r) => `${n(r?.last10_hr, 0)} HR in his last 10 · ${n(r?.season_hr, 0)} on the season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hr, 0)} HR` },
      { k: 'L10', v: `${n(r?.last10_hr, 0)} HR` },
      { k: 'SZN', v: `${n(r?.season_hr, 0)} HR` },
    ],
  },
  HIT: {
    score: (r) => n(r?.hit_score, null),
    market: '1+ hit',
    why: (r) => `${n(r?.last10_hits, 0)} hits in his last 10 · ${avg3(r?.season_avg)} season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)} H` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)} H` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
  HRR: {
    score: (r) => n(r?.hrr_score, null),
    market: 'hits+runs+RBI',
    why: (r) => `${n(r?.last5_hits, 0) + n(r?.last5_runs, 0) + n(r?.last5_rbi, 0)} H+R+RBI over his last 5`,
    tiles: (r) => [
      { k: 'L5 H', v: `${n(r?.last5_hits, 0)}` },
      { k: 'L5 R', v: `${n(r?.last5_runs, 0)}` },
      { k: 'L5 RBI', v: `${n(r?.last5_rbi, 0)}` },
    ],
  },
  CONTACT: {
    score: (r) => n(r?.contact_score, null),
    market: '2+ total bases',
    why: (r) => `${n(r?.last10_xbh, 0)} XBH in his last 10 · ${seasonXBH(r)} on the season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_xbh, 0)} XBH` },
      { k: 'L10', v: `${n(r?.last10_xbh, 0)} XBH` },
      { k: 'SZN ISO', v: avg3(r?.season_iso) },
    ],
  },
  WATCH: {
    score: (r) => n(r?.hr_score, null),
    market: 'coverage watch',
    plain: true,
    why: (r) => `next power bat in this game — ${n(r?.season_hr, 0)} HR season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hr, 0)} HR` },
      { k: 'L10', v: `${n(r?.last10_hr, 0)} HR` },
      { k: 'SZN', v: `${n(r?.season_hr, 0)} HR` },
    ],
  },
  // Only reachable from the "Everyone" pill — a hitter the bot did not
  // designate. It gets the overall score and says so, rather than borrowing a
  // market's badge it was never given.
  NONE: {
    score: (r) => n(r?.overall_score, null),
    market: 'no badge',
    why: (r) => `${n(r?.season_hr, 0)} HR season · ${n(r?.last10_hits, 0)} hits in his last 10`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)}H·${n(r?.last5_hr, 0)}HR` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)}H·${n(r?.last10_hr, 0)}HR` },
      { k: 'SZN', v: avg3(r?.season_avg) },
    ],
  },
}

const GROUP_ORDER = [...ROLE_ORDER, 'NONE']

// The sentence. `plain` markets (the power slots) prefer the bot's own
// beginner line — it is personal to the hitter and states its evidence.
// The rest get the generated stat line, because their reason fields are the
// same string for everybody.
const sentenceFor = (r, v) => {
  if (v.plain) {
    const s = txt(r?.simple_reason_1).trim()
    if (s) return s
  }
  return v.why(r)
}

// At most two chips, and a live trap warning outranks a signal every time.
const chipsFor = (r, role) => {
  const out = []
  if (r?.trap_flag && (role === 'HR' || role === 'TOP' || role === 'WATCH')) {
    out.push({ t: '⚠ trap risk', warn: true })
  }
  for (const p of arr(r?.signal_pills)) {
    if (out.length >= 2) break
    const s = String(p || '').trim()
    if (s) out.push({ t: s, warn: false })
  }
  return out.slice(0, 2)
}

// ── the dial ────────────────────────────────────────────────────────────────
// A 0-100 model score drawn as a ring that fills to its own value. Two nested
// circles and a conic-gradient: no canvas, no SVG, no library, and it re-reads
// the live palette on every render like everything else here.
function Dial({ value, col }) {
  const v = value == null ? null : Math.max(0, Math.min(100, value))
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
      display: 'grid', placeItems: 'center',
      background: v == null
        ? alpha(C.text3, 0.14)
        : `conic-gradient(from 180deg, ${col} ${v}%, ${alpha(col, 0.13)} ${v}%)`,
      boxShadow: v == null ? 'none' : `0 0 14px ${alpha(col, 0.22)}`,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', background: C.bg,
        display: 'grid', placeItems: 'center', border: `1px solid ${alpha(col, 0.18)}`,
      }}>
        <span style={{ fontSize: 19, fontWeight: 900, fontFamily: NUM_FONT, color: col, lineHeight: 1 }}>
          {v == null ? '—' : fmtScore(v, 0)}
        </span>
      </div>
    </div>
  )
}

// ── the market's own name, over its block ───────────────────────────────────
// A hairline and four words. It is what makes the grouped ranking legible
// instead of mysterious, and it says the market in ENGLISH — "2+ total bases"
// rather than CONTACT — which is the one place on the site where the badge
// codes get translated for someone who has never seen them.
function GroupHead({ role, count }) {
  const col = roleColor(role)
  const v = VERDICTS[role] || VERDICTS.NONE
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <span style={{
        fontSize: 9.5, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color: col, whiteSpace: 'nowrap',
      }}>{v.market}</span>
      <span style={{ fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{count}</span>
      <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
    </div>
  )
}

function Card({ r, role: forced, onPlayerClick }) {
  // The card wears the market you are BROWSING. Filter to HR and a hitter who
  // also holds TOP shows his hr_score, because that is the board you asked
  // for — the first build always showed his highest-priority role instead,
  // so an HR-filtered board could print overall scores.
  const role = forced || primaryRole(r) || 'NONE'
  const v = VERDICTS[role] || VERDICTS.NONE
  const col = roleColor(role)
  const s = v.score(r)
  const arm = txt(r?.pitcher_name).trim()
  const hand = txt(r?.pitcher_throws).trim()
  const chips = chipsFor(r, role)

  return (
    <div
      onClick={onPlayerClick ? () => onPlayerClick(r) : undefined}
      style={{
        position: 'relative', overflow: 'hidden',
        border: `1px solid ${alpha(col, 0.26)}`, borderRadius: 18,
        padding: '14px 14px 13px', cursor: onPlayerClick ? 'pointer' : 'default',
        background: `linear-gradient(158deg, ${alpha(col, 0.13)}, ${C.bg2} 54%)`,
        display: 'flex', flexDirection: 'column', gap: 11, minWidth: 0,
      }}
    >
      {/* the light bar — the card's one piece of chrome, and the thing that
          makes a stack of these read as separate decisions from across a room */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${col}, ${alpha(col, 0)} 72%)`,
      }} />

      {/* ── the head: dial, who, and the badge ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0 }}>
        <Dial value={s} col={col} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{
              fontSize: 16.5, fontWeight: 900, letterSpacing: '-.01em', minWidth: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{nameOf(r)}</span>
            <span style={{
              marginLeft: 'auto', flexShrink: 0, fontSize: 8.5, fontWeight: 900,
              letterSpacing: '.07em', padding: '3px 8px', borderRadius: 999,
              color: role === 'WATCH' ? C.text3 : col,
              border: `1px solid ${role === 'WATCH' ? C.border2 : alpha(col, 0.55)}`,
              background: (role === 'WATCH' || role === 'NONE') ? 'transparent' : alpha(col, 0.12),
            }}>{role === 'WATCH' ? '👀 WATCH' : role === 'NONE' ? 'NO BADGE' : role}</span>
          </div>
          <div style={{
            fontSize: 10, color: C.text3, fontFamily: NUM_FONT,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {teamOf(r)} vs {oppOf(r)}{arm ? ` · ${arm}${hand ? ` (${hand})` : ''}` : ''}
          </div>
        </div>
      </div>

      {/* ── the sentence: why this one, in words ───────────────────────── */}
      <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.55, minWidth: 0 }}>
        {sentenceFor(r, v)}
      </div>

      {/* ── the chips: at most two, and only when the bot published them ── */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <span key={c.t} style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: '.03em', padding: '3px 8px',
              borderRadius: 999, whiteSpace: 'nowrap',
              color: c.warn ? C.text : C.text2,
              border: `1px solid ${c.warn ? C.border2 : alpha(col, 0.3)}`,
              background: c.warn ? C.glass : alpha(col, 0.07),
            }}>{c.t}</span>
          ))}
        </div>
      )}

      {/* ── the period tiles, doubling as the streak display ───────────── */}
      <div style={{ display: 'flex', gap: 7 }}>
        {v.tiles(r).map((t) => (
          <span key={t.k} style={{
            flex: 1, textAlign: 'center', padding: '7px 3px', borderRadius: 12,
            border: `1px solid ${C.border}`, background: C.glass, minWidth: 0,
          }}>
            <span style={{
              display: 'block', fontSize: 8, fontWeight: 800, letterSpacing: '.1em',
              color: C.text3, fontFamily: NUM_FONT,
            }}>{t.k}</span>
            <span style={{
              display: 'block', fontSize: 13, fontWeight: 800, fontFamily: NUM_FONT,
              color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{t.v}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// "Everyone" is 266 hitters on a full slate, and each card here is a real
// piece of paint (a conic ring, a wash, a glow). Rendering all of them at once
// is a phone-melting amount of work for a view nobody scrolls to the bottom
// of, so it stops at 60 — and SAYS SO, with the rest one tap away. A cap that
// doesn't announce itself reads as "that's everybody", which is the one thing
// a coverage board must never imply.
const SOFT_CAP = 60

export default function PropsGrid({ players = [], onPlayerClick }) {
  const [market, setMarket] = useState('picks')
  const [all, setAll] = useState(false)

  const rows = useMemo(() => (players || []).filter((p) => p && p.player_id), [players])

  const counts = useMemo(() => {
    const c = { picks: 0, everyone: rows.length }
    for (const k of ROLE_ORDER) c[k] = 0
    for (const r of rows) {
      const toks = rolesOf(r)
      if (toks.length) c.picks += 1
      for (const k of ROLE_ORDER) if (toks.includes(k)) c[k] += 1
    }
    return c
  }, [rows])

  // GROUPED BY MARKET, RANKED INSIDE IT (2026-08-23). The first build sorted
  // the whole board on "each card's own score", which sounds like the house
  // rule and quietly breaks it: hit_score runs hotter than hr_score, so a
  // 1+HIT card at 80 sat above the game's TOP bat at 65 — two different
  // yardsticks compared against each other, which is exactly what the rule
  // forbids. Cards only ever rank against cards measured the same way now,
  // and the market's own name sits above each block. It also reads better:
  // TOP first is "start here", instead of one undifferentiated stack.
  const groups = useMemo(() => {
    const single = market !== 'picks' && market !== 'everyone'
    let out = rows
    if (market === 'picks') out = out.filter((r) => rolesOf(r).length)
    else if (single) out = out.filter((r) => rolesOf(r).includes(market))

    const buckets = new Map()
    for (const r of out) {
      const k = single ? market : (primaryRole(r) || 'NONE')
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(r)
    }
    return GROUP_ORDER.filter((k) => buckets.has(k)).map((k) => {
      const sc = (r) => (VERDICTS[k] || VERDICTS.NONE).score(r) ?? -1
      return {
        key: k,
        rows: buckets.get(k).sort((a, b) => sc(b) - sc(a) ||
          String(nameOf(a)).localeCompare(String(nameOf(b)))),
      }
    })
  }, [rows, market])

  const total = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0), [groups])

  // Trim ACROSS groups in order, so the cap never silently empties a market.
  const capped = useMemo(() => {
    if (all || total <= SOFT_CAP) return groups
    let left = SOFT_CAP
    const out = []
    for (const g of groups) {
      if (left <= 0) break
      out.push({ key: g.key, rows: g.rows.slice(0, left) })
      left -= Math.min(left, g.rows.length)
    }
    return out
  }, [groups, total, all])

  const hidden = total - capped.reduce((s, g) => s + g.rows.length, 0)

  const pills = [
    { key: 'picks', label: 'Picks', count: counts.picks, title: 'every bat wearing a badge tonight' },
    ...ROLE_ORDER.map((k) => ({ key: k, label: k === 'WATCH' ? '👀 Watch' : k, count: counts[k] })),
    { key: 'everyone', label: 'Everyone', count: counts.everyone },
  ]

  return (
    <div>
      {/* One rail, one line. The search that used to sit here filtered the
          same rows the page header already filters — see the note up top. */}
      <div className="chip-row" style={{
        display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2,
      }}>
        {pills.map((o) => (
          <FilterPill
            key={o.key}
            active={market === o.key}
            onClick={() => { setMarket(o.key); setAll(false) }}
            count={o.count}
            title={o.title}
          >{o.label}</FilterPill>
        ))}
      </div>
      <div style={{ fontSize: 10, color: C.text3, margin: '8px 0 4px' }}>
        {hidden > 0 ? `showing ${total - hidden} of ${total}` : `${total} card${total === 1 ? '' : 's'}`}
        {' — the verdict first, tap one for the full read.'}
      </div>

      {total === 0 ? (
        <div style={{ fontSize: 11.5, color: C.text3, marginTop: 10 }}>
          Nothing matches — no slate published yet, or the filter left nobody. Clear it above.
        </div>
      ) : (
        <>
          {capped.map((g) => (
            <div key={g.key}>
              <GroupHead role={g.key} count={g.rows.length} />
              <div style={{
                display: 'grid', gap: 11,
                gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))',
              }}>
                {g.rows.map((r) => (
                  <Card key={`${r.player_id}-${r.game_pk}`} r={r} role={g.key} onPlayerClick={onPlayerClick} />
                ))}
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <div style={{ marginTop: 14 }}>
              <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
            </div>
          )}
        </>
      )}
    </div>
  )
}
