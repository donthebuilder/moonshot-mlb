'use client'
import PairHistory from './PairHistory'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { catColor, verdictInk, verdictWash, alpha } from '../../lib/scales'
import { PanelTitle, Empty, btnStyle, WhatThis } from '../ui'
import DenseTable from '../DenseTable'

// ── constants ─────────────────────────────────────────────────────────────────

// PAIR-TEMPLATE IDENTITY — NOT YET A CAT CONCEPT. Ten fixed labels the old
// pair-builder / bot payload can carry in `type` (some, like "Best HR Pair" or
// "Hot + Due Pair", are legacy strings this file's own current builders no
// longer emit but a cached/older payload still can). This is genuinely
// categorical identity — exactly the kind of thing lib/scales.js's CAT
// registry exists for — but it doesn't overlap CAT.role/pitch/result and
// adding a new CAT.pairType key is a registry decision, not something this
// pass should do unilaterally. Left as a literal map on purpose; see the
// session report for the flagged registry gap. (Two keys already share one
// colour — 'Hot + Due Pair' and 'Statcast HR Pair' are both the same gold — which is
// itself a small instance of the exact problem CAT.role/pitch/result were
// built to prevent, left as pre-existing rather than silently patched here.)
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const PAIR_TYPE_COLORS = () => ({
  'Best HR Pair':            '#FB923C',
  'Core HR Pair':            '#FB923C',
  'Hot + Due Pair':          '#FCD34D',
  'Statcast HR Pair':        '#FCD34D',
  'Pitcher Target Pair':     C.red,
  'Flex HR Pair':            C.cyan,
  'Same-Game Stack Pair':    C.cyan,
  'Variance Pair':           C.purple,
  'Variance Power Pair':     C.purple,
  'HRR Safer Pair':          C.green,
})
// The "unknown type" fallback isn't identity — it's the same quiet neutral
// catColor() itself falls back to — so it routes through the theme token.
function typeColor(t) { return PAIR_TYPE_COLORS()[t] || C.text3 }

const PAIR_SCOPES = [
  { key:'cross', label:'🔀 Cross Game' },
  { key:'bot',   label:'🤖 Bot Picks' },
  { key:'same',  label:'⚡ Same Game' },
]

// ── the bot's own pair categories ─────────────────────────────────────────────
//
// recommended_pairs carries `lane_key` and `type` on every entry. Verified on
// the live payload: 10 pairs, two in each of five lanes.
//
//   TOP30  "Top 30 Pairs"        A  "CORE HR PAIRS"     B  "STATCAST HR PAIRS"
//   C      "FLEX HR PAIRS"       D  "VALUE POWER PAIRS"
//
// Two things the handoff asked for are NOT in the payload and are deliberately
// not faked here. Searching the whole pair_builder_latest.json for "Top 15",
// "Top 40", "Due Pair", "TOP15", "TOP40" returns zero hits — the bot doesn't
// write those labels any more. What it does write is the `Due` string inside
// the per-pair `tags` array (5 of 10 pairs carry it), so Due is surfaced as a
// tag filter, which is what it actually is. Inventing a "Top 15" heading over
// an arbitrary slice would be the same mistake as the 🧩 emoji in isAligned():
// a label the UI asserts and the data never backs.
//
// The scores are NOT comparable across lanes and must never share a ramp.
// TOP30 pairs score 112 and 99; lanes A-D score 11-16. They're different
// quantities with the same field name, so each lane is ranked and shaded
// against its own range, the same rule Heatmap uses per column.
const LANE_ORDER = ['TOP30', 'A', 'B', 'C', 'D']
// BOT-LANE IDENTITY — the same "new CAT concept, not invented here" situation
// as PAIR_TYPE_COLORS above. TOP30/A/B/C/D is a different axis than pair type
// (a lane the bot published the pair under, not the pair's own label), so it
// isn't simply PAIR_TYPE_COLORS under another name, but it's the same kind of
// gap: a registry entry (CAT.lane, or a merge with CAT.pairType) is a decision
// for whoever owns lib/scales.js, not something to invent mid-file-pass. Left
// literal on purpose; flagged in the session report alongside PAIR_TYPE_COLORS.
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const LANE_META = () => ({
  TOP30: { short: 'TOP 30', color: '#FB923C', blurb: 'The bot’s headline board — scored on a different scale from the lettered lanes.' },
  A:     { short: 'LANE A', color: '#FCD34D', blurb: 'Core: the safest construction it will offer.' },
  B:     { short: 'LANE B', color: C.cyan, blurb: 'Statcast: built off contact quality rather than the board.' },
  C:     { short: 'LANE C', color: C.purple, blurb: 'Flex: looser, leans on HRR and hit shape.' },
  D:     { short: 'LANE D', color: C.green, blurb: 'Value power: cheaper bats with a matchup reason.' },
})
const laneMeta = (k) => LANE_META()[k] || { short: String(k || 'OTHER').toUpperCase(), color: C.text3, blurb: '' }

