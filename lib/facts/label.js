// THE LABEL LINE AND THE SHAPE OF A FACT POST (X overhaul, 2026-10-09). Pure.
//
// Every fact post was: a label line from the registry (lib/routes.js BRAND) -- '⚾ MOONSHOT · HOT STREAK' --
// then a few short lines. Since 2026-10-20 it is a HOOK, the lines, and an ASK (see THE VOICE below); the label stays on the fact. The brand and the icon are NEVER typed here:
// they are read off BRAND by sport key. The label is the family's own word (below).
import { BRAND, sportKey } from '../routes'

export const LABELS = Object.freeze({
  // player facts (lib/facts/players.js)
  p_streak: 'HOT STREAK', p_form: 'FORM CHECK', p_birthday: 'BIRTHDAY', p_vs_team: 'VS THIS TEAM', p_milestone: 'MILESTONE WATCH', p_vs_starter: 'HEAD TO HEAD',
  // team facts (lib/facts/nfl.js, teams.js) and the bot's own record (lib/facts/mlb.js)
  both_unbeaten: 'UNBEATEN MATCHUP', both_winless: 'WINLESS MATCHUP', team_start_unbeaten: 'PERFECT START', team_start_winless: 'WINLESS START',
  themed_week: 'THEMED WEEK', unbeaten_start: 'PERFECT START', win_streak: 'WIN STREAK', bot_called: 'BY THE NUMBERS', bot_blind_spot: 'BY THE NUMBERS',
})
// where the numbers came from, said short (no digits: the checker only lets a fact's own numbers through)
export const VIA = Object.freeze({
  nfl: 'nflverse schedule', mlb: 'MLB Stats API', nhl: 'NHL api-web', nba: 'ESPN',
})

/** The label line for a fact. Kept for the record (fact.label) and old callers; a fact POST no longer opens with it (2026-10-20, below). */
export const headerOf = (fact) => `${fact.icon} ${fact.brand} · ${fact.label}`

/** The fact with brand / icon / label / via set from the registry. A fact that already carries them keeps them. */
export function decorate(fact) {
  const b = BRAND[sportKey(fact.sport)]
  // a team fact names its clubs, so the repeat guard (same subject, same sport window) can hold the 49ers' 3-0 and 4-0 apart
  const named = fact.named || (Array.isArray(fact.teams) ? fact.teams.map((t) => `team:${fact.sport}:${t.code}`) : [])
  return { ...fact, named, brand: fact.brand || b.name, icon: b.icon, label: fact.label || LABELS[fact.family] || 'FACT', via: fact.via || VIA[fact.sport] || null }
}

// ── THE VOICE (2026-10-20, Donovan: "too robotic, too stat heavy -- we need voice, community speak, an admin running the
// account"; claude/CALLED-IT-PLAYBOOK-2026-10-20.txt). A fact post now opens with a HOOK (a feeling, in a fan's words, the sport
// icon first) and closes with an ASK (a question to the network), instead of the old label line ('⚾ MOONSHOT · HOT STREAK').
// Hooks and asks are CODE, never the AI: they use only the fact's own names, carry no digits, and never claim more than the fact
// does (no "he's chasing it", no "who gets there first": a rank is most likely on our board, not likely). The variant is picked
// by the fact's id, so the same fact always reads the same and different facts don't all open the same way.
// the hook names the man; his team is on the game line under the fact ("CLE vs TB · 8:08 PM ET", 2026-10-20)
const nm = (f) => f.player
const teamName = (f) => (Array.isArray(f.teams) && f.teams[0] ? f.teams[0].name : '')
export const HOOKS = Object.freeze({
  p_streak: [(f) => `${nm(f)} is rolling 🔥`, (f) => `${nm(f)} is on a heater 🔥`, (f) => `Somebody cool off ${nm(f)} 🔥`],
  p_form: [(f) => `${nm(f)} keeps clearing the bar`, (f) => `Steady as they come: ${nm(f)}`],
  p_birthday: [(f) => `Happy birthday, ${nm(f)} 🎂`],
  p_vs_team: [(f) => `${nm(f)} gets ${f.opp} again 👀`],
  p_milestone: [(f) => `Milestone watch: ${nm(f)} 👀`, (f) => `${nm(f)} is closing in on a big number 👀`],
  p_vs_starter: [(f) => `${nm(f)} has seen ${f.pitcher} before 👀`],
  both_unbeaten: [() => 'Unbeaten vs unbeaten 🍿'],
  both_winless: [() => 'Winless vs winless 😬'],
  team_start_unbeaten: [() => 'A perfect start 🔥'],
  team_start_winless: [() => 'Still looking for a win 😬'],
  unbeaten_start: [() => 'A perfect start 🔥'],
  win_streak: [(f) => `The ${teamName(f)} keep winning 🔥`],
  themed_week: [(f) => (f.theme === 'cats' ? 'Cat fight week 🐾' : 'Bird week 🐦')],
  bot_called: [(f) => `${f.player}, when we call him 🎯`],
  bot_blind_spot: [(f) => `Our blind spot: ${f.player} 🙈`],
})
export const ASKS = Object.freeze({
  p_streak: ['Does it keep going?', 'Riding with him?', 'Network, ride or fade?'],
  p_form: ['Ride or fade?', 'You trusting it?'],
  p_birthday: ['Birthday game?'],
  p_vs_team: ['Same story this time?', 'Network, ride or fade?'],
  p_milestone: ['Does he get there this game?'],
  p_vs_starter: ['Who wins this one?'],
  both_unbeaten: ['Who stays perfect?'],
  both_winless: ['Who breaks through?'],
  team_start_unbeaten: ['How long does it last?'],
  team_start_winless: ['When does it turn?'],
  unbeaten_start: ['How long does it last?'],
  win_streak: ['How long does it last?'],
  themed_week: ['Who takes it?'],
  bot_called: ['Would you ride him?'],
  bot_blind_spot: ['What are we missing?'],
})
const DEFAULT_HOOK = [() => 'Worth a look 👀']
const DEFAULT_ASK = ['What do you see, network?']
// a stable small number from a string, so the same fact always gets the same variant
const pick = (arr, key, salt) => { let h = 7; for (const c of `${salt}:${key}`) h = (h * 31 + c.charCodeAt(0)) >>> 0; return arr[h % arr.length] }

