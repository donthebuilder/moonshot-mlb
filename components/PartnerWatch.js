'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'
import { nameOf, playerId, n } from '../lib/player'

// 👀 PARTNER WENT, HE DIDN'T (2026-08-08, Donovan: "players whose pair
// partners went last night but they didn't — just to keep an eye on").
// The co-HR history says these two tend to fire together; last night one
// half fired alone. Folklore-grade by design — a watch strip, never a score:
// pair history's own out-of-sample lift measured ~1.3× (not proven), so
// this points the eye and states its nature.
//
// Sources: pair_history_summary top_pairs (repeat_count ≥ 2 pairs only) +
// YESTERDAY'S graded results file (who actually homered / who played and
// didn't). Name-normalized matching, the same rule PairMe uses.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`

export default function PartnerWatch({ players = [], pairHistorySummary, onPlayerClick }) {
  const [yday, setYday] = useState(null)   // {homered:Set<norm>, played:Set<norm>}
  useEffect(() => {
    const d = new Date(Date.now() - 864e5).toLocaleDateString('en-CA')
    fetch(bust(dataUrl(`current/graded_results_${d}.json`)))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return
        const homered = new Set(); const played = new Set()
        ;(j.graded_slots || j.results || []).forEach((s) => {
          const k = norm(s?.name || s?.player_name)
          if (!k) return
          if (n(s?.actual_ab, 0) > 0) played.add(k)
          if (n(s?.actual_hr, 0) > 0) homered.add(k)
        })
        if (played.size) setYday({ homered, played })
      })
      .catch(() => {})
  }, [])

  const watch = useMemo(() => {
    if (!yday) return []
    const byNorm = new Map(players.map((p) => [norm(nameOf(p)), p]))
    const out = new Map()
    ;(pairHistorySummary?.top_pairs || []).forEach((pr) => {
      if (n(pr?.repeat_count, 0) < 2) return
      const a = norm(pr?.player_1), b = norm(pr?.player_2)
      ;[[a, b, pr?.player_2], [b, a, pr?.player_1]].forEach(([me, partner, partnerName]) => {
        // he played last night without a homer, his partner DID go — and
        // he's on tonight's slate to answer
        if (!yday.homered.has(partner)) return
        if (!yday.played.has(me) || yday.homered.has(me)) return
        const p = byNorm.get(me)
        if (!p) return
        const prev = out.get(me)
        const ct = n(pr?.repeat_count, 0)
        if (!prev || ct > prev.ct) out.set(me, { p, partnerName, ct })
      })
    })
    return [...out.values()].sort((x, y) => y.ct - x.ct).slice(0, 6)
  }, [yday, players, pairHistorySummary])

  if (!watch.length) return null

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(167,139,250,.05))`,
      border: '1px solid rgba(167,139,250,.3)', borderRadius: 12, padding: '9px 13px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>👀 Partner went — he didn&apos;t</span>
        <span style={{ fontSize: 9, color: C.text3 }}>
          his usual co-HR partner homered last night without him · a watch, not a signal
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {watch.map(({ p, partnerName, ct }) => (
          <button key={playerId(p)} onClick={() => onPlayerClick?.(p)} style={{
            display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
            border: '1px solid rgba(167,139,250,.4)', background: 'rgba(167,139,250,.08)',
            borderRadius: 8, padding: '4px 11px',
          }} title={`${nameOf(p)} and ${partnerName} have homered on the same day ${ct}× this season. Last night ${partnerName} went deep; ${nameOf(p)} played and didn't. Folklore-grade — the pair history's predictive lift is unproven — but worth an eye tonight.`}>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{nameOf(p)}</span>
            <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: NUM_FONT }}>
              {String(partnerName).split(' ').slice(-1)[0]} went · {ct}× together
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
