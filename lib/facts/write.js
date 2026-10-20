// THE WRITER (BATCH-FACT-ENGINE, 2026-10-02). One fact in, 2-3 drafts out.
// With ANTHROPIC_API_KEY set: Claude (the cheapest model that writes well)
// gets ONE fact as JSON + the house style below, word for word, and may only
// use the fact's names and numbers. Without the key: fixed templates, built
// from the fact's own fields. Either way every draft then goes through
// lib/facts/check.js; the AI never touches a number on its own authority.

import { compose } from './label'
import { POST_WORDS, sportKey } from '../routes'

export const WRITER_MODEL = 'claude-haiku-4-5-20251001'

// HOUSE STYLE FOR THE WRITER (phrasing audit, Donovan 10-02; rules 9, 11, 12 the voice guide, Donovan 10-20).
export const HOUSE_STYLE = `The rule: don't try to make the stat exciting. Find what's already interesting about it and give it room to land.
 1. Lead with the interesting part, never "According to our data".
 2. Short lines, so the stat has room to breathe.
 3. Headline -> fact -> proof -> context/close.
 4. Preserve every name, number, date and stated time range exactly.
 5. Never upgrade "since 1999" into "ever", "never", "most" or "only".
 6. Don't explain a stat twice: state it once, then give the evidence.
 7. Specific beats generic hype: "3-0 vs. 3-0" beats "heavyweight bout".
 8. The closing line adds context, never hype or a betting suggestion.
 9. Sound like an admin with ball knowledge talking to the network, not a bot announcing a database result. We, us, our.
10. If the fact isn't interesting without hype, don't manufacture the hype (skip it).
11. Don't imply more than the fact says: no "due", "chasing", "will", "gets there first". Rare things are said as rare.
12. No swearing.
Reference tweet (passed every check):
  Week 4 has an unbeaten matchup.
  KC 3-0. LV 3-0.
  First time since at least 1999 these two meet with both teams unbeaten this late.
  Last meeting: Raiders 14, Chiefs 12 (Jan 4).`

const SYSTEM = `You write short sports posts for X from ONE verified fact (JSON).
Write the BODY lines only: the opening hook line and the closing question are added by code, so don't write either.
Use ONLY the names, numbers, dates and ranges in the fact. Do not add any other number, name, nickname, stat or claim.
Words like "first", "ever", "never", "most", "only" are allowed only if the fact's "proves" list contains them; if the fact has "since", say "since at least <since>" (never "ever").
No hashtags, no emojis, no betting suggestions. Under 260 characters each.

HOUSE STYLE
${HOUSE_STYLE}

Reply with JSON only: {"drafts": ["...", "...", "..."]} -- or {"drafts": []} if the fact isn't interesting without hype.`

/** Claude's drafts for a fact, or null without a key / on any failure. tokens = { in, out }. */
export async function aiDrafts(fact, { key = process.env.ANTHROPIC_API_KEY } = {}) {
  if (!key) return null
  const { score, why, ...clean } = fact
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: WRITER_MODEL, max_tokens: 600, system: SYSTEM, messages: [{ role: 'user', content: `FACT:\n${JSON.stringify(clean)}\n\nWhy it's interesting: ${why}` }] }),
    })
    if (!r.ok) return { drafts: [], tokens: null, error: `anthropic ${r.status}` }
    const j = await r.json()
    const text = (j.content || []).map((c) => c.text || '').join('')
    const m = text.match(/\{[\s\S]*\}/)
    const drafts = m ? (JSON.parse(m[0]).drafts || []).map(String) : []
    return { drafts: drafts.slice(0, 3), tokens: { in: j.usage?.input_tokens || 0, out: j.usage?.output_tokens || 0 } }
  } catch (e) {
    return { drafts: [], tokens: null, error: String(e?.message || e) }
  }
}

// ── TEMPLATES (no key, or the AI's drafts all failed the checker) ────────────
const lines = (...xs) => xs.filter(Boolean).join('\n')
const cap = (t) => String(t).charAt(0).toUpperCase() + String(t).slice(1)
const nextLine = (f) => (f.opp ? `Next: ${f.opp}${f.when ? `, ${f.when}` : ''}.` : null)