// Group the bot's recommended pairs by its own lane, preserving every one.
// The old path ran these through enforceUniquePairExposure(…, 1, 24), which
// caps each player at one appearance — and three players (Matt Olson, Kyle
// Manzardo, Pete Crow-Armstrong) legitimately appear in two lanes each, so
// that quietly threw away 3 of the bot's 10 pairs on this slate. A view whose
// whole job is "show me what the bot said" must not drop what the bot said.
function groupBotPairs(recommended = []) {
  const byLane = new Map()
  for (const raw of recommended) {
    const pair = normalizePair(raw)
    if (!pair) continue
    const lane = String(raw?.lane_key || '').toUpperCase() || 'OTHER'
    if (!byLane.has(lane)) byLane.set(lane, [])
    byLane.get(lane).push({ ...pair, lane_key: lane, risk: raw?.risk || '', tags: raw?.tags || pair.tags || [] })
  }
  const lanes = [...byLane.keys()].sort((a, b) => {
    const ia = LANE_ORDER.indexOf(a), ib = LANE_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return lanes.map((lane) => {
    const rows = byLane.get(lane).sort((a, b) => num(b.pair_score) - num(a.pair_score))
    const scores = rows.map(r => num(r.pair_score))
    return {
      lane,
      type: rows[0]?.type || laneMeta(lane).short,
      rows,
      lo: Math.min(...scores),
      hi: Math.max(...scores),
    }
  })
}

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

// Bot pair/pool payloads carry lean stubs (name, team, sometimes an id),
// not full slate rows -- resolve back against the real `players` list so a
// click opens the full modal instead of a half-empty one. Same fix Pools.js
// shipped 2026-08-08 for its live pools ("make sure on the live pools I can
// click the players to see their modal"); the live pairs/pools view here
// never got it. Resolution is optional by design -- when it fails, the name
// stays plain, unclickable text rather than opening a broken modal.
function makeResolver(players=[]) {
  const byKey = new Map()
  for (const p of players) {
    const key = playerKey(p)
    if (key) byKey.set(key, p)
  }
  return (stub) => (stub ? byKey.get(playerKey(stub)) || null : null)
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

// BOT-TAG-EMOJI IDENTITY — a third instance of the same gap as
// PAIR_TYPE_COLORS/LANE_META above: ten fixed emoji keys, each a distinct
// bucket, none of them role/pitch/result. A CAT.tag entry would be the right
// home for this (and possibly the same registry decision that resolves
// pairType/lane), but that's a lib/scales.js change, not this file's call.
// Left as one literal map rather than partially tokenizing individual keys
// (e.g. 🔥 already happens to equal C.orange) — a half-converted dict is
// worse than a whole literal one, since it implies a single-value guarantee
// this map doesn't actually have.
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const TAG_COLORS = () => ({
  '🏆':'#FB923C','🧨':'#FB923C','🔥':C.orange,
  '🏁':C.cyan,'💠':'#38bdf8','⚾':C.green,'⭐':'#FCD34D',
  '🔭':'#71717a','⛔':'#ef4444','🧩':C.purple,
})
function tagColor(tag) {
  for (const [emoji, color] of Object.entries(TAG_COLORS())) {
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
  if (type === 'Variance Power Pair') {
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

// ── THE POOL EVERY VARIANT PAIR IS BUILT FROM ───────────────────────────────
//
// Two invisible decisions used to live inside this one function: a bar that
// admits a hitter to the pool at all, and a hard cut to the strongest 64 by a
// number that appears nowhere on the page. Both are real editorial choices —
// a hitter can be missing from every variant pair on the site and the page
// never said why — so both are named now, and `eligiblePairInfo` hands the
// counts to the UI so it can say them out loud.
export const PAIR_POOL_SIZE = 64
export const PAIR_POOL_KEY = 'HR score + HRW'

export function eligiblePairInfo(players = []) {
  const all = dedupePlayers(players)
  const eligible = all
    .filter(p => !p.true_avoid_hr && (num(p.hr_score) >= 45 || hrwScore(p) >= 55 || num(p.hrr_score) >= 58))
    .sort((a, b) => (num(b.hr_score) + hrwScore(b)) - (num(a.hr_score) + hrwScore(a)))
  const pool = eligible.slice(0, PAIR_POOL_SIZE)
  // The rank key at the cut line — the number a hitter had to beat to be in
  // the pool at all. Printing it turns "he isn't here" into a fact you can
  // check on the Rundown.
  const cutAt = eligible.length > PAIR_POOL_SIZE
    ? num(eligible[PAIR_POOL_SIZE - 1]?.hr_score) + hrwScore(eligible[PAIR_POOL_SIZE - 1])
    : null
  return { pool, eligible: eligible.length, considered: all.length, cutAt }
}

function eligiblePairPlayers(players=[]) {
  return eligiblePairInfo(players).pool
}

function buildVariantPairs(players, relation='cross') {
  const pool = eligiblePairPlayers(players)
  const types = ['Core HR Pair', 'Statcast HR Pair', 'Flex HR Pair', 'Variance Power Pair']
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
        ['Pool D — Variance', 'variance'],
      ]
    : [
        ['Pool A — Strongest', 'strong'],
        ['Pool B — HRR + Power', 'hrr'],
        ['Pool C — Balanced', 'balanced'],
        ['Pool D — Variance', 'variance'],
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
          {/* Same-game/cross-game is a recurring binary in this file and is
              already themed elsewhere in it (TicketBlock, GroupTicketBuilder's
              shape buttons) via C.cyan/C.purple directly — these two literals
              were just an untokenized duplicate of that existing convention. */}
          <span style={{ fontSize:9, color:pair.same_game ? C.cyan : C.purple, fontFamily:NUM_FONT }}>{relation}</span>
          {(pair.tags || []).slice(0,3).map(tag => (
            <span key={tag} style={{ fontSize:9, padding:'1px 5px', borderRadius:4, background:`${col}18`, color:col, border:`1px solid ${col}44`, textTransform:'uppercase', letterSpacing:'0.04em', fontFamily:NUM_FONT }}>{tag}</span>
          ))}
        </div>
        {/* One-sided magnitude highlight on pair_score, not a verdict — there
            is no "cool/bad" tier to pair it with (below 250 is just plain
            C.text), so this doesn't fit verdictInk's up/down shape. It's the
            same kind of ad-hoc severity step HotZoneMap's cG/cR amber mid-tier
            was, left alone there for the same reason: a real fix is a
            seqColor ramp with a stated domain over pair_score, which is
            separate, harder work, not a mechanical swap. */}
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

// One lane of the bot's recommended pairs, ranked and shaded inside its own
// score range. Nothing here is recomputed — every number, tag and reason string
// is what the bot published.
function BotLane({ group, tagFilter }) {
  const meta = laneMeta(group.lane)
  const rows = tagFilter
    ? group.rows.filter(r => (r.tags || []).includes(tagFilter))
    : group.rows
  if (!rows.length) return null

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap', marginBottom:6 }}>
        <span style={{
          fontSize:9, fontWeight:800, letterSpacing:'.08em', padding:'2px 7px', borderRadius:5,
          background:`${meta.color}1e`, color:meta.color, border:`1px solid ${meta.color}44`,
          fontFamily:NUM_FONT,
        }}>{meta.short}</span>
        <span style={{ fontSize:13, fontWeight:800 }}>{group.type}</span>
        <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>
          {rows.length}{tagFilter && rows.length !== group.rows.length ? ` of ${group.rows.length}` : ''} pair{rows.length === 1 ? '' : 's'}
        </span>
        {meta.blurb && <span style={{ fontSize:9.5, color:C.text3 }}>{meta.blurb}</span>}
      </div>

      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
        {rows.map((pair, i) => {
          const score = num(pair.pair_score)
          // Shaded within this lane only — see the note on LANE_META.
          const span = Math.max(1e-6, group.hi - group.lo)
          const frac = group.rows.length < 2 ? 1 : Math.max(0.12, (score - group.lo) / span)
          const due = (pair.tags || []).includes('Due')
          return (
            <div key={pair.pair_key || i} style={{
              padding:'10px 14px', borderTop:i ? `1px solid ${C.border}` : 'none',
              borderLeft:`3px solid ${meta.color}${i === 0 ? 'cc' : '44'}`,
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:8, flexWrap:'wrap', alignItems:'baseline' }}>
                <div style={{ display:'flex', alignItems:'baseline', gap:7, flexWrap:'wrap', minWidth:0 }}>
                  <span style={{ fontFamily:NUM_FONT, fontSize:10, color:C.text3, fontWeight:800 }}>#{i + 1}</span>
                  <span style={{ fontSize:14, fontWeight:800, wordBreak:'break-word' }}>
                    {(pair.players || []).map(p => p.name).join('  +  ')}
                  </span>
                  <span style={{ fontSize:9.5, color: pair.same_game ? C.cyan : C.purple, fontFamily:NUM_FONT }}>
                    {pair.same_game ? '⚡ same game' : '🔀 cross game'}
                  </span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:7, flexShrink:0 }}>
                  {pair.risk && (
                    <span style={{
                      fontSize:9, fontFamily:NUM_FONT, fontWeight:700, padding:'1px 6px', borderRadius:4,
                      color: pair.risk === 'High' ? verdictInk(false).color : C.text3,
                      border:`1px solid ${pair.risk === 'High' ? alpha(verdictInk(false).color, 0.27) : C.border}`,
                    }}>{pair.risk} risk</span>
                  )}
                  <span style={{ fontFamily:NUM_FONT, fontWeight:800, fontSize:15, color:meta.color }}>
                    {score.toFixed(score < 30 ? 2 : 0)}
                  </span>
                </div>
              </div>

              <div style={{ height:3, background:C.bg3, borderRadius:2, margin:'5px 0 6px' }}>
                <div style={{ width:`${frac * 100}%`, height:'100%', background:meta.color, borderRadius:2, opacity:.75 }} />
              </div>

              {/* The 'Due' gold highlight (here and at every other 'Due' site
                  in this file) is deliberately left literal. It isn't a
                  good/bad verdict on an outcome (it's an informational "the
                  bot flagged this one" tag, closer to lib/scales.js's STATE
                  concept than to verdictInk's win/loss pair), and it isn't an
                  untokenized duplicate of an existing C token either — the
                  nearest theme colour, C.yellow, is a visibly different,
                  more muted amber, so swapping it in would be a real colour
                  change disguised as plumbing. Left as-is rather than either
                  forcing that change or inventing a registry concept for it. */}
              <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:4 }}>
                {(pair.tags || []).map(tag => (
                  <span key={tag} style={{
                    fontSize:9, padding:'1px 6px', borderRadius:4, fontFamily:NUM_FONT, fontWeight:700,
                    background: tag === 'Due' ? 'rgba(252,211,77,.14)' : `${meta.color}14`,
                    color: tag === 'Due' ? '#FCD34D' : meta.color,
                    border:`1px solid ${tag === 'Due' ? 'rgba(252,211,77,.3)' : `${meta.color}33`}`,
                  }}>{tag}</span>
                ))}
                {due && <span style={{ fontSize:9, color:C.text3, fontFamily:NUM_FONT }}>— bot flagged this one as due</span>}
              </div>

              {pair.reason && (
                <div style={{ fontSize:10, color:C.text2, fontFamily:NUM_FONT, marginBottom:3 }}>{pair.reason}</div>
              )}
              {(pair.players || []).map((p, pi) => (
                <div key={playerKey(p) || pi} style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginTop:1, wordBreak:'break-word' }}>
                  <span style={{ color:C.text2, fontWeight:600 }}>{p.name}</span>
                  {p.team ? ` · ${p.team}` : ''}{p.lineup_spot ? ` #${p.lineup_spot}` : ''}
                  {p.pitcher_name ? ` · vs ${p.pitcher_name} (${p.pitcher_throws || '?'})` : ''}
                  {num(p.hrw_score) > 0 ? ` · HRW ${Math.round(num(p.hrw_score))} ${hrwEmoji(p.hrw_score)}` : ''}
                  {num(p.season_hr) > 0 ? ` · ${p.season_hr} HR in ${p.season_pa} PA` : ''}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BotPairGroups({ pairBuilder, q = '' }) {
  const [tagFilter, setTagFilter] = useState(null)

  const groups = useMemo(() => groupBotPairs(pairBuilder?.recommended_pairs || []), [pairBuilder])
  const allRows = useMemo(() => groups.flatMap(g => g.rows), [groups])

  const tagCounts = useMemo(() => {
    const counts = new Map()
    allRows.forEach(r => (r.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)))
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [allRows])

  const searched = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return groups
    return groups
      .map(g => ({ ...g, rows: g.rows.filter(p => pairNames(p).toLowerCase().includes(term)) }))
      .filter(g => g.rows.length)
  }, [groups, q])

  if (!allRows.length) return <Empty text="The pair builder hasn't published any recommended pairs for this slate." />

  return (
    <div>
      <div style={{
        display:'flex', gap:6, flexWrap:'wrap', alignItems:'center', marginBottom:8,
        padding:'8px 12px', background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10,
      }}>
        <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, fontWeight:700 }}>
          {allRows.length} pairs · {groups.length} lanes
        </span>
        {groups.map(g => {
          const meta = laneMeta(g.lane)
          return (
            <span key={g.lane} style={{
              fontSize:9, fontFamily:NUM_FONT, fontWeight:700, padding:'2px 7px', borderRadius:5,
              background:`${meta.color}16`, color:meta.color, border:`1px solid ${meta.color}38`,
            }}>{meta.short} {g.rows.length}</span>
          )
        })}
      </div>

      {tagCounts.length > 0 && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:9, color:C.text3, textTransform:'uppercase', letterSpacing:'.07em' }}>Bot tags</span>
          <button onClick={() => setTagFilter(null)} style={btnStyle(C.orange, !tagFilter)}>All</button>
          {tagCounts.map(([tag, count]) => (
            // Same 'Due' gold literal as the tag chip above — see that comment.
            <button key={tag} onClick={() => setTagFilter(t => (t === tag ? null : tag))}
              style={btnStyle(tag === 'Due' ? '#FCD34D' : C.orange, tagFilter === tag)}>
              {tag} {count}
            </button>
          ))}
        </div>
      )}

      {searched.map(g => <BotLane key={g.lane} group={g} tagFilter={tagFilter} />)}

      <div style={{ fontSize:9.5, color:C.text3, lineHeight:1.6, marginTop:4 }}>
        Lanes, types, tags, risk and reasons are the bot&apos;s own fields — nothing on this view is
        recomputed. Scores are <b style={{ color:C.text2 }}>not comparable between lanes</b>: TOP 30
        runs around 100 and the lettered lanes around 12–16, so each lane is ranked and shaded
        against its own range only.
        {' '}A player can appear in more than one lane, and does — those repeats are kept rather than
        deduplicated away, because the bot put them there on purpose.
        {' '}There is no <i>Top 15</i> or <i>Top 40</i> grouping here because the builder no longer
        publishes those labels; <b style={{ color:C.text2 }}>Due</b> is a per-pair tag, so it&apos;s
        filterable above rather than promoted to a heading it doesn&apos;t have.
      </div>
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

  // All of them, in lane order. The focus path (arriving from a Bot Pick click)
  // reads this too, and used to miss a player's second pair for the same
  // exposure-capping reason described on groupBotPairs.
  const botPairs = useMemo(
    () => groupBotPairs(pairBuilder?.recommended_pairs || []).flatMap(g => g.rows),
    [pairBuilder],
  )

  const crossPairs = useMemo(() => buildVariantPairs(sourcePlayers, 'cross'), [sourcePlayers])
  const samePairs = useMemo(() => buildVariantPairs(sourcePlayers, 'same'), [sourcePlayers])
  const poolInfo = useMemo(() => eligiblePairInfo(sourcePlayers), [sourcePlayers])

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
          // rgba(249,115,22,...) was the decimal form of C.orange baked in at
          // its ember value — invisible to check-scales.mjs (not a #-literal)
          // but still a real theming bug: C.orange resolves to a different
          // hex in the light theme, and this hardcoded rgba would have stayed
          // the ember colour there regardless.
          background: alpha(C.orange, 0.08), border: `1px solid ${C.orange}44`, borderRadius: 10,
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
          <button key={item.key} onClick={() => { setScope(item.key); setActiveType('All') }} style={btnStyle(item.key === 'same' ? C.cyan : C.orange, scope === item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT, marginBottom:10 }}>
        {scope === 'cross' && 'Cross-game variants are shown first. Every player appears once.'}
        {scope === 'bot' && 'Exact pair-builder output, grouped by the bot’s own lanes. Nothing dropped.'}
        {scope === 'same' && 'Same-game stack variants, cleaned to one appearance per player.'}
      </div>

      {/* THE POOL, SAID OUT LOUD. Both variant scopes are built from a cut
          this page never mentioned: the strongest 64 by HR score + HRW, out of
          everyone who clears the entry bar. A hitter can be absent from every
          pair on the page for that reason alone, and "he isn't here" should be
          a fact you can check rather than something you have to infer. */}
      {/* TRIMMED (2026-09-01, Donovan: "trim Pairs' prose"). The words are
          unchanged; they open on tap instead of sitting between the header
          and the pairs. */}
      {scope !== 'bot' && (
        <WhatThis label="how this pool was built" maxWidth={780}>
          Built from the strongest{' '}
          <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{Math.min(PAIR_POOL_SIZE, poolInfo.eligible)}</b>{' '}
          bats by <b style={{ color: C.text2 }}>{PAIR_POOL_KEY}</b>, out of{' '}
          <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{poolInfo.eligible}</b> who clear the
          entry bar (HR 45+, or HRW 55+, or HRR 58+, and not a bot avoid) from{' '}
          <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{poolInfo.considered}</b> on the slate.
          {poolInfo.cutAt != null && <>
            {' '}The cut line tonight is{' '}
            <b style={{ color: C.text2, fontFamily: NUM_FONT }}>{poolInfo.cutAt.toFixed(0)}</b>{' '}
            combined — a hitter below it is missing from every variant pair for that reason and no
            other.
          </>}
        </WhatThis>
      )}

      {/* Bot picks get the bot's own structure. The cross/same variants are
          this site's constructions, so they keep the flat type filter. */}
      {scope === 'bot' && !focusKey && <BotPairGroups pairBuilder={pairBuilder} q={q} />}

      {scope !== 'bot' && !focusKey && (
        <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
          {types.map(type => (
            <button key={type} onClick={() => setActiveType(type)} style={btnStyle(type === 'All' ? C.orange : typeColor(type), effectiveType === type)}>{type}</button>
          ))}
        </div>
      )}

      {/* The flat list is the variant builders' output. Under Bot Picks the
          grouped lanes above already are the list, so it would just be the
          same ten pairs a second time. */}
      {!(scope === 'bot' && !focusKey) && (
        <>
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
        </>
      )}
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

function LiveHRPairs({ results, pairBuilder, players=[], pairHistorySummary, onPlayerClick }) {
  const [scope, setScope] = useState('cross')
  const resolve = useMemo(() => makeResolver(players), [players])

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
      // pools_3man (2026-08-12): the retired 6-man's actual replacement key
      // -- was arriving under pools_6man until the bot-side fix shipped.
      // pools_6man kept below for any older cached payload still on it.
      ...(pairBuilder?.pools_3man || []),
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

  if (!homers.length) {
    return (
      <div>
        <div style={{
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '18px 16px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>⚡</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 3 }}>No home runs yet tonight</div>
          <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>
            The moment two hitters have gone deep, this view starts building live pairs from them,
            checks them against the bot&apos;s recommended pairs and pools, and flags any season-history
            partner still waiting to bat. It updates as the bot&apos;s results file refreshes — no
            reload needed beyond switching tabs.
          </div>
        </div>
      </div>
    )
  }

  // Status strip — the one-glance answer to "where are we at tonight":
  // homers so far, pairs formed, whether any bot pair has fully landed, and
  // whether history has a live setup working.
  const StatusStrip = () => {
    const tiles = [
      // 'HR tonight' literally counts the home_run batted-ball outcome — the
      // one tile here with an exact CAT.result key, so it reads through the
      // registry rather than a duplicate green.
      { label: 'HR tonight', v: homers.length, color: catColor('result', 'home_run') },
      // Cross/same-game reuses this file's own established relation colours.
      { label: 'Cross pairs', v: crossPairs.length, color: C.purple },
      { label: 'Same-game', v: samePairs.length, color: C.cyan },
      { label: 'Bot pairs hit', v: combinedBotHits.length, color: combinedBotHits.length ? C.orange : C.text3,
        note: combinedBotHits.length ? 'a recommended pair fully landed' : 'none complete yet' },
      // Same gold as the 'Due' tag elsewhere in this file — left
      // literal for the same reason (see the comment on the Due tag chip in
      // BotLane): not a verdict, not a match for any existing C token.
      { label: 'History setups', v: historyMatches.length, color: historyMatches.length ? '#FCD34D' : C.text3,
        note: historyMatches.length ? 'partner still to bat' : '' },
    ]
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {tiles.map((t) => (
          <div key={t.label} title={t.note || ''} style={{
            background: `linear-gradient(135deg, ${t.color}18, ${t.color}06)`,
            border: `1px solid ${t.color}3d`, borderRadius: 9, padding: '5px 12px',
          }}>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.08em', color: C.text3, fontWeight: 800 }}>
              {t.label}
            </div>
            <div style={{ fontFamily: NUM_FONT, fontSize: 15, fontWeight: 900, color: t.color }}>{t.v}</div>
          </div>
        ))}
      </div>
    )
  }

  const HomerBubble = ({h}) => {
    const tags = Array.isArray(h.tags) ? h.tags : []
    const mainTag = tags[0] || '⚾'
    const col = tagColor(mainTag)
    const row = resolve(h)
    return (
      <div
        onClick={row ? () => onPlayerClick?.(row) : undefined}
        title={row ? 'open his card' : undefined}
        style={{
          display:'flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius:7,
          background:`${col}18`, border:`1px solid ${col}33`, cursor: row ? 'pointer' : 'default',
        }}>
        <span style={{ fontSize:12 }}>{mainTag}</span>
        <span style={{ fontSize:12, fontWeight:700, textDecoration: row ? 'underline dotted rgba(255,255,255,.18)' : 'none', textUnderlineOffset:3 }}>{h.name}</span>
        <span style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>{h.team}</span>
        {num(h.hr_score) > 0 && <span style={{ fontSize:9, color:col, fontFamily:NUM_FONT }}>HR {Math.round(num(h.hr_score))}</span>}
      </div>
    )
  }

  const PairLine = ({pair, i}) => {
    const col = pair.same_game ? C.cyan : C.purple
    const label = pair.same_game ? '⚡ Same game' : '🔀 Cross game'
    const a = pair.a || pair.players?.[0]
    const b = pair.b || pair.players?.[1]
    if (!a || !b) return null
    const ra = resolve(a)
    const rb = resolve(b)
    return (
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderTop:i ? `1px solid ${C.border}` : 'none', flexWrap:'wrap' }}>
        <span style={{ fontSize:9, fontWeight:700, color:col, minWidth:80, fontFamily:NUM_FONT }}>{label}</span>
        <span
          onClick={ra ? () => onPlayerClick?.(ra) : undefined}
          title={ra ? 'open his card' : undefined}
          style={{ fontSize:13, fontWeight:700, cursor: ra ? 'pointer' : 'default', textDecoration: ra ? 'underline dotted rgba(255,255,255,.18)' : 'none', textUnderlineOffset:3 }}>{a.name}</span>
        <span style={{ fontSize:10, color:C.text3 }}>{a.team}</span>
        <span style={{ color:C.border, fontSize:14 }}>+</span>
        <span
          onClick={rb ? () => onPlayerClick?.(rb) : undefined}
          title={rb ? 'open his card' : undefined}
          style={{ fontSize:13, fontWeight:700, cursor: rb ? 'pointer' : 'default', textDecoration: rb ? 'underline dotted rgba(255,255,255,.18)' : 'none', textUnderlineOffset:3 }}>{b.name}</span>
        <span style={{ fontSize:10, color:C.text3 }}>{b.team}</span>
      </div>
    )
  }

  const shownPairs = scope === 'same' ? samePairs : crossPairs

  return (
    <div>
      <StatusStrip />

      <div style={{ marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:C.green, marginBottom:6 }}>✅ Unique HR Scorers ({homers.length})</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
          {homers.map(h => <HomerBubble key={playerKey(h)} h={h} />)}
        </div>
      </div>

      {historyMatches.length > 0 && (
        <div style={{ marginBottom:14 }}>
          {/* Same 'Due'-family gold literal as elsewhere in this file — see
              the comment on BotLane's 'Due' tag chip. */}
          <div style={{ fontSize:12, fontWeight:800, color:'#FCD34D', marginBottom:5 }}>
            📅 Season History Match ({historyMatches.length})
            <span style={{ fontSize:9.5, color:C.text3, fontFamily:NUM_FONT, fontWeight:400 }}> — someone who already homered has a season partner still to bat</span>
          </div>
          <DenseTable
            rows={historyMatches.map(m => ({
              _key: m.key,
              _raw: m.partner,
              homer: m.homer.name,
              partner: m.partnerName,
              team: m.partner.team || '',
              opp: m.partner.opponent || m.partner.opp || '',
              sameDay: num(m.pair?.same_day_hr_count_season),
              sameGame: num(m.pair?.same_game_hr_count),
              boost: num(m.pair?.history_boost),
              since: num(m.pair?.days_since_last_hit, null),
              last: m.pair?.last_same_day_hr || '—',
              hrs: num(m.partner?.hr_score),
            }))}
            columns={[
              { key:'homer',    label:'Already deep', heat:false, w:132, bold:true, sticky:true },
              { key:'partner',  label:'Partner left', heat:false, w:132, bold:true },
              { key:'team',     label:'Tm',  heat:false, w:34, mono:true, dim:true },
              { key:'opp',      label:'Opp', heat:false, w:34, mono:true, dim:true },
              { key:'hrs',      label:'HR score', w:56, dp:1 },
              { key:'sameDay',  label:'Same-day', w:56,
                title:'Times these two homered on the same date this season — different parks counts' },
              { key:'sameGame', label:'Same-gm', w:52,
                title:'Times they homered in the same game. NOT more correlated than any other pair — measured 2026-08-09 across 58 graded nights, same-game pairs cleared 1.05x the independence expectation, which is 1.00 to within noise.' },
              { key:'boost',    label:'Boost', w:46 },
              { key:'since',    label:'Days ago', w:52, invert:true, fmt:(v)=> v==null?'—':String(v) },
              { key:'last',     label:'Last', heat:false, w:82, mono:true, dim:true },
            ]}
            onRowClick={null}
            initialSort="sameDay"
            maxHeight={300}
            caption="Days ago is inverted so a recent pairing reads bright. Same-day is the loose version — two hitters going deep on the same date in different ballparks are two independent events. Same-game is the one that means anything causally, and it's much rarer."
          />
        </div>
      )}

      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
        {PAIR_SCOPES.map(item => (
          <button key={item.key} onClick={() => setScope(item.key)} style={btnStyle(item.key === 'same' ? C.cyan : C.orange, scope === item.key)}>
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
                  <div style={{ fontSize:11, color:C.text2 }}>
                    {pool.hits.map((p, j) => {
                      const row = resolve(p)
                      return (
                        <span key={playerKey(p) || j}>
                          {j > 0 && ' + '}
                          <span
                            onClick={row ? () => onPlayerClick?.(row) : undefined}
                            title={row ? 'open his card' : undefined}
                            style={{ cursor: row ? 'pointer' : 'default', textDecoration: row ? 'underline dotted rgba(255,255,255,.18)' : 'none', textUnderlineOffset:3 }}>
                            {p.name}
                          </span>
                        </span>
                      )
                    })}
                  </div>
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
            <DenseTable
              rows={shownPairs.map((p, i) => ({
                _key: p.pair_key || i,
                a: p.a?.name || '', at: p.a?.team || '',
                b: p.b?.name || '', bt: p.b?.team || '',
                ahr: num(p.a?.hr_score), bhr: num(p.b?.hr_score),
                ahrw: num(p.a?.hrw_score), bhrw: num(p.b?.hrw_score),
                score: num(p.score),
              }))}
              columns={[
                { key:'a',    label:'Hitter',  heat:false, w:140, bold:true, sticky:true },
                { key:'at',   label:'Tm',      heat:false, w:34, mono:true, dim:true },
                { key:'ahr',  label:'HR',      w:46, dp:1 },
                { key:'ahrw', label:'HRW',     w:46, dp:0 },
                { key:'b',    label:'Partner', heat:false, w:140, bold:true },
                { key:'bt',   label:'Tm',      heat:false, w:34, mono:true, dim:true },
                { key:'bhr',  label:'HR',      w:46, dp:1 },
                { key:'bhrw', label:'HRW',     w:46, dp:0 },
                { key:'score', label:'Pair',   w:52, dp:0,
                  title:'Both HR scores plus a quarter of each HRW — this site’s construction, not the bot’s' },
              ]}
              initialSort="score"
              maxHeight={400}
              caption="Both of these hitters have already homered tonight. Every player appears once — the highest-scoring pair he belongs to wins him. Pair is this page's own combination score, not a bot field."
            />
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
// A 3-step MAGNITUDE ramp on same_day_hr_count_season (elite > solid >
// occasional), not a verdict — 'solid' already correctly reads C.orange and
// 'occasional' reads C.text3, so only 'elite' still hardcodes its rung. There
// is no "bad/cool" side here to pair it with, so this doesn't fit verdictInk's
// up/down shape; the honest fix is a seqColor ramp with a stated domain over
// the count, which — like HotZoneMap's own zone-heat-ramp — is separate,
// harder work than a mechanical hex swap. Left literal on purpose.
const HISTORY_TIERS = [
  { key: 'elite',      label: '🔥 Elite',      min: 8, color: C.red },
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
  // Gold/silver/bronze medal colours — a fixed real-world convention for
  // 1st/2nd/3rd place, the same kind of "domain colour" the header comment in
  // lib/scales.js carves out an exception for (a field graphic), not a
  // data-driven categorical or verdict choice. Left literal on purpose.
  const rankColor = isTop3 ? ['#FCD34D', '#D1D5DB', '#FB923C'][rank - 1] : C.text3

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
      borderTop: rank > 1 ? `1px solid ${C.border}` : 'none',
      // onSlate = "this historical partner is actually playing tonight, so
      // this pair is actionable" — a genuine good/relevant verdict, not a
      // domain colour, so it reads through the site-wide up/down pair.
      borderLeft: onSlate ? `3px solid ${verdictInk(true).color}` : '3px solid transparent',
      background: onSlate ? verdictWash(true, 0.04) : 'transparent',
      flexWrap: 'wrap',
    }}>
      <div style={{ width: 22, flexShrink: 0, textAlign: 'center', fontFamily: NUM_FONT, fontWeight: 800, fontSize: isTop3 ? 14 : 11, color: rankColor }}>
        {isTop3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, wordBreak: 'break-word' }}>{pairNames(pair)}</span>
          {onSlate && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 5, background: verdictWash(true, 0.15), color: verdictInk(true).color, fontFamily: NUM_FONT, fontWeight: 700 }}>ON SLATE</span>}
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
              // Same gold-family literal as 'Due' elsewhere in this file — a
              // matchup-edge flag, not a good/bad verdict on a graded outcome,
              // and not a match for any existing C token. See the comment on
              // BotLane's 'Due' tag chip.
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
        {/* Same-game badge: the file's own recurring relation colour (C.cyan),
            now via alpha() instead of a hand-typed rgba of its ember value. */}
        {sameGame > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: alpha(C.cyan, 0.12), color: C.cyan, border: `1px solid ${alpha(C.cyan, 0.25)}`, fontFamily: NUM_FONT, fontWeight: 700 }}>{sameGame}× same-game</span>}
        {/* boost > 0 is a genuine positive verdict on this pairing. */}
        {boost > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: verdictWash(true, 0.1), color: verdictInk(true).color, border: `1px solid ${alpha(verdictInk(true).color, 0.2)}`, fontFamily: NUM_FONT, fontWeight: 700 }}>+{boost}</span>}
      </div>
    </div>
  )
}

