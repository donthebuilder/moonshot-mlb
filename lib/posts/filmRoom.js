// FILM ROOM (Wednesday's series, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "one explainer: what ON THE BOARD means, why a good
// call can miss (an explainer is our top post of the last 90 days)"). Donovan, 2026-10-20: "ok next". The call made here: a FIXED
// set of explainers that rotate one a week, each with ONE real line from last week's own record when the week has one.
//
//   WHAT    the teaching words are fixed (no number in them); the one real line is a sum of the stored nightly receipts
//           (the same rows THE RECORD reads) or the last LONGSHOT TUESDAY result row. A week with nothing to show posts the
//           explainer alone. Never a model chance, never a number we don't have, no link, no hashtag, no swearing.
//   WHEN    Wednesday from FILM_HOUR_PHX (Phoenix, the posting day), once (its own claim, homer_feed_posts kind film_room).
//   PICTURE the Film Room card (lib/cards/filmRoomCard.js, 2026-10-20 "wow these are beautiful"): the topic's own body, real faces from the
//           receipts' CALLED scorers. A render that fails or is slow leaves the post as text (never a held post).
//   WHERE   X, and the free feed channel. Tried from the homers tick's receipt step, which also runs in the
//           MLB offseason (app/api/dash/homers/tick/route.js receiptTick).
//   ORDER   the topic is the week's own index from FIRST_WEEK, so a week always gets the same topic and the set cycles.
// Undo: FILM_ROOM_OFF=on; revert the commit to remove it.
import { STATUS_WORD } from '../callStatus'
import { ALL_SPORT_KEYS, BRAND, POST_WORDS } from '../routes'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { isPublicSport, xLen } from './slate'
import { periodTotals } from './receipt'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'

export const FILM_KIND = 'film_room'
export const FILM_HOUR_PHX = 10                 // after THE RECORD's morning (7), before the afternoon facts
export const FIRST_WEEK = '2026-10-21'          // the first Film Room Wednesday: topic 0
export const filmOff = () => /^(on|1|true)$/i.test(String(process.env.FILM_ROOM_OFF || '').trim())

const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const plural = (n, one, many) => (n === 1 ? one : many)
const HEAD = '\u{1F3AC} FILM ROOM'

/**
 * THE TOPICS, in order. `body` = the fixed teaching lines (no numbers), `real(data)` = the one real line or null,
 * `ask` = the choice question last. Every word checked against the voice guide: a rank is "most likely", never "likely".
 */
export const TOPICS = Object.freeze([
  {
    key: 'called', title: 'WHAT "CALLED" MEANS',
    body: [
      'Every player we talk about lands in one of three buckets:',
      '',
      `${STATUS_WORD.called} · we picked him, in public, before the game`,
      `${STATUS_WORD.board} · he made our board, but he wasn't a pick`,
      `${STATUS_WORD.off} · we never had him`,
      '',
      `Only ${STATUS_WORD.called} counts as ours. A guy who scores off our board never goes in our record as a win.`,
    ],
    real: (d) => (d.made ? `The last 7 nights: ${d.made} ${plural(d.made, 'call', 'calls')} made, ${d.cashed} landed. Every one graded.` : null),
    ask: 'Did you know the difference before today?',
  },
  {
    key: 'miss', title: 'WHY A GOOD CALL CAN MISS',
    body: [
      'A call is our read on who has the best shot tonight. It is not a promise.',
      '',
      'The best hitters go most nights without a home run. Most scorers go most games without a goal.',
      'So a good read still misses a lot. What counts is the record over weeks, not one night.',
    ],
    real: (d) => (d.missed ? `In the last 7 nights, ${d.missed} of our calls missed. They sit in the record right next to the hits.` : null),
    ask: "What's the miss from this week that still hurts?",
  },
  {
    key: 'rank', title: 'WHAT #1 ON OUR BOARD MEANS',
    body: [
      '#1 means the most likely of everyone on the slate. It does not mean likely.',
      '',
      'On a home run board, even #1 misses more nights than he hits.',
      "That's why we grade the whole board, not one name.",
    ],
    real: (d) => (d.names.length ? `The last 7 nights, WE HAD: ${d.names.slice(0, 5).join(', ')}${d.names.length > 5 ? ` +${d.names.length - 5} more` : ''}` : null),
    ask: 'Rank or price: which one do you look at first?',
  },
  {
    key: 'longshot', title: 'WHAT A LONG SHOT IS',
    body: [
      'Our long shot is +550 or longer, at the median price on file.',
      'That price is the book telling you most of these miss. We say it out loud too.',
      '',
      'One from each board every Tuesday. Named, priced, and graded, misses included.',
    ],
    real: (d) => (d.tuesday ? `Last Longshot Tuesday: ${d.tuesday.landed} of ${d.tuesday.graded} landed.` : null),
    ask: 'Long shot or the safe pick: which one are you?',
  },
  {
    key: 'grading', title: 'HOW WE GRADE',
    body: [
      'Every call is posted before the game starts. After that, it does not change.',
      'It is graded against exactly what we posted: the player, the market, the game.',
      '',
      'Misses stay up. Nothing gets rewritten after the fact.',
    ],
    real: (d) => (d.sportLines.length ? `The last 7 nights:\n${d.sportLines.join('\n')}` : null),
    ask: 'What should the film room break down next?',
  },
])

