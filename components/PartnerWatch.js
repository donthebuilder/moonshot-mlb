'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { dataUrl } from '../lib/dataSource'
import { nameOf, playerId, surname, arr, n } from '../lib/player'
import { dedupeGraded } from '../lib/graded'

// 👀 HIS PARTNERS WENT, HE DIDN'T (2026-08-08; reworked 2026-08-09).
//
// WHAT THIS ANSWERS: which hitter on tonight's slate had the most of his
// historical co-HR partners go deep last night while he stood there.
//
// THE REWORK. The first version was keyed the wrong way round: it walked the
// pair list and emitted one chip per PAIR, keeping only the single strongest
// pair per hitter. So a hitter whose ONE partner went and a hitter whose FOUR
// partners all went looked identical on the strip, and the number shown
// (`ct`) was the pair's repeat count — how often those two have homered on
// the same day — not how many of his partners fired. Donovan's actual point
// was the second thing: when several of last night's homer hitters share a
// partner who didn't go, that shared partner is the interesting name.
//
// So it now GROUPS BY THE TONIGHT-SLATE HITTER and leads with the count of
// distinct partners of his who homered last night. Pair strength (the best
// repeat_count among those partners) is the tiebreak, not the headline.
//
// THE RULE, unchanged and verified:
//   · his partner HOMERED last night, and
//   · he PLAYED last night (actual_ab > 0) and did NOT homer.
// A hitter who was rested or wasn't graded is not "he didn't go" — he wasn't
// asked. Those are dropped rather than counted as misses.
//
// MATCHING is by player_id first. The graded results, the slate and
// pair_history_summary's `players[]` all publish player_id; the normalised
// name is a fallback for the older player_1/player_2 string fields only.
//
// Folklore-grade by design — a watch strip, never a score. The pair history's
// own out-of-sample lift measured ~1.3× and is not proven.

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
const bust = (u) => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`
const idOf = (o) => {
  const v = Number(o?.player_id ?? o?.id)
  return Number.isFinite(v) && v ? v : null
}

export default function PartnerWatch({ players = [], pairHistorySummary, onPlayerClick }) {
  // yday = { date, homeredIds, homeredNames, playedIds, playedNames }
  const [yday, setYday] = useState(null)
  useEffect(() => {
    const d = new Date(Date.now() - 864e5).toLocaleDateString('en-CA')
    fetch(bust(dataUrl(`current/graded_results_${d}.json`)))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return
        const homeredIds = new Set(); const homeredNames = new Set()
        const playedIds = new Set(); const playedNames = new Set()
        // One row per player before reading his line (lib/graded.js). The
        // Sets happened to survive the duplicate rows, but "did he play"
        // reads actual_ab, and a two-category hitter has two rows that can be
        // a step apart mid-grading — dedupeGraded takes the max of each, so
        // the answer can't depend on which category is walked last.
        dedupeGraded(j.graded_slots || j.results || []).forEach((s) => {
          const id = idOf(s)
          const k = norm(s?.name || s?.player_name)
          if (!id && !k) return
          if (n(s?.actual_ab, 0) > 0) { if (id) playedIds.add(id); if (k) playedNames.add(k) }
          if (n(s?.actual_hr, 0) > 0) { if (id) homeredIds.add(id); if (k) homeredNames.add(k) }
        })
        if (playedIds.size || playedNames.size) {
          setYday({ date: d, homeredIds, homeredNames, playedIds, playedNames })
        }
      })
      .catch(() => {})
  }, [])

  const watch = useMemo(() => {
    if (!yday) return []
    const hitById = new Map(); const hitByName = new Map()
    players.forEach((p) => {
      const id = idOf(p)
      if (id) hitById.set(id, p)
      const k = norm(nameOf(p))
      if (k && !hitByName.has(k)) hitByName.set(k, p)
    })
    const slateRow = (side) => (side.id && hitById.get(side.id)) || hitByName.get(side.key) || null
    const homered = (side) => (side.id && yday.homeredIds.has(side.id)) || yday.homeredNames.has(side.key)
    const played = (side) => (side.id && yday.playedIds.has(side.id)) || yday.playedNames.has(side.key)

    // meKey -> { p, partners: Map<partnerKey, {name, ct}>, best }
    const out = new Map()
    arr(pairHistorySummary?.top_pairs).forEach((pr) => {
      const ct = n(pr?.repeat_count, 0)
      if (ct < 2) return
      // Prefer the structured players[] (it carries player_id); fall back to
      // the legacy player_1 / player_2 name strings.
      const raw = arr(pr?.players)
      const sides = (raw.length >= 2 ? raw : [{ name: pr?.player_1 }, { name: pr?.player_2 }])
        .slice(0, 2)
        .map((o) => ({ id: idOf(o), name: String(o?.name || o?.player_name || '').trim(), key: norm(o?.name || o?.player_name) }))
      if (sides.length < 2 || !sides[0].key || !sides[1].key || sides[0].key === sides[1].key) return

      ;[[sides[0], sides[1]], [sides[1], sides[0]]].forEach(([me, partner]) => {
        if (!homered(partner)) return                 // partner has to have gone
        if (!played(me) || homered(me)) return        // he has to have played and not gone
        const p = slateRow(me)
        if (!p) return                                // and be on tonight's slate
        const mk = me.id ? `id:${me.id}` : `nm:${me.key}`
        if (!out.has(mk)) out.set(mk, { p, partners: new Map(), best: 0 })
        const e = out.get(mk)
        const pk = partner.id ? `id:${partner.id}` : `nm:${partner.key}`
        const prev = e.partners.get(pk)
        if (!prev || ct > prev.ct) e.partners.set(pk, { name: partner.name, ct })
        if (ct > e.best) e.best = ct
      })
    })

    return [...out.values()]
      .map((e) => ({
        p: e.p,
        best: e.best,
        partners: [...e.partners.values()].sort((a, b) => b.ct - a.ct),
      }))
      // How MANY of last night's homer hitters are his partners is the point;
      // pair strength only breaks ties.
      .sort((a, b) => (b.partners.length - a.partners.length) || (b.best - a.best))
      .slice(0, 6)
  }, [yday, players, pairHistorySummary])

  if (!watch.length) return null

  const multi = watch.filter((w) => w.partners.length > 1).length

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(167,139,250,.05))`,
      border: '1px solid rgba(167,139,250,.3)', borderRadius: 12, padding: '9px 13px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 900 }}>👀 His partners went — he didn&apos;t</span>
        <span style={{ fontSize: 9, color: C.text3 }}>a watch, not a signal</span>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.55, marginBottom: 7, maxWidth: 620 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> who on tonight&apos;s slate had the most of
        his usual co-homer partners go deep last night while he played and didn&apos;t. Sorted by how
        many of his partners went, then by how strong the pair is.
        {multi > 0 && <> <b style={{ color: C.text2 }}>{multi}</b> of these had more than one partner go.</>}
        {' '}Folklore-grade: pair history&apos;s measured lift is ~1.3× and unproven.
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {watch.map(({ p, partners, best }) => {
          const cnt = partners.length
          const list = partners.map((x) => `${x.name} (${x.ct}× together)`).join(', ')
          return (
            <button key={playerId(p)} onClick={() => onPlayerClick?.(p)} style={{
              display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
              border: `1px solid rgba(167,139,250,${cnt > 1 ? '.65' : '.4'})`,
              background: `rgba(167,139,250,${cnt > 1 ? '.14' : '.08'})`,
              borderRadius: 8, padding: '4px 11px',
            }} title={`${cnt} of ${nameOf(p)}'s historical co-HR partners homered last night: ${list}. He played and didn't. Strongest of those pairs has homered on the same day ${best}× this season. Folklore-grade — pair history's predictive lift is unproven — but worth an eye tonight.`}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{nameOf(p)}</span>
              <span style={{ fontSize: 9, color: '#a78bfa', fontFamily: NUM_FONT }}>
                {cnt > 1
                  ? `${cnt} of his partners went last night`
                  : `${surname(partners[0].name)} went · ${best}× together`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