function HistorySection({ data, q, players=[] }) {
  const [onSlateOnly, setOnSlateOnly] = useState(false)
  const [tier, setTier] = useState('all')
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

  // One flat table instead of three card stacks. The tier is a filter now, not
  // a layout — the numbers are what separate these pairs, so they belong in
  // sortable columns rather than in three lists you can't sort across.
  const tableRows = useMemo(() => {
    const source = tier === 'all' ? filtered.slice(0, 350) : tiered[tier] || []
    return source.map((pair, i) => {
      const ps = Array.isArray(pair?.players) ? pair.players : []
      const onSlatePlayers = ps.map(p => ({ ref:p, today: todaysById.get(p?.player_id) })).filter(x => x.today)
      const edge = onSlatePlayers.map(({ ref, today }) => {
        const weak = today.weak_spot_flag === true
        const match = Number(today.pitch_type_match_score || 0) > 0
        if (!weak && !match) return null
        return `${String(ref.name || '').split(' ').slice(-1)[0]} ${weak ? '★' : ''}${match ? '🎯' : ''}`
      }).filter(Boolean).join(' ')
      const since = Number(pair?.days_since_last_hit)
      return {
        _key: pair?.pair_key || i,
        pair: pairNames(pair),
        teams: ps.map(p => p?.team).filter(Boolean).join('/'),
        onSlate: onSlatePlayers.length ? 1 : 0,
        sameDay: Number(pair?.same_day_hr_count_season || 0),
        sameGame: Number(pair?.same_game_hr_count || 0),
        boost: Number(pair?.history_boost || 0),
        pairScore: Number(pair?.pair_score || 0),
        since: Number.isFinite(since) ? since : null,
        last: String(pair?.last_same_day_hr || '—'),
        edge: edge || '',
      }
    })
  }, [filtered, tiered, tier, todaysById])

  if (!data) return <Empty text="Pair history not loaded. Run pair_history_cache.py." />

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:14 }}>
        <div style={{ fontSize:10, color:C.text3, fontFamily:NUM_FONT }}>
          {Number(data.pair_count || filtered.length)} pairs · {Number(data.days_checked || 0)} days · {data.season || ''}
        </div>
        <button onClick={() => setOnSlateOnly(v => !v)} style={btnStyle(verdictInk(true).color, onSlateOnly)}>
          On Slate Today
        </button>
      </div>

      <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:9, color:C.text3, textTransform:'uppercase', letterSpacing:'.07em' }}>Tier</span>
        <button onClick={() => setTier('all')} style={btnStyle(C.orange, tier === 'all')}>
          All {filtered.length}
        </button>
        {HISTORY_TIERS.map(t => (
          <button key={t.key} onClick={() => setTier(tier === t.key ? 'all' : t.key)} style={btnStyle(t.color, tier === t.key)}>
            {t.label} {tiered[t.key].length}
          </button>
        ))}
      </div>

      {!tableRows.length ? <Empty text="No pairs match this filter." /> : (
        <DenseTable
          rows={tableRows}
          columns={[
            { key:'pair',     label:'Pair',      heat:false, w:230, bold:true, sticky:true },
            { key:'onSlate',  label:'Today',     flag:true, mark:'●', w:34,
              title:'At least one of the two is on tonight’s slate' },
            { key:'teams',    label:'Tms',       heat:false, w:76, mono:true, dim:true },
            { key:'sameDay',  label:'Same-day',  w:60,
              title:'Days this season both homered — different ballparks included' },
            { key:'sameGame', label:'Same-gm',   w:56,
              title:'Days both homered in the SAME game. Measured 2026-08-09: same-game pairs are no more correlated than any other pair (1.05x the independence expectation). Interesting history, not an edge.' },
            { key:'boost',    label:'Boost',     w:48 },
            { key:'pairScore', label:'Pair',     w:48 },
            { key:'since',    label:'Days ago',  w:56, invert:true, fmt:(v)=> v==null?'—':String(v) },
            { key:'last',     label:'Last',      heat:false, w:84, mono:true, dim:true },
            { key:'edge',     label:'Edge',      heat:false, w:120, dim:true,
              title:'Weak spot / pitch-type match, only for the half of the pair actually playing tonight' },
          ]}
          initialSort="sameDay"
          maxHeight={520}
          caption="Capped at 200 rendered rows — this table used to lock the browser tab at 350. Days ago is inverted so a recent pairing reads bright. CORRECTION 2026-08-09: this caption used to say same-game was the column that implies correlation. It isn't. Across 58 graded nights, same-game pairs cleared together 1.05x the independence expectation and same-team 1.04x — no correlation at all. Two big-ISO bats landed together 4.8% of the time and two TOP picks 5.3%, against 2.2% for a random same-night pair. Build on the bats, not the ballpark."
        />
      )}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

