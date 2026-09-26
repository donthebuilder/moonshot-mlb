// 📜 NFL HISTORY CLAIMS + WATCH (milestones plan step 4, 2026-09-26).
// Server only. hist_nfl (nflverse weekly player stats, 1999 on) answered by
// lib/history/lastTime.js. Coverage starts in 1999, so a claim that finds
// nobody says "since at least 1999" -- never "ever".
import { createClient } from '@supabase/supabase-js'
import { lastTime, wordClaim, posWord } from './lastTime'
import { NFL_TEAMS } from '../nfl/teams'

export const CREDIT = 'Data: nflverse player stats (1999 on)'
// stat -> rungs, how close counts as "in reach", and the words.
export const NFL_RUNGS = {
  total_td: { rungs: [10, 12, 15], within: 1, what: (v) => `${v} touchdowns` },
  rec_yds: { rungs: [1000, 1500], within: 60, what: (v) => `${v.toLocaleString('en-US')} receiving yards` },
  rush_yds: { rungs: [1000, 1500], within: 60, what: (v) => `${v.toLocaleString('en-US')} rushing yards` },
}
const TWO_WORD = { NE: 'Patriots', TB: 'Buccaneers', WAS: 'Commanders', SF: '49ers' }
const nickname = (ab) => TWO_WORD[ab] || (NFL_TEAMS.find(([a]) => a === ab)?.[1] || ab).split(' ').pop()
const FRANCHISE = { STL: 'LA', SD: 'LAC', OAK: 'LV' }
const COVERAGE = 1999

const db = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

/** Claims for reaching `value` of `stat` this season. p = { team, position, rookie } */
export async function nflClaims(p, { stat, value, season }) {
  const c = db()
  const franchise = FRANCHISE[p?.team] || p?.team
  if (!c || !franchise) return []
  const { data, error } = await c.from('hist_nfl').select('season, player_id, name, team, franchise, position, rookie, total_td, rec_yds, rush_yds')
    .eq('franchise', franchise).neq('team', 'TOT').lt('season', season).gte(stat, value).order('season', { ascending: false }).limit(500)
  if (error) throw new Error(`hist_nfl: ${error.message}`)
  const rows = (data || []).map((r) => ({ ...r, source_id: r.player_id }))
  const team = nickname(franchise)
  const what = NFL_RUNGS[stat].what(value)
  const tries = [
    p.position && { type: 'C1', who: `${team} ${posWord(p.position)}`, q: { stat, value, franchise, position: p.position, before: season } },
    { type: 'C2', who: `${team} player`, q: { stat, value, franchise, before: season } },
    p.rookie && { type: 'C3', who: `${team} rookie`, q: { stat, value, franchise, rookie: true, before: season } },
  ].filter(Boolean)
  const out = []
  for (const t of tries) {
    const ans = lastTime(rows, t.q)
    ans.coverageFrom = COVERAGE
    const text = wordClaim(ans, { who: t.who, what, season })   // no firstSeason: never "ever" inside a 1999 floor
    if (text) out.push({ type: t.type, text, proof: { ...t.q, who: t.who, lastSeason: ans.lastSeason, lastPlayer: ans.lastPlayer, lastValue: ans.lastValue, hits: ans.hits, coverageFrom: COVERAGE, allSince: ans.allSince, source: CREDIT } })
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0))
}

let cur = { at: 0, season: 0, rows: null }
/** This season's totals per player (nflverse weekly, REG), cached an hour. */
async function currentTotals(season) {
  if (cur.rows && cur.season === season && Date.now() - cur.at < 3600e3) return cur.rows
  const res = await fetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`)
  if (!res.ok) return new Map()
  const [head, ...lines] = (await res.text()).split('\n')
  const cols = head.split(',')
  const at = (k) => cols.indexOf(k)
  const I = { id: at('player_id'), name: at('player_display_name'), pos: at('position'), team: at('team'), type: at('season_type'), rtd: at('rushing_tds'), ctd: at('receiving_tds'), ryd: at('rushing_yards'), cyd: at('receiving_yards') }
  const m = new Map()
  for (const line of lines) {
    // headshot URLs carry commas inside quotes: split on commas outside quotes.
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((x) => x.replace(/,$/, '').replace(/^"|"$/g, '')) || []
    if (f[I.type] !== 'REG') continue
    const r = m.get(f[I.id]) || { name: f[I.name], position: f[I.pos], team: f[I.team], total_td: 0, rec_yds: 0, rush_yds: 0 }
    r.team = f[I.team]; r.total_td += Number(f[I.rtd] || 0) + Number(f[I.ctd] || 0); r.rec_yds += Number(f[I.cyd] || 0); r.rush_yds += Number(f[I.ryd] || 0)
    m.set(f[I.id], r)
  }
  cur = { at: Date.now(), season, rows: m }
  return m
}

/** This week's watch: players whose current total is within reach of a rung. */
export async function nflWatch(season) {
  const totals = await currentTotals(season)
  const c = db()
  // Rookie = no earlier season in the data (a pre-1999 veteran is never a 2026 rookie).
  const ids = [...totals.keys()]
  const veterans = new Set()
  if (c) for (let i = 0; i < ids.length; i += 300) {
    const { data } = await c.from('hist_nfl').select('player_id').in('player_id', ids.slice(i, i + 300)).lt('season', season).limit(5000)
    for (const r of data || []) veterans.add(r.player_id)
  }
  const out = []
  for (const [id, p] of totals) {
    for (const [stat, spec] of Object.entries(NFL_RUNGS)) {
      const rung = spec.rungs.find((t) => t - p[stat] > 0 && t - p[stat] <= spec.within)
      if (!rung) continue
      const claims = await nflClaims({ team: p.team, position: p.position, rookie: !veterans.has(id) }, { stat, value: rung, season }).catch(() => [])
      if (!claims.length) continue
      out.push({ player_id: id, name: p.name, team: p.team, hr: p[stat], unit: stat === 'total_td' ? 'TD' : stat === 'rec_yds' ? 'rec yds' : 'rush yds', rung, claim: claims[0].text, proof: claims[0].proof })
    }
  }
  return out.sort((a, b) => (a.proof.lastSeason ?? 0) - (b.proof.lastSeason ?? 0) || b.rung - a.rung)
}
