// FILM ROOM, CHECKED (2026-10-20). lib/posts/filmRoom.js: the topics, the rotation, the one real line, the poster (fake database).
// TEST data only (every name says Test).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-film-room.mjs
import * as F from '../lib/posts/filmRoom.js'
import { xLen } from '../lib/posts/slate.js'
import { SWEARS, OVERCLAIM } from '../lib/facts/check.js'
import { receiptLineFor } from '../lib/posts/receiptLine.js'
import { kindInfo } from '../lib/dash/xSchedule.js'
import { tierOf } from '../lib/dash/xPolicy.js'

let bad = 0, n = 0
const ok = (c, m) => { n += 1; if (!c) { bad += 1; console.log('FAIL ' + m) } }
const WED = '2026-10-21'
const night = (day, cashed, missed, hits = []) => ({ day, payload: { counts: { cashed, missed, void: 0 }, by_sport: { nhl: { cashed, missed, void: 0 } }, results: hits.map((name) => ({ sport: 'nhl', player_id: `T-${name}`, name, outcome: 'cashed' })) } })
const receipts = [night('2026-10-15', 2, 10, ['Test Skater A', 'Test Skater B']), night('2026-10-18', 1, 8, ['Test Skater C'])]
const data = F.filmData({ receipts, tuesdayRow: { payload: { results: [{ result: 'hit' }, { result: 'miss' }, { result: 'miss' }] } } })

// 1. the rotation: a week always the same topic, five weeks cycle, Wednesdays only from the first one
ok(F.topicFor(WED).key === 'called' && F.topicFor('2026-10-28').key === 'miss' && F.topicFor('2026-11-25').key === 'called', `rotation: ${['2026-10-21', '2026-10-28', '2026-11-25'].map((d) => F.topicFor(d).key)}`)
ok(new Set(F.TOPICS.map((t) => t.key)).size === F.TOPICS.length && F.TOPICS.length === 5, 'five distinct topics')
ok(F.filmRoomDue({ day: WED, dow: 3, hour: 10 }) && !F.filmRoomDue({ day: WED, dow: 3, hour: 9 }) && !F.filmRoomDue({ day: '2026-10-22', dow: 4, hour: 12 }) && !F.filmRoomDue({ day: '2026-10-14', dow: 3, hour: 12 }), 'due Wednesday from 10 AM Phoenix, from the first week')

// 2. the real numbers: sums of the stored rows, nothing typed
ok(data.made === 21 && data.cashed === 3 && data.missed === 18 && data.names.join() === 'Test Skater A,Test Skater B,Test Skater C', `the 7 nights: ${JSON.stringify(data)}`)
ok(data.tuesday && data.tuesday.landed === 1 && data.tuesday.graded === 3, 'the last Tuesday: 1 of 3')
ok(F.filmData({}).tuesday === null && F.filmData({}).made === 0, 'no rows: zeros and no Tuesday line')

