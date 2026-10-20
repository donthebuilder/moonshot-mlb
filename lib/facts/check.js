import { ALL_ASKS, tagOf } from './label'
// THE CHECKER (BATCH-FACT-ENGINE). A draft -- the AI's or a template's -- posts
// only if it passes every rule. It may only use the names and numbers in its
// fact; a "first / ever / never / most / only" word only when the fact proved
// it (fact.proves); a fact with a range (fact.since) must state the range.
// A rejected draft is never shown or posted, and the reason is logged.

// Words a sentence can start with or carry that aren't names.
const COMMON = new Set(`A An And As At Both But By Each Even For From Has Have He His In It Its Last Lead Leads Meet Meets
Every Next No Not Of On One Only Or Since So That The Their These They This Those Three Through Two Up Week Weeks When With
Monday Tuesday Wednesday Thursday Friday Saturday Sunday Jan Feb Mar Apr May Jun Jul Aug Sep Sept Oct Nov Dec
January February March April June July August September October November December
First Ever Never Most Record Tonight Today Tomorrow Game Games Season Seasons Start Starts Team Teams Win Wins Loss Losses
Undefeated Unbeaten Winless Straight Back Home Away Road Final Over Under Points Yards Goals Runs Home-run HR TD TDs
NFL MLB NHL NBA AFC NFC AL NL East West North South Central
Market Plays Needs Turns Born Logged Source Against Cleared Plays Next Tonight Today
Who Whos What Which When How Does Do Is Are Would You Our We Network Ride Riding Somebody Steady Happy Birthday Milestone
Still Cat Bird Worth Picks Same With Touchdown Touchdowns Vs Average Him Every Cleared Logged Save List Active Streaks Streak Starters Seen Keeps Clearing Slate Leave Did Off Left`.split(/\s+/))

export const SUPERLATIVES = ['first', 'ever', 'never', 'most', 'only', 'record', 'unprecedented', 'best', 'worst', 'longest', 'all-time', 'history']

const numsIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) || []).map((x) => String(Number(x)))
function factStrings(v, out = []) {
  if (v == null) return out
  if (typeof v === 'string' || typeof v === 'number') { out.push(String(v)); return out }
  if (Array.isArray(v)) { v.forEach((x) => factStrings(x, out)); return out }
  if (typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!['id', 'source', 'why', 'proves', 'family', 'sport', 'score', 'body', 'startMs', 'named', 'pid'].includes(k)) factStrings(x, out) })
  return out
}

/** { ok, why[] } for one draft against its fact. */
export function checkDraft(text, fact, { limit = 280 } = {}) {
  const why = []
  const t = String(text || '').trim()
  if (!t) return { ok: false, why: ['empty'] }
  if (t.length > limit) why.push(`too long (${t.length} > ${limit})`)
  const strings = factStrings(fact)
  const allowedNums = new Set(strings.flatMap(numsIn))
  for (const n of numsIn(t)) if (!allowedNums.has(n)) why.push(`number ${n} is not in the fact`)
  const hay = strings.join(' ').toLowerCase()
  const words = t.match(/\b[A-Z][A-Za-z0-9'.&-]*\b/g) || []
  for (const w of words) {
    const bare = w.replace(/['.]+$/, '').replace(/'s$/, '')
    // a headline in capitals ("11 STRAIGHT GAMES WITH A HIT", 2026-10-20): a common word is common in any case
    const titled = /^[A-Z]{2,}$/.test(bare) ? bare.charAt(0) + bare.slice(1).toLowerCase() : bare
    if (COMMON.has(bare) || COMMON.has(titled) || /^\d/.test(bare)) continue
    if (!hay.includes(bare.toLowerCase())) why.push(`name "${bare}" is not in the fact`)
  }
  const proves = new Set((fact.proves || []).map((x) => x.toLowerCase()))
  for (const s of SUPERLATIVES) {
    if (new RegExp(`\\b${s}\\b`, 'i').test(t) && !proves.has(s)) why.push(`"${s}" is not proved by the fact`)
  }
  if (fact.since && !t.includes(String(fact.since))) why.push(`the range (since ${fact.since}) is not stated`)
  if (/\b(bet|lock|hammer|parlay|odds on|take the over|take the under)\b/i.test(t)) why.push('betting language')
  if (/according to (our|the) data/i.test(t)) why.push('"according to our data"')
  // the voice rules (2026-10-20): no swearing anywhere, and nothing that claims more than the board does
  if (SWEARS.test(t)) why.push('swearing')
  return { ok: why.length === 0, why }
}
export const SWEARS = /\b(fuck\w*|shit\w*|damn\w*|goddamn\w*|bitch\w*|ass|asshole|bastard)\b/i
// fact posts only (checkShape), not the shared write-up checker: "due to injury" is a fine sentence, "he's due" is not
export const OVERCLAIM = /\b(?:(?:is|he's|she's|they're|looks|feels)\s+due\b|due for\b|guaranteed?\b|can'?t miss\b|sure thing\b|chasing\b|gets there first\b)/i

// THE SHAPE of a fact post (X overhaul, 2026-10-09; the voice, 2026-10-20): a HOOK first (the sport icon from the registry, then a
// fan's line), then the fact lines, then an ASK last (a question to the network) -- 4-8 non-blank lines in all. No link, no "@",
// at most two emoji, and at most ONE hashtag, only the one listed for that sport and day (label.js TAGS). Pure. { ok, why[] }.
export const SHAPE = Object.freeze({ minLines: 4, maxLines: 8, maxLine: 80, maxEmoji: 2, maxTags: 1 })
const EMOJI = /\p{Extended_Pictographic}/gu
export function checkShape(text, fact) {
  const why = []
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < SHAPE.minLines || lines.length > SHAPE.maxLines) why.push(`${lines.length} lines (want ${SHAPE.minLines}-${SHAPE.maxLines})`)
  if (fact?.icon && lines.length && !lines[0].startsWith(`${fact.icon} `)) why.push('the first line is not the hook (sport icon first)')
  const last = lines[lines.length - 1] || ''
  if (!(last.endsWith('?') || ALL_ASKS.includes(last))) why.push('the last line is not an ask')
  for (const l of lines) if ([...l].length > SHAPE.maxLine) { why.push(`a line is over ${SHAPE.maxLine} characters`); break }
  if (/https?:|www\.|\.com\b|\.vercel\.app/i.test(text)) why.push('a link')
  if (/@\w/.test(text)) why.push('a mention')
  const tags = String(text || '').match(/#[A-Za-z]\w*/g) || []   // a hashtag starts with a letter on X; "#16 on tonight's board" is a rank
  const allowed = fact ? tagOf(fact) : null
  if (tags.length > SHAPE.maxTags) why.push(`${tags.length} hashtags (max ${SHAPE.maxTags})`)
  else if (tags.length && tags[0] !== allowed) why.push(`hashtag ${tags[0]} is not the listed tag for this sport and day`)
  if (OVERCLAIM.test(String(text || ''))) why.push('claims more than the fact (due / guaranteed / can\'t miss / sure thing / chasing)')
  const emoji = (String(text || '').match(EMOJI) || []).length
  if (emoji > SHAPE.maxEmoji) why.push(`${emoji} emoji (max ${SHAPE.maxEmoji})`)
  return { ok: why.length === 0, why }
}
