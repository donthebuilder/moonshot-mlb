// NFL SHARE CAPTION (2026-08-24) — the text half of components/nfl/
// shareCard.js's image, built to the SAME pick shape so the two never
// disagree about what happened.
//
// This is deliberately NOT a port of bots/social/captions.py. That module
// calls the Anthropic API to write a caption and is the wrong pattern to
// copy into a "pure function, no API calls" spec — it needs a key, a network
// round trip, and a queue to fall back into when either is unavailable. What
// IS worth carrying over from bots/social is the STYLE the whole pipeline is
// held to (captions.py's own SYSTEM_PROMPT): every fact traces to the object
// you were handed, no hashtag stuffing, no more emoji than the result itself
// earns, and it should read like someone who watched the model, not a fill-
// in-the-blanks template. This function keeps that voice with a plain string
// template instead of a model call — deterministic, offline, and it never
// posts anywhere; it just returns a string for a human to copy or for
// shareCard.js's PNG to sit next to.
//
// Shape of `pick` — identical to shareCard.js's downloadNflPickCard:
//   name, team, opp, position, market, marketLabel, rank, bar,
//   questionable, low_sample, score, hit, actual, void, grade
//
// nflPickCaption(pick) -> string. Never throws on a sparse object; missing
// fields just drop out of the sentence rather than printing "undefined."

function clean(v) {
  if (v === null || v === undefined) return ''
  const s = String(v).trim()
  return s
}

function who(pick) {
  const bits = [clean(pick.position), clean(pick.team)].filter(Boolean).join(' ')
  const opp = clean(pick.opp) ? `vs ${clean(pick.opp)}` : ''
  const tail = [bits, opp].filter(Boolean).join(' ')
  return tail ? `${clean(pick.name) || 'this pick'} (${tail})` : (clean(pick.name) || 'this pick')
}

export function nflPickCaption(pick = {}) {
  const market = clean(pick.marketLabel) || clean(pick.market) || 'the market'
  const graded = pick.hit === true || pick.hit === false || pick.void === true

  if (!graded) {
    const scoreTxt = Number.isFinite(pick.score) ? Math.round(pick.score) : null
    const gradeTxt = clean(pick.grade)
    const rungTxt = pick.rank ? `our #${pick.rank} rung` : 'on the card'
    const scoreBit = scoreTxt != null
      ? ` — ${scoreTxt}${gradeTxt ? ` (${gradeTxt})` : ''}, ${rungTxt} for ${market.toLowerCase()}`
      : ''
    const flag = pick.questionable ? ' Listed Q, worth a lineup check before kickoff.' : ''
    return `🏈 ${market}: ${who(pick)}${scoreBit}.${flag}`.replace(/\s+/g, ' ').trim()
  }

  if (pick.void) {
    return `— ${market}: ${who(pick)} didn't draw a line this week (cut, inactive, or a bye) — void, not a miss.`
  }

  const icon = pick.hit ? '✅' : '❌'
  const verb = pick.hit ? 'hit' : 'missed'
  const barBits = []
  if (Number.isFinite(pick.actual)) barBits.push(`${pick.actual}`)
  if (Number.isFinite(pick.bar)) barBits.push(`bar ${pick.bar}`)
  const line = barBits.length ? ` (${barBits.join(' vs ')})` : ''
  const called = Number.isFinite(pick.score)
    ? ` Called pregame at ${Math.round(pick.score)}${pick.grade ? ` (${pick.grade})` : ''}.`
    : ''
  return `${icon} ${market} ${verb}: ${who(pick)}${line}.${called}`.replace(/\s+/g, ' ').trim()
}

export default nflPickCaption
