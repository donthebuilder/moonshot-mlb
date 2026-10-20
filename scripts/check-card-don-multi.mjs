// HIS LANE: UP TO 3 POSTS A DAY PER SPORT (2026-10-12, Donovan: "give me 3 post max, ranging from straight to 6man"; "2 yes" = a 2-leg N-man).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-card-don-multi.mjs
// ALL DATA IS TEST DATA: players are "Test ...", every webhook / key is a TEST placeholder, fetch is replaced (nothing is sent), the card renderers are stubs, the
// homer_feed_posts table is an in-memory fake that holds the (day, kind) key and, when asked, the kind check BEFORE the migration.
//   A  three entries post, each its own claim (card_don_<sport>_<key>), its own text, its own card; oldest saved first
//   B  a 4th entry is not posted (over-cap), whatever its product; entries beyond the cap leave the first three alone
//   C  two ticks never double-post; an X refusal keeps the claim (no loop)
//   D  the Two-Man the day's card post already named is not posted again; the others still are
//   E  BEFORE the SQL: one post a day and sport under the old kind, the rest skipped with a log line, not rebuilt every tick; AFTER it: nothing is posted twice
//   F  policy: every suffixed kind is tagged (KIND_TAGS), write-up tier like the card post, counted by the cap (not exempt), never suppressed by the repeat guard, sport read from it
//   G  a 2-leg N-man: the form's rules, the row, the title, the post, the table (2..6), and it is never counted as a Two-Man
//   I  (202610121800) his straights and more than one N-man: the row, the table before / after the mix migration, public from lock, LATE never public, the records apart, the posts per slot
//   H  the migration: one idempotent NOT VALID extension, byte-identical plain .txt; the admin form says "Posts today" and "3 posts max a day"
import './_no-injury-net.mjs'
import { readFileSync, existsSync } from 'node:fs'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

const calls = []
globalThis.fetch = async (url, init = {}) => {
  const u = String(url)
  calls.push({ url: u, body: init.body, method: init.method })
  if (u.includes('api.x.com/2/media/upload')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: 'm-1' } }) }
  if (u.includes('api.x.com')) return { ok: true, status: 200, statusText: 'OK', headers: { get: () => null }, json: async () => ({ data: { id: `t-${calls.length}` } }) }
  return { ok: true, status: 204, statusText: 'No Content', headers: { get: () => null }, json: async () => ({}) }
}
const FREE = 'https://discord.com/api/webhooks/2001/TEST-TOKEN'
const XENV = { X_API_KEY: 'k', X_API_SECRET: 's', X_ACCESS_TOKEN: 't', X_ACCESS_SECRET: 'a', X_SCHEDULE_OFF: 'on', X_GUARDS_OFF: 'repeat,naming,cap' }
const setEnv = (extra = {}) => {
  for (const k of Object.keys(process.env)) if (/^DISCORD_|^X_|POST_KINDS_ON|SLAB_CARD_OFF|DUAL_CARD_OFF|CARD_POSTS_PAUSE|SUPABASE/.test(k)) delete process.env[k]
  Object.assign(process.env, { DISCORD_HOMER_WEBHOOK: FREE, DISCORD_NHL_WEBHOOKS: FREE, ...extra })
}
const tweets = () => calls.filter((c) => c.url.endsWith('/2/tweets')).map((c) => JSON.parse(c.body))

const POST = await import('../lib/card/post.js')
const { _resetTakenForTests: resetTaken } = await import('../lib/dash/postClaim.js')
const XS = await import('../lib/dash/xSchedule.js'); const XP = await import('../lib/dash/xPolicy.js')
const CORE = await import('../lib/card/core.js')
const NOW = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const DAY = '2026-10-12'
const START = NOW + 2 * 3600e3