import PairMe from '../PairMe'
import PartnerWatch from '../PartnerWatch'
import PairBoard from '../PairBoard'
import Rail from '../Rail'
import {
  buildPairs, PAIR_BASELINE,
  GROUP_ORDER, GROUP_META, GROUP_RATE, GROUP_BACKTEST, TOP_ON_HIT_BAR,
  LEG_SIGNALS, ALL_SIGNAL_IDS, buildGroupTickets, buildSignalTickets,
  rateText, signalRecordText, slateDateOf, useSlateOdds, spokenSignals,
} from '../../lib/pairEvidence'
import { useSetupHomers, useBackToBack } from '../../lib/b2b'
import { quoteFor, fmtOdds, impliedPct } from '../../lib/odds'
import { nameOf, teamOf, oppOf, clean, n, mlbId } from '../../lib/player'
import { downloadPairsCard } from '../shareCard'

// ══ 🧱 BUILD FROM THE GROUPS ═══════════════════════════════════════════════
//
// 2026-08-16, Donovan: "Pairing logic for pairs and pools using 2 of the
// groups or more pick based on the high rate signals like the back to back."
//
// Both of this tab's existing pair engines cross HOME RUNS with home runs —
// the bot's lanes, and the by-the-record rail above. Neither can build the
// thing he asked for, which is a ticket that CROSSES THE BOT'S DESIGNATIONS:
// the HIT pick out of one game with the HRR pick out of another, narrowed to
// the hitters carrying a signal that has held up. The groups are the unit,
// so they are the control.
//
// WHY THIS IS A BLOCK OF SENTENCES AND NOT A GRID. Five separate times the
// standing instruction on this project has been that tiles lose to sentences.
// A builder is allowed its controls — there is no way to choose two of five
// groups in prose — but what it BUILDS has to read as a stated pair, because
// the output is an argument ("these two, for these reasons, at this ceiling")
// and an argument in a table is a table.
//
// ─── THE THING THIS SCREEN EXISTS TO STOP ───────────────────────────────────
//
// A parlay page multiplies its legs. That is the whole genre. Doing it here
// would be wrong twice over.
//
// FIRST, the legs are not independent when they share a game — same park,
// same air, same starter, same game state, and a rain-shortened seven innings
// takes both of them down together. lib/pairEvidence.js measured the same-game
// question for HOME RUNS across 58 nights and got 1.05× the independence
// expectation, which is chance; that result is about home runs and does NOT
// transfer to a 1+ hit or a 2+ total-bases bar, which nobody here has ever
// measured that way. So the honest position is not "independent" and not
// "correlated" — it is UNMEASURED, and multiplying an unmeasured dependence
// is how a page ends up confidently wrong.
//
// SECOND, even where the product would be defensible it is the wrong thing to
// show, because it hides the shape of what he is building. Two HR legs is two
// ~16% events; the product buries that in a single small number, while two
// rates side by side make it obvious at a glance.
//
// So: NO COMBINED PERCENTAGE IS EVER PRINTED HERE. Every leg prints its own
// measured rate with its own denominator, every ticket says out loud whether
// its legs share a game, and the one combined number that is safe — the
// ceiling, P(all) ≤ min(P(leg)), which holds under ANY dependence — is
// printed as a ceiling in those words.

