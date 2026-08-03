'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { PanelTitle, Empty, btnStyle } from '../ui'

// ── constants ─────────────────────────────────────────────────────────────────

const PAIR_TYPE_COLORS = {
  'Best HR Pair':            '#FB923C',
  'Core HR Pair':            '#FB923C',
  'Hot + Due Pair':          '#FCD34D',
  'Statcast HR Pair':        '#FCD34D',
  'Pitcher Target Pair':     '#f87171',
  'Flex HR Pair':            '#22d3ee',
  'Same-Game Stack Pair':    '#22d3ee',
  'Value / Contrarian Pair': '#a78bfa',
  'Value Power Pair':        '#a78bfa',
  'HRR Safer Pair':          '#4ade80',
}
function typeColor(t) { return PAIR_TYPE_COLORS[t] || '#71717a' }

const PAIR_SCOPES = [
  { key:'cross', label:'🔀 Cross Game' },
  { key:'bot',   label:'🤖 Bot Picks' },
  { key:'same',  label:'⚡ Same Game' },
]

function num(value, fallback=0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function hrwEmoji(s) {
  // Aligned to bots/today_bot.py's hrw_zone_label() bands (45/55/70/80),
  // which is the single source of truth h.hrw_zone is built from. This used
  // to run its own 80/70/60 thresholds, disagreeing with both the backend
  // and PlayerCard.js. 80+ gets 🌋 instead of 🚀 since hrw_zone_score_value()
  // deliberately treats 80+ as less reliable than 70-80, not the same tier.
  const n = num(s)
  if (n > 80) return '🌋'
  if (n > 70) return '🚀'
  if (n >= 55) return '⚡'
  if (n >= 45) return '🌤️'
  return '🧊'
}

function cleanName(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
}

function playerKey(player) {
  if (!player) return ''
  const id = player.player_id ?? player.id ?? player.person_id
  if (id !== undefined && id !== null && String(id) !== '') return `id:${id}`
  return `name:${cleanName(player.name)}|${String(player.team || '').toUpperCase()}`
}

function gameKey(player) {
  const value = player?.game_pk ?? player?.gamePk ?? player?.game_id ?? player?.gameId
  return value === undefined || value === null ? '' : String(value)
}

function isSameGame(a, b) {
  const ga = gameKey(a)
  const gb = gameKey(b)
  return Boolean(ga && gb && ga === gb)
}

function mergePlayer(oldPlayer, newPlayer) {
  if (!oldPlayer) return newPlayer
  if (!newPlayer) return oldPlayer
  const oldScore = num(oldPlayer.hr_score) + num(oldPlayer.hrw_score)
  const newScore = num(newPlayer.hr_score) + num(newPlayer.hrw_score)
  const primary = newScore >= oldScore ? newPlayer : oldPlayer
  const secondary = primary === newPlayer ? oldPlayer : newPlayer
  const tags = [...new Set([...(secondary.tags || []), ...(primary.tags || [])])]
  return {
    ...secondary,
    ...primary,
    game_pk: primary.game_pk ?? secondary.game_pk,
    team: primary.team || secondary.team,
    name: primary.name || secondary.name,
    tags,
  }
}

function dedupePlayers(players=[]) {
  const map = new Map()
  for (const player of players) {
    if (!player || !player.name) continue
    const key = playerKey(player)
    if (!key) continue
    map.set(key, mergePlayer(map.get(key), player))
  }
  return [...map.values()]
}

function pairNames(pair) {
  const ps = Array.isArray(pair?.players) ? pair.players : []
  if (ps.length >= 2) return `${ps[0]?.name || '?'} + ${ps[1]?.name || '?'}`
  return String(pair?.pair_key || '').replace('|', ' + ') || 'Unknown'
}

function pairKeyFromPlayers(players=[]) {
  const keys = players.slice(0, 2).map(playerKey).filter(Boolean).sort()
  return keys.length === 2 ? keys.join('|') : ''
}

function normalizePair(pair, fallbackType='Best HR Pair') {
  const players = dedupePlayers(Array.isArray(pair?.players) ? pair.players : [])
  if (players.length < 2) return null
  const cleanPlayers = players.slice(0, 2)
  const key = pair.pair_key || pairKeyFromPlayers(cleanPlayers)
  if (!key || playerKey(cleanPlayers[0]) === playerKey(cleanPlayers[1])) return null
  return {
    ...pair,
    type: pair.type || fallbackType,
    pair_key: key,
    pair_score: num(pair.pair_score ?? pair.combo_score),
    players: cleanPlayers,
    same_game: pair.same_game ?? isSameGame(cleanPlayers[0], cleanPlayers[1]),
  }
}

function normalizePairs(pairs=[]) {
  const seen = new Set()
  const out = []
  for (const raw of pairs) {
    const pair = normalizePair(raw)
    if (!pair || seen.has(pair.pair_key)) continue
    seen.add(pair.pair_key)
    out.push(pair)
  }
  return out
}

function enforceUniquePairExposure(pairs=[], maxExposure=1, limit=30) {
  const normalized = normalizePairs(pairs)
  const groups = new Map()
  for (const pair of normalized) {
    const type = pair.type || 'Pair'
    if (!groups.has(type)) groups.set(type, [])
    groups.get(type).push(pair)
  }
  for (const rows of groups.values()) {
    rows.sort((a,b) => {
      if (a.same_game !== b.same_game) return a.same_game ? 1 : -1
      return num(b.pair_score) - num(a.pair_score)
    })
  }

  const exposure = new Map()
  const selected = []
  let changed = true
  while (changed && selected.length < limit) {
    changed = false
    for (const rows of groups.values()) {
      const index = rows.findIndex(pair => pair.players.every(p => (exposure.get(playerKey(p)) || 0) < maxExposure))
      if (index < 0) continue
      const [pair] = rows.splice(index, 1)
      selected.push(pair)
      pair.players.forEach(p => exposure.set(playerKey(p), (exposure.get(playerKey(p)) || 0) + 1))
      changed = true
      if (selected.length >= limit) break
    }
  }
  return selected.sort((a,b) => {
    if (a.same_game !== b.same_game) return a.same_game ? 1 : -1
    return num(b.pair_score) - num(a.pair_score)
  })
}

const TAG_COLORS = {
  '🏆':'#FB923C','🧨':'#FB923C','🔥':'#f97316',
  '🏁':'#22d3ee','💠':'#38bdf8','⚾':'#4ade80','⭐':'#FCD34D',
  '🔭':'#71717a','⛔':'#ef4444','🧩':'#a78bfa',
}
function tagColor(tag) {
  for (const [emoji, color] of Object.entries(TAG_COLORS)) {
    if (String(tag || '').includes(emoji)) return color
  }
  return C.text2
}

// ── pair/pool builders ────────────────────────────────────────────────────────

function hrwScore(p) { return num(p?.hrw_score) }
function recent350Rate(p) { return num(p?.recent_350_num) / Math.max(1, num(p?.recent_350_den, 1)) }

function pairBaseScore(a, b) {
  return num(a.hr_score) * 0.42 + num(b.hr_score) * 0.42 +
    (hrwScore(a) + hrwScore(b)) * 0.52 +
    num(a.pitch_mix_score) * 0.12 + num(b.pitch_mix_score) * 0.12 +
    num(a.recent_ideal_hr_contact) * 42 + num(b.recent_ideal_hr_contact) * 42
}

function variantScore(a, b, type) {
  const base = pairBaseScore(a, b)
  if (type === 'Statcast HR Pair') {
    return base +
      (num(a.recent_ideal_hr_contact) + num(b.recent_ideal_hr_contact)) * 75 +
      (recent350Rate(a) + recent350Rate(b)) * 24 +
      Math.max(0, num(a.recent_ev) - 88) * 1.8 + Math.max(0, num(b.recent_ev) - 88) * 1.8
  }
  if (type === 'Flex HR Pair') {
    return base * 0.68 +
      (num(a.hrr_score) + num(b.hrr_score)) * 0.34 +
      (num(a.hit_score) + num(b.hit_score)) * 0.12
  }
  if (type === 'Value Power Pair') {
    return base * 0.72 +
      (num(a.pitcher_attack_score) + num(b.pitcher_attack_score)) * 0.34 +
      (num(a.hr_due_score) + num(b.hr_due_score)) * 0.2 +
      (num(a.hr_score) < 60 ? 8 : 0) + (num(b.hr_score) < 60 ? 8 : 0)
  }
  return base +
    (num(a.pitcher_attack_score) + num(b.pitcher_attack_score)) * 0.18 +
    (num(a.last5_hr) + num(b.last5_hr)) * 5
}

function pairTags(a, b) {
  const tags = []
  if (hrwScore(a) >= 70 && hrwScore(b) >= 70) tags.push('HRW')
  if (num(a.recent_ideal_hr_contact) >= 0.15 || num(b.recent_ideal_hr_contact) >= 0.15) tags.push('IHR')
  if (num(a.recent_350_num) >= 3 || num(b.recent_350_num) >= 3) tags.push('350+')
  if (num(a.pitcher_attack_score) >= 25 || num(b.pitcher_attack_score) >= 25) tags.push('Pitcher target')
  if (num(a.hrr_score) >= 60 && num(b.hrr_score) >= 60) tags.push('HRR floor')
  return tags.slice(0, 4)
}

function pairReason(a, b, type) {
  const parts = [isSameGame(a, b) ? 'same-game stack' : 'cross-game coverage']
  if (hrwScore(a) >= 70 && hrwScore(b) >= 70) parts.push(`HRW ${Math.round(hrwScore(a))}+${Math.round(hrwScore(b))}`)
  if (type === 'Flex HR Pair') parts.push(`HRR ${Math.round(num(a.hrr_score))}+${Math.round(num(b.hrr_score))}`)
  if (num(a.recent_ideal_hr_contact) >= 0.15 || num(b.recent_ideal_hr_contact) >= 0.15) parts.push('IHR timing')
  if (num(a.pitcher_attack_score) >= 25 || num(b.pitcher_attack_score) >= 25) parts.push('pitcher target edge')
  return parts.join(' · ')
}

function eligiblePairPlayers(players=[]) {
  return dedupePlayers(players)
    .filter(p => !p.true_avoid_hr && (num(p.hr_score) >= 45 || hrwScore(p) >= 55 || num(p.hrr_score) >= 58))
    .sort((a,b) => (num(b.hr_score) + hrwScore(b)) - (num(a.hr_score) + hrwScore(a)))
    .slice(0, 64)
}

function buildVariantPairs(players, relation='cross') {
  const pool = eligiblePairPlayers(players)
  const types = ['Core HR Pair', 'Statcast HR Pair', 'Flex HR Pair', 'Value Power Pair']
  const candidatesByType = new Map()

  for (const type of types) {
    const candidates = []
    for (let i=0; i<pool.length; i++) {
      for (let j=i+1; j<pool.length; j++) {
        const a = pool[i]
        const b = pool[j]
        const same = isSameGame(a, b)
        if (relation === 'same' && !same) continue
        if (relation === 'cross' && same) continue
        const score = variantScore(a, b, type)
        candidates.push({
          type,
          pair_score: Math.round(score),
          pair_key: pairKeyFromPlayers([a,b]),
          same_game: same,
          source: 'variant',
          tags: pairTags(a,b),
          reason: pairReason(a,b,type),
          players:[a,b],
        })
      }
    }
    candidates.sort((a,b) => num(b.pair_score) - num(a.pair_score))
    candidatesByType.set(type, candidates)
  }

  const used = new Set()
  const out = []
  for (const type of types) {
    let added = 0
    for (const pair of candidatesByType.get(type) || []) {
      const ids = pair.players.map(playerKey)
      if (ids.some(id => used.has(id))) continue
      out.push(pair)
      ids.forEach(id => used.add(id))
      added += 1
      if (added >= 3) break
    }
  }
  return out.sort((a,b) => num(b.pair_score) - num(a.pair_score))
}

function poolPlayerScore(p, mode) {
  const power = num(p.hr_score) * .42 + hrwScore(p) * .3 + num(p.recent_ideal_hr_contact) * 65 + recent350Rate(p) * 20
  const production = num(p.hrr_score) * .42 + num(p.hit_score) * .18 + num(p.last5_hits) * 2
  const matchup = num(p.pitcher_attack_score) * .22 + Math.max(0, num(p.pitcher_hr9) - 1) * 8
  if (mode === 'hrr') return production + power * .58
  if (mode === 'balanced') return power * .55 + production * .4 + matchup
  if (mode === 'variance') return power * .58 + matchup * 1.45 + num(p.hr_due_score) * .18 + (num(p.hr_score) < 60 ? 8 : 0)
  return power + matchup
}

function buildVariantPools(players, size) {
  const pool = eligiblePairPlayers(players)
  const defs = size === 6
    ? [
        ['Pool A — Strongest', 'strong'],
        ['Pool B — Balanced', 'balanced'],
        ['Pool C — Mid / Var', 'variance'],
        ['Pool D — Contrarian', 'variance'],
      ]
    : [
        ['Pool A — Strongest', 'strong'],
        ['Pool B — HRR + Power', 'hrr'],
        ['Pool C — Balanced', 'balanced'],
        ['Pool D — Contrarian', 'variance'],
      ]

  const globalUsed = new Set()
  const out = []
  for (const [label, mode] of defs) {
    const ranked = [...pool].sort((a,b) => poolPlayerScore(b, mode) - poolPlayerScore(a, mode))
    const members = []
    const localGames = new Set()

    for (const p of ranked) {
      const key = playerKey(p)
      if (globalUsed.has(key) || localGames.has(gameKey(p))) continue
      members.push(p)
      globalUsed.add(key)
      if (gameKey(p)) localGames.add(gameKey(p))
      if (members.length >= size) break
    }
    for (const p of ranked) {
      if (members.length >= size) break
      const key = playerKey(p)
      if (globalUsed.has(key)) continue
      members.push(p)
      globalUsed.add(key)
    }
    if (members.length < size) continue
    const avg = members.reduce((sum,p) => sum + poolPlayerScore(p, mode), 0) / members.length
    out.push({
      label,
      name: label,
      size,
      build_type: mode,
      pool_score: Math.round(avg),
      reason: `${new Set(members.map(gameKey).filter(Boolean)).size} games · no repeated players`,
      players: members,
    })
  }
  return out
}

// ── shared row components ─────────────────────────────────────────────────────

function PairRow({ pair, i, dimmed=false }) {
  const col = typeColor(pair.type)
  const players = pair.players || []
  const score = Math.round(num(pair.pair_score))
  const relation = pair.same_game ? '⚡ Same game' : '🔀 Cross game'
  return (
    <div style={{ padding:'10px 14px', borderTop:i ? `1px solid ${C.border}` : 'none', opacity:dimmed ? 0.4 : 1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8, marginBottom:3, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <span style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.07em', color:col }}>{pair.type}</span>
          <span style={{ fontSize:9, color:pair.same_game ? '#22d3ee' : '#a78bfa', fontFamily:NUM_FONT }}>{relation}</span>
          {(pair.tags || []).slice(0,3).map(tag => (
            <span key={tag} style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:`${col}18`, color:col, border:`1px solid ${col}44`, textTransform:'uppercase', letterSpacing:'0.04em', fontFamily:NUM_FONT }}>{tag}</span>
          ))}
        </div>
        <span style={{ fontFamily:NUM_FONT, fontWeight:800, fontSize:15, flexShrink:0, color:score >= 280 ? C.orange : score >= 250 ? '#FCD34D' : C.text }}>{score || '—'}</span>
      </div>
      <div style={{ fontSize:14, fontWeight:800, marginBottom:2, wordBreak:'break-word' }}>{players.map(p => p.name).join(' + ')}</div>
      {pair.reason && <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginBottom:4 }}>{pair.reason}</div>}
      {players.map((p,pi) => (
        <div key={playerKey(p) || pi} style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginTop:2, wordBreak:'break-word' }}>
          <span style={{ color:C.text2, fontWeight:600 }}>{p.name}</span>
          {p.team ? ` · ${p.team}` : ''}
          {p.lineup_spot ? ` #${p.lineup_spot}` : ''}
          {p.pitcher_name ? ` · vs ${p.pitcher_name} (${p.pitcher_throws || '?'})` : ''}
          {num(p.hrw_score) > 0 ? ` · HRW ${Math.round(num(p.hrw_score))} ${hrwEmoji(p.hrw_score)}` : ''}
          {num(p.last5_hr) > 0 ? ` · L5: ${p.last5_hr}HR` : ''}
        </div>
      ))}
    </div>
  )
}