// an in-memory homer_feed_posts: select by (day, kind), insert-or-ignore, update; `deny` = a regexp the kind check refuses (the SQL not run yet)
function postsDb({ seed = [], deny = null } = {}) {
  const rowsT = [...seed]
  const bad = (k) => deny && deny.test(k)
  const t = {
    select: () => ({ match: (m) => ({ maybeSingle: async () => ({ data: rowsT.find((r) => r.day === m.day && r.kind === m.kind) || null }) }), eq: () => t.select(), in: () => t.select(), order: () => t.select(), limit: async () => ({ data: [] }) }),
    upsert: (r) => ({ select: async () => {
      if (r.some((x) => bad(x.kind))) return { data: null, error: { message: 'new row for relation "homer_feed_posts" violates check constraint "homer_feed_posts_kind_check"' } }
      const out = []; for (const x of r) if (!rowsT.some((q) => q.day === x.day && q.kind === x.kind)) { rowsT.push({ ...x }); out.push({ day: x.day }) }
      return { data: out, error: null } } }),
    update: (patch) => ({ match: async (m) => { const q = rowsT.find((r) => r.day === m.day && r.kind === m.kind); if (q) Object.assign(q, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }), insert: async () => ({ error: null }),
  }
  return { rowsT, db: { from: () => t } }
}
const leg = (id, name, o = {}) => ({ player_id: id, name, team: 'TST', opp: 'OPP', game_id: '1', game_date: DAY, start_at: iso(START), status: 'called', ...o })
const row = (id, product, legs, o = {}) => ({ id, lane: 'donovan', product, slot: 1, legs, leg_count: legs.length, locks_at: iso(NOW - 5 * 60e3), start_at: iso(START), note: `Note for ${product} ${id}.`, ...o })
const SOLO = row(2, 'straight', [leg('S1', 'Test Solo')])
const TWO = row(3, 'two_man', [leg('T1', 'Test Twin One'), leg('T2', 'Test Twin Two')])
const NMAN = row(1, 'n_man', [leg('N1', 'Test Nine'), leg('N2', 'Test Ten'), leg('N3', 'Test Eleven')])
const problems = new Map(['S1', 'T1', 'T2', 'N1', 'N2', 'N3', 'X1'].map((id) => [id, null]))
const asked = { dual: 0, nman: 0, front: [] }
const stubs = {
  dual: async () => { asked.dual += 1; return Buffer.from('PNG-dual') },
  image: async () => { asked.nman += 1; return Buffer.from('PNG-nman') },
  front: async ({ id }) => { asked.front.push(id); return Buffer.from(`PNG-front-${id}`) },
  problems,
}
const cardPosted = (ids = ['P1']) => ({ day: DAY, kind: 'card_nhl', payload: { picks: ids.map((id) => ({ player_id: id })) } })
const fresh = () => { setEnv(XENV); calls.length = 0; resetTaken(); POST._resetDonovanBlocksForTests(); asked.dual = 0; asked.nman = 0; asked.front.length = 0 }
const quiet = async (f) => { const ce = console.error; const errs = []; console.error = (...a) => errs.push(a.join(' ')); try { return [await f(), errs] } finally { console.error = ce } }
const kindsOf = (s) => s.rowsT.map((r) => r.kind).sort()

// ── A. three entries post, each its own claim ──
{
  fresh()
  const s = postsDb({ seed: [cardPosted()] })
  const r = await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN], now: NOW, ...stubs })
  check(/^posted/.test(r.n_man_1) && /^posted/.test(r.straight_1) && /^posted/.test(r.two_man), `A: his three entries all post (${JSON.stringify(r)})`)
  check(JSON.stringify(kindsOf(s)) === JSON.stringify(['card_nhl', 'card_don_nhl_n_man_1', 'card_don_nhl_straight_1', 'card_don_nhl_two_man'].sort()), `A: one claim row each, under the suffixed kinds (${kindsOf(s).join(', ')})`)
  const tw = tweets()
  check(tw.length === 3 && tw.every((x) => !/https?:\/\//.test(x.text) && !/\block|\bdue\b|guarantee|nuke/i.test(x.text)), 'A: three X posts, none with a link or a lock / due / guaranteed word')
  const by = (name) => tw.find((x) => x.text.includes(name))
  const sol = by('Test Solo'); const tm = by('Test Twin One'); const nm = by('Test Nine')
  check(sol && !sol.text.includes('Test Twin') && !sol.text.includes('Test Nine') && sol.text.includes('Straight:') && sol.text.includes('Note for straight 2.'), 'A: the straight post names only the straight, with its own note')
  check(tm && !tm.text.includes('Test Solo') && !tm.text.includes('Test Nine') && tm.text.includes('Test Twin Two') && tm.text.includes('Note for two_man 3.'), 'A: the Two-Man post names only the Two-Man (both men), with its own note')
  check(nm && !nm.text.includes('Test Solo') && !nm.text.includes('Twin') && nm.text.includes("ADMIN'S 3-MAN") && nm.text.includes('Test Eleven') && nm.text.includes('Note for n_man 1.'), 'A: the N-man post names only the N-man, "ADMIN\'S 3-MAN", with its own note')
  check(tw.every((x) => x.media?.media_ids?.length === 1), 'A: each post carries its own card')
  check(asked.front.join() === 'S1' && asked.dual === 1 && asked.nman === 1, `A: the straight\'s front card for HIS man only, one dual card, one N-man card (front ${asked.front.join()}, dual ${asked.dual}, nman ${asked.nman})`)
  const order = tw.map((x) => (x.text.includes('Test Nine') ? 'n' : x.text.includes('Test Solo') ? 's' : 't')).join('')
  check(order === 'nst', `A: oldest saved first (ids 1, 2, 3 = N-man, straight, Two-Man): ${order}`)
  check(s.rowsT.filter((x) => /^card_don_/.test(x.kind)).every((x) => x.x_post_id && x.payload.don_key), 'A: every claim row records its X post and which entry it was')
}

// ── B. the 4th is not posted ──
{
  fresh()
  const fourth = row(4, 'straight', [leg('X1', 'Test Fourth')], { slot: 2 })
  const s = postsDb({ seed: [cardPosted()] })
  const r = await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN, fourth], now: NOW, ...stubs })
  check(/^over-cap \(3 posts max a day/.test(r.straight_2) && tweets().length === 3 && !tweets().some((x) => x.text.includes('Test Fourth')) && !kindsOf(s).includes('card_don_nhl_straight_2'), `B: a 4th entry is not posted and holds no claim (${r.straight_2})`)
  // a 4th that was saved FIRST in time but is a different product does not matter: the cap is by save order, so the newest is the one left out
  fresh()
  const s2 = postsDb({ seed: [cardPosted()] })
  const r2 = await POST.postDonovanEntries(s2.db, { sport: 'nhl', day: DAY, rows: [row(9, 'straight', [leg('X1', 'Test Newest')], { slot: 2 }), TWO, SOLO, NMAN], now: NOW, ...stubs })
  check(/^over-cap/.test(r2.straight_2) && /^posted/.test(r2.n_man_1) && /^posted/.test(r2.straight_1) && /^posted/.test(r2.two_man), 'B: the newest saved is the one left out; the first three keep their posts')
  // two ticks, 4 entries: still 3
  const r3 = await POST.postDonovanEntries(s2.db, { sport: 'nhl', day: DAY, rows: [row(9, 'straight', [leg('X1', 'Test Newest')], { slot: 2 }), TWO, SOLO, NMAN], now: NOW + 600e3, ...stubs })
  check(tweets().length === 3 && Object.values(r3).filter((v) => v === 'already-posted').length === 3, 'B: the next tick posts nothing more')
  // a LATE row and a row of the bot are never in the list
  check(POST.donovanEntries([{ ...TWO, lane: 'donovan_late' }, { ...TWO, lane: 'bot' }, { ...SOLO, product: 'long_shot' }]).length === 0, 'B: LATE rows, the bot\'s rows and other products are never his entries')
}