const TICKET_WORD = (k) => (k === 2 ? 'Pair' : `Pool of ${k}`)

function ordinal(v) {
  const x = Number(v)
  if (!Number.isFinite(x) || x < 1) return ''
  const s = x % 10 === 1 && x % 100 !== 11 ? 'st'
    : x % 10 === 2 && x % 100 !== 12 ? 'nd'
      : x % 10 === 3 && x % 100 !== 13 ? 'rd' : 'th'
  return `${x}${s}`
}

// "CWS vs DET at Comerica Park" — read off the leg's own row, never inferred.
function gamePhrase(p) {
  const t = teamOf(p)
  const o = oppOf(p)
  const v = clean(p?.venue_name, '')
  const teams = t && o ? `${t} vs ${o}` : t || o || 'his game'
  return v ? `${teams} at ${v}` : teams
}

const B = ({ children, color }) => (
  <b style={{ color: color || C.text, fontWeight: 800 }}>{children}</b>
)

const PAIR_STYLES = [
  { key: 'safe_hits', label: 'Safe Hits', groups: ['TOP', 'HIT'], shape: 'spread', size: 2, signals: [], note: 'best hit-rate bats first: TOP on the hit bar plus the game HIT leg' },
  { key: 'hit_hrr', label: 'HIT + HRR', groups: ['HIT', 'HRR'], shape: 'spread', size: 2, signals: [], note: 'one floor leg with one production leg, the cleanest mixed-market build' },
  { key: 'hrr_ladder', label: 'HRR Ladder', groups: ['HRR', 'HIT'], shape: 'spread', size: 3, signals: [], note: 'three legs when you want HRR upside but still want one hit-rate anchor' },
  { key: 'bases_gaps', label: 'Bases / Gaps', groups: ['CONTACT', 'HIT'], shape: 'spread', size: 2, signals: [], note: '2+ total-base legs backed by hit volume and bases environment' },
  { key: 'hr_moonshot', label: 'HR Moonshot', groups: ['TOP', 'HR'], shape: 'spread', size: 2, signals: ['aligned'], note: 'hardest bar, so it starts with the strongest HR signal composite' },
]

const pct = (v) => {
  const x = Number(v)
  if (!Number.isFinite(x)) return ''
  return `${Math.round(x > 1 ? x : x * 100)}%`
}

const stat = (v, dp = 0) => {
  const x = Number(v)
  return Number.isFinite(x) ? x.toFixed(dp) : ''
}

function legStrengthFacts(leg) {
  const p = leg.player || {}
  const out = [`score ${stat(leg.score)}`]
  if (leg.distinct?.length) out.push(`${leg.distinct.length} signal${leg.distinct.length === 1 ? '' : 's'}`)
  if (leg.group === 'HIT') {
    if (n(p?.last5_hits, 0) > 0) out.push(`L5 ${n(p.last5_hits, 0)} H`)
    if (n(p?.last10_hits, 0) > 0) out.push(`L10 ${n(p.last10_hits, 0)} H`)
    if (n(p?.season_k_rate, 0) > 0) out.push(`K ${pct(p.season_k_rate)}`)
  } else if (leg.group === 'HRR') {
    if (n(p?.last5_runs, 0) + n(p?.last5_rbi, 0) > 0) out.push(`L5 R+RBI ${n(p.last5_runs, 0) + n(p.last5_rbi, 0)}`)
    if (n(p?.lineup_context_score, 0) > 0) out.push(`lineup ${stat(p.lineup_context_score)}`)
    if (n(p?.pitcher_whip, 0) > 0) out.push(`arm WHIP ${stat(p.pitcher_whip, 2)}`)
  } else if (leg.group === 'CONTACT') {
    if (n(p?.last7_xbh, 0) > 0) out.push(`L7 ${n(p.last7_xbh, 0)} XBH`)
    if (n(p?.last10_hits, 0) > 0) out.push(`L10 ${n(p.last10_hits, 0)} H`)
    if (n(p?.contact_score, 0) > 0) out.push(`TB ${stat(p.contact_score)}`)
  } else {
    if (n(p?.season_iso, 0) > 0) out.push(`ISO ${stat(p.season_iso, 3).replace(/^0/, '')}`)
    if (n(p?.hrw_score, 0) > 0) out.push(`HRW ${stat(p.hrw_score)}`)
    if (n(p?.recent_ev, 0) > 0) out.push(`EV ${stat(p.recent_ev, 1)}`)
  }
  return out.slice(0, 5)
}

/**
 * The three facts that are about the SPOT rather than the hitter.
 *
 * Deliberately excludes last-7 XBH and last-10 hits even though both are in
 * the bases finding: legStrengthFacts() already prints them one chip to the
 * left for a CONTACT leg, and the first render of this row showed
 * "L7 7 XBH · L10 14 H" immediately followed by "L7 XBH 7 · L10 H 14". A
 * number printed twice in one line reads as two findings and is one.
 *
 * What is left is exactly what the strength strip cannot say, and what the
 * archive actually pointed at: park_hits_factor 52.1% vs 31.2% top-to-bottom,
 * low park_k_factor 45.1% vs 26.4%, low pitcher putaway 45.1% vs 28.5%. The
 * bases angle is a game and a park and an arm before it is a bat.
 */
function basesEnvironmentFacts(p) {
  const out = []
  const parkHits = Number(p?.park_hits_factor)
  const parkK = Number(p?.park_k_factor)
  const putaway = Number(p?.pitcher_putaway_pct)
  if (Number.isFinite(parkHits)) out.push(`park hits ${parkHits.toFixed(2)}`)
  if (Number.isFinite(parkK)) out.push(`park K ${parkK.toFixed(2)}`)
  if (Number.isFinite(putaway)) out.push(`putaway ${pct(putaway)}`)
  return out
}

/**
 * One leg, stated. Name, where he is, the group he fills, the bar he has to
 * clear, what that bar has measured at, the signals he is carrying, and the
 * price — but only when the book is selling the same bet the bar describes.
 *
 * `reserved` marks the leg the ticket held a spot for. It names the signal and
 * then says what that signal has actually measured, which for back-to-back is
 * "nothing yet" — the one thing he most believes in is the one with no number,
 * and a page that hid that would be selling the belief back to him.
 */
function LegSentence({ leg, odds, reserved = false }) {
  const p = leg.player
  const meta = GROUP_META[leg.group] || {}
  const col = C[meta.tone] || C.text2
  const q = quoteFor(odds, p, leg.group)
  const need = q ? (q.implied ?? impliedPct(q.over)) : null
  const spot = ordinal(p?.lineup_spot)
  const arm = clean(p?.pitcher_name, '')
  // Aligned swallows weak spot and pitch match — see spokenSignals(). The
  // filter still sees all three; only the sentence and the count collapse them.
  const spoken = leg.distinct || spokenSignals(leg.signals)
  const strength = legStrengthFacts(leg)
  const basesEnv = leg.group === 'CONTACT' ? basesEnvironmentFacts(p) : []

  return (
    <div style={{
      fontSize: 11.5, color: C.text2, lineHeight: 1.85, marginTop: 10,
      // The reserved leg is marked by a quiet rule down its left edge and
      // nothing else. A badge or a tile here would be the fifth thing on this
      // page competing with the sentence that carries the argument.
      borderLeft: reserved ? `2px solid ${C.green}` : 'none',
      paddingLeft: reserved ? 10 : 0,
    }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 4 }}>
        {strength.map((x) => (
          <span key={x} style={{
            border: `1px solid ${col}44`, background: `${col}12`, color: C.text2,
            borderRadius: 7, padding: '1px 6px', fontSize: 9.5, fontFamily: NUM_FONT,
          }}>{x}</span>
        ))}
        {basesEnv.length > 0 && (
          <span title="Bases environment: the archive pointed more to game/park/arm shape than one magic total-bases hitter."
            style={{
              border: `1px solid ${C.green}44`, background: `${C.green}12`, color: C.green,
              borderRadius: 7, padding: '1px 6px', fontSize: 9.5, fontFamily: NUM_FONT,
            }}>
            bases env: {basesEnv.join(' · ')}
          </span>
        )}
      </div>
      <B color={col}>{nameOf(p)}</B>
      {' — '}{gamePhrase(p)}
      {spot ? `, batting ${spot}` : ''}
      {arm ? ` against ${arm}` : ''}
      {' — is the bot’s '}<B color={col}>{leg.group}</B>{' pick in that game and needs '}
      <B color={col}>{leg.bar}</B>{'. That bar cleared '}
      <B><span style={{ fontFamily: NUM_FONT }}>{rateText(leg.rate)}</span></B>
      {` across ${GROUP_BACKTEST.nights} graded nights.`}

      {/* THE TOP CAVEAT. A TOP pick is a very good bat being asked a very hard
          question: the same 807 slots cleared 1+ hit 571 times. Leaving that
          out would let a TOP leg read as the best thing on the board when what
          makes it 21.3% is the bar, not the hitter. */}
      {leg.group === 'TOP' && (
        <>
          {' The same TOP picks graded on the easier 1+ hit bar instead cleared '}
          <span style={{ fontFamily: NUM_FONT }}>{rateText(TOP_ON_HIT_BAR)}</span>
          {' — the designation is a good bat, the home-run bar is what makes this a hard leg.'}
        </>
      )}

      {leg.alsoGroups.length > 0 && (
        <>
          {' He is also the bot’s '}
          <B color={C.text2}>{leg.alsoGroups.join(' and ')}</B>
          {' pick in that game, so he counts once here, on the hardest bar he holds — a home run'}
          {' is already one hit, four total bases and three of hits+runs+RBI, so betting both bars'}
          {' would be betting the harder one twice.'}
        </>
      )}

      {spoken.length > 0 && (
        <> {spoken.map((s, i) => {
          const said = s.say(p)
          return (
            <span key={s.id}>
              {i === 0 ? ' ' : '; '}
              <span style={{ color: C.text }}>
                {i === 0 ? said.charAt(0).toUpperCase() + said.slice(1) : said}
              </span>
              {i === spoken.length - 1 ? '.' : ''}
            </span>
          )
        })}</>
      )}

      {/* THE RESERVED LEG, NAMED — and immediately followed by what its signal
          has actually measured. Back-to-back has never been graded on this
          archive, so this is where it says so; aligned is the only one that
          can answer with a k/n. */}
      {reserved && spoken.length > 0 && (
        <>
          {' This is the ticket’s '}<B color={C.green}>reserved signal leg</B>
          {spoken.map((s, i) => (
            <span key={s.id}>
              {i === 0 ? ' — ' : '; '}
              <B color={C.green}>{s.label}</B>
              {/* Aligned's own sentence above already quotes its 45 of 154, so
                  repeating it here would state the same fraction twice in one
                  paragraph. Every other signal has nothing to repeat. */}
              {s.sayCarriesRecord ? '' : `, ${signalRecordText(s)}`}
            </span>
          ))}
          {'.'}
        </>
      )}

      {q && q.matches && (
        <>
          {' The book is '}
          <B color={C.yellow}><span style={{ fontFamily: NUM_FONT }}>{fmtOdds(q.over)}</span></B>
          {' on that exact bar (over '}
          <span style={{ fontFamily: NUM_FONT }}>{q.line}</span>
          {need != null ? `), which needs ${need}% to break even.` : ').'}
        </>
      )}
      {/* A price on a DIFFERENT line is not this leg's price. Saying which
          line the book is on is useful; pairing that number with this bar's
          record would be quietly, confidently wrong — the same guard
          quoteFor()'s `matches` flag exists for. */}
      {q && !q.matches && (
        <>
          {' The book here is on the '}
          <span style={{ fontFamily: NUM_FONT }}>{q.line}</span>
          {' line, which is a different bet from this leg’s bar, so no price is shown for it.'}
        </>
      )}
    </div>
  )
}

