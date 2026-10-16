// ONE TWEET-SPACING NORMALISER (pure, no deps). Every text that goes to X passes through
// postToX, and postToX calls this, so no builder can ship ragged spacing.
//
// What it does (and only this): CRLF -> LF; trailing and leading spaces off every line; runs of
// spaces/tabs inside a line -> one space; no space before , . ! ? : ; (when the mark ends a word
// group -- ' .300' and '...' are left alone, an ellipsis keeps its space, and a mark after a URL is left alone so the
// link is never altered); 3+ newlines -> one blank line; no leading or trailing
// blank lines. It only ever REMOVES characters, so a post that fit X's limit still fits (X's
// weighted count, lib/posts/slate.js xLen, never goes up). URLs, @handles and #hashtags are
// never edited. Text inside a ``` fence is left exactly as written (Discord plain text).
const SP = '[ \\t\\u00a0\\u2000-\\u200a\\u202f\\u3000]'
const TRAIL = new RegExp(`${SP}+$`)
const LEAD = new RegExp(`^${SP}+`)
const RUN = new RegExp(`${SP}{2,}`, 'g')
const PROTECTED = /^(?:https?:\/\/|www\.)\S*$/i

function tidyLine(line) {
  let s = line.replace(TRAIL, '').replace(LEAD, '').replace(RUN, ' ')
  // a space before , . ! ? : ; that is followed by a space or the end of the line
  s = s.replace(new RegExp(`(\\S)${SP}+([,;:]+|[!?]+|\\.)(?=${SP}|$)`, 'g'), (m, before, mark, offset) => {
    const head = s.slice(0, offset + 1)
    const prev = head.slice(head.search(/\S+$/))
    return PROTECTED.test(prev) ? m : before + mark
  })
  return s
}

/** Clean one post's spacing. Idempotent. Non-strings come back as ''. */
export function normalizeTweet(raw) {
  const text = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n')
  if (text.includes('```')) return text.replace(/^\n+|\s+$/g, '')   // a code fence is alignment on purpose: only the ends are tidied
  const lines = text.split('\n').map(tidyLine)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

export default normalizeTweet