// ── TODAY PAIRS ───────────────────────────────────────────────────────────────

function TodayPairs({ players, pairBuilder, q='', focusPlayerId, onClearFocus }) {
  const [scope, setScope] = useState(focusPlayerId ? 'bot' : 'cross')
  const [activeType, setActiveType] = useState('All')

  const sourcePlayers = useMemo(() => {
    const fromBuilder = Array.isArray(pairBuilder?.available_pool) ? pairBuilder.available_pool : []
    return dedupePlayers(fromBuilder.length ? fromBuilder : players)
  }, [players, pairBuilder])

  const botPairs = useMemo(() => {
    const exact = pairBuilder?.recommended_pairs || []
    return enforceUniquePairExposure(exact, 1, 24)
  }, [pairBuilder])

  const crossPairs = useMemo(() => buildVariantPairs(sourcePlayers, 'cross'), [sourcePlayers])
  const samePairs = useMemo(() => buildVariantPairs(sourcePlayers, 'same'), [sourcePlayers])

  const scopedPairs = scope === 'bot' ? botPairs : scope === 'same' ? samePairs : crossPairs
  const types = useMemo(() => ['All', ...new Set(scopedPairs.map(p => p.type).filter(Boolean))], [scopedPairs])
  const effectiveType = types.includes(activeType) ? activeType : 'All'

  // When arriving from a Bot Pick click, show that player's actual pair(s)
  // first -- matched by player_id (via playerKey) rather than name string,
  // consistent with how live-HR history matching works elsewhere on this
  // page. Falls back to the normal type/search filter once focus is cleared.
  const focusKey = focusPlayerId != null ? `id:${focusPlayerId}` : null
  const focusedPairs = useMemo(() => {
    if (!focusKey) return null
    return scopedPairs.filter(pair => (pair.players || []).some(p => playerKey(p) === focusKey))
  }, [scopedPairs, focusKey])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const base = (focusKey && focusedPairs) ? focusedPairs : scopedPairs
    return base.filter(pair => {
      const typeOK = focusKey ? true : (effectiveType === 'All' || pair.type === effectiveType)
      const searchOK = !term || pairNames(pair).toLowerCase().includes(term)
      return typeOK && searchOK
    })
  }, [scopedPairs, focusedPairs, focusKey, effectiveType, q])

  return (
    <div>
      {focusKey && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          background: 'rgba(249,115,22,0.08)', border: `1px solid ${C.orange}44`, borderRadius: 10,
          padding: '8px 12px', marginBottom: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: C.text2 }}>
            Showing pair{filtered.length === 1 ? '' : 's'} for the player you clicked
            {focusedPairs && focusedPairs.length === 0 ? ' — no bot pair found for them' : ''}
          </span>
          <button onClick={onClearFocus} style={btnStyle(C.orange, false)}>Show all pairs</button>
        </div>
      )}

      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:8 }}>
        {PAIR_SCOPES.map(item => (
          <button key={item.key} onClick={() => { setScope(item.key); setActiveType('All') }} style={btnStyle(item.key === 'same' ? '#22d3ee' : C.orange, scope === item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginBottom:10 }}>
        {scope === 'cross' && 'Cross-game variants are shown first. Every player appears once.'}
        {scope === 'bot' && 'Exact pair-builder output, cleaned to one appearance per player.'}
        {scope === 'same' && 'Same-game stack variants, cleaned to one appearance per player.'}
      </div>

      {!focusKey && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
          {types.map(type => (
            <button key={type} onClick={() => setActiveType(type)} style={btnStyle(type === 'All' ? C.orange : typeColor(type), effectiveType === type)}>{type}</button>
          ))}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ fontSize:15, fontWeight:800 }}>Today&apos;s Pairs</div>
        <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{filtered.length} pairs</div>
      </div>

      {!filtered.length
        ? <Empty text="No pairs available for this view." />
        : <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', marginTop:8 }}>
            {filtered.map((pair,i) => <PairRow key={pair.pair_key || i} pair={pair} i={i} />)}
          </div>
      }
    </div>
  )
}