// ── C. two ticks / an X refusal ──
{
  fresh()
  const s = postsDb({ seed: [cardPosted()] })
  await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN], now: NOW, ...stubs })
  const n1 = calls.length
  const r2 = await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN], now: NOW + 600e3, ...stubs })
  check(calls.length === n1 && Object.values(r2).every((v) => v === 'already-posted'), 'C: a second tick sends nothing (claimed once per entry)')
  // two ticks racing: both read the table before either claims -> the (day, kind) key lets exactly one through
  fresh()
  const s2 = postsDb({ seed: [cardPosted()] })
  await Promise.all([1, 2].map(() => POST.postDonovanEntries(s2.db, { sport: 'nhl', day: DAY, rows: [NMAN], now: NOW, ...stubs })))
  check(tweets().length === 1, `C: two ticks at once post the entry once (${tweets().length})`)
  // X refuses: the claim stays, the channel still got it, no retry on the next tick
  fresh()
  const real = globalThis.fetch
  globalThis.fetch = async (url, init) => (String(url).endsWith('/2/tweets') ? (calls.push({ url: String(url), body: init?.body, method: init?.method }), { ok: false, status: 403, statusText: 'Forbidden', headers: { get: () => null }, json: async () => ({ title: 'nope' }) }) : real(url, init))
  const s3 = postsDb({ seed: [cardPosted()] })
  const [r3] = await quiet(() => POST.postDonovanEntries(s3.db, { sport: 'nhl', day: DAY, rows: [SOLO, NMAN], now: NOW, ...stubs }))
  const n3 = calls.filter((c) => c.url.endsWith('/2/tweets')).length
  const [r3b] = await quiet(() => POST.postDonovanEntries(s3.db, { sport: 'nhl', day: DAY, rows: [SOLO, NMAN], now: NOW + 600e3, ...stubs }))
  globalThis.fetch = real
  check(/^posted/.test(r3.n_man_1) && n3 === 2 && calls.filter((c) => c.url.endsWith('/2/tweets')).length === 2 && r3b.n_man_1 === 'already-posted' && r3b.straight_1 === 'already-posted', 'C: an X refusal keeps each claim: one attempt per entry, never a loop')
  // not before the lock, not after a start, not a started game, paused
  fresh()
  const s4 = postsDb({ seed: [cardPosted()] })
  const r4 = await POST.postDonovanEntries(s4.db, { sport: 'nhl', day: DAY, rows: [{ ...SOLO, locks_at: iso(NOW + 600e3) }, { ...NMAN, start_at: iso(NOW - 1000) }], now: NOW, ...stubs })
  check(r4.straight_1 === 'not-locked-yet' && r4.n_man_1 === 'too-late' && calls.length === 0, 'C: before his lock and after his first game started: nothing is posted')
  setEnv({ ...XENV, CARD_POSTS_PAUSE: 'on' })
  check(Object.values(await POST.postDonovanEntries(s4.db, { sport: 'nhl', day: DAY, rows: [SOLO], now: NOW, ...stubs })).every((v) => v === 'paused') && await POST.postDonovan(s4.db, { sport: 'nhl', day: DAY, rows: [TWO], now: NOW, ...stubs }) === 'paused', 'C: CARD_POSTS_PAUSE stops every one of them')
}

// ── D. the Two-Man named in the card post is not posted again ──
{
  fresh()
  const s = postsDb({ seed: [cardPosted(['P1', 'T1', 'T2'])] })
  const r = await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN], now: NOW, ...stubs })
  check(r.two_man === 'in-card-post' && !kindsOf(s).includes('card_don_nhl_two_man') && /^posted/.test(r.straight_1) && /^posted/.test(r.n_man_1) && tweets().length === 2, `D: his Two-Man is in the day's card post -> not posted again; the other two are (${JSON.stringify(r)})`)
  fresh()
  const s2 = postsDb()
  const r2 = await POST.postDonovanEntries(s2.db, { sport: 'nhl', day: DAY, rows: [TWO, NMAN], now: NOW, ...stubs })
  check(r2.two_man === 'waits-for-card-post' && /^posted/.test(r2.n_man_1), 'D: the card post is not out yet -> the Two-Man waits for it (it carries him); the N-man does not wait')
  // the card post leaves the Two-Man out once his own suffixed post exists
  check(await POST.donovanPostClaimed(postsDb({ seed: [{ day: DAY, kind: 'card_don_nhl_two_man', payload: {} }] }).db, 'nhl', DAY) === true && await POST.donovanPostClaimed(postsDb({ seed: [{ day: DAY, kind: 'card_don_nhl_n_man_1', payload: {} }] }).db, 'nhl', DAY) === false, 'D: the card post leaves the Two-Man out once his own post is claimed, not for an N-man\'s claim')
  const status = await POST.donovanPostsToday(postsDb({ seed: [cardPosted(), { day: DAY, kind: 'card_don_nhl_n_man_1', payload: {} }] }).db, { sport: 'nhl', day: DAY, rows: [TWO, SOLO, NMAN, row(12, 'straight', [leg('X1', 'Test Late')], { slot: 2 })] })
  check(status.max === 3 && status.used === 1 && status.entries.map((e) => `${e.key}:${e.state}`).join() === 'n_man_1:posted,straight_1:not-yet,two_man:not-yet,straight_2:over-cap', `D: the form's "Posts today" read: ${status.used} of ${status.max} (${status.entries.map((e) => `${e.key}:${e.state}`).join()})`)
}

