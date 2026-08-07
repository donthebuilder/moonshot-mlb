'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, playerId } from '../lib/player'

// 📖 STORYLINES — the human layer (2026-08-06, on request).
//
// Three trackers nobody has to maintain, all live API:
//   🏁 MILESTONE WATCH — slate hitters within striking distance of round
//      numbers tonight, season (200 H, 100 RBI/R, 30/40/50 HR) and career
//      (500/1000/1500/2000... H, every 50th HR, 500-step RBI/R). One batch
//      people call with career+season hitting.
//   🎂 BIRTHDAYS — same call carries birthDate; anyone on the slate blowing
//      out candles gets the shoutout line.
//   🧸 GIVEAWAY NIGHTS — the schedule's own promotions feed: bobbleheads and
//      giveaways tonight, with the folklore flag when a slate hitter's OWN
//      bobblehead is being handed out at his park.
// Narrative on purpose — these are the lines you say out loud on stream.

const S_MILES = [
  { key: 'hits', label: 'H', targets: [200], within: 3, word: 'hits' },
  { key: 'homeRuns', label: 'HR', targets: [30, 40, 50, 60], within: 2, word: 'homers' },
  { key: 'rbi', label: 'RBI', targets: [100], within: 3, word: 'RBI' },
  { key: 'runs', label: 'R', targets: [100], within: 3, word: 'runs' },
  { key: 'stolenBases', label: 'SB', targets: [30, 40, 50], within: 2, word: 'steals' },
]
const C_MILES = [
  { key: 'hits', targets: [500, 1000, 1500, 2000, 2500, 3000], within: 5, word: 'career hits' },
  { key: 'homeRuns', targets: Array.from({ length: 14 }, (_, i) => 50 + i * 50), within: 2, word: 'career homers' },
  { key: 'rbi', targets: [500, 1000, 1500, 2000], within: 5, word: 'career RBI' },
  { key: 'runs', targets: [500, 1000, 1500, 2000], within: 5, word: 'career runs' },
  { key: 'doubles', targets: [200, 300, 400, 500], within: 3, word: 'career doubles' },
]

let _cache = null

export default function Storylines({ players = [], onPlayerClick }) {
  const [data, setData] = useState(_cache)

  useEffect(() => {
    if (_cache || !players.length) return
    let alive = true
    ;(async () => {
      try {
        const ids = [...new Set(players.map((p) => Number(p?.player_id ?? p?.id)).filter(Boolean))]
        const people = []
        for (let i = 0; i < ids.length; i += 100) {
          const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=stats(group=[hitting],type=[career,season])`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
          people.push(...(j?.people || []))
        }
        const today = new Date().toLocaleDateString('en-CA')
        const promos = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&hydrate=game(promotions)`)
          .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        if (alive) { _cache = { people, promos }; setData(_cache) }
      } catch { if (alive) setData({ people: [], promos: null }) }
    })()
    return () => { alive = false }
  }, [players.length])

  if (!data?.people?.length) return null

  const byId = new Map(players.map((p) => [Number(p?.player_id ?? p?.id), p]))
  const statOf = (person, type) => {
    const block = (person.stats || []).find((s) => s?.type?.displayName === type)
    return block?.splits?.[0]?.stat || null
  }

  // ── milestones ──
  const miles = []
  data.people.forEach((person) => {
    const p = byId.get(person.id)
    if (!p) return
    const season = statOf(person, 'season')
    const career = statOf(person, 'career')
    S_MILES.forEach((m) => {
      const v = Number(season?.[m.key])
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: `${m.word} this season`, prox: need / m.within })
      })
    })
    C_MILES.forEach((m) => {
      const v = Number(career?.[m.key])
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: m.word, prox: need / m.within })
      })
    })
  })
  miles.sort((a, b) => a.prox - b.prox)

  // ── birthdays ──
  const mmdd = new Date().toLocaleDateString('en-CA').slice(5)
  const bdays = data.people
    .filter((person) => String(person.birthDate || '').slice(5) === mmdd && byId.has(person.id))
    .map((person) => ({ p: byId.get(person.id), age: person.currentAge }))

  // ── giveaways ──
  const lastNames = new Map(players.map((p) => [String(nameOf(p)).split(' ').slice(-1)[0].toLowerCase(), p]))
  const giveaways = []
  ;(data.promos?.dates?.[0]?.games || []).forEach((g) => {
    const home = g?.teams?.home?.team?.name || ''
    ;(g.promotions || []).forEach((pr) => {
      const nm = String(pr.name || '')
      const isBobble = /bobble/i.test(nm)
      if (pr.offerType !== 'Giveaway' && !isBobble) return
      let star = null
      for (const [ln, p] of lastNames) {
        if (ln.length > 3 && nm.toLowerCase().includes(ln)) { star = p; break }
      }
      giveaways.push({ home, nm, isBobble, star, dist: pr.distribution || '' })
    })
  })
  giveaways.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0) || (b.isBobble ? 1 : 0) - (a.isBobble ? 1 : 0))

  if (!miles.length && !bdays.length && !giveaways.length) return null

  const Row = ({ icon, children, p }) => (
    <div onClick={() => p && onPlayerClick?.(p)} style={{
      display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11, lineHeight: 1.55,
      padding: '3px 0', cursor: p ? 'pointer' : 'default', color: C.text2,
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(252,211,77,.03))`,
      border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>📖 Storylines</span>
        <span style={{ fontSize: 9.5, color: C.text3 }}>
          milestones in reach tonight · birthdays · giveaway nights — the human layer, live from the league
        </span>
      </div>

      {miles.slice(0, 6).map((m, i) => (
        <Row key={`m${i}`} icon="🏁" p={m.p}>
          <b style={{ color: C.text }}>{nameOf(m.p)}</b> is <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{m.need}</b> away
          from <b style={{ fontFamily: NUM_FONT }}>{m.t.toLocaleString()}</b> {m.word}
          {m.need === 1 ? ' — could land tonight' : ''}
        </Row>
      ))}

      {bdays.map((b, i) => (
        <Row key={`b${i}`} icon="🎂" p={b.p}>
          <b style={{ color: C.text }}>{nameOf(b.p)}</b> turns <b style={{ fontFamily: NUM_FONT }}>{b.age}</b> today —
          birthday bombs are folklore, not physics, but nobody fades the birthday boy on stream
        </Row>
      ))}

      {giveaways.slice(0, 5).map((g, i) => (
        <Row key={`g${i}`} icon={g.isBobble ? '🧸' : '🎁'} p={g.star}>
          <b style={{ color: C.text }}>{g.home}</b>: {g.nm}
          {g.dist ? <span style={{ color: C.text3, fontFamily: NUM_FONT }}> · {g.dist}</span> : ''}
          {g.star && <b style={{ color: C.orange }}> — {nameOf(g.star)}&apos;s own night, the folklore game</b>}
        </Row>
      ))}
    </div>
  )
}