// ── THE PLAYER POST'S LOOK (2026-10-20, Donovan: "make those tweets better looking and better"). Three blocks under the hook:
//   the HEADLINE: the fact in capitals, number first ("11 STRAIGHT GAMES WITH A HIT"), and one plain line under it
//   the GAME: "CLE vs TB · 8:08 PM ET", and his place on tonight's board ("#16 on tonight's MOONSHOT board") when he has one
// then the ask. The blocks are joined by BLOCK (compose keeps them apart with a blank line).
const BLOCK = '\u0000'
const UP = (t) => String(t).toUpperCase()
/** "CLE vs TB · 8:08 PM ET" (an opp that already says "at" / "vs" keeps its word). */
const gameLine = (f) => {
  if (!f.opp) return null
  const opp = String(f.opp).trim()
  const meet = /^(at|vs\.?|@)\s/i.test(opp) ? `${f.team} ${opp}` : `${f.team} vs ${opp}`
  return f.when ? `${meet} · ${f.when}` : meet
}
/** "#16 on tonight's MOONSHOT board" (NFL: this week's); none when the slate has no rank for him. */
const boardLine = (f) => (f.rank != null && f.brand ? `#${f.rank} on ${POST_WORDS[sportKey(f.sport)]?.slate || "tonight's"} ${f.brand} board` : null)
const listValue = (f, r) => (f.shape === 'streak' ? `${r.n} straight` : f.shape === 'bar' ? `${r.cleared} of last ${r.of}` : f.shape === 'h2h' ? `${r.hits} for ${r.ab}${r.hr ? `, ${r.hr} HR` : ''} vs ${r.pitcher}` : '')
const listRow = (f, r, withRank = true) => {
  const head = `${r.pos}. ${r.name} (${r.team}) · ${listValue(f, r)}`
  const full = withRank && r.rank != null ? `${head} · board #${r.rank}` : head
  return [...full].length <= 80 ? full : head
}
// a stable one-in-three, by the list's id (the same list always reads the same)
const saveLine = (f) => { let h = 7; for (const c of String(f.id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 3 === 0 ? 'Save this for tonight \u{1F516}' : null }
const playerPost = (f, head, ...under) => [lines(head, ...under), BLOCK, lines(gameLine(f), boardLine(f))].join('\n')
const TEMPLATES = {
  both_unbeaten: (f) => {
    const [a, b] = f.teams
    const last = f.last && !f.last.tie ? `Last meeting: ${f.last.winner} ${f.last.winnerPts}, ${f.last.loser} ${f.last.loserPts} (${f.last.date}).` : null
    return [lines(
      `Week ${f.week} has an unbeaten matchup.`,
      `${a.name} ${a.record}. ${b.name} ${b.record}.`,
      // two lines: one line was 82 characters and the shape caps lines at 80, so this template could never post (found 2026-10-20)
      f.prior === 0 ? `First time since at least ${f.since} these two meet` : null,
      f.prior === 0 ? 'with both teams unbeaten this late.' : null,
      last,
    )]
  },
  both_winless: (f) => {
    const [a, b] = f.teams
    return [lines(
      `Week ${f.week} has a winless matchup.`,
      `${a.name} ${a.record}. ${b.name} ${b.record}.`,
      f.prior === 0 ? `First time since at least ${f.since} these two meet` : null,
      f.prior === 0 ? 'with both teams winless this late.' : null,
    )]
  },
  team_start_unbeaten: (f) => {
    const t = f.teams[0]
    return [f.running >= 2
      ? lines(`The ${t.name} are ${t.record} again.`, `${f.running} seasons running now.`, `Every ${t.record} start since ${f.since}: ${f.seasons.join(', ')}.`)
      : lines(`The ${t.name} are ${t.record}.`, `Their ${t.record} starts since ${f.since}: ${f.seasons.join(', ')}.`)]
  },
  team_start_winless: (f) => {
    const t = f.teams[0]
    return [f.running >= 2
      ? lines(`The ${t.name} are ${t.record}.`, `${f.running} seasons running.`, `Their ${t.record} starts since ${f.since}: ${f.seasons.join(', ')}.`)
      : lines(`The ${t.name} are ${t.record}.`, `Their ${t.record} starts since ${f.since}: ${f.seasons.join(', ')}.`)]
  },
  themed_week: (f) => [lines(
    f.theme === 'cats' ? `The cat teams all play each other this week.` : `The bird teams all play each other this week.`,
    ...f.games.map((g) => `${g.away} at ${g.home}.`),
    f.prior === 0 ? `First week since at least ${f.since} with ${f.count} of these games.` : null,
  )],
  win_streak: (f) => {
    const t = f.teams[0]
    return [lines(`The ${t.name} have won ${f.streak} straight.`, `${t.record} on the season.`, f.opp ? `Next: ${f.opp} ${f.when || ''}`.trim() : null)]
  },
  bot_called: (f) => [lines(
    `${f.player} when ${f.brand} calls him: ${f.called.g} games, homered in ${f.called.hrG} (${f.called.hr} HR).`,
    f.not.g ? `When it doesn't: ${f.not.g} games, homered in ${f.not.hrG}.` : null,
    `${f.basis}, since ${f.since}.`,
  )],
  bot_blind_spot: (f) => [lines(
    `${f.player} hasn't been a ${f.brand} call since ${f.since}.`,
    `${f.not.g} games, homered in ${f.not.hrG} (${f.not.hr} HR).`,
    `${f.basis}.`,
  )],
  // ── PLAYER FACTS (lib/facts/players.js). Every figure is a field on the fact; nothing is worked out here.
  // the player and his team are in the HOOK (label.js HOOKS), so the body doesn't name him a second time
  // (2026-10-20: the headline / game layout above; the old "Market: home run." and "Born Oct 9, 1999." lines are gone)
  p_streak: (f) => [playerPost(f, `${f.n} STRAIGHT GAMES WITH ${UP(f.what)}`)],
  // (no "%" on a fact post: a percent reads as a chance -- scripts/check-facts-engine.mjs BAD; "8 of his last 10" says it)
  p_form: (f) => [playerPost(f, `${UP(f.bar)} IN ${f.cleared} OF HIS LAST ${f.of}`, f.cleared === f.of ? 'Every one of them.' : null)],
  p_birthday: (f) => [playerPost(f, `TURNS ${f.age} TODAY`)],
  p_vs_team: (f) => [playerPost(f, `${f.tds} ${f.tds === 1 ? 'TOUCHDOWN' : 'TOUCHDOWNS'} IN ${f.meetings} GAMES VS ${UP(f.opp)}`, `In his logged games since ${f.since}.`)],
  p_milestone: (f) => [playerPost(f, `${f.gap} AWAY FROM ${f.next} ${UP(f.stat)}`,
    f.games ? `${f.have} in ${f.games} games this season${f.perGame != null ? `, ${f.perGame} a game` : ''}.` : null)],
  p_vs_starter: (f) => [playerPost(f, `${f.hits} FOR ${f.ab} VS ${UP(f.pitcher)}`,
    f.avg ? `${f.hr ? `${f.hr} HR and a` : 'A'} ${f.avg} average against him.` : null)],
  // THE LIST (2026-10-20): the ranked rows, his number first, then his place on our board; about one list in three says
  // "Save this for tonight" (claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: lists get bookmarked). Rows that would run past 80
  // characters drop the board rank, never the man.
  // Several drafts, richest first (writeChecked takes the first that passes, the length check included): all rows with the
  // board rank, all rows without it, then one row fewer at a time down to the list's floor.
  p_list: (f) => {
    const out = []
    for (let k = f.rows.length; k >= 3; k -= 1) {
      // always marked as blocks, so compose keeps the ranked rows together (a list is one block, never split for air)
      for (const withRank of [true, false]) out.push([lines(...f.rows.slice(0, k).map((r) => listRow(f, r, withRank))), saveLine(f) || ''].join(`\n${BLOCK}\n`))
    }
    return [...new Set(out)]
  },
  unbeaten_start: (f) => {
    const t = f.teams[0]
    return [lines(`The ${t.name} are ${t.record} to start.`, f.opp ? `Next: ${f.opp} ${f.when || ''}`.trim() : null)]
  },
}
// "The cat teams all play each other" is only true when every member does
export function templateDrafts(fact) {
  const t = TEMPLATES[fact.family]
  if (!t) return []
  if (fact.family === 'themed_week' && fact.games.length * 2 !== fact.members) {
    return [lines(`${fact.count} ${fact.theme === 'cats' ? 'cat-vs-cat' : 'bird-vs-bird'} games this week.`, ...fact.games.map((g) => `${g.away} at ${g.home}.`),
      fact.prior === 0 ? `First week since at least ${fact.since} with ${fact.count} of these games.` : null).trim()].map((x) => compose(fact, x.split('\n')))
  }
  return t(fact).map((x) => String(x).trim()).filter(Boolean).map((x) => compose(fact, x.split('\n')))
}