/** One built ticket, stated as a paragraph rather than laid out as a card. */
function TicketBlock({ ticket, index, odds, onPlayerClick, word }) {
  const legs = ticket.legs
  // Unique and in the canonical order: a four-leg ticket off two groups is
  // "HIT + HRR", not "HIT + HRR + HIT + HRR", and a game-shape ticket is
  // named in the same order as the buttons rather than in ranked order.
  const named = GROUP_ORDER.filter((g) => ticket.groups.includes(g))
  // `word` names a one-off ticket (the signals-only one) — it is the only one
  // of its kind on the page, so it is not numbered.
  const head = word
    ? `${word} — ${named.join(' + ')}`
    : `${TICKET_WORD(legs.length)} ${index + 1} — ${named.join(' + ')}`

  return (
    <div style={{ padding: '16px 0 6px', borderTop: index ? `1px solid ${C.border}` : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>{head}</span>
        <span style={{
          fontSize: 9.5, fontFamily: NUM_FONT, fontWeight: 800,
          color: ticket.sameGame ? C.cyan : C.purple,
        }}>
          {ticket.sameGame ? 'same game' : `${ticket.games.length} different games`}
        </span>
        {/* The names again, as a line you can tap — the sentences below carry
            the argument, this is the handle. */}
        <span style={{ fontSize: 11, color: C.text3 }}>
          {legs.map((l, i) => (
            <span key={l.key}>
              {i > 0 && ' + '}
              <span
                onClick={() => onPlayerClick?.(l.player)}
                title="open his card"
                style={{
                  cursor: 'pointer', color: C.text2, fontWeight: 700,
                  textDecoration: 'underline dotted rgba(255,255,255,.18)', textUnderlineOffset: 3,
                }}
              >{nameOf(l.player)}</span>
            </span>
          ))}
        </span>
      </div>

      {legs.map((leg) => (
        <LegSentence
          key={leg.key}
          leg={leg}
          odds={odds}
          reserved={leg.key === ticket.reservedKey}
        />
      ))}

      {/* NO RESERVED LEG, SAID OUT LOUD (2026-08-16).
          The promise is that one spot on every ticket belongs to a hitter
          carrying a signal. A night where the chosen groups have nobody
          carrying one is a real outcome, and the ticket that results looks
          exactly like a reserved one from the outside. So it says so instead:
          silence here would be the failure mode the whole mechanism exists to
          avoid. */}
      {ticket.reserveMissing && (
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.85, marginTop: 10 }}>
          <B color={C.orange}>No leg on this ticket is carrying a signal.</B>
          {' Nobody left in these groups is back-to-back, high-confidence, in a weak spot,'}
          {' on a pitch-type match or aligned, so no spot could be reserved for one and these'}
          {' legs are here on their group and their score alone.'}
        </div>
      )}

      {/* THE ONLY COMBINED NUMBER ON THIS PAGE, and it is an inequality.
          P(every leg) ≤ P(the worst leg) is true under any dependence at all,
          which is exactly why it is safe where a product is not. */}
      <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.7, marginTop: 7 }}>
        {legs.length === 2 ? 'Both legs' : `All ${legs.length} legs`}{' have to land, so this ticket '}
        <B color={C.text2}>cannot land more often than its worst leg</B>
        {ticket.ceiling ? (
          <>
            {' — the '}{ticket.ceiling.group}{' bar, '}
            <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{rateText(ticket.ceiling.rate)}</span>
            {'. That is a ceiling, not a forecast: the real number is lower and nobody here has measured how much.'}
          </>
        ) : '.'}
        {ticket.sameGame ? (
          <>
            {' '}<B color={C.cyan}>Both legs are in the same game</B>
            {` (${gamePhrase(legs[0].player)}) — one park, one air, one starting pitcher, one game state.`}
            {' The two rates above are each leg’s own and are '}
            <B color={C.text2}>not multiplied</B>
            {', because what a shared game does to these bars has never been measured on this archive.'}
          </>
        ) : (
          <>
            {' The legs are in '}<B color={C.text2}>{ticket.games.length} different games</B>
            {' — no shared park, air, starter or game state. Their rates are still not multiplied;'}
            {' see the note under the builder.'}
          </>
        )}
      </div>
    </div>
  )
}