// HASHTAGS (2026-10-20, Donovan: "very, very moderate, and used correctly"). At most ONE, and only the real live tag for that sport's
// event that day, typed here by hand (sport:YYYY-MM-DD -> '#Tag') once it is the tag fans are actually using. Empty = no hashtag.
// The checker refuses any hashtag that isn't the one listed for the fact's sport and date.
export const TAGS = Object.freeze({})
export const tagOf = (fact) => fact.tag || TAGS[`${sportKey(fact.sport)}:${fact.date || ''}`] || null

export const hookOf = (fact) => {
  const text = pick(HOOKS[fact.family] || DEFAULT_HOOK, fact.id || fact.family, 'hook')(fact)
  const tag = tagOf(fact)
  return `${fact.icon} ${text}${tag ? ` ${tag}` : ''}`
}
export const askOf = (fact) => pick(ASKS[fact.family] || DEFAULT_ASK, fact.id || fact.family, 'ask')
/** Every ask line there is (the checker knows an ask when it sees one). */
export const ALL_ASKS = Object.freeze([...new Set([...Object.values(ASKS).flat(), ...DEFAULT_ASK])])

/** hook + body + ask, as a post (no source line). `body` is lines (strings). */
export function compose(fact, body) {
  // No 'Source: ...' line on any fact post (Donovan 10-10: 'please don't put sources on there'). `via` stays on the fact record for the audit trail only.
  // LAYOUT (Donovan, 2026-10-16: the lines were stacked with no air): hook line, a blank line, the fact lines together, a blank line,
  // then the 'Next:' line and what follows it, a blank line, the ask. A block longer than four lines is not left solid (Donovan,
  // 2026-10-16, post spacing): the first line stands alone, the last line stands alone, and the lines between them stay together.
  // BLOCKS (2026-10-20, the player posts): a body that marks its blocks (a NUL line, write.js BLOCK) gets exactly those blocks, each
  // set apart by a blank line: hook / the headline and its line / the game and the board rank / the ask
  if (body.includes('\u0000')) {
    const blocks = String(body.join('\n')).split('\u0000').map((b) => b.split('\n').filter(Boolean)).filter((b) => b.length)
    return [hookOf(fact), '', ...blocks.flatMap((b, i) => (i ? ['', ...b] : b)), '', askOf(fact)].join('\n')
  }
  const rows = body.filter(Boolean)
  const at = rows.findIndex((l) => /^Next:/i.test(String(l).trim()))
  const airy = (block) => (block.length > 4 ? [block[0], '', ...block.slice(1, -1), '', block[block.length - 1]] : block)
  const lines = at > 0
    ? [hookOf(fact), '', ...airy(rows.slice(0, at)), '', ...rows.slice(at)]
    : [hookOf(fact), '', ...airy(rows)]
  return [...lines, '', askOf(fact)].join('\n')
}
