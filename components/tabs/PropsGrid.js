'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { n, nameOf, teamOf, oppOf, clean } from '../../lib/player'
import { catColor, alpha, score as fmtScore } from '../../lib/scales'
import { PillRow, FilterSearch, ActiveFilters } from '../Filters'

// ══ PROPS GRID — THE MOBILE PILOT PAGE (2026-08-23) ═════════════════════════
//
// The mobile rebuild's pilot (claude/moonshot-ideas-and-feedback.md item 2).
// Three complaints in one day set the brief: "too much and too small" ·
// "they dont know where to go" · and the sharpest one, DECISION PARALYSIS —
// "they cant find anybody to pick or looks good to pick … hard to decide or
// look at stats easily to decide." The reader reaches a wall of numbers and
// the numbers don't resolve into a decision.
//
// So this page inverts the site's usual order: THE VERDICT LEADS, the stats
// support. One card per decision-ready bat, and the first line of every card
// is what the site already concluded — the badge, the market's own score,
// and one sentence of why — with the period tiles (L5 · L10 · SZN, doubling
// as the streak display, per Donovan's sequencing answers) underneath, and
// ALL depth a deliberate tap away: tapping a card opens the existing player
// modal (the decided drill-down), where the full prop grid, splits and zone
// map already live. Glanceable first, depth on tap, never simultaneous.
//
// WHY-THIS-ONE (open question #7, decided here as the working default,
// stated not hidden): the leading signal is THE BADGE'S OWN MARKET SCORE
// plus its evidence counts — a pick always wears its own market's score
// (the house rule), so the HIT card leads with hit_score and hit counts,
// never a blended number. If Donovan wants a different field to lead, it is
// one map below (VERDICTS), not a redesign.
//
// Default population = the decision-ready set: badge holders + WATCH.
// "Everyone" is one pill away — nothing is removed, it just doesn't all
// shout at once.

const ROLE_ORDER = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT', 'WATCH']

const rolesOf = (r) => String(r?.game_pick_role || '')
  .split('/').map((t) => t.trim().toUpperCase()).filter(Boolean)

const primaryRole = (r) => {
  const toks = rolesOf(r)
  for (const k of ROLE_ORDER) if (toks.includes(k)) return k
  return null
}

// The verdict registry — one entry per badge: which score leads the card,
// which counts back it up, and the sentence that does the deciding.
const VERDICTS = {
  TOP: {
    score: (r) => n(r?.overall_score, null),
    market: 'best bat',
    why: (r) => `the game's best bat — ${n(r?.season_hr, 0)} HR season, ${n(r?.last10_hits, 0)} hits in his last 10`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)}H·${n(r?.last5_hr, 0)}HR` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)}H·${n(r?.last10_hr, 0)}HR` },
      { k: 'SZN', v: `${(n(r?.season_avg, 0)).toFixed(3).replace(/^0/, '')}` },
    ],
  },
  HR: {
    score: (r) => n(r?.hr_score, null),
    market: 'home run',
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
    why: (r) => `${n(r?.last10_hits, 0)} hits in his last 10 · ${(n(r?.season_avg, 0)).toFixed(3).replace(/^0/, '')} season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hits, 0)} H` },
      { k: 'L10', v: `${n(r?.last10_hits, 0)} H` },
      { k: 'SZN', v: `${(n(r?.season_avg, 0)).toFixed(3).replace(/^0/, '')}` },
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
    why: (r) => `${n(r?.last10_xbh, 0)} XBH in his last 10 · ${n(r?.season_xbh, 0) || '—'} on the season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_xbh, 0)} XBH` },
      { k: 'L10', v: `${n(r?.last10_xbh, 0)} XBH` },
      { k: 'SZN ISO', v: `${(n(r?.season_iso, 0)).toFixed(3).replace(/^0/, '')}` },
    ],
  },
  WATCH: {
    score: (r) => n(r?.hr_score, null),
    market: 'coverage watch',
    why: (r) => `next power bat in this game — ${n(r?.season_hr, 0)} HR season`,
    tiles: (r) => [
      { k: 'L5', v: `${n(r?.last5_hr, 0)} HR` },
      { k: 'L10', v: `${n(r?.last10_hr, 0)} HR` },
      { k: 'SZN', v: `${n(r?.season_hr, 0)} HR` },
    ],
  },
}

