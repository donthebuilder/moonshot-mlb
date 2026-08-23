'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, txt } from '../../lib/player'
import { quoteFor, fmtOdds } from '../../lib/odds'
import {
  ROLE_ORDER, GROUP_ORDER, rolesOf, primaryRole, roleColor,
  verdictFor, sentenceFor, chipsFor,
} from '../../lib/verdict'
import VerdictHero, { PeriodTiles } from '../VerdictHero'
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
//   1. THE DIAL. One number per card, drawn as a ring that fills to the
//      score — an instrument, not a table cell. It is the only loud thing on
//      the card and the only thing on this site that looks like this, which
//      is the whole point: the page announces itself. It now lives in
//      components/VerdictHero.js, because the player and pitcher modals open
//      the same way (Donovan, same day: "upgrade both ... modals like this").
//   2. AIR. Card padding, name size and tile size all step up; each card
//      carries a soft wash of its own badge colour so a board of them reads
//      as a stack of distinct decisions rather than one grey list.
//   3. THE FURNITURE IS GONE. The second search box is deleted (Controls at
//      the top of the page already filters `players` by name/team/pitcher —
//      this one filtered the same rows a second time), the paragraph moved
//      into TabExplainer where every other tab's lives, and the two pill rows
//      are one sideways-scrolling rail on the standard .chip-row.
//   4. THE PRICE, QUIETLY. "odds are cool make subtle" — the book's own
//      number sits dimmed at the end of the matchup line, and only when the
//      book is quoting the same bar the pick has to clear (quoteFor's
//      `matches`; a HR pick graded on 1+ cannot wear a price for 2+).
//
// WHY-THIS-ONE (the long-open question #7) — Donovan, asked directly: "idk
// please make simple". So the badge's own market score leads, and under it
// ONE sentence. Which sentence, and which score, is lib/verdict.js's job.
//
// Everything else is deliberate: default population is the decision-ready set
// (badge holders + WATCH), "Everyone" is one pill away, cards are ranked only
// against cards measured the same way, and the drill-down is the existing
// player modal — the full grid, splits and zone map already live there.

// ── the market's own name, over its block ───────────────────────────────────
// A hairline and four words. It is what makes the grouped ranking legible
// instead of mysterious, and it says the market in ENGLISH — "2+ total bases"
// rather than CONTACT — which is the one place on the site where the badge
// codes get translated for someone who has never seen them.
function GroupHead({ role, count }) {
  const col = roleColor(role)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0 }} />
      <span style={{
        fontSize: 9.5, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color: col, whiteSpace: 'nowrap',
      }}>{verdictFor(role).market}</span>
      <span style={{ fontSize: 9, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{count}</span>
      <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
    </div>
  )
}

// WATCH is the coverage tier, so its price is the home-run market's; a hitter
// with no badge is in no market at all and gets no price rather than a
// borrowed one.
const PRICE_ROLE = { TOP: 'TOP', HR: 'HR', HIT: 'HIT', HRR: 'HRR', CONTACT: 'CONTACT', WATCH: 'HR' }

function priceFor(odds, r, role) {
  const cat = PRICE_ROLE[role]
  if (!odds || !cat) return null
  const q = quoteFor(odds, r, cat)
  if (!q || !q.matches) return null
  const price = fmtOdds(q.over)
  return price === '—' ? null : price
}

function Card({ r, role: forced, odds, onPlayerClick }) {
  // The card wears the market you are BROWSING. Filter to HR and a hitter who
  // also holds TOP shows his hr_score, because that is the board you asked
  // for — the first build always showed his highest-priority role instead,
  // so an HR-filtered board could print overall scores.
  const role = forced || primaryRole(r) || 'NONE'
  const v = verdictFor(role)
  const col = roleColor(role)
  const quiet = role === 'WATCH' || role === 'NONE'
  const arm = txt(r?.pitcher_name).trim()
  const hand = txt(r?.pitcher_throws).trim()
  const price = priceFor(odds, r, role)

  return (
    <div onClick={onPlayerClick ? () => onPlayerClick(r) : undefined}
      style={{ cursor: onPlayerClick ? 'pointer' : 'default', minWidth: 0 }}>
      <VerdictHero
        col={col}
        score={v.score(r)}
        title={nameOf(r)}
        badge={role === 'WATCH' ? '👀 WATCH' : role === 'NONE' ? 'NO BADGE' : role}
        badgeQuiet={quiet}
        meta={`${teamOf(r)} vs ${oppOf(r)}${arm ? ` · ${arm}${hand ? ` (${hand})` : ''}` : ''}`}
        metaRight={price}
        line={sentenceFor(r, role)}
        chips={chipsFor(r, role)}
        footer={<PeriodTiles tiles={v.tiles(r)} />}
      />
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

export default function PropsGrid({ players = [], odds = null, onPlayerClick }) {
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
      const sc = (r) => verdictFor(k).score(r) ?? -1
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
                  <Card key={`${r.player_id}-${r.game_pk}`} r={r} role={g.key} odds={odds} onPlayerClick={onPlayerClick} />
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