export function GroupTicketBuilder({
  players = [],
  odds: oddsProp = null,
  slateDate = '',
  defaultSize = 2,
  onPlayerClick,
  // ── THE ANCHOR, HANDED IN (2026-08-17) ──────────────────────────────────
  // Donovan: "why cant buuld from groups enging and the pair builder engine
  // wokr on the same build". They can. When Builder.js has a named hitter, it
  // passes his id here and lib/pairEvidence.js pins him into a leg of every
  // ticket it returns. Null = the behaviour this component always had.
  pinnedId = null,
  pinnedIds = null,
  // ── MOUNTED INSIDE THE MERGED BUILDER (2026-08-23) ──────────────────────
  // Donovan: "i dont like that its like two separate machines on one page."
  // components/Builder.js now wraps this and PairBuilder in ONE bordered
  // machine with one heading and a Both/Tickets/Partners switch. A second
  // "🧱 Build from the groups" heading eleven pixels under the first one is
  // precisely the thing that made it read as two products, so the host
  // suppresses it. Every other caller still gets it.
  bare = false,
  pinnedName = '',
}) {
  // GROUPS DEFAULT TO THE PIN'S OWN DESIGNATIONS (2026-08-18). Without this,
  // handing someone in here — from Alignments' "Build a ticket around" or
  // Builder's own search — landed on the hardcoded HIT+HRR pair regardless of
  // what he's actually designated for, so a TOP/HR/CONTACT pick like Miguel
  // Vargas hit an immediate "no ticket can hold him" wall the moment the
  // hand-off finished. His own role string already IS a list of valid GROUP_
  // ORDER tokens ("TOP/HR/CONTACT" splits clean) — read it back instead of
  // guessing. Union across every pinned man when there's more than one, so a
  // combo of anchors from different groups still starts somewhere they can
  // both land; pad to two with the old default if a single pin only carries
  // one designation, since "two or more" is the floor the engine requires.
  const [groups, setGroups] = useState(() => {
    const pinSet = pinnedIds?.length ? new Set(pinnedIds.map(String)) : (pinnedId ? new Set([String(pinnedId)]) : null)
    if (!pinSet) return ['HIT', 'HRR']
    const roles = new Set()
    players.forEach((p) => {
      if (!pinSet.has(String(mlbId(p)))) return
      String(p?.game_pick_role || '').split('/').forEach((r) => {
        const g = r.trim().toUpperCase()
        if (GROUP_ORDER.includes(g)) roles.add(g)
      })
    })
    if (!roles.size) return ['HIT', 'HRR']
    const ordered = GROUP_ORDER.filter((g) => roles.has(g))
    if (ordered.length < 2) {
      ['HIT', 'HRR'].forEach((g) => { if (ordered.length < 2 && !ordered.includes(g)) ordered.push(g) })
    }
    return ordered
  })
  const [signals, setSignals] = useState([])
  const [shape, setShape] = useState('spread')
  const [size, setSize] = useState(defaultSize)
  const [styleKey, setStyleKey] = useState('custom')

  const odds = useSlateOdds(oddsProp)

  // BACK-TO-BACK, THE VERIFIED PATH AND ONLY THE VERIFIED PATH.
  //
  // `games_since_last_hr === 0` is on every slate row and it is a trap: on a
  // slate rebuilt after the afternoon window it means "he homered TODAY", so
  // filtering on it would hand back hitters chasing an encore they already
  // had. That bug shipped three times on this site. lib/b2b.js proves the
  // setup homer from a graded file or the league's own boxscores, keeps the
  // raw field as a veto only, and returns `verified` so an empty list can be
  // told apart from an unchecked one. Until it comes back proven, the filter
  // is unavailable rather than unproven.
  const dateKey = slateDate || slateDateOf(players) || new Date().toLocaleDateString('en-CA')
  const setupHr = useSetupHomers(dateKey)
  const { list: b2bList, verified: b2bVerified } = useBackToBack(players, setupHr, null, dateKey)
  const b2bIds = useMemo(
    () => new Set(b2bList.map((p) => Number(p?.player_id ?? p?.id))), [b2bList],
  )

  const activeSignals = useMemo(
    () => signals.filter((id) => id !== 'b2b' || b2bVerified), [signals, b2bVerified],
  )

  // WHICH SIGNALS CAN HONESTLY BE REQUIRED TONIGHT. Everything except an
  // unproven back-to-back: a ticket whose premise is that every leg carries a
  // verified signal must not let an unverified one qualify a leg.
  const availableSignals = useMemo(
    () => ALL_SIGNAL_IDS.filter((id) => id !== 'b2b' || b2bVerified), [b2bVerified],
  )

  const built = useMemo(() => buildGroupTickets(players, {
    groups, signals: activeSignals, shape, size, ctx: { b2b: b2bIds }, limit: 4,
    pinnedId, pinnedIds,
  }), [players, groups, activeSignals, shape, size, b2bIds, pinnedId, pinnedIds])

  // What to say when an anchor is set. Stated, not implied — and it reports the
  // failure case, because "build around Alonso" returning nothing must explain
  // itself rather than look like a broken panel.
  const anyPin = pinnedIds?.length || pinnedId
  const pinNote = !anyPin ? '' : (
    built.tickets.length
      ? `Every ticket below holds ${pinnedName || 'your hitter'} — the rest of each one is filled by the group engine under its normal rules.`
      : `No ticket can hold ${pinnedName || 'your hitters'} with the current groups and leg count — either a hitter is not designated in a group you picked, or there are more anchors than matching slots. Add the group he holds, raise the legs, or clear an anchor.`
  )

  // THE SIGNALS-ONLY TICKET — same groups, same shape, same size, same
  // machinery, but every leg has to be carrying something. Built alongside the
  // main tickets rather than instead of them, because the two answer different
  // questions: "the best of this combination" and "the same combination with
  // nothing on it that isn't flagged".
  const signalBuilt = useMemo(() => buildSignalTickets(players, {
    groups, shape, size, ctx: { b2b: b2bIds }, limit: 1, available: availableSignals,
  }), [players, groups, shape, size, b2bIds, availableSignals])

  const signalTicket = signalBuilt.tickets[0] || null
  // When the user's own filter already demands a signal on every leg, this is
  // the identical ticket. Printing it twice would be the same argument twice,
  // so it is named as a repeat instead.
  const signalIsRepeat = !!signalTicket && built.tickets.some((t) => t.key === signalTicket.key)

  const toggle = (arr, set, key) => {
    setStyleKey('custom')
    set(arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key])
  }
  const applyStyle = (style) => {
    setStyleKey(style.key)
    setGroups(style.groups)
    setSignals(style.signals || [])
    setShape(style.shape || 'spread')
    setSize(style.size || 2)
  }

  const designated = useMemo(
    () => players.filter((p) => String(p?.game_pick_role || '').trim()).length, [players],
  )

  // HOW MANY MEN ARE ACTUALLY CARRYING EACH SIGNAL TONIGHT, counted over the
  // designated hitters only — those are the only rows this builder can draw a
  // leg from. By player, not by row, so a hitter designated TOP/HR/CONTACT
  // counts once rather than three times.
  const signalCounts = useMemo(() => {
    const sets = Object.fromEntries(LEG_SIGNALS.map((s) => [s.id, new Set()]))
    players.forEach((p) => {
      if (!p || !String(p?.game_pick_role || '').trim()) return
      const id = String(p?.player_id ?? p?.id ?? nameOf(p))
      LEG_SIGNALS.forEach((s) => {
        try { if (s.test(p, { b2b: b2bIds })) sets[s.id].add(id) } catch { /* a broken flag is not a signal */ }
      })
    })
    return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]))
  }, [players, b2bIds])

  return (
    <div>
      {!bare && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 900 }}>
            🧱 {(pinnedIds?.length || pinnedId) ? `Build around ${pinnedName || 'your hitters'}` : 'Build from the groups'}
          </span>
          <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
            two or more of the bot’s five designations, crossed
          </span>
        </div>
      )}
      {pinNote && (
        <div style={{
          fontSize: 10.5, lineHeight: 1.6, marginBottom: 8, maxWidth: 820,
          color: built.tickets.length ? C.text2 : C.yellow,
        }}>
          {built.tickets.length ? '📌 ' : '⚠️ '}{pinNote}
        </div>
      )}

      {/* .quiet-note: nine lines of measured rates that are load-bearing the
          first time and furniture the fiftieth. Quiet mode hides it; the
          per-leg bars below state their own rate either way, so nothing a
          number MEANS goes with it. */}
      <div className="quiet-note" style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.7, marginBottom: 9, maxWidth: 860 }}>
        The bot designates exactly one hitter per group per game, so a combination of groups is a
        real object: pick two and you are choosing between one candidate per game on each side.
        {' '}Each bar is what it is regardless of whose name is on it — measured over{' '}
        <b style={{ color: C.text2 }}>{GROUP_BACKTEST.nights} graded nights and {GROUP_BACKTEST.games} games</b>
        {' '}of this project’s own archive:{' '}
        <span style={{ fontFamily: NUM_FONT }}>
          1+ hit {rateText(GROUP_RATE.HIT)} · 2+ of hits, runs and RBI {rateText(GROUP_RATE.HRR)} ·
          {' '}2+ total bases {rateText(GROUP_RATE.CONTACT)} · 1+ home run {rateText(GROUP_RATE.TOP)} as a
          {' '}TOP pick and {rateText(GROUP_RATE.HR)} as an HR pick
        </span>.
        {' '}That spread is far wider than anything a signal moves, which is why every leg below states
        its own bar first.
      </div>

      {/* ── controls ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', width: 52 }}>Style</span>
        {PAIR_STYLES.map((style) => (
          <button
            key={style.key}
            onClick={() => applyStyle(style)}
            title={style.note}
            style={btnStyle(style.key === 'bases_gaps' ? C.green : style.key === 'hr_moonshot' ? C.orange : C.purple, styleKey === style.key)}
          >{style.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', width: 52 }}>Groups</span>
        {GROUP_ORDER.map((g) => {
          const meta = GROUP_META[g]
          const col = C[meta.tone] || C.orange
          return (
            <button
              key={g}
              onClick={() => toggle(groups, setGroups, g)}
              title={`${meta.bar} — ${rateText(GROUP_RATE[g])} over ${GROUP_BACKTEST.nights} nights. ${meta.blurb}.`}
              style={btnStyle(col, groups.includes(g))}
            >{g}</button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', width: 52 }}>Signals</span>
        {LEG_SIGNALS.map((s) => {
          const off = s.id === 'b2b' && !b2bVerified
          const carrying = signalCounts[s.id]
          return (
            <button
              key={s.id}
              onClick={() => { if (!off) toggle(signals, setSignals, s.id) }}
              title={off
                ? 'Last night’s homers aren’t proven yet, so this filter can’t be applied — see lib/b2b.js'
                : `Keep only legs carrying at least one of the signals you switch on. What this one has measured: ${signalRecordText(s)}.`}
              style={{ ...btnStyle(C.green, signals.includes(s.id)), opacity: off ? 0.4 : 1, cursor: off ? 'not-allowed' : 'pointer' }}
            >
              {s.label}
              {/* The count is of DESIGNATED hitters, which is the only pool
                  this builder can draw from — a signal carried by twenty
                  hitters nobody designated is worth nothing here. */}
              {!off && carrying != null ? ` ${carrying}` : ''}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', width: 52 }}>Shape</span>
        <button onClick={() => { setStyleKey('custom'); setShape('spread') }} style={btnStyle(C.purple, shape === 'spread')}>Across games</button>
        <button onClick={() => { setStyleKey('custom'); setShape('game') }} style={btnStyle(C.cyan, shape === 'game')}>All in one game</button>
        <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em', marginLeft: 6 }}>Legs</span>
        {[2, 3, 4].map((k) => (
          <button key={k} onClick={() => { setStyleKey('custom'); setSize(k) }} style={btnStyle(C.orange, size === k)}>
            {k === 2 ? '2 legs · pair' : `${k} legs · pool`}
          </button>
        ))}
      </div>

      {/* What the controls actually did, in a sentence — a count nobody can
          see is a filter nobody can trust. */}
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.7, marginBottom: 4 }}>
        {designated} hitters carry a designation on this slate.
        {GROUP_ORDER.filter((g) => groups.includes(g)).map((g) => {
          const c = built.counts[g]
          if (!c) return null
          return (
            <span key={g}>
              {' '}{g}: <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{c.total}</span> designated
              {activeSignals.length ? <>, <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{c.kept}</span> carrying a signal you asked for</> : ''}.
            </span>
          )
        })}
        {signals.includes('b2b') && !b2bVerified && (
          <span> The back-to-back proof hasn’t come back yet, so that filter is <b style={{ color: C.text2 }}>not</b> being applied — no proof, no claim.</span>
        )}
        {/* The button used to carry the slate-wide back-to-back count and now
            carries the designated count, which is the pool this builder can
            actually draw from. Both numbers stay — the first one is how big
            tonight's watch is, the second is how much of it is reachable. */}
        {b2bVerified && (
          <span>
            {' '}<span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{b2bList.length}</span>
            {` hitter${b2bList.length === 1 ? '' : 's'} on the slate ${b2bList.length === 1 ? 'is' : 'are'} proven back-to-back tonight, `}
            <span style={{ fontFamily: NUM_FONT, color: C.text2 }}>{signalCounts.b2b}</span>
            {' of them designated in one of the five groups.'}
          </span>
        )}
        {shape === 'game' && built.collapsed > 0 && (
          <span> {built.collapsed} game{built.collapsed === 1 ? '' : 's'} couldn’t make a ticket because the groups you picked land on the same hitter there.</span>
        )}
      </div>

      {/* ── WHAT THE SIGNALS HAVE AND HAVEN'T MEASURED ──────────────────────
          2026-08-16, Donovan on the signals: "they holding true." Some of them
          have a number behind that and some of them have never been graded at
          all, and the difference is the single most important thing on this
          panel. It is written from LEG_SIGNALS itself so a rate can never
          drift from the one the library carries, and back-to-back — the one he
          named first — is the one that has to say it has no rate. */}
      {/* NOT .quiet-note, deliberately. This paragraph is the one place that
          says WHICH signals have a graded number behind them and which have
          never been measured at all — back-to-back claims no rate, and hiding
          that would let a filter chip read as evidence. Quiet mode hides prose
          ABOUT the page; this changes what the chips above it MEAN. */}
      <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.9, margin: '14px 0 4px', maxWidth: 860 }}>
        <b style={{ color: C.text2 }}>What each signal has actually measured.</b>{' '}
        {LEG_SIGNALS.map((s, i) => (
          <span key={s.id}>
            {i > 0 ? ' ' : ''}
            <b style={{ color: C.text2 }}>{s.label.charAt(0).toUpperCase() + s.label.slice(1)}</b>
            {' — '}
            <span style={{ fontFamily: s.record ? NUM_FONT : 'inherit' }}>{signalRecordText(s)}</span>.
          </span>
        ))}
      </div>

      {/* .quiet-note: how the ranking works, which is worth reading once and
          is furniture after that. Every leg below still states its own bar and
          names its own reserved signal, so nothing a number MEANS goes with
          it — unlike the paragraph above, which stays. */}
      <div className="quiet-note" style={{
        fontSize: 10.5, color: C.text3, lineHeight: 1.9, maxWidth: 860,
        marginBottom: 12, display: groups.length < 2 ? 'none' : 'block',
      }}>
        Every ticket below <b style={{ color: C.text2 }}>reserves one spot</b> for a hitter carrying one of
        them, and that leg names which. Legs are then ranked by{' '}
        <b style={{ color: C.text2 }}>how many signals they carry first</b> and by that group’s own 0-100
        score second — the signals are tested against outcomes and the score is a model output, so that is
        the right way round.
        {' '}Aligned counts as <b style={{ color: C.text2 }}>one</b> signal, not three: it is the weak spot
        and the pitch-type match by definition, and counting all three would let one man’s single matchup
        fact outrank a hitter who is back-to-back and high-confidence on two separate ones. Switching{' '}
        <i>weak spot</i> on still keeps every aligned hitter — the filter sees all three, only the count
        and the sentence collapse them.
      </div>

      {groups.length < 2 ? (
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.7, padding: '10px 0' }}>
          Pick <b style={{ color: C.text2 }}>at least two groups</b> — crossing them is the whole idea.
          One group on its own is the Picks tab, which already lists it in full.
        </div>
      ) : !built.tickets.length ? (
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.7, padding: '10px 0' }}>
          Nothing to build from that combination tonight
          {built.emptyGroups.length
            ? ` — ${built.emptyGroups.join(' and ')} ${built.emptyGroups.length === 1 ? 'has' : 'have'} no candidate${activeSignals.length ? ' left once the signal filter is applied' : ' on this slate'}`
            : ''}
          .{activeSignals.length ? ' Drop a signal,' : ''}
          {shape === 'game'
            ? ' one game only supplies one hitter per group, so try building across games instead.'
            : ' or try a different pair of groups.'}
        </div>
      ) : (
        <div>
          {built.tickets.map((t, i) => (
            <TicketBlock key={t.key} ticket={t} index={i} odds={odds} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}

      {/* ── THE SIGNALS-ONLY TICKET ─────────────────────────────────────────
          The third mechanism. Above, one spot per ticket is reserved; here
          every spot is. Same groups, same shape, same size, same collapse,
          same ceiling — see buildSignalTickets() — so it is comparable to the
          tickets above it line for line, and the only thing that changed is
          that nothing on it is unflagged. */}
      {groups.length >= 2 && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 4 }}>
            Signals only
          </div>
          <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.9, marginBottom: 4, maxWidth: 860 }}>
            The same {GROUP_ORDER.filter((g) => groups.includes(g)).join(' + ')} combination, built so that{' '}
            <b style={{ color: C.text2 }}>every</b> leg is carrying a signal rather than just the reserved one.
            {!b2bVerified && (
              <> Back-to-back is left out of it until tonight’s setup homers are proven, because a ticket
              whose whole premise is a verified signal on every leg cannot be built out of an unverified
              one.</>
            )}
          </div>

          {!signalTicket ? (
            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.9, padding: '6px 0' }}>
              {signalBuilt.signalMen > 0 ? (
                <>
                  {signalBuilt.signalMen} designated hitter{signalBuilt.signalMen === 1 ? '' : 's'} in these
                  groups {signalBuilt.signalMen === 1 ? 'is' : 'are'} carrying a signal, but not enough of
                  them in different games to fill {size} legs
                  {shape === 'game' ? ' out of one game' : ''}. Try another combination or fewer legs.
                </>
              ) : (
                <>
                  <b style={{ color: C.orange }}>Nobody designated in these groups is carrying a signal tonight.</b>
                  {' '}Not one of them is back-to-back, high-confidence, in a weak spot, on a pitch-type match
                  or aligned, so there is no signals-only ticket to build — and the tickets above have no
                  reserved leg either, which each of them says.
                </>
              )}
            </div>
          ) : signalIsRepeat ? (
            <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.9, padding: '6px 0' }}>
              Your signal filter already requires one on every leg, so this is the same ticket as{' '}
              <b style={{ color: C.text2 }}>{TICKET_WORD(signalTicket.legs.length)} 1</b> above rather than a
              second one. Turn the filters off and the two separate.
            </div>
          ) : (
            <TicketBlock
              ticket={signalTicket}
              index={0}
              odds={odds}
              onPlayerClick={onPlayerClick}
              word={`Signals-only ${TICKET_WORD(signalTicket.legs.length).toLowerCase()}`}
            />
          )}
        </div>
      )}

      <WhatThis label="why no combined percentage is printed" maxWidth={860}>
        <b style={{ color: C.text2 }}>No combined percentage is printed here, on purpose.</b>{' '}
        Two legs in the same game share a park, an air, a starting pitcher and a game state, and this
        archive has never measured what that does to a 1+ hit or a 2+ total-bases bar — the one
        same-game result it does have is for home runs (1.05× the independence expectation over 58
        nights, see the Pair History note), and that does not transfer. Multiplying two rates as
        though the legs were independent would be asserting something nobody has checked, so each leg
        keeps its own measured rate and the only combined figure is the ceiling, which is true under
        any dependence at all.
        {' '}Ranking inside a group is by distinct signals first — aligned counting once for the weak spot
        and pitch match it contains — and then by that group’s own 0-100 score:
        <b style={{ color: C.text2 }}> a score is not a probability</b>, so it is a sort key here and
        nothing else. Prices are the book’s, shown only where the book’s line is the same bet as the
        leg’s bar, and the rate beside a leg is <b style={{ color: C.text2 }}>that group&apos;s</b> record
        over the backtest, not this hitter&apos;s — the two sitting next to each other is a comparison to
        make yourself, not an edge this page is claiming.
      </WhatThis>
    </div>
  )
}