// 3. every topic, long and bare 280: the title, the ask last, clean; the real line when there is one, never when not
for (let w = 0; w < 5; w += 1) {
  const day = new Date(Date.parse(`${WED}T12:00:00Z`) + w * 7 * 864e5).toISOString().slice(0, 10)
  for (const limit of [900, 280]) {
    const t = F.filmRoomText({ day, data, limit })
    const lines = t.text.split('\n')
    ok(t.text && xLen(t.text) <= limit, `${t.topic} @${limit}: fits (${xLen(t.text)})`)
    ok(lines[0].startsWith('\u{1F3AC} FILM ROOM · ') && lines[lines.length - 1].endsWith('?'), `${t.topic} @${limit}: title first, ask last`)
    ok(t.real === true, `${t.topic} @${limit}: carries its real line`)
    ok(!/https?:|#[A-Za-z]/.test(t.text) && !SWEARS.test(t.text) && !OVERCLAIM.test(t.text), `${t.topic} @${limit}: no link, hashtag, swear or overclaim`)
    ok(!/\d+(\.\d+)?%|\bchance\b|\bguarantee/i.test(t.text), `${t.topic} @${limit}: no rate, no chance, no guarantee`)
  }
  const empty = F.filmRoomText({ day, data: F.filmData({}), limit: 900 })
  ok(empty.text && empty.real === false && !/last 7 nights|Last Longshot/i.test(empty.text), `${empty.topic}: a quiet week posts the explainer alone`)
}
const c = F.filmRoomText({ day: WED, data, limit: 900 }).text
ok(c.includes('CALLED · we picked him') && c.includes('ON THE BOARD ·') && c.includes('NOT ON THE BOARD ·') && c.includes('The last 7 nights: 21 calls made, 3 landed.'), `the CALLED topic: ${c}`)
const r = F.filmRoomText({ day: '2026-11-04', data, limit: 900 }).text
ok(/most likely/.test(r) && /does not mean likely/i.test(r), 'the rank topic says most likely, not likely (voice rule 11)')

// 4. the kind: an explainer, no receipt line (it names no locked call), write-up tier, event-driven
ok(kindInfo('film_room')?.mode === 'event' && kindInfo('film_room')?.tag === 'INFO' && tierOf('film_room') === 'writeup', 'film_room is INFO, event, write-up tier')
ok(receiptLineFor('film_room', { text: c }) === null, 'no "Locked before ..." line on an explainer')

// 5. the poster on a fake database: claims once, posts to Discord (no X configured here), records the topic
const store = []
const q = (table) => {
  const st = { filters: {}, rows: null }
  const api = {
    select: () => api, eq: (k, v) => { st.filters[k] = v; return api }, gte: () => api, lte: () => api, order: () => api, limit: () => api,
    match: (m) => { Object.assign(st.filters, m); return api },
    maybeSingle: async () => ({ data: store.find((x) => x.day === st.filters.day && x.kind === st.filters.kind) || null, error: null }),
    upsert: (rows) => { const fresh = rows.filter((x) => !store.some((y) => y.day === x.day && y.kind === x.kind)); store.push(...fresh.map((x) => ({ ...x }))); return { select: async () => ({ data: fresh, error: null }) } },
    update: (patch) => ({ match: async (m) => { const row = store.find((x) => x.day === m.day && x.kind === m.kind); if (row) Object.assign(row, patch); return { error: null } } }),
    delete: () => ({ match: async () => ({ error: null }) }),
    then: (res) => res({ data: st.filters.kind === 'receipt' ? receipts : [], error: null }),
  }
  return api
}
const db = { from: q }
for (const k of ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET', 'X_BEARER_TOKEN']) delete process.env[k]
F._resetFilmForTests()
const first = await F.postFilmRoomOnce(db, { day: WED, hooks: '' })
ok(/^posted/.test(first), `first try posts (${first})`)
ok(store.find((x) => x.kind === 'film_room')?.payload?.topic === 'called', 'the claim row records the topic')
ok(await F.postFilmRoomOnce(db, { day: WED, hooks: '' }) === 'already-posted', 'a second try is already-posted')
process.env.FILM_ROOM_OFF = 'on'
ok(await F.postFilmRoomOnce(db, { day: '2026-10-28', hooks: '' }) === 'off', 'FILM_ROOM_OFF=on stops it')
delete process.env.FILM_ROOM_OFF

// 5b. the picture (2026-10-20): the card gets the topic, the series number, the real numbers and the CALLED scorers' faces, newest first, each once
const faces = F.filmFaces([night('2026-10-15', 1, 0, ['Test Old']), night('2026-10-18', 2, 0, ['Test New', 'Test Old'])])
ok(faces.map((f) => f.name).join() === 'Test New,Test Old', `faces newest first, each once: ${faces.map((f) => f.name)}`)
ok(F.filmNumber('2026-10-21') === 1 && F.filmNumber('2026-11-25') === 6, 'the series number counts the Wednesdays')
let drawn = null
const pic = await F.filmPicture({ day: WED, data, receipts, draw: async (m) => { drawn = m; return Buffer.from('PNG') }, face: async (sport, id) => (id ? `data:image/png;base64,${id}` : '') })
ok(pic && drawn.topic.key === 'called' && drawn.n === 1 && drawn.data === data && drawn.dayWord === 'Oct 21', 'the card model: topic, number, data, the day')
ok(drawn.ex && drawn.faces.length === 3 && drawn.faces.every((f) => f.face && f.dayWord), `the faces (${drawn.faces.length}) and the CALLED example`)
ok(await F.filmPicture({ day: WED, data, receipts, draw: async () => { throw new Error('boom') }, face: async () => '' }) === null, 'a render that throws: no picture, no throw')
F._resetFilmForTests()
store.length = 0
const r2 = await F.postFilmRoomOnce(db, { day: '2026-12-02', hooks: '', draw: async () => Buffer.from('PNG'), face: async () => '' })
ok(/^posted/.test(r2) && store.find((x) => x.day === '2026-12-02')?.payload?.picture === true, `the post carries the picture (${r2})`)

// 6. the SQL and the wiring
const fs = await import('node:fs')
const sql = fs.readFileSync(new URL('../supabase/migrations/202610202100_film_room_kind.sql', import.meta.url), 'utf8')
ok(sql.includes("''film_room''") && /\) not valid'/.test(sql), 'the kind migration allows film_room, NOT VALID')
const route = fs.readFileSync(new URL('../app/api/dash/homers/tick/route.js', import.meta.url), 'utf8')
const rt = route.slice(route.indexOf('async function receiptTick('), route.indexOf('\n}\n', route.indexOf('async function receiptTick(')))
ok(/filmRoomDue\(clock\)/.test(rt) && /postFilmRoomOnce\(db, \{ day: clock\.day, hooks: FEED_WEBHOOKS\(\) \}\)/.test(rt), 'tried from the receipt step (runs in the MLB offseason too), free feed channels only')

console.log(bad ? `${bad}/${n} FAILED` : `check-film-room: ${n} checks passed (TEST data)`)
process.exit(bad ? 1 : 0)