/** The topic for a Film Room day (a Wednesday): the week's index from FIRST_WEEK, cycling. Pure. */
export function topicFor(day) {
  const weeks = Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${FIRST_WEEK}T12:00:00Z`)) / (7 * 864e5))
  const n = TOPICS.length
  return TOPICS[((weeks % n) + n) % n]
}

/** Is Film Room due on this Phoenix clock ({ day, hour, dow } from lib/dash/xSchedule.js phxClock)? Pure. */
export const filmRoomDue = (clock) => Boolean(clock && clock.dow === 3 && clock.hour >= FILM_HOUR_PHX && clock.day >= FIRST_WEEK)

/**
 * The real numbers a topic may use, from the stored nightly receipt rows of the 7 nights before `day` and the last Tuesday result
 * row ({ payload: { results: [{ result }] } }) or null. Pure.
 */
export function filmData({ receipts = [], tuesdayRow = null } = {}) {
  const t = periodTotals(receipts)
  const c = t.total
  const seen = new Set()
  const names = (t.hits || []).filter((h) => { const k = `${h.sport}:${h.id || h.name}`; if (seen.has(k)) return false; seen.add(k); return true }).map((h) => h.name)
  const sportLines = ALL_SPORT_KEYS.filter((s) => isPublicSport(s) && t.bySport[s] && (t.bySport[s].cashed + t.bySport[s].missed) > 0)
    .map((s) => { const sc = t.bySport[s]; return `${BRAND[s].league}  ${sc.cashed} of ${sc.cashed + sc.missed} · ${POST_WORDS[s].market}` })
  const tr = (tuesdayRow?.payload?.results || []).filter((r) => r?.result === 'hit' || r?.result === 'miss')
  return {
    made: c.cashed + c.missed + c.void, cashed: c.cashed, missed: c.missed, names, sportLines,
    tuesday: tr.length ? { landed: tr.filter((r) => r.result === 'hit').length, graded: tr.length } : null,
  }
}

/**
 * THE POST. `day` = the Wednesday, `data` = filmData(). The long post first; on the bare 280 the body sheds its blank lines,
 * then its last lines, never the title, the real line or the ask. '' when nothing fits. Pure.
 */
export function filmRoomText({ day, data, limit = postLimit() + TAIL_MARGIN }) {
  const topic = topicFor(day)
  const real = data ? topic.real(data) : null
  const cap = Math.max(limit, HARD_LIMIT)
  const tries = []
  for (let k = topic.body.length; k >= 0; k -= 1) {
    const body = topic.body.slice(0, k)
    tries.push([`${HEAD} · ${topic.title}`, '', ...body, ...(real ? ['', real] : []), '', topic.ask])
    tries.push([`${HEAD} · ${topic.title}`, ...body.filter(Boolean), ...(real ? [real] : []), topic.ask])
  }
  for (const lines of tries) {
    const t = lines.join('\n').replace(/\n{3,}/g, '\n\n')
    if (xLen(t) <= cap) return { text: t, topic: topic.key, real: Boolean(real) }
  }
  return { text: '', topic: topic.key, real: false }
}

/** The series number of a Film Room day (No. 1 on FIRST_WEEK). Pure. */
export const filmNumber = (day) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${FIRST_WEEK}T12:00:00Z`)) / (7 * 864e5)) + 1

/** The CALLED scorers of the stored nights, newest first, each man once: [{ sport, id, name, team, day }] (the card's faces; team is '' on a
 *  receipt stored before 2026-10-21, which kept no club). Pure. */
export function filmFaces(receipts = []) {
  const out = []
  for (const r of (receipts || []).slice().sort((a, b) => String(b.day).localeCompare(String(a.day)))) {
    for (const g of r?.payload?.results || []) {
      if (g?.outcome !== 'cashed' || g.tracking || !g.name || g.player_id == null) continue
      if (out.some((o) => o.sport === g.sport && o.id === String(g.player_id))) continue
      out.push({ sport: g.sport, id: String(g.player_id), name: String(g.name), team: g.team ? String(g.team) : '', day: r.day })
    }
  }
  return out
}

const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const capsDay = (d) => `${MON3[Number(String(d).slice(5, 7)) - 1]} ${Number(String(d).slice(8, 10))}`
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms) })]).finally(() => clearTimeout(t)) }

/**
 * THE PICTURE: PNG bytes or null. `draw` is lib/cards/filmRoomCard.js renderFilmRoom (loaded lazily, like every card), `face` = (sport, id) => data URI.
 * Up to five faces that load, the first one the CALLED example. Never throws; 20 seconds at most.
 */