// ── E. BEFORE the SQL ──
{
  fresh()
  const s = postsDb({ seed: [cardPosted()], deny: /^card_don_nhl_/ })
  const [r, errs] = await quiet(() => POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, NMAN, SOLO], now: NOW, ...stubs }))
  check(/^posted/.test(r.n_man_1) && kindsOf(s).includes('card_don_nhl') && !kindsOf(s).some((k) => /^card_don_nhl_/.test(k)), `E: before the SQL the first entry goes out under the OLD kind, one post (${JSON.stringify(r)})`)
  check(/^skipped: run supabase\/migrations\/202610121700_card_don_multi\.sql/.test(r.straight_1) && /^skipped: run supabase\/migrations\/202610121700_card_don_multi\.sql/.test(r.two_man) && tweets().length === 1, 'E: the extra entries are skipped with a plain "run the migration" word, nothing sent for them')
  check(errs.some((e) => /card_don_nhl_n_man_1 skipped: the kind is not allowed yet \(run supabase\/migrations\/202610121700_card_don_multi\.sql\)/.test(e)), 'E: the log says which file to run')
  const rendered = asked.nman + asked.dual + asked.front.length
  const [r2] = await quiet(() => POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [TWO, NMAN, SOLO], now: NOW + 60e3, ...stubs }))
  check(tweets().length === 1 && asked.nman + asked.dual + asked.front.length === rendered && r2.n_man_1 === 'already-posted', 'E: the next ticks send nothing and render nothing (30 minutes)')
  // the SQL is run: the entry already posted under the old kind is NOT posted again; the others go out under their own kinds
  const [r3] = await quiet(() => POST.postDonovanEntries(postsDb({ seed: s.rowsT }).db, { sport: 'nhl', day: DAY, rows: [TWO, NMAN, SOLO], now: NOW + 31 * 60e3, ...stubs }))
  check(r3.n_man_1 === 'already-posted' && /^posted/.test(r3.two_man) && /^posted/.test(r3.straight_1) && tweets().length === 3 && tweets().filter((x) => x.text.includes('Test Nine')).length === 1, `E: after the SQL, the old-kind post is not repeated and the other two post (${JSON.stringify(r3)})`)
  // neither migration run
  fresh()
  const sNone = postsDb({ seed: [cardPosted()], deny: /^card_don_/ })
  const [rn, errsN] = await quiet(() => POST.postDonovanEntries(sNone.db, { sport: 'nhl', day: DAY, rows: [NMAN, TWO], now: NOW, ...stubs }))
  const [rn2] = await quiet(() => POST.postDonovanEntries(sNone.db, { sport: 'nhl', day: DAY, rows: [NMAN, TWO], now: NOW + 60e3, ...stubs }))
  check(/^skipped: run the update/.test(rn.n_man_1) && calls.length === 0 && errsN.some((e) => /card_don_nhl skipped/.test(e)) && /^waiting/.test(rn2.n_man_1), 'E: neither migration run -> nothing sent, logged, and not rebuilt for 30 minutes')
}

// ── F. policy ──
{
  const kinds = []
  for (const sp of ['mlb', 'nfl', 'nhl']) for (const key of ['two_man', 'n_man_1', 'n_man_2', 'straight_1', 'straight_2']) kinds.push(`card_don_${sp}_${key}`)
  check(kinds.every((k) => XS.tagOf(k) === 'INFO' && XS.modeOf(k) === 'event'), 'F: KIND_TAGS tags every suffixed kind INFO, event-driven (an untagged kind is held forever)')
  check(kinds.every((k) => XP.tierOf(k) === XP.tierOf(`card_${k.slice(9, 12)}`) && XP.isCapExempt(k) === false && XP.isDonovanKind(k) && XP.isRepeatExempt(k) && XP.sportOfKind(k) === k.slice(9, 12)), 'F: write-up tier like the card post, NOT cap-exempt, repeat-guard exempt, sport read from the kind')
  check(XP.capAllows('card_don_nhl_n_man_1', 17) === XP.capAllows('card_nhl', 17) && XP.capAllows('card_don_nhl_n_man_1', 18) === XP.capAllows('card_nhl', 18) && XP.capAllows('card_don_nhl_two_man', 20) === false, 'F: counted by the 20/day cap exactly like the card post')
  check(XS.untagged().length === 0 && XS.mayPostNow({ kind: 'card_don_nhl_straight_1', now: NOW, sport: 'nhl' }).ok && !XP.isDonovanKind('card_nhl') && XP.isDonovanKind('card_don_nba') && !XP.isDonovanKind('card_ls_nhl'), 'F: the scheduler lets one through; untagged() empty; the card post and others keep the repeat guard')
  const code = src('lib/card/post.js')
  const lits = [...code.matchAll(/card_don_\$\{sport\}_?[a-z$\{\}_]*/g)].map((m) => m[0])
  check(lits.length > 0 && kinds.every((k) => XS.kindInfo(k)), 'F: every kind the engine builds (card_don_<sport>_<key>) resolves in the table')
}

