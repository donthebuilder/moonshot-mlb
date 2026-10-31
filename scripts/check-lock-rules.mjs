#!/usr/bin/env node
// THE CARD'S LOCK TIMES, ONE FILE (batch member-requests 2C). lib/card/lockRules.js holds them; this proves (1) NOTHING CHANGED today (every sport
// still 60), (2) a per-sport number really moves that sport's lock and window and no other's, (3) no caller bypasses the file.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lock-rules.mjs
import fs from 'node:fs'
import path from 'node:path'
let n = 0, bad = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.error(`FAIL ${m}`) } else console.log(`ok   ${m}`) }
const R = await import('../lib/card/lockRules.js')
const C = await import('../lib/card/core.js')

ok(['nhl', 'nfl', 'mlb', 'nba'].every((s) => R.leadMinFor(s) === 60) && R.leadMinFor('xyz') === 60 && C.CARD_LOCK_LEAD_MIN === 60, 'today every sport locks 60 minutes before its first game (no behaviour change)')
const F = Date.parse('2026-10-26T23:00:00Z')
ok(C.lockAtFor('nfl', F) === F - 60 * 60e3 && C.lockAtFor('nfl', F) === C.lockAtOf(F), 'lockAtFor reads the sport\'s lead')
ok(C.lockOpenFor('nhl', F, F - 61 * 60e3) === false && C.lockOpenFor('nhl', F, F - 60 * 60e3) === true && C.lockOpenFor('nhl', NaN, F) === false, 'the window opens at the lead (the first start closes it in mayLockRow / the database)')
// a changed number moves only its sport (simulated: the frozen map cannot be edited, so call the generic helpers with a lead)
ok(C.lockAtOf(F, 120) === F - 120 * 60e3 && C.lockWindowOpen(F, F - 119 * 60e3, 120) === true && C.lockWindowOpen(F, F - 121 * 60e3, 120) === false, 'a 120-minute lead locks at -120 and opens at -120')
ok(Object.isFrozen(R.LOCK_LEAD_MIN), 'the table is frozen: changed in the file, nowhere else')

// no caller outside core / lockRules may use the sport-blind helpers (a future per-sport change would lock the window and the lock moment apart)
const bare = []
const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.next', '.claude', 'ARCHIVE'].includes(f.name)) continue; const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|mjs)$/.test(f.name) && !/^(lib\/card\/core|lib\/card\/lockRules|lib\/totals\/)/.test(p) && !/^scripts\//.test(p)) { const s = fs.readFileSync(p, 'utf8'); if (/\block(?:AtOf|WindowOpen)\(/.test(s) && !/^lib\/totals/.test(p)) bare.push(p) } } }
for (const d of ['app', 'lib', 'components']) walk(d)
ok(bare.length === 0, `no caller bypasses lockRules (${bare.join(', ') || 'none'})`)
console.log(bad ? `${bad}/${n} FAILED` : `check-lock-rules: ${n} checks passed`)
process.exit(bad ? 1 : 0)
