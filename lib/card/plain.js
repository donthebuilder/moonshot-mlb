// #MEMBERS IN PLAIN WORDS (2026-10-23, Donovan: "I didn't even know what I was looking at ... get this a little bit cleaner so it's easier when a lot
// more people get in here"; then "plain words, drop units and the CALLED / ON THE BOARD tags in members posts, and add the wins posts").
//
// Pure: the words a member reads for one Card pick. A bettor's words, not ours: "to score", "3+ shots", "top 1% in shots tonight". No units, no
// status word, no "straight", no fine print. The status and the units still live on the rows (the record and the ledger read them); only the
// members text stops printing them. Used by lib/card/briefing.js (THE DAY) and lib/card/wins.js (wins and the morning grade).
import { BRAND } from '../routes.js'
import { MARKETS, fmtAmerican, legPriceOf } from './core.js'

export const ICON = { mlb: BRAND.mlb?.icon || '⚾', nfl: BRAND.nfl?.icon || '🏈', nhl: BRAND.nhl?.icon || '🏒', nba: BRAND.nba?.icon || '🏀' }
export const PRODUCT = { mlb: 'MOONSHOT', nfl: 'TUDDY', nhl: 'LAMP', nba: 'BUCKETS' }

// the yes/no bet of each sport, as a bettor says it
const YES = { nhl: 'to score', nfl: 'to score a TD', mlb: 'to homer', nba: 'to score' }
const YES_DONE = { nhl: 'scored', nfl: 'scored a TD', mlb: 'homered', nba: 'scored' }
// an over, as a count: "over 2.5 shots" is "3+ shots"
const UNIT = { sog: 'shots', rec_yds: 'receiving yards', rush_yds: 'rushing yards', hit: 'hits', hrr: 'hits + runs + RBIs', pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threes', pra: 'points + rebounds + assists' }

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
/** "3+ shots" for a line of 2.5; "over 3 shots" for a whole-number line (a push is possible there). */
export function overWords(market, line) {
  const unit = UNIT[market] || market
  const n = num(line)
  if (n == null) return `over ${unit}`
  return Number.isInteger(n) ? `over ${n} ${unit}` : `${Math.floor(n) + 1}+ ${unit}`
}

/** The bet, in words: "to score", "3+ shots", "55+ receiving yards". A leg with no market is its sport's yes/no bet. */
export function betWords(sport, l) {
  const m = l?.market && l.market !== 'anytime' ? MARKETS[sport]?.[l.market] : null
  if (m?.kind === 'ou') return overWords(l.market, l.line)
  return YES[sport] || 'to score'
}
/** The same bet, after it landed: "scored", "went over 3+ shots". */
export function hitWords(sport, l) {
  const m = l?.market && l.market !== 'anytime' ? MARKETS[sport]?.[l.market] : null
  return m?.kind === 'ou' ? `got ${overWords(l.market, l.line)}` : (YES_DONE[sport] || 'scored')
}

/** The price as a bettor reads it, or null when none was stored ("-120", "+186"). */
export function priceWords(l, fallback = null) {
  const f = legPriceOf(l) || (fallback ? { median: fallback.median ?? fallback.best } : null)
  return f?.median != null ? fmtAmerican(f.median) : null
}

// NO PERCENTILES (Donovan, 2026-10-23: "90th percentile ... that doesn't make sense ... for all of the notifications").
// A reason is a real stat ("3.4 shots and 0.52 goals a game") when the numbers exist (nhlStatWhy); an older stored percentile line
// ("shots 99th · goals 100th · ice time 91st percentile tonight") is said in words, never as a rank or a %.
const PCT = /\b(shots|goals|ice time|points|rebounds|assists|threes|minutes)\s+(\d{1,3})(?:st|nd|rd|th)\b/gi
const NOUN = { shots: 'shooters', goals: 'goal scorers', points: 'scorers', rebounds: 'rebounders', assists: 'passers', threes: 'shooters from deep' }
const OFTEN = { shots: 'shoots a lot', goals: 'scores often', points: 'scores a lot', rebounds: 'rebounds a lot', assists: 'sets up a lot', threes: 'takes a lot of threes' }
const MINUTES = (what) => what === 'ice time' || what === 'minutes'

/** Percentile parts in words: "One of tonight's top shooters and goal scorers, and plays big minutes". null when nothing stands out. */
export function pctWords(parts) {
  const by = (w) => parts.find((x) => x.what === w)?.p ?? null
  const stats = parts.filter((x) => !MINUTES(x.what) && NOUN[x.what])
  const top = stats.filter((x) => x.p >= 95).map((x) => NOUN[x.what])
  const good = stats.filter((x) => x.p >= 85 && x.p < 95).map((x) => OFTEN[x.what])
  const big = (by('ice time') ?? by('minutes') ?? 0) >= 90
  const bits = []
  if (top.length) bits.push(`One of tonight's top ${top.join(' and ')}`)
  for (const g of good) bits.push(bits.length ? g : g.charAt(0).toUpperCase() + g.slice(1))
  if (big) bits.push(bits.length ? 'plays big minutes' : 'Plays big minutes')
  if (!bits.length) return null
  return bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')}, and ${bits[bits.length - 1]}`
}

const mmss = (min) => { const m = Math.floor(min); const s = Math.round((min - m) * 60); return `${m}:${String(s).padStart(2, '0')}` }
/** A skater's reason from his real numbers (the board row's per-game legs): "3.4 shots and 0.52 goals a game · 21:04 ice time". null without them. */
export function nhlStatWhy(legs, market = 'anytime') {
  const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  const shots = n(legs?.shotsPg), goals = n(legs?.goalsPg), toi = n(legs?.toi)
  const a = market === 'sog'
    ? (shots != null ? `${shots.toFixed(1)} shots a game` : null)
    : shots != null && goals != null ? `${shots.toFixed(1)} shots and ${goals.toFixed(2)} goals a game` : goals != null ? `${goals.toFixed(2)} goals a game` : shots != null ? `${shots.toFixed(1)} shots a game` : null
  const t = toi != null && toi > 0 ? `${mmss(toi)} ice time` : null
  return [a, t].filter(Boolean).join(' · ') || null
}

/** One short why, never a percentile: a stored percentile line becomes words (pctWords); any other stored why is kept as written. No stored why, no why. */
export function whyPlain(why) {
  const t = String(why == null ? '' : why).replace(/\s+/g, ' ').trim()
  if (!t) return null
  const parts = [...t.matchAll(PCT)].map((m) => ({ what: m[1].toLowerCase(), p: Number(m[2]) })).filter((x) => x.p >= 0 && x.p <= 100)
  if (parts.length || /percentile/i.test(t)) return pctWords(parts)
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** "Kirill Kaprizov (MIN)" */
export const who = (l) => `${l?.name || l?.player_id}${l?.team ? ` (${l.team})` : ''}`
