// THE POSTSEASON DIGEST: "TOP 3 POSTSEASON PERFORMANCES" (Donovan, 2026-10-12: "yes post season card when it's postseason", then "dont like a pot with three players
// like the top three that night if available"). Once a night, when EVERY MLB postseason game of that game date is Final, ONE post names the three best big nights of
// the night (the approved rule, lib/posts/postseasonCard.js BIG_NIGHT: a hitter with a home run, 3+ hits or 4+ RBI; a pitcher with 8+ strikeouts, or 6+ innings and
// 1 earned run or fewer), as ONE image (lib/cards/topThreeCard.js): X (neutral text, no link, <= 280), the MLB Discord channel and #members. It replaces the one-post-
// per-player postseason cards (the nights had up to three of them); the single player card still exists on the site and in the share route.
//
// It rides the homers tick (postseasonPass is called after the tick's own work; no cron, no polling of its own: the schedule read is kept 3 minutes per instance and only
// happens while the postseason is on). The sender, the claim and every rule are lib/posts/digestPost.js sendDigest: claim ONCE (kind postseason_mlb_top3_<YYYYMMDD>,
// matches the table's existing postseason pattern: no SQL), an X refusal keeps the claim, ONE X post (write-up tier, NOT exempt, through admit()), OFF unless
// MOMENT_POSTS_ON, paused by MOMENT_POSTS_PAUSE / MOMENT_POSTS_PAUSE_KINDS=postseason_mlb (or moment_top3 / postseason_mlb_top3).
//
// RANK: the box score's own score (postseasonCard.js boxNight: a home run weighs most; a pitcher's strikeouts and length less earned runs), then the later game, then the
// name; one line per player. A player whose season game log has not caught up with the Final yet is waited for (the post says only what MLB's own log says), a few
// minutes of ticks at most, then the digest goes without him.
import { digestKindOf, kindPaused, momentPostsOn, momentPostsPaused, POSTSEASON_MAX_PER_NIGHT, POSTSEASON_FRESH_MS, POSTSEASON_WAIT_TRIES, PASS_BUDGET_MS } from '../cards/momentPosting'
import { rankPicks } from '../cards/digestRank'
import { boxNight, nightOf } from './postseasonCard'
import { sendDigest, nightState, windowFor, DIGEST_SENDERS } from './digestPost'
import { sqlBlockedUntil } from './momentPost'
import { knownTaken } from '../dash/postClaim'
import { mayRetry } from '../dash/xFail'
import { etDay } from './momentFeed'

const API = 'https://statsapi.mlb.com/api/v1'
const _memo = new Map()
const memo = async (key, ttl, fn) => {
  const hit = _memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.v
  const v = await fn()
  if (_memo.size > 60) _memo.clear()
  if (v != null) _memo.set(key, { at: Date.now(), v })
  return v
}
const jget = async (url) => { try { const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null } catch { return null } }
const _done = new Set()          // game date -> posted or given up on (per instance; the claims are the real record)
export const _resetPostseasonPost = () => { _memo.clear(); _done.clear() }

/** The postseason games of the ET day before and today, with their status. */
async function scheduleGames(now) {
  return memo(`ps-sch|${etDay(now)}`, 3 * 60e3, async () => {
    const j = await jget(`${API}/schedule?sportId=1&startDate=${etDay(now - 86400e3)}&endDate=${etDay(now)}&gameType=F,D,L,W`)
    return j ? (j.dates || []).flatMap((d) => d.games || []) : null
  })
}
const boxscore = (pk) => memo(`ps-box|${pk}`, 5 * 60e3, () => jget(`${API}/game/${pk}/boxscore`))