function Card({ r, onPlayerClick }) {
  const role = primaryRole(r)
  const v = VERDICTS[role] || VERDICTS.WATCH
  const col = catColor('role', role === 'WATCH' ? 'HR' : role)
  const s = v.score(r)
  return (
    <div
      onClick={onPlayerClick ? () => onPlayerClick(r) : undefined}
      style={{
        border: `1px solid ${C.border}`, borderLeft: `3px solid ${role === 'WATCH' ? C.border2 : col}`,
        borderRadius: 12, padding: '10px 12px', cursor: onPlayerClick ? 'pointer' : 'default',
        background: C.bg2, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0,
      }}
    >
      {/* line 1 — WHO, and the badge */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {nameOf(r)}
        </span>
        <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, whiteSpace: 'nowrap' }}>
          {teamOf(r)} vs {oppOf(r)}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 8.5, fontWeight: 900, letterSpacing: '.05em',
          padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
          color: role === 'WATCH' ? C.text3 : col,
          border: `1px solid ${role === 'WATCH' ? C.border : alpha(col, 0.55)}`,
          background: role === 'WATCH' ? 'transparent' : alpha(col, 0.10),
        }}>{role === 'WATCH' ? '👀 WATCH' : role}</span>
      </div>

      {/* line 2 — THE VERDICT. The decision, before any stat. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 900, fontFamily: NUM_FONT, color: role === 'WATCH' ? C.text2 : col }}>
          {s == null ? '—' : fmtScore(s, 0)}
        </span>
        <span style={{ fontSize: 10, color: C.text2, lineHeight: 1.45, minWidth: 0 }}>
          <b style={{ color: C.text }}>{v.market}</b> — {v.why(r)}
        </span>
      </div>

      {/* line 3 — the period tiles, doubling as the streak display */}
      <div style={{ display: 'flex', gap: 5 }}>
        {v.tiles(r).map((t) => (
          <span key={t.k} style={{
            flex: 1, textAlign: 'center', padding: '4px 2px', borderRadius: 7,
            border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.02)', minWidth: 0,
          }}>
            <span style={{ display: 'block', fontSize: 7.5, fontWeight: 800, letterSpacing: '.07em', color: C.text3, fontFamily: NUM_FONT }}>{t.k}</span>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, fontFamily: NUM_FONT, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.v}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export default function PropsGrid({ players = [], onPlayerClick }) {
  const [market, setMarket] = useState('picks')
  const [q, setQ] = useState('')

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

  const shown = useMemo(() => {
    let out = rows
    if (market === 'picks') out = out.filter((r) => rolesOf(r).length)
    else if (market !== 'everyone') out = out.filter((r) => rolesOf(r).includes(market))
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      out = out.filter((r) => String(nameOf(r)).toLowerCase().includes(needle) ||
        String(teamOf(r)).toLowerCase().includes(needle))
    }
    // rank each card on ITS OWN market's score — a pick always wears its own
    // market's score, and mixing yardsticks to sort is the violation the
    // house rule names. Ties broken by name for a stable board.
    return [...out].sort((a, b) => {
      const va = (VERDICTS[primaryRole(a)] || VERDICTS.WATCH).score(a) ?? -1
      const vb = (VERDICTS[primaryRole(b)] || VERDICTS.WATCH).score(b) ?? -1
      return vb - va || String(nameOf(a)).localeCompare(String(nameOf(b)))
    })
  }, [rows, market, q])

  const pills = [
    { key: 'picks', label: 'Picks', count: counts.picks, title: 'every bat wearing a badge tonight' },
    ...ROLE_ORDER.map((k) => ({ key: k, label: k === 'WATCH' ? '👀 Watch' : k, count: counts[k] })),
    { key: 'everyone', label: 'Everyone', count: counts.everyone },
  ]

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.5 }}>
          One card per decision — the verdict first, the streak tiles under it,
          everything else one tap away. Tap any card for the full grid, splits and zones.
        </div>
        <PillRow value={market} options={pills} onChange={setMarket} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterSearch value={q} onChange={setQ} placeholder="player or team…" />
          <ActiveFilters
            variant="sentence"
            shown={shown.length}
            total={market === 'everyone' ? counts.everyone : counts.picks}
            filters={q ? [{ key: 'q', label: `“${q.trim()}”`, onClear: () => setQ('') }] : []}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <div style={{ fontSize: 11.5, color: C.text3 }}>
          Nothing matches — no slate published yet, or the filter left nobody. Clear it above.
        </div>
      ) : (
        <div style={{
          display: 'grid', gap: 8,
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
        }}>
          {shown.map((r) => <Card key={`${r.player_id}-${r.game_pk}`} r={r} onPlayerClick={onPlayerClick} />)}
        </div>
      )}
    </div>
  )
}
