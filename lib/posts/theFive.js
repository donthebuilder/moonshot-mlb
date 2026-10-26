// THE FIVE (Friday's series, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "five names for the weekend, all sports"). Donovan, 2026-10-20, of the
// prototypes: "wow these are beautiful"; the version is A (made here: every sport in it, the network's parity rule): ONE CALL PER SPORT, then
// THE BEST OF THE REST.
//
// The candidates are THE SLATE's (lib/posts/slateLoad.js -> each sport's adapter: lib/posts/nfl.js, nhl.js, nba.js; MLB's rows come from the homers
// tick's main path, under THE SLATE's own board gate: app/api/dash/homers/tick fiveTick, since 2026-10-21): CALLED men only, each with his place on his own board (`rank` of `of`) and one real proof line, a man
// with any open problem (game started, goalie not confirmed, listed out) left out. A board's score is not comparable across sports, so "best"
// across sports is the place on his own board as a share of the board (rank / of): #6 of 405 beats #2 of 85.
//
//   WHEN    Friday (Phoenix) from FIVE_FROM_PHX, once (its own claim, homer_feed_posts kind the_five), when at least three men are usable;
//           while LAMP's first game is still to lock (lockWait) it waits, until FIVE_LAST_PHX.
//   WHAT    the post (head, hook, five numbered rows, the ask; the receipt line is added by postToX) and the picture: the Top 3 card with five
//           tiles (lib/cards/topThreeCard.js compact mode), each tile in its product's accent, #1 holo.
//   WHERE   X and the free feed channel. Undo: THE_FIVE_OFF=on.
import { BRAND, ALL_SPORT_KEYS } from '../routes'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { xLen } from './slate'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'

export const FIVE_KIND = 'the_five'
export const FIVE_FROM_PHX = 15 * 60 + 45      // 3:45 PM Phoenix (6:45 PM ET): a 7 PM puck drop or tip has its calls written by then
export const FIVE_LAST_PHX = 17 * 60           // 5 PM Phoenix: stop waiting for a late lock and post what is called
export const fiveOff = () => /^(on|1|true)$/i.test(String(process.env.THE_FIVE_OFF || '').trim())

const share = (c) => (c.rank > 0 && c.of > 0 ? c.rank / c.of : Infinity)
const byShare = (a, b) => share(a) - share(b) || a.rank - b.rank
const order = (s) => { const i = ALL_SPORT_KEYS.indexOf(s); return i < 0 ? 99 : i }
const keyOf = (c) => `${c.sport}:${c.id}`
const usable = (cands) => (cands || []).filter((c) => c && c.name && c.rank > 0 && c.of > 0 && !c.problem)

/** One per sport (its best), then the best of the rest, ordered by share. `sports` = the adapters' outputs ([{ sport, cands }]). Pure. */
export function pickFive(sports, n = 5) {
  const all = (sports || []).flatMap((s) => usable(s.cands).map((c) => ({ ...c, sport: c.sport || s.sport })))
  const out = []
  const seen = new Set()
  for (const s of [...new Set(all.map((c) => c.sport))].sort((a, b) => order(a) - order(b))) {
    const top = all.filter((c) => c.sport === s).sort(byShare)[0]
    if (top && out.length < n) { out.push(top); seen.add(keyOf(top)) }
  }
  for (const c of all.slice().sort(byShare)) { if (out.length >= n) break; if (!seen.has(keyOf(c))) { out.push(c); seen.add(keyOf(c)) } }
  return out.sort(byShare)
}

/** Is The Five due? `clock` = phxClock(now) ({ day, dow, min }). Pure. */
export const fiveDue = (clock) => Boolean(clock && clock.dow === 5 && clock.min >= FIVE_FROM_PHX)
/** Post now, or wait: { go, reason }. `sports` = the adapters' outputs, `clock` as above. Pure. */
export function fiveTiming({ sports, clock }) {
  const picks = pickFive(sports)
  if (picks.length < 3) return { go: false, picks, reason: `${picks.length} usable calls (three at least)` }
  // a sport whose READ failed carries `hold` (lib/posts/slateLoad.js) and no candidates: wait for it like a lock until FIVE_LAST_PHX, then go without it (batch 3, 2026-10-26)
  const waiting = (sports || []).filter((s) => s.lockWait || s.hold).map((s) => s.sport)
  if (waiting.length && clock.min < FIVE_LAST_PHX) return { go: false, picks, reason: `waiting for ${waiting.join(', ')} to lock` }
  return { go: true, picks, reason: waiting.length ? `going without ${waiting.join(', ')}` : 'ready' }
}

const ICON = (s) => BRAND[s]?.icon || ''
/** One row: "1. 🏈 Jahmyr Gibbs (DET) · #1 of 307 · 7.7 red-zone touches a game". */
export const fiveLine = (c, i) => `${i + 1}. ${ICON(c.sport)} ${c.name}${c.team ? ` (${c.team})` : ''} · #${c.rank} of ${c.of}${c.proof && !/^#\d+ of/.test(c.proof) ? ` · ${c.proof}` : ''}`
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Weekend of Oct 23" from the Friday's date. Pure. */
export const weekendWords = (day) => `Weekend of ${MON[Number(String(day).slice(5, 7)) - 1]} ${Number(String(day).slice(8, 10))}`