/** Pure: a schedule body's games -> the postseason NIGHTS, oldest first: [{ date, season, games:[{ id, startMs, final, off }] }] (a night is a game date). */
export function postseasonNights(games) {
  const by = new Map()
  for (const g of games || []) {
    const date = String(g?.officialDate || '').slice(0, 10)
    if (!g?.gamePk || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!by.has(date)) by.set(date, { date, season: String(g.season || date.slice(0, 4)), games: [] })
    by.get(date).games.push({ id: String(g.gamePk), startMs: Date.parse(g.gameDate || ''), off: /postponed|cancel|suspend/i.test(String(g.status?.detailedState || '')), final: g.status?.abstractGameState === 'Final' })
  }
  return [...by.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Pure: a Final game's boxscore -> the players with a big night, most notable first: [{ id, name, team, group, score }]. */
export function bigNights(box) {
  const out = []
  for (const side of ['home', 'away']) {
    const team = String(box?.teams?.[side]?.team?.abbreviation || '')
    for (const p of Object.values(box?.teams?.[side]?.players || {})) {
      const id = p?.person?.id
      if (!id) continue
      for (const n of boxNight(p.stats)) out.push({ id: String(id), name: p.person.fullName || '', team, group: n.group, score: n.score })
    }
  }
  return out.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
}

const DEFAULTS = {
  ...DIGEST_SENDERS,
  schedule: scheduleGames, boxscore,
  postseasonOn: async (day) => (await (await import('../dash/seasonGuard')).postseasonOn(day)).postseason === true,
  loadPlayer: async ({ id, season, group }) => (await import('../cards/postseasonData')).loadPostseasonPlayer({ id, season, group, withPictures: true }),
  loadModel: async (o) => (await import('../cards/topThreeData')).topThreeModel({ sport: 'mlb', picks: o.picks, tiles: o.picks.map((p) => p.tile), night: o.night, postseason: true }),
}

/** A tile for a postseason pick from his season model (pictures, club, tone): the shimmer, the line is the night's own counting stats. */
export const postseasonTile = (model, line) => ({ name: model.name, team: model.team, opp: '', home: null, club: model.teamName || '', face: model.face || '', logo: model.logo || '', logoPlate: Boolean(model.logoPlate), tone: model.tone || null, tier: 'star', holo: false, shimmer: true, line, tag: ['POSTSEASON', model.roundTag].filter(Boolean).join(' · ') })

/**
 * One pass (called by the homers tick, last): for each postseason night that is over (every game Final or off) and not yet posted, post the night's digest.
 * Never throws. -> { off | paused | blocked | skipped: why | nights:[{ night, result }] }
 */
export async function postseasonPass(db, { now = Date.now(), deps = {} } = {}) {
  const d = { ...DEFAULTS, ...deps }
  try {
    if (!momentPostsOn()) return { off: true }
    if (momentPostsPaused()) return { paused: true }
    if (now < sqlBlockedUntil()) return { blocked: 'kind not allowed yet (run the SQL)' }
    if (kindPaused('postseason_mlb') || kindPaused('postseason_mlb_top3')) return { paused: 'postseason_mlb' }
    if (!(await d.postseasonOn(etDay(now)))) return { skipped: 'not the postseason' }
    const sched = await d.schedule(now)
    const out = { nights: [] }
    const t0 = d.clock()
    for (const night of postseasonNights(sched)) {
      const kind = digestKindOf({ sport: 'mlb', night: night.date, postseason: true })
      if (!kind || _done.has(night.date) || knownTaken(night.date, kind)) continue
      if (d.clock() - t0 > PASS_BUDGET_MS) break
      const note = (result) => out.nights.push({ night: night.date, result })
      const s = nightState(night.games)
      if (!s.over) continue
      const w = windowFor('mlb', s.lastStart, now)
      if (w === 'wait') { note('over; waiting for the post-game window'); continue }
      if (w === 'stale' || (s.lastStart != null && now - s.lastStart > POSTSEASON_FRESH_MS)) { _done.add(night.date); continue }
      // every big night of the night's games
      const cands = []
      let missing = false
      for (const g of s.live) {
        const box = await d.boxscore(g.id)
        if (!box) { missing = true; break }
        for (const n of bigNights(box)) cands.push({ ...n, pk: g.id, startMs: g.startMs, season: night.season, date: night.date })
      }
      if (missing) { note('wait: a box score did not answer'); continue }
      if (!cands.length) { note('no big night'); _done.add(night.date); continue }
      const ranked = rankPicks(cands.map((c) => ({ slug: c.id, playerId: c.id, name: c.name, team: c.team, tier: 'star', rank: 1, magnitude: c.score, at: Number.isFinite(c.startMs) ? c.startMs : 0, moment: `postseason_${c.group}`, line: '', cand: c })), { max: 99 })
      const picks = []
      let pending = 0
      for (const r of ranked) {
        if (picks.length >= POSTSEASON_MAX_PER_NIGHT) break
        if (d.clock() - t0 > PASS_BUDGET_MS) { pending += 1; break }
        const c = r.cand
        // his season model: the game must be in MLB's own game log before the card says anything about it
        const lp = await d.loadPlayer({ id: c.id, season: c.season, group: c.group })
        if (!lp?.ok) { pending += 1; continue }
        const model = lp.model
        if (String(model.last?.gamePk || '') !== String(c.pk)) { pending += 1; continue }
        const night1 = nightOf(model)
        if (!night1.big) continue
        const line = night1.parts.join(' · ').toUpperCase().replace(/(\d+) STRIKEOUTS?/, '$1 K')
        picks.push({ ...r, team: r.team || model.team || '', line, tile: postseasonTile(model, line) })
      }
      // a higher-ranked player whose log has not caught up is waited for (a few minutes of ticks, so the best three are the true best three), then the digest goes without him
      if (pending && mayRetry(`ps-wait|${kind}`, POSTSEASON_WAIT_TRIES)) { note(`wait: ${pending} game log(s) have not caught up`); continue }
      if (!picks.length) { note('skip: no model could be built'); _done.add(night.date); continue }
      let result
      try { result = await sendDigest(db, { sport: 'mlb', night: night.date, kind, picks, postseason: true, now }, d) } catch (err) { result = `error: ${err?.message || err}`; console.error(`[postseason] ${night.date}: ${err?.message || err}`) }
      if (/^(posted|skip: already posted|dropped)/.test(result)) _done.add(night.date)
      note(result)
      if (result.startsWith('blocked')) break
    }
    return out
  } catch (err) {
    console.error(`[postseason] pass failed: ${err?.message || err}`)
    return { error: String(err?.message || err) }
  }
}
