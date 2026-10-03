// THE WRITER (BATCH-FACT-ENGINE, 2026-10-02). One fact in, 2-3 drafts out.
// With ANTHROPIC_API_KEY set: Claude (the cheapest model that writes well)
// gets ONE fact as JSON + the house style below, word for word, and may only
// use the fact's names and numbers. Without the key: fixed templates, built
// from the fact's own fields. Either way every draft then goes through
// lib/facts/check.js; the AI never touches a number on its own authority.

export const WRITER_MODEL = 'claude-haiku-4-5-20251001'

// HOUSE STYLE FOR THE WRITER (phrasing audit, Donovan 10-02) -- word for word.
export const HOUSE_STYLE = `The rule: don't try to make the stat exciting. Find what's already interesting about it and give it room to land.
 1. Lead with the interesting part, never "According to our data".
 2. Short lines, so the stat has room to breathe.
 3. Headline -> fact -> proof -> context/close.
 4. Preserve every name, number, date and stated time range exactly.
 5. Never upgrade "since 1999" into "ever", "never", "most" or "only".
 6. Don't explain a stat twice: state it once, then give the evidence.
 7. Specific beats generic hype: "3-0 vs. 3-0" beats "heavyweight bout".
 8. The closing line adds context, never hype or a betting suggestion.
 9. Sound like a reporter who noticed something, not a bot announcing a database result.
10. If the fact isn't interesting without hype, don't manufacture the hype (skip it).
Reference tweet (passed every check):
  Week 4 has an unbeaten matchup.
  KC 3-0. LV 3-0.
  First time since at least 1999 these two meet with both teams unbeaten this late.
  Last meeting: Raiders 14, Chiefs 12 (Jan 4).`

const SYSTEM = `You write short sports posts for X from ONE verified fact (JSON).
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
const TEMPLATES = {
  both_unbeaten: (f) => {
    const [a, b] = f.teams
    const last = f.last && !f.last.tie ? `Last meeting: ${f.last.winner} ${f.last.winnerPts}, ${f.last.loser} ${f.last.loserPts} (${f.last.date}).` : null
    return [lines(
      `Week ${f.week} has an unbeaten matchup.`,
      `${a.name} ${a.record}. ${b.name} ${b.record}.`,
      f.prior === 0 ? `First time since at least ${f.since} these two meet with both teams unbeaten this late.` : null,
      last,
    )]
  },
  both_winless: (f) => {
    const [a, b] = f.teams
    return [lines(
      `Somebody gets off the mark in Week ${f.week}.`,
      `${a.name} ${a.record}. ${b.name} ${b.record}.`,
      f.prior === 0 ? `First time since at least ${f.since} these two meet with both teams winless this late.` : null,
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
      fact.prior === 0 ? `First week since at least ${fact.since} with ${fact.count} of these games.` : null).trim()]
  }
  return t(fact).map((x) => String(x).trim()).filter(Boolean)
}