// ── G. a 2-leg N-man ──
{
  const FIELD = ['p1', 'p2', 'p3'].map((id, k) => ({ player_id: id, name: `Test ${id}`, team: 'TST', opp: 'OPP', game_id: 'g', start_ms: NOW + 2 * 3600e3, score: 90 - k, status: 'called', market: 'anytime' }))
  const base = { sport: 'nhl', slate_key: 's', card_date: DAY, field: FIELD, note: 'Both look right tonight.', now: NOW, lockAtMs: NOW + 3600e3 }
  const nm = CORE.donovanRow({ ...base, playerIds: ['p1', 'p2'], product: 'n_man' })
  const tm = CORE.donovanRow({ ...base, playerIds: ['p1', 'p2'] })
  check(nm.ok && nm.row.product === 'n_man' && nm.row.leg_count === 2 && nm.row.slot === 1 && CORE.twoManTitle(nm.row) === "ADMIN'S 2-MAN" && tm.row.product === 'two_man' && CORE.twoManTitle(tm.row) === "Admin's Two-Man", "G: two players on the N-man tab = product n_man, leg_count 2, \"ADMIN'S 2-MAN\"; on the Two-Man tab still a two_man")
  check(CORE.donovanRow({ ...base, playerIds: ['p1'], product: 'n_man' }).ok === false && CORE.donovanRow({ ...base, playerIds: ['p1', 'p1'], product: 'n_man' }).ok === false, 'G: one player or the same man twice is refused')
  const recs = CORE.recordsOf([{ ...nm.row, result: 'hit', legs: nm.row.legs }, { ...tm.row, result: 'miss', legs: tm.row.legs }], {})
  check(recs.donovan_n_man.graded === 1 && recs.donovan_n_man.hits === 1 && recs.donovan.graded === 1 && recs.donovan.hits === 0, 'G: the record lines count them separately (donovan_n_man 1 of 1, donovan 0 of 1): no double count')
  const b = POST.nManBuild({ sport: 'nhl', day: DAY, row: { ...nm.row, locks_at: iso(NOW - 1000), start_at: iso(NOW + 3600e3) }, problems: new Map([['p1', null], ['p2', null]]), now: NOW })
  check(b.text.includes("ADMIN'S 2-MAN: Test p1 + Test p2") && b.text.includes('Both look right tonight.') && b.payload.product === 'n_man', 'G: the post text: "ADMIN\'S 2-MAN: A + B" with his note')
  fresh()
  const s = postsDb({ seed: [cardPosted()] })
  const two = { ...row(5, 'n_man', [leg('N1', 'Test Nine'), leg('N2', 'Test Ten')]) }
  const r = await POST.postDonovanEntries(s.db, { sport: 'nhl', day: DAY, rows: [two], now: NOW, ...stubs })
  check(/^posted/.test(r.n_man_1) && tweets()[0].text.includes("ADMIN'S 2-MAN") && asked.nman === 1 && asked.dual === 0, `G: the 2-leg N-man posts with the N-man card (not the dual card) ${JSON.stringify(r)} ${JSON.stringify(tweets().map((x) => x.text))} ${asked.nman}/${asked.dual}`)
  // beside a real Two-Man: both post, each its own kind, each its own card
  fresh()
  const s2 = postsDb({ seed: [cardPosted()] })
  const r2 = await POST.postDonovanEntries(s2.db, { sport: 'nhl', day: DAY, rows: [two, TWO], now: NOW, ...stubs })
  check(/^posted/.test(r2.n_man_1) && /^posted/.test(r2.two_man) && asked.nman === 1 && asked.dual === 1 && kindsOf(s2).includes('card_don_nhl_n_man_1') && kindsOf(s2).includes('card_don_nhl_two_man'), 'G: a 2-leg N-man beside the Two-Man: two posts, two kinds, two different cards')
  // the table: 2 legs pass after the migration, are refused before the N-man migration
  const { fakeDb } = await import('./_card-fakedb.mjs')
  const clock = { now: NOW - 3600e3 }
  const rowDb = { ...nm.row, locks_at: iso(NOW + 1800e3), start_at: iso(NOW + 7200e3) }
  check((await fakeDb({ now: NOW }).from('card_calls').upsert([rowDb])).error === null && /check constraint/.test((await fakeDb(clock, { nman: false }).from('card_calls').upsert([rowDb])).error?.message || ''), 'G: the table takes a 2-leg n_man after the N-man migration (leg_count 2..6) and refuses it before')
  const nsql = src('supabase/migrations/202610121200_card_calls_nman.sql')
  check(/product = 'n_man'\s+and leg_count between 2 and 6 and slot = 1/.test(nsql), 'G: the shape check in the migration already allows leg_count 2..6 for n_man (no SQL needed for the 2-leg ticket)')
  check(/05-two/.test(src('scripts/proto-cards/nManStressFixtures.mjs')) && /gridOf\(2\)\.rows === 1/.test(src('scripts/check-nman-card.mjs')), 'G: the N-man card\'s own sizing check (check-nman-card) already draws and measures a 2-leg variant (05-two)')
  const form = src('components/admin/TwoManForm.js')
  check(/2 to 6-Man/.test(form) && /same bet saved under the N-man card layout/i.test(form.replace(/\s+/g, ' ')), 'G: the form\'s tab is "2 to 6-Man" and a one-line note explains how it differs from the Two-Man')
}

