#!/usr/bin/env node
// X'S WEIGHTED LENGTH IN THE LAST THREE BUILDERS (batch 3, 2026-10-26; PR #308 moved the rest). lib/dash/postLimit.js xLen counts an emoji or a CJK character as 2; the longshots list, the
// multi-club list and a moment's X text still counted code points ([...t].length / Array.from), so a post of wide characters passed the check and X refused it (a 400 that then costs the slot).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-x-length-everywhere.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
const { xLen } = await import('../lib/dash/postLimit.js')
const { xTextFor, X_LIMIT } = await import('../lib/cards/momentPosting.js')
let n = 0, bad = 0
const t = (name, fn) => { n += 1; try { fn(); console.log(`PASS  ${name}`) } catch (e) { bad += 1; console.log(`FAIL  ${name}\n     ${e.message.split('\n')[0]}`) } }
t('a moment line of 150 wide characters (code points 150, X weight 300) is NOT returned as an X text', () => {
  const wide = 'テ'.repeat(150)   // each counts 2 on X
  assert.ok(xLen(wide) > X_LIMIT && Array.from(wide).length <= X_LIMIT, 'fixture: fits by code points, over by X weight')
  const out = xTextFor(wide, null, [])
  assert.ok(out === null || xLen(out) <= X_LIMIT, `returned a text of X weight ${out && xLen(out)}`)
})
t('the longshots and multi-club fitters count with xLen', () => {
  for (const f of ['lib/dash/longshotsPost.js', 'lib/dash/multiClubPost.js']) {
    const src = fs.readFileSync(f, 'utf8')
    assert.ok(!/\[\.\.\.t\]\.length \+ 4 <= HARD_LIMIT/.test(src), `${f} still counts code points`)
    assert.ok(/xLen\(t\) \+ 4 <= HARD_LIMIT/.test(src), `${f} counts X's weight`)
  }
})
t('the 280 retry of a refused long post keeps its sport (the BUCKETS hidden-sport gate and the sport receipt line read it)', () => {
  const src = fs.readFileSync('lib/dash/xPost.js', 'utf8')
  assert.ok(/return postToX\(plain, \{ replyTo, mediaId, mediaIds, quoteId, poll, kind, sport, link: linkCtx, _retry: true \}\)/.test(src), 'the retry drops sport')
})
console.log(bad ? `\n${bad}/${n} FAILED` : `\ncheck-x-length-everywhere: ${n} checks passed`)
process.exit(bad ? 1 : 0)
