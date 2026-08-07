'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { nameOf, teamOf, oppOf, n as num } from '../lib/player'
import { teamAbbrs } from '../lib/gamelogs'

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

// 'xbh' is computed (2B+3B+HR); everything else reads straight off the stat.
const S_MILES = [
  { key: 'hits', targets: [200], within: 3, word: 'hits' },
  { key: 'homeRuns', targets: [30, 40, 50, 60], within: 2, word: 'homers' },
  { key: 'rbi', targets: [100], within: 3, word: 'RBI' },
  { key: 'runs', targets: [100], within: 3, word: 'runs' },
  { key: 'stolenBases', targets: [30, 40, 50], within: 2, word: 'steals' },
  { key: 'doubles', targets: [30, 40, 50], within: 2, word: 'doubles' },
  { key: 'triples', targets: [10, 15], within: 1, word: 'triples' },
  { key: 'totalBases', targets: [300, 350, 400], within: 8, word: 'total bases' },
  { key: 'xbh', targets: [50, 60, 70, 80], within: 2, word: 'extra-base hits' },
]
const C_MILES = [
  { key: 'hits', targets: [500, 1000, 1500, 2000, 2500, 3000], within: 5, word: 'career hits' },
  { key: 'homeRuns', targets: Array.from({ length: 14 }, (_, i) => 50 + i * 50), within: 2, word: 'career homers' },
  { key: 'rbi', targets: [500, 1000, 1500, 2000], within: 5, word: 'career RBI' },
  { key: 'runs', targets: [500, 1000, 1500, 2000], within: 5, word: 'career runs' },
  { key: 'doubles', targets: [200, 300, 400, 500], within: 3, word: 'career doubles' },
  { key: 'triples', targets: [50, 100], within: 2, word: 'career triples' },
  { key: 'totalBases', targets: [1000, 2000, 3000, 4000, 5000], within: 10, word: 'career total bases' },
  { key: 'xbh', targets: [300, 500, 700, 1000], within: 4, word: 'career extra-base hits' },
]

const readStat = (st, key) => {
  if (!st) return NaN
  if (key === 'xbh') return (Number(st.doubles) || 0) + (Number(st.triples) || 0) + (Number(st.homeRuns) || 0)
  return Number(st[key])
}

// Curated classics — a rivalry is folklore, not an algorithm.
const RIVALS = [
  ['NYY', 'BOS'], ['LAD', 'SF'], ['LAD', 'SD'], ['CHC', 'STL'], ['CHC', 'CWS'],
  ['NYY', 'NYM'], ['NYM', 'PHI'], ['NYM', 'ATL'], ['HOU', 'TEX'], ['BAL', 'WSH'], ['LAA', 'LAD'],
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
        // Team history (revenge games): yearByYear trimmed to season+team —
        // a few KB for the whole slate. Verified live 2026-08-06.
        const history = {}
        for (let i = 0; i < ids.length; i += 100) {
          const j = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&hydrate=stats(group=[hitting],type=[yearByYear])&fields=people,id,stats,type,displayName,splits,season,team,id,name`)
            .then((r) => (r.ok ? r.json() : null)).catch(() => null)
          ;(j?.people || []).forEach((person) => {
            const blk = (person.stats || []).find((x) => x?.type?.displayName === 'yearByYear')
            history[person.id] = (blk?.splits || [])
              .map((sp) => ({ season: sp.season, teamId: sp?.team?.id }))
              .filter((x) => x.teamId)
          })
        }
        const abbrs = (await teamAbbrs().catch(() => null)) || {}
        if (alive) { _cache = { people, promos, history, abbrs }; setData(_cache) }
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
      const v = readStat(season, m.key)
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: `${m.word} this season`, prox: need / m.within })
      })
    })
    C_MILES.forEach((m) => {
      const v = readStat(career, m.key)
      if (!Number.isFinite(v)) return
      m.targets.forEach((t) => {
        const need = t - v
        if (need > 0 && need <= m.within) miles.push({ p, need, t, word: m.word, prox: need / m.within })
      })
    })
  })
  miles.sort((a, b) => a.prox - b.prox)

  // ── BvP duels — free, straight off the slate's bvp_* fields ──
  const duels = []
  players.forEach((p) => {
    const pa = num(p?.bvp_pa, 0), h = num(p?.bvp_hits, 0), hr = num(p?.bvp_hr, 0)
    const ab = num(p?.bvp_ab, pa), avg = num(p?.bvp_avg, 0), ops = num(p?.bvp_ops, 0)
    const arm = String(p?.pitcher_name || '').split(' ').slice(-1)[0]
    if (!arm) return
    if (pa >= 8 && (hr >= 2 || ops >= 1.05)) {
      duels.push({ p, own: true, hr, text: `${h}-for-${ab}${hr ? `, ${hr} HR` : ''} lifetime vs ${arm}` })
    } else if (pa >= 10 && avg <= 0.125 && hr === 0) {
      duels.push({ p, own: false, hr: 0, text: `${h}-for-${ab} lifetime vs ${arm}` })
    }
  })
  duels.sort((a, b) => (b.own === true) - (a.own === true) || b.hr - a.hr)

  // ── revenge games — facing a team he used to wear ──
  const revenge = []
  if (data.history && data.abbrs) {
    players.forEach((p) => {
      const hist = data.history[Number(p?.player_id ?? p?.id)] || []
      const opp = oppOf(p), own = teamOf(p)
      const yrs = hist.filter((x) => data.abbrs[x.teamId] === opp && opp !== own).map((x) => x.season)
      if (yrs.length) {
        const span = yrs.length > 1 ? `${Math.min(...yrs)}–${String(Math.max(...yrs)).slice(2)}` : yrs[0]
        revenge.push({ p, opp, span, last: Math.max(...yrs) })
      }
    })
    revenge.sort((a, b) => b.last - a.last)
  }

  // ── rivalry nights — from the curated classics ──
  const matchups = new Set()
  players.forEach((p) => {
    const a2 = teamOf(p), b2 = oppOf(p)
    if (a2 && b2) matchups.add([a2, b2].sort().join('|'))
  })
  const rivalries = RIVALS.filter(([a2, b2]) => matchups.has([a2, b2].sort().join('|')))

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

  if (!miles.length && !bdays.length && !giveaways.length && !duels.length && !revenge.length && !rivalries.length) return null

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

      {duels.slice(0, 4).map((d, i) => (
        <Row key={`d${i}`} icon={d.own ? '⚔' : '🥶'} p={d.p}>
          {d.own
            ? <><b style={{ color: C.text }}>{nameOf(d.p)}</b> owns this matchup — <b style={{ fontFamily: NUM_FONT, color: C.orange }}>{d.text}</b></>
            : <><b style={{ color: C.text }}>{nameOf(d.p)}</b> has never solved him: <span style={{ fontFamily: NUM_FONT }}>{d.text}</span> — tiny samples, big folklore</>}
        </Row>
      ))}

      {revenge.slice(0, 4).map((r, i) => (
        <Row key={`r${i}`} icon="🔄" p={r.p}>
          <b style={{ color: C.text }}>{nameOf(r.p)}</b> faces his old team — wore <b>{r.opp}</b> in{' '}
          <span style={{ fontFamily: NUM_FONT }}>{r.span}</span>. Revenge games are theater, and theater sells.
        </Row>
      ))}

      {rivalries.slice(0, 3).map(([a2, b2], i) => (
        <Row key={`rv${i}`} icon="🔥">
          Rivalry night: <b style={{ color: C.text }}>{a2} vs {b2}</b> — the games that never need a storyline get one anyway
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