// ── POOLS ─────────────────────────────────────────────────────────────────────

function buildLivePairs(homers, relation) {
  const candidates = []
  for (let i=0; i<homers.length; i++) {
    for (let j=i+1; j<homers.length; j++) {
      const a = homers[i]
      const b = homers[j]
      const same = isSameGame(a,b)
      if (relation === 'same' && !same) continue
      if (relation === 'cross' && same) continue
      candidates.push({
        a, b,
        same_game:same,
        pair_key:pairKeyFromPlayers([a,b]),
        score:num(a.hr_score) + num(b.hr_score) + num(a.hrw_score) * .25 + num(b.hrw_score) * .25,
      })
    }
  }
  candidates.sort((a,b) => b.score - a.score)
  const used = new Set()
  const out = []
  for (const pair of candidates) {
    const ids = [playerKey(pair.a), playerKey(pair.b)]
    if (ids.some(id => used.has(id))) continue
    out.push(pair)
    ids.forEach(id => used.add(id))
  }
  return out
}

function buildHistoryPairIndex(pairHistorySummary) {
  const pairs = Array.isArray(pairHistorySummary?.top_pairs) ? pairHistorySummary.top_pairs : []
  const index = new Map() // player_id -> [{ partnerId, partnerName, pair }]
  for (const pair of pairs) {
    const ps = Array.isArray(pair?.players) ? pair.players : []
    if (ps.length < 2) continue
    const [a, b] = ps
    if (a?.player_id == null || b?.player_id == null) continue
    if (!index.has(a.player_id)) index.set(a.player_id, [])
    if (!index.has(b.player_id)) index.set(b.player_id, [])
    index.get(a.player_id).push({ partnerId: b.player_id, partnerName: b.name || b.player_name, pair })
    index.get(b.player_id).push({ partnerId: a.player_id, partnerName: a.name || a.player_name, pair })
  }
  return index
}