// SLIMMED TO TWO VIEWS (2026-08-04). Build a Pair moved to the Pools tab —
// the two builders were on different tabs doing sibling jobs, and one home
// for "construct your own ticket" beats two. Season History went with it:
// the Pair History tab already owns that data, and a second copy here was a
// tab pretending to be a feature.
// 2026-08-24: text-only — secondary/sub-tab pills are emoji-free site-wide.
const VIEWS = [
  { key:'today',   label:'Today\'s Pairs' },
  { key:'live',    label:'Live HR Pairs' },
]

// `odds` and `slateDate` are NEW AND OPTIONAL (2026-08-16). Dashboard doesn't
// pass either to this tab and adding them there would mean editing a file two
// other agents are in tonight, so the builder falls back to fetching the same
// odds_latest.json itself and to reading the slate date off the rows. Every
// existing caller keeps working unchanged; a caller that has them can hand
// them over and skip the extra fetch.
export default function Pairs({ players=[], pairBuilder, pairHistorySummary, results, focusPlayerId, onClearFocus, onPlayerClick, odds=null, slateDate='' }) {
  // ── THE SECOND PILL ROW IS GONE (2026-08-17) ──────────────────────────────
  // Donovan: "LOOK AT THE DOUBLE PAIR HISTORY."
  //
  // This tab rendered TWO navigation rows stacked on each other. The outer one
  // (🤝 Pairs / 🎱 Pools / 📜 History) belongs to components/tabs/Combos.js,
  // the shell built in the 08-16 tab consolidation. The inner one (👥 Pairs /
  // 📜 Pair History) was this file's own pre-merge switcher, which the merge
  // left in place because it wrapped rather than rewrote.
  //
  // So Pair History was reachable by two paths, down two separate useState
  // atoms that could not see each other — meaning the outer row could say
  // "Pairs" while the inner row said "Pair History", and the page would obey
  // the inner one. A duplicated control that can contradict its own twin.
  //
  // Combos already routes `history` to <PairHistory> itself, so the whole
  // pview branch here was dead weight the moment the shell existed. Deleted:
  // the state, both PairPills mounts, the history early-return, and the
  // PairPills component. `pairHistorySummary` stays in the signature because
  // Combos hands it down and other callers pass it.
  //
  // THE RULE THIS EARNED: when two surfaces stack, check whether the top one
  // repeats the bottom one — and after a consolidation, grep the WRAPPED
  // component for the navigation it used to own.
  const [view, setView] = useState('today')

  const homers = useMemo(() => {
    const raw = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    return dedupePlayers(raw)
  }, [results])

  // 🔗 EVIDENCE PAIRS — see lib/pairEvidence.js. Ranked on the only thing that
  // measured: both halves being good bats. No same-game term, because same
  // game landed at 1.05× the independence expectation across 58 nights, which
  // is to say it landed at chance.
  const evPairs = useMemo(() => buildPairs(players, { limit: 6 }), [players])

  return (
    <div>
      {evPairs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 900 }}>🔗 By the record</span>
            <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
              pairs ranked on what actually landed across 58 graded nights
            </span>
            {/* 📸 SHARE (2026-08-23) — zero-backend PNG export, same canvas
                mechanism as the Watchlist/Player cards. */}
            <button onClick={() => downloadPairsCard(evPairs, { title: 'PAIRS BY THE RECORD', baseline: PAIR_BASELINE })}
              title="Download these pairs as a PNG for posting"
              aria-label="Download pairs as image"
              style={{
                marginLeft: 'auto', background: alpha(C.orange, 0.10), border: `1px solid ${C.border}`,
                color: C.orange, borderRadius: 7, padding: '2px 9px', fontSize: 10.5, fontWeight: 700,
                cursor: 'pointer',
              }}>📸</button>
          </div>
          <div style={{ fontSize: 10, color: C.text3, marginBottom: 8, lineHeight: 1.6, maxWidth: 760 }}>
            Every percentage here is a <b style={{ color: C.text2 }}>measured</b> both-homer rate, not a
            model output. A random pair off the same slate lands{' '}
            <b style={{ color: C.text2 }}>{PAIR_BASELINE}%</b> of the time — that is the number to beat.
            {' '}Same game and same team are <i>not</i> on this list: they measured 1.05× and 1.04× the
            independence expectation, which is chance. Two good bats is the whole edge.
          </div>
          <Rail gap={8} label="pairs by measured rate">
            {evPairs.map((p, i) => (
              <div key={i} style={{
                flexShrink: 0, width: 218,
                background: `linear-gradient(155deg, ${C.orange}14, ${C.orange}04)`,
                border: `1px solid ${C.orange}3d`, borderRadius: 11, padding: '9px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, color: C.orange,
                  }}>{p.rate.toFixed(1)}%</span>
                  <span style={{ fontSize: 9, color: C.text3 }}>
                    {p.lift > 0 ? `${p.lift.toFixed(1)} over random` : 'no rule fired'}
                  </span>
                </div>
                <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>
                  {p.rule ? p.rule.label : 'neither half clears a measured bar'}
                </div>
                {[p.a, p.b].map((pl, k) => (
                  <div key={k}
                    onClick={() => onPlayerClick?.(pl)}
                    title={p.rule ? p.rule.why : undefined}
                    style={{
                      fontSize: 11.5, fontWeight: 700, marginTop: 4, cursor: 'pointer',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: C.text2,
                    }}>
                    {nameOf(pl)}{' '}
                    <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, fontWeight: 500 }}>
                      {teamOf(pl)} · {n(pl?.hr_score, 0).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </Rail>
        </div>
      )}

      <PartnerWatch players={players} pairHistorySummary={pairHistorySummary} onPlayerClick={onPlayerClick} />
      <PairMe players={players} pairHistorySummary={pairHistorySummary} onPlayerClick={onPlayerClick} />
      <PanelTitle
        title="Pairs"
        sub="The bot's pairs tonight, and which of them are landing live"
        right={
          <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
            {VIEWS.map(item => (
              <button key={item.key} onClick={() => { setView(item.key); if (item.key !== 'today') onClearFocus?.() }} style={btnStyle(item.key === 'live' ? C.cyan : C.orange, view === item.key)}>
                {item.label}
                {item.key === 'live' && homers.length > 0 ? ` (${homers.length} HR)` : ''}
              </button>
            ))}
          </div>
        }
      />

      {/* Today = the bot's table plus its reasoning in prose. The old top
          heatmap repeated the table's columns in chart form, and the card
          grid below repeated the same pairs one at a time — three renderings
          of ten pairs. One table + the writeup is the version that survives. */}
      {view === 'today' && (
        <PairBoard pairBuilder={pairBuilder} results={results} onPlayerClick={onPlayerClick} />
      )}
      {view === 'live' && <LiveHRPairs results={results} pairBuilder={pairBuilder} players={players} pairHistorySummary={pairHistorySummary} onPlayerClick={onPlayerClick} />}

      {/* ── THE GROUP BUILDER LEFT THIS PAGE TOO (2026-08-17) ────────────────
          It was mounted here AND on Pools — one component, two copies, neither
          aware of the other. It now lives once, in components/Builder.js, on
          the 🧱 Builder tab in Combos, merged with the anchor pair builder as
          its two modes. GroupTicketBuilder is still EXPORTED from this file
          because that is where its logic lives; only the mount moved.
          This page is the bot's pairs. Building your own is one tab over. */}
    </div>
  )
}

// PairPills lived here — the second, duplicated navigation row. Removed
// 2026-08-17; components/tabs/Combos.js owns the only pill row this tab has.
// See the note on `view` above before reintroducing anything like it.
