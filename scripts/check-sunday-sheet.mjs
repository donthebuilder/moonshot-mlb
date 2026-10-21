// THE SUNDAY SHEET, CHECKED (2026-10-20). lib/posts/sundaySheet.js: the timing, the post from the card's own model, the retitled card model,
// the poster on a fake database, and the TUDDY ranked loader's one-day filter (lib/cards/shareData.js nflRanked `date`). TEST data only.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-sunday-sheet.mjs
import * as S from '../lib/posts/sundaySheet.js'
import { xLen } from '../lib/posts/slate.js'
import { SWEARS, OVERCLAIM } from '../lib/facts/check.js'
import { receiptLineFor } from '../lib/posts/receiptLine.js'
import { kindInfo } from '../lib/dash/xSchedule.js'
import { tierOf } from '../lib/dash/xPolicy.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const SUN = '2026-10-25'
const row = (rank, status, score) => ({ id: `T${rank}`, rank, name: `Test Back ${rank}`, team: 'TST', where: 'vs EXA', status, score })
const model = { kicker: 'RANKINGS · ANYTIME TD', dayWord: 'Week 7', lead: row(1, 'called', 78.7), rows: [row(2, 'called', 74.7), row(3, 'called', 72.7), row(4, 'board', 66.6), row(5, 'board', 65.1)], more: 200 }

// 1. timing: Sunday from 7:30 AM Phoenix
ok(S.sheetDue({ dow: 0, min: 7 * 60 + 30 }) && !S.sheetDue({ dow: 0, min: 7 * 60 + 29 }) && !S.sheetDue({ dow: 6, min: 9 * 60 }), 'due Sunday from 7:30 AM Phoenix')

// 2. the post: the card's names in the card's order, CALLED block then ON THE BOARD block, "+N more ranked", the ask
const t = S.sheetText({ model, week: '7', limit: 890 })
const lines = t.split('\n')
ok(lines[0] === '\u{1F3C8} THE SUNDAY SHEET · WEEK 7', `head: ${lines[0]}`)
ok(t.indexOf('CALLED\n1. Test Back 1 (TST vs EXA) · 79') > 0 && t.indexOf('ON THE BOARD\n4. Test Back 4 (TST vs EXA) · 67') > t.indexOf('3. Test Back 3'), `blocks in order:\n${t}`)
ok(/\+200 more ranked/.test(t) && !/more on the board/.test(t), '"more ranked" (the rest include men not on the board)')
ok(lines[lines.length - 1] === "Who's scoring first, network?", 'the ask last')
const t280 = S.sheetText({ model, week: '7', limit: 280 })
ok(t280 && xLen(t280) <= 280 && t280.includes('Test Back 1'), `fits 280 (${xLen(t280)})`)
ok(!/https?:|#[A-Za-z]|%/.test(t) && !SWEARS.test(t) && !OVERCLAIM.test(t), 'no link, hashtag, percent, swear or overclaim')
ok(S.sheetText({ model: { lead: row(1, 'called', 70), rows: [row(2, 'called', 60)] }, week: '7' }) === '', 'fewer than three names: no post')

// 3. the card model: retitled, the day in the footer, the names untouched
const m2 = S.sheetModel(model, '7', SUN)
ok(m2.kicker === 'THE SUNDAY SHEET · ANYTIME TD' && m2.right === 'WEEK 7' && m2.dayWord === 'Sunday, Oct 25' && m2.lead === model.lead && m2.rows === model.rows, 'the card model is the rankings model, retitled')

// 4. the kind: slate group (it names our calls: the receipt line), event-driven, slate tier, sport nfl
ok(kindInfo('sunday_sheet')?.mode === 'event' && kindInfo('sunday_sheet')?.group === 'slate' && kindInfo('sunday_sheet')?.sport === 'nfl' && tierOf('sunday_sheet') === 'slate', 'sunday_sheet: event, slate, nfl')
ok(receiptLineFor('sunday_sheet', { text: t }) === 'Locked before kickoff. Graded against exactly that.', 'it ends on the NFL receipt line')

// 5. the poster on a fake database (no X keys): one post, the picture recorded; a failed load posts nothing
const store = []
const db = { from: () => {
  const st = {}
  const api = {
    select: () => api, match: (m) => { Object.assign(st, m); return api },
    maybeSingle: async () => ({ data: store.find((x) => x.day === st.day && x.kind === st.kind) || null, error: null }),
    upsert: (rows) => { const fresh = rows.filter((x) => !store.some((y) => y.day === x.day && y.kind === x.kind)); store.push(...fresh.map((x) => ({ ...x }))); return { select: async () => ({ data: fresh, error: null }) } },
    update: (patch) => ({ match: async (m) => { const r = store.find((x) => x.day === m.day && x.kind === m.kind); if (r) Object.assign(r, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }),
  }
  return api
} }
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN']) delete process.env[k]
S._resetSheetForTests()
const clock = { day: SUN, dow: 0, min: 8 * 60 }
let drawn = null
ok(/^none/.test(await S.postSheetOnce(db, { day: SUN, clock, load: async () => ({ ok: false, why: 'no week file' }), draw: async () => null })), 'no board: nothing posts')
S._resetSheetForTests()
const r1 = await S.postSheetOnce(db, { day: SUN, clock, load: async () => ({ ok: true, model }), draw: async (kind, m) => { drawn = { kind, m }; return Buffer.from('PNG') } })
ok(/^posted/.test(r1) && drawn?.kind === 'ranked' && drawn.m.kicker === 'THE SUNDAY SHEET · ANYTIME TD', `posts with the retitled card (${r1})`)
ok(store.find((x) => x.kind === 'sunday_sheet')?.payload?.picture === true && store[0].payload.names.length === 5, 'the row records the names and the picture')
ok(await S.postSheetOnce(db, { day: SUN, clock, load: async () => ({ ok: true, model }), draw: async () => null }) === 'already-posted', 'once')

// 6. the loader's one-day filter and the wiring
const fs = await import('node:fs')
const sd = fs.readFileSync(new URL('../lib/cards/shareData.js', import.meta.url), 'utf8')
ok(/async function nflRanked\(\{ ids = null, market = 'TD', date = null, now \}\)/.test(sd) && /easternDate\(Date\.parse\(k\)\) === date && Date\.parse\(k\) > now/.test(sd), 'nflRanked keeps one ET day of games that have not started, only when asked')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
ok(/if \(sheetDue\(clock\)\) out\.sunday_sheet = await postSheetOnce\(db, \{ day: clock\.day, clock, hooks: feedHooks\('nfl'\) \}\)/.test(route), 'tried from the receipt step, the TUDDY free channel')
const sql = fs.readFileSync(new URL('../supabase/migrations/202610202300_sunday_sheet_kind.sql', import.meta.url), 'utf8')
ok(sql.includes("''sunday_sheet''") && /\) not valid'/.test(sql), 'the kind migration allows sunday_sheet, NOT VALID')

console.log(bad ? `${bad}/${n} FAILED` : `check-sunday-sheet: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