export async function filmPicture({ day, data, receipts, draw = null, face = null, logo = null, timeoutMs = 20000 }) {
  try {
    const render = draw || (await import('../cards/filmRoomCard')).renderFilmRoom
    const faceOf = face || (await import('../cards/faceOf')).faceOf
    let logoFor = logo   // the club mark every card uses (lib/cards/adapters/common.js logoFor, KNOWN-ISSUES #9), loaded only when a face has a club
    return await withTimeout((async () => {
      const faces = []
      for (const f of filmFaces(receipts)) {
        if (faces.length >= 5) break
        const pic = await faceOf(f.sport, f.id)
        if (!pic) continue
        if (f.team && !logoFor) logoFor = (await import('../cards/adapters/common')).logoFor
        const lg = f.team ? await logoFor(f.sport, f.team).catch(() => null) : null   // no club stored (an older receipt): no logo, as before
        faces.push({ ...f, face: pic, team: f.team || '', logo: lg?.src || '', logoPlate: Boolean(lg?.plate), dayWord: capsDay(f.day) })
      }
      const d = new Date(`${day}T12:00:00Z`)
      return render({ topic: topicFor(day), n: filmNumber(day), data, ex: faces[0] || null, faces, dayWord: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCDate()}` })
    })(), timeoutMs)
  } catch (e) { console.error(`[film] picture failed: ${e?.message || e}`); return null }
}

/** The window of nights a Wednesday's Film Room reads: the 7 nights before it ("the last 7 nights"). Pure. */
export const filmWindow = (day) => ({ from: shiftDay(day, -7), to: shiftDay(day, -1) })

const _wait = new Map()   // day -> ms of the last try that needs time
const RETRY_MS = 10 * 60e3
export const _resetFilmForTests = () => _wait.clear()

/**
 * One try at a Wednesday's Film Room: read the 7 nights' receipts and the last Tuesday result, claim, post to X (through the
 * cap / pause gate) and the free feed channel. `day` = the Phoenix posting day (a Wednesday). Never throws on a read.
 * @returns {Promise<string>} what happened, for the tick's log
 */
export async function postFilmRoomOnce(db, { day, hooks = '', now = Date.now(), draw = null, face = null } = {}) {
  if (filmOff()) return 'off'      // ON in code like the Card kinds (POST_KINDS_ON does not switch it): FILM_ROOM_OFF=on is the switch
  if (knownTaken(day, FILM_KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  const done = await db.from('homer_feed_posts').select('day').match({ day, kind: FILM_KIND }).maybeSingle()
  if (done?.data) { markTaken(day, FILM_KIND); return 'already-posted' }      // a cold instance after the post: one cheap read, not three
  const { from, to } = filmWindow(day)
  const rec =await db.from('homer_feed_posts').select('day, payload').eq('kind', 'receipt').gte('day', from).lte('day', to)
  if (rec.error) { _wait.set(day, now); console.error(`[film] receipts read failed: ${rec.error.message}`); return 'read-failed' }
  const tue = await db.from('homer_feed_posts').select('day, payload').eq('kind', 'card_ls_tuesday_result').gte('day', shiftDay(day, -8)).lte('day', day).order('day', { ascending: false }).limit(1)
  const data = filmData({ receipts: rec.data || [], tuesdayRow: tue?.error ? null : (tue?.data || [])[0] || null })
  const t = filmRoomText({ day, data })
  if (!t.text) { _wait.set(day, now); recordPost({ day, kind: FILM_KIND, sport: 'mlb', state: 'DROPPED', reason: 'nothing fits' }); return 'none: nothing fits' }
  // the picture BEFORE the claim: a slow render must never leave a claimed day with nothing sent
  const png = await filmPicture({ day, data, receipts: rec.data || [], draw, face })
  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: FILM_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { _wait.set(day, now); console.error(`[film] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, FILM_KIND)
  if (!claim.data?.length) return 'already-posted'
  const patch = { payload: { topic: t.topic, real: t.real, from, to, picture: Boolean(png) } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: FILM_KIND })
    if (del?.error) { console.error(`[film] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, FILM_KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day, kind: FILM_KIND, repeat: false })
    if (g.state === 'go') {
      const mediaIds = png ? [await uploadImageToX(png)].filter(Boolean) : []      // an upload that fails leaves the post as text
      const r = await postToX(t.text, { kind: FILM_KIND, ...(mediaIds.length ? { mediaIds } : {}) })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: FILM_KIND, tweetId: r.id, text: t.text }) }
      else {
        console.error(`[film] refused: ${r.status} ${r.error}`)
        if (mayRetryPost(r, `${FILM_KIND}|${day}`) && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(t.text, { kind: FILM_KIND, sportKey: 'mlb', ...(png ? { png } : {}) }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: FILM_KIND })
  if (saved?.error) console.error(`[film] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