// For each live HR hitter, check season history for a real pair partner who
// is actually on today's slate (matched by player_id, not name string, since
// history pair_key is a "Name|Name" string that won't reliably match the
// id:/name: keys built for live player objects). Kept simple per request:
// only surfaces a match when the partner is confirmed on today's slate --
// a historical partner who isn't playing today isn't actionable, so it's
// left out rather than shown as a dead-end.
function findLiveHistoryMatches(homers, pairHistorySummary, todaysPlayers) {
  const historyIndex = buildHistoryPairIndex(pairHistorySummary)
  const todaysById = new Map()
  for (const p of todaysPlayers || []) {
    const pid = p?.player_id ?? p?.id
    if (pid != null) todaysById.set(pid, p)
  }

  const matches = []
  for (const homer of homers) {
    const hid = homer?.player_id ?? homer?.id
    if (hid == null) continue
    const candidates = historyIndex.get(hid) || []
    for (const { partnerId, partnerName, pair } of candidates) {
      const partnerOnSlate = todaysById.get(partnerId)
      if (!partnerOnSlate) continue // partner not playing today -- skip, per "keep it simple"
      matches.push({
        homer,
        partner: partnerOnSlate,
        partnerName,
        pair,
        key: `${hid}-${partnerId}`,
      })
    }
  }
  // de-dupe (a pair could theoretically surface from both directions)
  const seen = new Set()
  return matches.filter(m => {
    const k = [m.homer.player_id ?? m.homer.id, m.partner.player_id ?? m.partner.id].sort().join('-')
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function LiveHRPairs({ results, pairBuilder, players=[], pairHistorySummary }) {
  const [scope, setScope] = useState('cross')

  const homers = useMemo(() => {
    const raw = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    return dedupePlayers(raw)
  }, [results])

  const historyMatches = useMemo(
    () => findLiveHistoryMatches(homers, pairHistorySummary, players),
    [homers, pairHistorySummary, players]
  )

  const crossPairs = useMemo(() => buildLivePairs(homers, 'cross'), [homers])
  const samePairs = useMemo(() => buildLivePairs(homers, 'same'), [homers])

  const exactBotPairs = useMemo(() => enforceUniquePairExposure(pairBuilder?.recommended_pairs || [], 1, 30), [pairBuilder])
  const homerKeys = useMemo(() => new Set(homers.map(playerKey)), [homers])
  const botHits = useMemo(() => exactBotPairs.filter(pair => pair.players.every(p => homerKeys.has(playerKey(p)))), [exactBotPairs, homerKeys])

  const botPools = useMemo(() => {
    const all = [
      ...(pairBuilder?.recommended_3mans || []),
      ...(pairBuilder?.pools_4man || []),
      ...(pairBuilder?.pools_6man || []),
    ]
    return all.map((pool,index) => {
      const members = dedupePlayers(pool.players || [])
      const hits = members.filter(p => homerKeys.has(playerKey(p)))
      return {
        ...pool,
        key: pool.pool_key || `${pool.name || pool.label || 'pool'}-${index}`,
        players:members,
        hits,
      }
    }).filter(pool => pool.hits.length >= 2)
  }, [pairBuilder, homerKeys])

  const sourcePlayers = useMemo(() => {
    const fromBuilder = Array.isArray(pairBuilder?.available_pool) ? pairBuilder.available_pool : []
    return dedupePlayers(fromBuilder.length ? fromBuilder : players)
  }, [players, pairBuilder])
  const variantPairs = useMemo(() => [
    ...buildVariantPairs(sourcePlayers, 'cross'),
    ...buildVariantPairs(sourcePlayers, 'same'),
  ], [sourcePlayers])
  const variantHits = useMemo(() => enforceUniquePairExposure(
    variantPairs.filter(pair => pair.players.every(p => homerKeys.has(playerKey(p)))), 1, 20
  ), [variantPairs, homerKeys])
  const combinedBotHits = useMemo(() => enforceUniquePairExposure([...botHits, ...variantHits], 1, 30), [botHits, variantHits])

  if (!homers.length) return <Empty text="No HRs yet today. Live pairs will appear as players go deep." />

  const HomerBubble = ({h}) => {
    const tags = Array.isArray(h.tags) ? h.tags : []
    const mainTag = tags[0] || '⚾'
    const col = tagColor(mainTag)
    return (
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius:7, background:`${col}18`, border:`1px solid ${col}33` }}>
        <span style={{ fontSize:12 }}>{mainTag}</span>
        <span style={{ fontSize:12, fontWeight:700 }}>{h.name}</span>
        <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{h.team}</span>
        {num(h.hr_score) > 0 && <span style={{ fontSize:9, color:col, fontFamily:NUM_FONT }}>HR {Math.round(num(h.hr_score))}</span>}
      </div>
    )
  }

  const PairLine = ({pair, i}) => {
    const col = pair.same_game ? '#22d3ee' : '#a78bfa'
    const label = pair.same_game ? '⚡ Same game' : '🔀 Cross game'
    const a = pair.a || pair.players?.[0]
    const b = pair.b || pair.players?.[1]
    if (!a || !b) return null
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderTop:i ? `1px solid ${C.border}` : 'none', flexWrap:'wrap' }}>
        <span style={{ fontSize:9, fontWeight:700, color:col, minWidth:80, fontFamily:NUM_FONT }}>{label}</span>
        <span style={{ fontSize:13, fontWeight:700 }}>{a.name}</span>
        <span style={{ fontSize:10, color:C.text3 }}>{a.team}</span>
        <span style={{ color:C.border, fontSize:14 }}>+</span>
        <span style={{ fontSize:13, fontWeight:700 }}>{b.name}</span>
        <span style={{ fontSize:10, color:C.text3 }}>{b.team}</span>
      </div>
    )
  }

  const shownPairs = scope === 'same' ? samePairs : crossPairs

  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.green, marginBottom:6 }}>✅ Unique HR Scorers ({homers.length})</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
          {homers.map(h => <HomerBubble key={playerKey(h)} h={h} />)}
        </div>
      </div>

      {historyMatches.length > 0 && (
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#FCD34D', marginBottom:6 }}>
            📅 Season History Match ({historyMatches.length}) <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT, fontWeight:400 }}>— partner is on today's slate</span>
          </div>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
            {historyMatches.map((m, i) => {
              const sameDayCount = num(m.pair?.same_day_hr_count_season)
              const lastHit = m.pair?.last_same_day_hr || '—'
              return (
                <div key={m.key} style={{ padding:'9px 14px', borderTop:i ? `1px solid ${C.border}` : 'none', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.green }}>{m.homer.name}</span>
                  <span style={{ fontSize:12, color:C.text3 }}>just homered · paired with</span>
                  <span style={{ fontSize:13, fontWeight:700 }}>{m.partnerName}</span>
                  <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{m.partner.team}</span>
                  <span style={{ fontSize:10, padding:'2px 8px', borderRadius:6, background:'rgba(252,211,77,0.12)', color:'#FCD34D', border:'1px solid rgba(252,211,77,0.25)', fontFamily:NUM_FONT, fontWeight:700, marginLeft:'auto' }}>
                    {sameDayCount}× same-day this season
                  </span>
                  <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>last: {lastHit}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
        {PAIR_SCOPES.map(item => (
          <button key={item.key} onClick={() => setScope(item.key)} style={btnStyle(item.key === 'same' ? '#22d3ee' : C.orange, scope === item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {scope === 'bot' ? (
        <div>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
            🤖 Bot Pair Hits <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, fontWeight:400 }}>({botHits.length} exact · {variantHits.length} variant)</span>
          </div>
          {combinedBotHits.length ? (
            <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', marginBottom:12 }}>
              {combinedBotHits.map((pair,i) => <PairLine key={pair.pair_key || i} pair={pair} i={i} />)}
            </div>
          ) : <Empty text="No complete bot pair has hit yet." />}

          <div style={{ fontSize:13, fontWeight:800, margin:'12px 0 6px', paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
            🏊 Bot Pool Progress <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, fontWeight:400 }}>({botPools.length})</span>
          </div>
          {!botPools.length ? <Empty text="No bot pool has two HR scorers yet." /> : (
            <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
              {botPools.map((pool,i) => (
                <div key={pool.key} style={{ padding:'9px 14px', borderTop:i ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontSize:12, fontWeight:800 }}>{pool.name || pool.label || pool.type || 'Pool'}</span>
                    <span style={{ fontSize:10, color:C.green, fontFamily:NUM_FONT }}>{pool.hits.length}/{pool.players.length} HR</span>
                  </div>
                  <div style={{ fontSize:11, color:C.text2 }}>{pool.hits.map(p => p.name).join(' + ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:6, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
            {scope === 'same' ? '⚡ Same-Game HR Pairs' : '🔀 Cross-Game HR Pairs'}
            <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, fontWeight:400 }}> ({shownPairs.length}) · no repeated player</span>
          </div>
          {!shownPairs.length ? <Empty text={`No ${scope === 'same' ? 'same-game' : 'cross-game'} live pair available yet.`} /> : (
            <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
              {shownPairs.map((pair,i) => <PairLine key={pair.pair_key || i} pair={pair} i={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── HISTORY ───────────────────────────────────────────────────────────────────

// Tier thresholds for same_day_hr_count_season. Checked against real
// pair_history_summary data: the actual range here clusters tightly (4-9,
// heavy at 5), so the original 10/4/1 split put 100% of pairs in one tier
// with the other two empty -- thresholds below are set from the real
// distribution instead of a guessed round number.
const HISTORY_TIERS = [
  { key: 'elite',      label: '🔥 Elite',      min: 8, color: '#f87171' },
  { key: 'solid',      label: '⚡ Solid',       min: 6,  color: C.orange },
  { key: 'occasional', label: '🔹 Occasional', min: 0,  color: C.text3 },
]

function tierFor(season) {
  for (const t of HISTORY_TIERS) if (season >= t.min) return t
  return HISTORY_TIERS[HISTORY_TIERS.length - 1]
}

// Badge font/padding scales with same_day count so a 12x pair visually
// outweighs a 2x pair without needing to read the number first.
function badgeScale(season) {
  if (season >= 10) return { fontSize: 13, padding: '4px 11px' }
  if (season >= 6)  return { fontSize: 11.5, padding: '3px 10px' }
  if (season >= 4)  return { fontSize: 10.5, padding: '2.5px 9px' }
  return { fontSize: 10, padding: '2px 8px' }
}

// Mini date-dot timeline: one filled dot per occurrence date, most recent
// last. Reads faster than comma-separated date text for spotting recency/
// frequency at a glance. Capped at 12 dots so a long history doesn't sprawl.
function DateTimeline({ dates, color }) {
  if (!dates?.length) return null
  const shown = dates.slice(-12)
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginTop: 3 }} title={shown.join(', ')}>
      {shown.map((d, i) => (
        <span key={d + i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i === shown.length - 1 ? color : `${color}66`,
          flexShrink: 0,
        }} />
      ))}
      {dates.length > 12 && <span style={{ fontSize: 8, color: C.text3, marginLeft: 2 }}>+{dates.length - 12} more</span>}
    </div>
  )
}

function HistoryRow({ pair, rank, isTop3, tierColor, todaysById }) {
  const season = Number(pair?.same_day_hr_count_season || 0)
  const sameGame = Number(pair?.same_game_hr_count || 0)
  const boost = Number(pair?.history_boost || 0)
  const last = String(pair?.last_same_day_hr || '—')
  const dates = Array.isArray(pair?.dates) ? pair.dates : []
  const ps = Array.isArray(pair?.players) ? pair.players : []
  const onSlatePlayers = ps
    .map(p => ({ ref: p, today: todaysById.get(p?.player_id) }))
    .filter(x => x.today)
  const onSlate = onSlatePlayers.length > 0
  const scale = badgeScale(season)
  const rankColor = isTop3 ? ['#FCD34D', '#D1D5DB', '#FB923C'][rank - 1] : C.text3

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderTop: rank > 1 ? `1px solid ${C.border}` : 'none',
      borderLeft: onSlate ? '3px solid #4ade80' : '3px solid transparent',
      background: onSlate ? 'rgba(74,222,128,0.04)' : 'transparent',
      flexWrap: 'wrap',
    }}>
      <div style={{ width: 22, flexShrink: 0, textAlign: 'center', fontFamily: NUM_FONT, fontWeight: 800, fontSize: isTop3 ? 14 : 11, color: rankColor }}>
        {isTop3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>{pairNames(pair)}</span>
          {onSlate && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 5, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontFamily: NUM_FONT, fontWeight: 700 }}>ON SLATE</span>}
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>Last: {last}</div>
        <DateTimeline dates={dates} color={tierColor} />
        {/* Weak-spot / matchup-edge signals — only for the player(s) in this
            pair who are confirmed on today's slate, since a signal on a
            player who isn't playing today isn't actionable. */}
        {onSlatePlayers.some(x => x.today.weak_spot_flag || Number(x.today.pitch_type_match_score || 0) > 0) && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {onSlatePlayers.map(({ ref, today }) => {
              const hasWeakSpot = today.weak_spot_flag === true
              const hasEdge = Number(today.pitch_type_match_score || 0) > 0
              if (!hasWeakSpot && !hasEdge) return null
              return (
                <span key={ref.player_id} style={{
                  fontSize: 9, padding: '1px 7px', borderRadius: 5,
                  background: 'rgba(252,211,77,0.1)', color: '#FCD34D',
                  border: '1px solid rgba(252,211,77,0.25)',
                  fontFamily: NUM_FONT, fontWeight: 700,
                }}>
                  {ref.name} {hasWeakSpot ? '⭐' : ''}{hasEdge ? '🎯' : ''}
                  {hasWeakSpot && hasEdge ? ' weak spot + matchup edge' : hasWeakSpot ? ' weak spot' : ' matchup edge'}
                </span>
              )
            })}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 5, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{
          borderRadius: 6, background: `${tierColor}22`, color: tierColor, border: `1px solid ${tierColor}44`,
          fontFamily: NUM_FONT, fontWeight: 800, ...scale,
        }}>{season}× same-day</span>
        {sameGame > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,211,238,0.12)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.25)', fontFamily: NUM_FONT, fontWeight: 700 }}>{sameGame}× same-game</span>}
        {boost > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', fontFamily: NUM_FONT, fontWeight: 700 }}>+{boost}</span>}
      </div>
    </div>
  )
}

function HistorySection({ data, q, players=[] }) {
  const [onSlateOnly, setOnSlateOnly] = useState(false)
  const pairs = useMemo(() => Array.isArray(data?.top_pairs) ? data.top_pairs : [], [data])

  const todaysById = useMemo(() => {
    const map = new Map()
    for (const p of players || []) {
      const pid = p?.player_id ?? p?.id
      if (pid != null) map.set(pid, p)
    }
    return map
  }, [players])

  const pairOnSlate = (pair) => {
    const ps = Array.isArray(pair?.players) ? pair.players : []
    return ps.some(p => todaysById.has(p?.player_id))
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let rows = term ? pairs.filter(pair => pairNames(pair).toLowerCase().includes(term)) : pairs
    if (onSlateOnly) rows = rows.filter(pairOnSlate)
    return rows
  }, [pairs, q, onSlateOnly, todaysById])

  const tiered = useMemo(() => {
    const groups = { elite: [], solid: [], occasional: [] }
    for (const pair of filtered.slice(0, 150)) {
      const season = Number(pair?.same_day_hr_count_season || 0)
      groups[tierFor(season).key].push(pair)
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => Number(b?.same_day_hr_count_season || 0) - Number(a?.same_day_hr_count_season || 0))
    }
    return groups
  }, [filtered])

  if (!data) return <Empty text="Pair history not loaded. Run pair_history_cache.py." />

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>
          {Number(data.pair_count || filtered.length)} pairs · {Number(data.days_checked || 0)} days · {data.season || ''}
        </div>
        <button onClick={() => setOnSlateOnly(v => !v)} style={btnStyle('#4ade80', onSlateOnly)}>
          On Slate Today
        </button>
      </div>

      {HISTORY_TIERS.map(tier => {
        const rows = tiered[tier.key]
        if (!rows.length) return null
        return (
          <div key={tier.key} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: tier.color }}>{tier.label}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{rows.length} pairs</span>
            </div>
            <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
              {rows.map((pair, i) => (
                <HistoryRow
                  key={pair?.pair_key || i}
                  pair={pair}
                  rank={i + 1}
                  isTop3={i < 3}
                  tierColor={tier.color}
                  todaysById={todaysById}
                />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

import PairBuilder from '../PairBuilder'
import PairBoard from '../PairBoard'

const VIEWS = [
  { key:'today',   label:'🧩 Today\'s Pairs' },
  { key:'build',   label:'🔧 Build a Pair' },
  { key:'live',    label:'⚡ Live HR Pairs' },
  { key:'history', label:'📅 Season History' },
]

export default function Pairs({ players=[], pairBuilder, pairHistorySummary, results, focusPlayerId, onClearFocus, onPlayerClick }) {
  const [view, setView] = useState(focusPlayerId != null ? 'today' : 'today')
  const [q, setQ] = useState('')

  const homers = useMemo(() => {
    const raw = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    return dedupePlayers(raw)
  }, [results])
  const histCount = Array.isArray(pairHistorySummary?.top_pairs) ? pairHistorySummary.top_pairs.length : 0

  return (
    <div>
      <PanelTitle
        title="Pairs"
        sub="Cross-game first · bot pairs · same-game · live results"
        right={
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {VIEWS.map(item => (
              <button key={item.key} onClick={() => { setView(item.key); if (item.key !== 'today') onClearFocus?.() }} style={btnStyle(item.key === 'live' ? '#22d3ee' : C.orange, view === item.key)}>
                {item.label}
                {item.key === 'live' && homers.length > 0 ? ` (${homers.length} HR)` : ''}
                {item.key === 'history' && histCount > 0 ? ` (${histCount})` : ''}
              </button>
            ))}
          </div>
        }
      />

      {(view === 'today' || view === 'history') && (
        <div style={{ marginBottom:14 }}>
          <input
            type="search"
            placeholder="Search by player name…"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ width:'100%', maxWidth:320, background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, padding:'7px 12px', fontSize:12, color:C.text, outline:'none', fontFamily:NUM_FONT }}
          />
        </div>
      )}

      {view === 'today' && (
        <>
          {/* Dense first. The cards below are the same pairs read one at a
              time; this is the board read at once. */}
          <PairBoard pairBuilder={pairBuilder} onPlayerClick={onPlayerClick} />
          <TodayPairs players={players} pairBuilder={pairBuilder} q={q} focusPlayerId={focusPlayerId} onClearFocus={onClearFocus} />
        </>
      )}
      {/* The builder lives here as well as on Pair History. The bot's
          recommended pairs are its opinion; this is where you build your own
          around a hitter you already like. */}
      {view === 'build' && (
        <PairBuilder summary={pairHistorySummary} players={players} onPlayerClick={onPlayerClick} />
      )}
      {view === 'live' && <LiveHRPairs results={results} pairBuilder={pairBuilder} players={players} pairHistorySummary={pairHistorySummary} />}
      {view === 'history' && <HistorySection data={pairHistorySummary} q={q} players={players} />}
    </div>
  )
}