/** THE POST. The long post first, then without the proof lines (280). '' with fewer than three names. Pure. */
export function fiveText({ picks, day, limit = HARD_LIMIT }) {
  if (!picks || picks.length < 3) return ''
  const head = `\u{1F590}\u{FE0F} THE FIVE · ${weekendWords(day).toUpperCase()}`
  const hook = 'One from every board, then the best of the rest \u{1F447}'
  const ask = picks.length === 5 ? "Who's your #1 of the five, network?" : "Who's your #1 of these, network?"   // 3 or 4 names: not "the five"
  const full = picks.map(fiveLine)
  const bare = picks.map((c, i) => fiveLine({ ...c, proof: null }, i))
  for (const lines of [full, bare]) for (const withHook of [true, false]) {
    const t = [head, '', ...(withHook ? [hook, ''] : []), ...lines, '', ask].join('\n')
    if (xLen(t) <= limit) return t
  }
  return ''
}

const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms) })]).finally(() => clearTimeout(t)) }
/**
 * THE PICTURE: the Top 3 card with five tiles. PNG bytes or null (never throws; 25 seconds at most). `draw` / `face` / `logo` are injectable for the
 * tests; by default the card kit is loaded lazily, like every card.
 */
export async function fivePicture({ picks, day, draw = null, face = null, logo = null, accent = null, timeoutMs = 25000 }) {
  try {
    const render = draw || (await import('../cards/topThreeCard')).renderTopThree
    const faceOf = face || (await import('../cards/faceOf')).faceOf
    const logoFor = logo || (await import('../cards/adapters/common')).logoFor
    const orange = accent || (await import('../theme')).C.orange
    return await withTimeout((async () => {
      const tiles = await Promise.all(picks.map(async (c, i) => {
        const [pic, lg] = await Promise.all([faceOf(c.sport, c.id), logoFor(c.sport, c.team).catch(() => ({ src: '', plate: false }))])
        return {
          sport: c.sport, name: c.name, team: c.team, face: pic, logo: lg?.src || '', logoPlate: Boolean(lg?.plate), tone: null,
          tier: i === 0 ? 'elite' : 'star', holo: i === 0, shimmer: i !== 0,
          tag: `CALLED · ${BRAND[c.sport]?.name || c.sport} · #${c.rank} OF ${c.of}`, line: c.proof || '',
        }
      }))
      return render({ sport: 'all', accent: orange, brand: { name: 'CALLED IT', league: 'ALL SPORTS' }, title: 'THE FIVE', dayWord: weekendWords(day), tiles, test: false, note: 'One from every board, then the rest' })
    })(), timeoutMs)
  } catch (e) { console.error(`[five] picture failed: ${e?.message || e}`); return null }
}

const _wait = new Map()   // day -> ms of the last try that needs time
const RETRY_MS = 5 * 60e3
export const _resetFiveForTests = () => _wait.clear()

/**
 * One try at a Friday's The Five. `load` = THE SLATE's loader for the day (async () => [adapter outputs]); `clock` = phxClock(now).
 * @returns {Promise<string>} what happened, for the tick's log
 */
export async function postFiveOnce(db, { day, clock, load, hooks = '', now = Date.now(), draw = null, face = null, logo = null } = {}) {
  if (fiveOff()) return 'off'
  if (!fiveDue(clock)) return 'not-due'
  if (knownTaken(day, FIVE_KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  const done = await db.from('homer_feed_posts').select('day').match({ day, kind: FIVE_KIND }).maybeSingle()
  if (done?.data) { markTaken(day, FIVE_KIND); return 'already-posted' }
  let sports
  try { sports = await load() } catch (e) { _wait.set(day, now); return `load-failed: ${e?.message || e}` }
  const timing = fiveTiming({ sports, clock })
  if (!timing.go) { _wait.set(day, now); return `held: ${timing.reason}` }
  const text = fiveText({ picks: timing.picks, day, limit: postLimit() + TAIL_MARGIN })
  if (!text) { _wait.set(day, now); recordPost({ day, kind: FIVE_KIND, sport: 'mlb', state: 'DROPPED', reason: 'nothing fits' }); return 'none: nothing fits' }
  // the picture BEFORE the claim: a slow render must never leave a claimed day with nothing sent
  const png = await fivePicture({ picks: timing.picks, day, draw, face, logo })
  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: FIVE_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { _wait.set(day, now); console.error(`[five] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, FIVE_KIND)
  if (!claim.data?.length) return 'already-posted'
  const ids = timing.picks.map((c) => String(c.id))
  const patch = { payload: { picks: timing.picks.map((c) => ({ sport: c.sport, player_id: String(c.id), name: c.name, rank: c.rank, of: c.of })), picture: Boolean(png) } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: FIVE_KIND })
    if (del?.error) { console.error(`[five] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, FIVE_KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day, kind: FIVE_KIND, ids, repeat: false })
    if (g.state === 'go') {
      const mediaIds = png ? [await uploadImageToX(png)].filter(Boolean) : []
      const r = await postToX(text, { kind: FIVE_KIND, ...(mediaIds.length ? { mediaIds } : {}) })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: FIVE_KIND, ids, tweetId: r.id, text }) }
      else {
        console.error(`[five] refused: ${r.status} ${r.error}`)
        if (mayRetryPost(r, `${FIVE_KIND}|${day}`) && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(text, { kind: FIVE_KIND, sportKey: 'mlb', ...(png ? { png } : {}) }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: FIVE_KIND })
  if (saved?.error) console.error(`[five] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