// ── H. migration, text copy, the form ──
{
  const sql = src('supabase/migrations/202610121700_card_don_multi.sql')
  const code = sql.replace(/--.*$/gm, '')
  check(/'\^card_don_\(mlb\|nfl\|nhl\)_\[a-z0-9_\]\+\$'/.test(sql) && /\) not valid'/.test(sql) && /regexp_replace\(d, ' NOT VALID\$', ''\)/.test(sql) && /position\(/.test(sql) && /raise exception 'homer_feed_posts_kind_check not found/.test(sql), 'H: one idempotent extension: reads the live constraint, strips NOT VALID, skips if present, adds NOT VALID')
  check(!/\b(drop table|truncate|delete from public|update public|insert into)\b/i.test(code) && (code.match(/drop constraint/g) || []).length === 1, 'H: it only replaces the one check constraint (no data touched)')
  // the regex the migration adds accepts every kind the code claims and nothing else
  const re = new RegExp(sql.match(/'\^(card_don_\(mlb\|nfl\|nhl\)_\[a-z0-9_\]\+)\$'/)[0].slice(1, -1))
  const gen = []
  for (const sp of ['mlb', 'nfl', 'nhl']) for (const key of ['two_man', 'n_man_1', 'n_man_2', 'n_man_3', 'straight_1', 'straight_2', 'straight_3']) gen.push(POST.CARD_KIND.donEntry(sp, key))
  check(gen.every((k) => re.test(k)) && !re.test('card_don_nba_two_man') && !re.test('card_nhl') && !re.test('card_don_nhl') && !re.test('card_don_nhl_Two'), 'H: the pattern allows every kind the code claims and not BUCKETS, the card post, or the old kind (already allowed)')
  const txt = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/LANE-POSTS/card_don_multi_SQL.txt'
  if (existsSync(txt)) check(readFileSync(txt, 'utf8') === sql, 'H: the plain .txt for the SQL editor is byte-identical to the migration')
  else console.log('skip the plain .txt copy is not on this machine (AUDITS-TO-READ/LANE-POSTS/card_don_multi_SQL.txt)')
  check(POST.MULTI_MIGRATION === 'supabase/migrations/202610121700_card_don_multi.sql' && existsSync(POST.MULTI_MIGRATION), 'H: the file the log tells Donovan to run exists')
  const form = src('components/admin/TwoManForm.js'); const api = src('app/api/admin/two-man/route.js')
  check(/Posts today/.test(form) && /3 posts max a day/.test(form) && /this one will not post/.test(form), 'H: the form shows "Posts today: n of 3", "3 posts max a day", and warns "this one will not post"')
  check(/donovanPostsToday/.test(api) && /posts:/.test(api), 'H: the admin read carries each window\'s posts (used / max / which entries posted)')
  const tick = src('lib/card/tick.js')
  check(/postDonovanEntries\(db/.test(tick) && !/postDonovanNMan\(db/.test(tick), 'H: the tick posts his entries through the one engine')
}

// ── I. HIS STRAIGHTS AND MORE THAN ONE N-MAN (2026-10-12, 202610121800_card_calls_donovan_mix.sql): the lane holds any mix, up to 3 posts a day ──
{
  const { fakeDb } = await import('./_card-fakedb.mjs')
  const STORE = await import('../lib/card/store.js')
  const REVEAL = await import('../lib/card/reveal.js')
  const H = 3600e3
  const FIELD = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id, k) => ({ player_id: id, name: `Test ${id}`, team: 'TST', opp: 'OPP', game_id: 'g', game_date: DAY, start_ms: NOW + 4 * H, score: 90 - k, status: 'called', market: 'anytime' }))
  const base = { sport: 'nhl', slate_key: DAY, card_date: DAY, field: FIELD, note: 'Why I like it.', now: NOW - 2 * H, lockAtMs: NOW + 1 * H }
  const mk = (o) => CORE.donovanRow({ ...base, ...o })

  // 1. the row: his straight is its own lane + product, 1 unit, the anytime market, slots 1..3, the title, the rule; nothing else about the Two-Man changed
  const st = mk({ product: 'straight', playerIds: ['a1'], slot: 2, cardName: 'Solo Shot' })
  check(st.ok && st.row.lane === 'donovan' && st.row.product === 'straight' && st.row.slot === 2 && st.row.leg_count === 1 && st.row.stake === 1 && st.row.market === 'anytime' && st.row.rule === CORE.CARD_RULE.donovan_straight && CORE.twoManTitle(st.row) === 'Solo Shot' && CORE.twoManTitle(mk({ product: 'straight', playerIds: ['a1'] }).row) === "Admin's Straight", 'I: his straight row: lane donovan, product straight, slot, 1 unit, market anytime, its own rule and title')
  check(!mk({ product: 'straight', playerIds: ['a1', 'a2'] }).ok && !mk({ product: 'straight', playerIds: [] }).ok && !mk({ product: 'straight', playerIds: ['zz'] }).ok && !mk({ product: 'straight', playerIds: ['a1'], slot: 4 }).ok && !mk({ product: 'n_man', playerIds: ['a1', 'a2'], slot: 0 }).ok && !mk({ playerIds: ['a1', 'a2'], slot: 2 }).ok, 'I: one player only; a stranger, slot 0 / 4, or a Two-Man in slot 2 is refused')
  const two = mk({ playerIds: ['a1', 'a2'] })
  check(two.ok && two.row.slot === 1 && two.row.product === 'two_man' && !('market' in two.row) && two.row.rule === CORE.CARD_RULE.donovan, 'I: the Two-Man row is exactly as before (slot 1, no market key, the same rule)')

  // 2. the table: any mix in his lane, never meeting the bot's straights; AFTER the mix migration
  const clock = { now: NOW - 2 * H }
  const db = fakeDb(clock)
  const botS = { sport: 'nhl', card_date: DAY, slate_key: DAY, lane: 'bot', product: 'straight', slot: 1, market: 'anytime', model_version: CORE.CARD_VERSION, rule: CORE.CARD_RULE.straight, stake: 1, legs: [CORE.legOf({ ...FIELD[4] })], leg_count: 1, note: null, start_at: iso(NOW + 4 * H), locks_at: iso(NOW + 1 * H) }
  check((await db.from('card_calls').upsert([botS])).error === null, 'I: (setup) the bot\'s straight slot 1')
  const saves = []
  for (const [product, ids, slot] of [['straight', ['a1'], 1], ['straight', ['a2'], 2], ['straight', ['a3'], 3], ['n_man', ['a1', 'a2'], 1], ['n_man', ['a3', 'a4', 'a5'], 2], ['two_man', ['a1', 'a2'], 1]]) saves.push(await STORE.saveDonovan(db, mk({ product, playerIds: ids, slot }).row))
  check(saves.every((r) => r.ok) && db.rows.filter((r) => r.lane === 'donovan').length === 6 && db.rows.filter((r) => r.lane === 'bot').length === 1, 'I: after the migration: 3 straights, 2 N-men (slots 1 and 2, one of them 2 legs) and a Two-Man all live in his lane beside the bot\'s straight (no key collision)')
  const dupe = await STORE.saveDonovan(db, mk({ product: 'straight', playerIds: ['a4'], slot: 1 }).row)
  check(dupe.ok && db.rows.filter((r) => r.lane === 'donovan' && r.product === 'straight').length === 3 && db.rows.find((r) => r.lane === 'donovan' && r.product === 'straight' && r.slot === 1).legs[0].player_id === 'a4', 'I: saving the same slot again before the lock REPLACES it (still 3 straights)')
  check((await STORE.saveDonovan(db, { ...mk({ product: 'straight', playerIds: ['a1'] }).row, slot: 4 })).ok === false, 'I: a 4th straight slot is refused by the table')
  // the cap is on POSTS: a 4th entry would be saved (here: a 3rd N-man) and is not posted
  check((await STORE.saveDonovan(db, mk({ product: 'n_man', playerIds: ['a1', 'a2', 'a3'], slot: 3 }).row)).ok, 'I: saving is not capped: a 7th entry is saved')
  const ranked = POST.donovanEntries(db.rows.filter((r) => r.lane === 'donovan'))
  check(ranked.length === 7 && ranked.map((r) => r.id).join() === ranked.map((r) => r.id).slice().sort((x, y) => x - y).join(), 'I: the post order is oldest saved first (row id)')

  // 3. nothing locked is ever overwritten; lock-at-save works for a straight; LATE never public; bot straights unaffected
  clock.now = NOW + 1.5 * H      // after the card's lock (NOW + 1h), before the games (NOW + 4h)
  const over = await STORE.saveDonovan(db, mk({ product: 'straight', playerIds: ['a5'], slot: 2, now: clock.now, allowLate: true }).row)
  check(over.ok === false && db.rows.find((r) => r.lane === 'donovan' && r.product === 'straight' && r.slot === 2).legs[0].player_id === 'a2', `I: a locked straight is never overwritten (${over.error})`)
  const at = mk({ product: 'straight', playerIds: ['a5'], slot: 2, now: clock.now, allowLate: true })
  check(at.ok && at.lockAtSave === true, 'I: (a straight saved after the lock, before the game, is lock-at-save)')
  const free = fakeDb(clock)
  const rr = await STORE.saveDonovan(free, at.row, { lockAtSave: true })
  check(rr.ok && Date.parse(free.rows[0].locks_at) === clock.now, 'I: lock at save: the row\'s lock moment is the save moment')
  const late = mk({ product: 'straight', playerIds: ['a1'], slot: 1, now: NOW + 5 * H, allowLate: true })
  check(late.ok && late.late === true && late.row.lane === 'donovan_late', 'I: a straight whose game has started is the LATE lane')
  const dbL = fakeDb({ now: NOW + 5 * H })
  check((await STORE.saveDonovan(dbL, late.row)).ok === true, 'I: the late straight is stored (own lane)')
  const clk = { now: NOW + 1.5 * H }
  const pubDb = fakeDb(clk)
  await pubDb.from('card_calls').upsert([{ ...botS }, { ...botS, slot: 2, legs: [CORE.legOf({ ...FIELD[3] })] }])
  for (const [product, ids, slot] of [['straight', ['a1'], 1], ['n_man', ['a1', 'a2'], 2]]) pubDb.rows.push({ id: 900 + slot, ...mk({ product, playerIds: ids, slot }).row, locks_at: iso(NOW + 1 * H), locked_at: iso(NOW - 1 * H) })
  pubDb.rows.push({ id: 950, ...late.row, locked_at: iso(NOW + 5 * H) })
  const pub = await STORE.readCard(pubDb, 'nhl', DAY, { now: NOW + 1.5 * H })
  const kinds = pub.rows.map((r) => `${r.lane}:${r.product}:${r.slot}`).sort().join()
  check(kinds === 'bot:straight:1,donovan:n_man:2,donovan:straight:1', `I: his straight and his 2nd N-man are public from their lock like his other entries; LATE rows never; the bot's 2nd straight stays held until a grade (${kinds})`)
  check(STORE.verifiedRow(NOW + 1.5 * H)({ lane: 'donovan_late', locks_at: iso(NOW) }) === false && STORE.publicRow(NOW + 0.5 * H)({ lane: 'donovan', locks_at: iso(NOW + 1 * H) }) === false, 'I: LATE is never verified; his entry is not public before its lock')
  check(REVEAL.publicCardRows(pub.rows).held.straights === 0, 'I: his straights are never counted as the bot\'s held straights')

  // 4. BEFORE the mix migration: a straight or a 2nd N-man says "run the update" and stores NOTHING; the Two-Man and the first N-man are untouched
  const pre = fakeDb({ now: NOW - 2 * H }, { mix: false })
  const r1 = await STORE.saveDonovan(pre, mk({ product: 'straight', playerIds: ['a1'] }).row)
  const r2 = await STORE.saveDonovan(pre, mk({ product: 'n_man', playerIds: ['a1', 'a2', 'a3'], slot: 2 }).row)
  check(!r1.ok && r1.needsSql && /202610121800_card_calls_donovan_mix\.sql/.test(r1.error) && !r2.ok && r2.needsSql && /202610121800_card_calls_donovan_mix\.sql/.test(r2.error) && pre.rows.length === 0, 'I: before the update a straight and a 2nd N-man are refused with "run the update" and NOTHING is stored')
  const r3 = await STORE.saveDonovan(pre, mk({ playerIds: ['a1', 'a2'] }).row); const r4 = await STORE.saveDonovan(pre, mk({ product: 'n_man', playerIds: ['a1', 'a2', 'a3'] }).row)
  check(r3.ok && r4.ok && pre.rows.length === 2, 'I: before the update the Two-Man and the first N-man save exactly as today')
  const preNow = fakeDb({ now: NOW + 1.5 * H }, { mix: false })
  const r5 = await STORE.saveDonovan(preNow, mk({ product: 'straight', playerIds: ['a5'], now: NOW + 1.5 * H, allowLate: true }).row, { lockAtSave: true })
  check(!r5.ok && r5.needsSql && preNow.rows.length === 0, 'I: before the update a straight after the card\'s lock (lock at save) is refused with "run the update", nothing stored')

  // 5. the records: his straights, N-men and Two-Man are three separate lines; the bot's straight record is untouched
  const g = (lane, product, result, slot = 1) => ({ lane, product, slot, result, legs: [CORE.legOf({ ...FIELD[0] })].concat(product === 'straight' ? [] : [CORE.legOf({ ...FIELD[1] })]), stake: 1, market: product === 'straight' ? 'anytime' : null, rule: 'x' })
  const recs = CORE.recordsOf([g('bot', 'straight', 'hit'), g('donovan', 'straight', 'miss'), g('donovan', 'straight', 'hit', 2), g('donovan', 'n_man', 'hit'), g('donovan', 'two_man', 'miss'), g('donovan_late', 'straight', 'hit')], {})
  check(recs.straight.graded === 1 && recs.straight.hits === 1 && recs.donovan_straight.graded === 2 && recs.donovan_straight.hits === 1 && recs.donovan_n_man.graded === 1 && recs.donovan.graded === 1 && recs.donovan.hits === 0, 'I: donovan_straight 1 of 2, donovan_n_man 1 of 1, donovan 0 of 1; the bot\'s straight record is still 1 of 1; the LATE straight is in none of them')
  const words = CORE.recordWords(recs.donovan_straight, { product: 'straight', who: "Admin's straight: " })
  check(words.length > 0 && /Admin's straight: 1 of 2/.test(words[0]), `I: the public line for his straights shows n (${words[0]})`)
  check(/donovan_straight/.test(src('app/api/card/route.js')) && /donovan_straight/.test(src('components/card/CardSection.js')), 'I: the Card route and the public record section carry the straight line')

  // 6. the posts: each slot its own claim; two N-men the same day do not collide; each gets its own card
  fresh()
  const nm1 = row(31, 'n_man', [leg('N1', 'Test Nine'), leg('N2', 'Test Ten'), leg('N3', 'Test Eleven')], { slot: 1 })
  const nm2 = row(32, 'n_man', [leg('S1', 'Test Solo'), leg('T1', 'Test Twin One')], { slot: 2 })
  const sg2 = row(33, 'straight', [leg('T2', 'Test Twin Two')], { slot: 2 })
  const sP = postsDb({ seed: [cardPosted()] })
  const slotsAsked = []
  const r = await POST.postDonovanEntries(sP.db, { sport: 'nhl', day: DAY, rows: [nm1, nm2, sg2, { ...TWO, id: 34 }], now: NOW, ...stubs, image: async ({ slot }) => { slotsAsked.push(slot); return Buffer.from('PNG-nman') } })
  check(/^posted/.test(r.n_man_1) && /^posted/.test(r.n_man_2) && /^posted/.test(r.straight_2) && /^over-cap/.test(r.two_man) && JSON.stringify(kindsOf(sP)) === JSON.stringify(['card_don_nhl_n_man_1', 'card_don_nhl_n_man_2', 'card_don_nhl_straight_2', 'card_nhl'].sort()), `I: two N-men and a straight the same day: three claims, the 4th (the Two-Man, saved last) is not posted (${JSON.stringify(r)})`)
  check(slotsAsked.sort().join() === '1,2' && tweets().length === 3 && tweets().every((x) => x.media?.media_ids?.length === 1), 'I: each N-man asks for ITS slot\'s card; every post carries a card')
  const claimTxt = (name) => tweets().find((x) => x.text.includes(name))?.text || ''
  check(claimTxt('Test Nine').includes("ADMIN'S 3-MAN") && claimTxt('Test Solo').includes("ADMIN'S 2-MAN") && claimTxt('Twin Two').startsWith('\u{1F3AF} THE CARD') && claimTxt('Twin Two').includes('Straight:') && claimTxt('Twin Two').includes('Note for straight 33.'), 'I: each post names only its own entry with its own note; the straight post is a neutral "Straight:" line + his note')
  check(/\/api\/card\/nman/.test(src('app/api/card/nman/route.js')) && /slot/.test(src('lib/cards/nManData.js')) && /slot/.test(src('lib/cards/postImages.js')), 'I: the N-man card route, data and post image take the slot')

  // 7. wiring: the admin route, the preview and the form
  const api = src('app/api/admin/two-man/route.js'); const prev = src('app/api/admin/two-man/preview/route.js'); const form = src('components/admin/TwoManForm.js')
  check(/body\.product === 'straight' \? 'straight'/.test(api) && /will_post/.test(api) && /donovanRowsOf/.test(api) && /All \$\{DON_SLOTS\}/.test(api), 'I: the admin save takes product straight, picks the next free slot, answers will_post')
  check(/straightFrontCard/.test(prev) && /product === 'straight'|body\.product === 'straight'/.test(prev), 'I: the preview draws the straight\'s FRONT card (the one that rides his post)')
  check(/>Straight<\/button>/.test(form) && /Up to \{SLOTS\} straights/.test(form) && /\+ New \{isS/.test(form), 'I: the form has a Straight tab, slot chips and the "+ New" entry')

  // 8. the migration
  const mix = src('supabase/migrations/202610121800_card_calls_donovan_mix.sql'); const mixCode = mix.replace(/--.*$/gm, '')
  check(/card_calls_lane_ck/.test(mixCode) && /product in \('straight','two_man','double','n_man'\)/.test(mixCode) && /product = 'n_man'\s+and leg_count between 2 and 6 and slot between 1 and 3/.test(mixCode) && /lane = 'bot' and product <> 'n_man'/.test(mixCode), 'I: the migration widens the lane and shape checks (straight in his lane, n_man slots 1..3, the bot still never an n_man)')
  check(/if new\.product in \('two_man', 'n_man', 'straight'\) then\s+new\.locks_at := now\(\);/.test(mixCode) && /new\.lane = 'donovan_late'/.test(mixCode) && /interval '15 minutes'/.test(mixCode) && /create trigger card_calls_guard before insert or update or delete/.test(mixCode), 'I: the guard: lock-at-save covers straight; the LATE rules and the trigger are intact')
  check(/obj_description/.test(mixCode) && /donovan-mix-v1/.test(mixCode) && !/\bset role\b/i.test(mixCode) && !/\b(drop table|truncate|delete from|update public|insert into)\b/i.test(mixCode), 'I: idempotent by a comment marker on each constraint, no role switching, no data touched')
  const cap = (mixCode.match(/limit|count\(/gi) || []).length
  check(cap === 0, 'I: the cap of 3 is in code, not in SQL')
  const txtDir = '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/LANE-POSTS/'
  if (existsSync(`${txtDir}card_calls_mix_SQL.txt`)) {
    check(readFileSync(`${txtDir}card_calls_mix_SQL.txt`, 'utf8') === mix, 'I: the plain .txt for the mix migration is byte-identical')
    check(readFileSync(`${txtDir}RUN_BOTH_IN_ONE_PASTE_SQL.txt`, 'utf8') === `${mix}\n\n${src('supabase/migrations/202610121700_card_don_multi.sql')}`, 'I: RUN_BOTH_IN_ONE_PASTE_SQL.txt is the mix migration then the kind migration, nothing else')
  } else console.log('skip the plain .txt copies are not on this machine')
}

console.log(failed ? `\n${failed} FAILED` : '\nOK: his lane, up to 3 posts a day')
process.exit(failed ? 1 : 0)
