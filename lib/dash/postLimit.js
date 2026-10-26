// ONE CHARACTER BUDGET FOR EVERY CALLED IT POST (2026-09-18).
//
// Donovan, after the first 824-character post went out and X accepted it:
// "fix all the tweet so the post longer tweets".
//
// Until now the number 270 was written down in seven places across three
// files -- fits270() and the hot-stretch guard in tweetFeed.js, three `fits`
// closures plus a `const LIMIT` in homerFeed.js -- so "make the posts longer"
// meant finding all seven. Now it is one function, and the env var that moves
// it is the SAME one xPost.js reads before sending, so the builder and the
// sender can never disagree about how long a post is allowed to be.
//
// WHY 280 AND WHY THE MARGIN. X's free limit is 280 characters. Every builder
// here appends a tail (the site/handle line) after it has already decided what
// fits, so the budget holds back TAIL_MARGIN characters rather than filling to
// the ceiling and overflowing on the last line.
//
// X_TEXT_LIMIT is the one dial. Unset (or <= 280) and everything behaves
// exactly as it did before this file existed: 270. Set it to 900 and every
// post fills to 890 instead, dropping fewer names off the bottom. It cannot be
// set BELOW 280 -- a typo there would quietly gut every post on the account,
// and there is no reason to want shorter than X's own limit.
//
// SAFE TO RAISE. postToX retries once trimmed to 280 if X refuses an
// over-length post, so a wrong guess about the account's tier costs a shorter
// post, never a missing one.
export const HARD_LIMIT = 280
export const TAIL_MARGIN = 10

export function postLimit() {
  const n = Number(process.env.X_TEXT_LIMIT)
  const ceiling = Number.isFinite(n) && n > HARD_LIMIT ? n : HARD_LIMIT
  return ceiling - TAIL_MARGIN
}

/** X's weighted length: most of the Latin and punctuation range counts 1, emoji and arrows count 2. One rule for every builder AND the sender
 *  (2026-10-26: the Card posts, Longshot Tuesday and the sender's trim counted characters, so an emoji-heavy post could run past X's 280). */
export function xLen(text) {
  let n = 0
  for (const ch of String(text == null ? '' : text)) {
    const c = ch.codePointAt(0)
    n += (c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2
  }
  return n
}
