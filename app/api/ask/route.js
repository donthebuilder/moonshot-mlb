// THE ANSWER — one player, everything CALLED IT knows, ready to paste.
//
// Donovan, 2026-09-18, after the content-strategy pass: the whole distribution
// plan ("find a sports moment, add what only our database knows") dies on
// friction. Quoting a home-run clip with real numbers is only ever going to
// happen if the lookup takes twenty seconds on a phone during a game. Opening
// the site, finding the hitter, reading numbers off a card and retyping them
// into X is a two-minute job, which means it happens twice and then stops.
//
// So: type a name, get a post. That is the entire product of this route.
//
// WHY THE LOOKUP IS SERVER-SIDE. today_slim.json is about four megabytes. A
// standalone page that fetched it would be unusable on a phone on stadium
// wifi, which is exactly where this gets used. The server fetches it once,
// caches it for five minutes, and hands back a few hundred bytes.
//
// IT ANSWERS THE THREE-STATE QUESTION FIRST (the project's own rule #14):
// CALLED, ON THE BOARD, or NOT ON THE BOARD. That distinction IS the product;
// a stat dump without it is something anyone could scrape.
//
// NOTHING IS INVENTED. Every number comes off the published board row. A
// player who isn't on tonight's slate gets told so plainly rather than given
// a fabricated line.

import { fetchBoardFull, fetchRunMeta } from '../../../lib/dash/board'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.vercel.app'

const TTL_MS = 5 * 60 * 1000
const cache = { at: 0, rows: null, meta: null }

async function board() {
  if (cache.rows && Date.now() - cache.at < TTL_MS) return cache
  const [rows, meta] = await Promise.all([
    fetchBoardFull('today').catch(() => null),
    fetchRunMeta('today').catch(() => null),
  ])
  // An empty board is never cached -- a bot that has not published yet should
  // be asked again next request, not remembered as "nobody is playing" for
  // five minutes. Same rule boardIndex() uses in the homer tick.
  if (Array.isArray(rows) && rows.length) {
    cache.at = Date.now()
    cache.rows = rows
    cache.meta = meta
  }
  return cache
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v) => String(v == null ? '' : v).trim()
// Accents off, case off -- "Peña" has to match "pena", which is what anyone
// types on a phone.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const one = (v) => (num(v) == null ? null : Math.round(num(v) * 10) / 10)
const avg3 = (v) => (num(v) == null ? null : num(v).toFixed(3).replace(/^0\./, '.'))

/** Board rows whose name matches, best first. Surname hits rank above mid-name. */
function match(rows, q) {
  const f = fold(q)
  if (f.length < 2) return []
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const id = txt(r.player_id)
    if (!id || seen.has(id)) continue
    const name = fold(r.name)
    if (!name.includes(f)) continue
    seen.add(id)
    const last = name.split(/\s+/).slice(-1)[0] || ''
    out.push({ row: r, rank: last.startsWith(f) ? 0 : name.startsWith(f) ? 1 : 2 })
  }
  out.sort((a, b) => a.rank - b.rank || (num(b.row.hr_score) || 0) - (num(a.row.hr_score) || 0))
  return out.slice(0, 8).map((m) => m.row)
}

const ROLE_WORD = { TOP: 'TOP pick', HR: 'HR pick', HRR: 'HRR pick', HIT: 'HIT pick', CONTACT: 'CONTACT pick', TB: 'TB pick', WATCH: 'WATCH' }

function answerFor(r, meta) {
  const role = txt(r.game_pick_role).toUpperCase()
  const called = Boolean(role)
  const name = txt(r.name)
  const team = txt(r.team)
  const opp = txt(r.opponent)
  const arm = txt(r.pitcher_name)
  const hr = one(r.hr_score)
  const state = called ? `CALLED — ${ROLE_WORD[role.split('/')[0]] || role}` : 'ON THE BOARD — no call'

  // Supporting evidence, in the order a person would actually want it. Every
  // line is dropped when its field is missing rather than printed as a dash.
  const ev = []
  if (hr != null) ev.push(`HR Score ${hr}`)
  const l5 = avg3(r.last5_avg)
  if (l5 && num(r.last5_hr) != null) ev.push(`${l5} last 5, ${Math.round(num(r.last5_hr))} HR`)
  const blast = one(num(r.recent_blast_rate) != null ? num(r.recent_blast_rate) * 100 : null)
  if (blast != null) ev.push(`${blast}% blast rate`)
  const l3 = num(r.pitcher_l3_hr9)
  if (arm && l3 != null) ev.push(`${arm}: ${l3.toFixed(2)} HR/9 last 3`)

  const head = '🌙 MOONSHOT · TONIGHT'
  const who = `${name}${team ? ` (${team})` : ''}${opp ? ` vs ${opp}` : ''}`
  const tail = `${SITE_HOST}/called`
  for (let n = ev.length; n >= 0; n -= 1) {
    const body = [head, '', who, '', state, ...ev.slice(0, n), '', tail]
    const s = body.join('\n')
    if (s.length <= 270) {
      return {
        player_id: txt(r.player_id), name, team, opp, pitcher: arm,
        called, role: role || null, state, hr_score: hr,
        venue: txt(r.venue_name) || null,
        lineup_confirmed: Boolean(r.lineup_confirmed),
        slate_date: meta?.slate_date || null,
        text: s,
      }
    }
  }
  return null
}

export async function GET(request) {
  const q = String(new URL(request.url).searchParams.get('q') || '').trim()
  const { rows, meta } = await board()
  if (!rows) return Response.json({ error: 'board-unavailable' }, { status: 503 })
  if (q.length < 2) return Response.json({ q, slate_date: meta?.slate_date || null, hits: [] })

  const hits = match(rows, q)
  if (!hits.length) {
    // The honest answer, and a genuinely good post in its own right -- the
    // third state the whole product is built on.
    return Response.json({
      q,
      slate_date: meta?.slate_date || null,
      hits: [],
      offBoard: {
        state: 'NOT ON THE BOARD',
        text: [`🌙 MOONSHOT · TONIGHT`, '', `${q} is not on tonight's board.`, '',
          'NOT ON THE BOARD — the model never surfaced him.', '',
          `${SITE_HOST}/called`].join('\n'),
      },
    })
  }
  return Response.json({
    q,
    slate_date: meta?.slate_date || null,
    hits: hits.map((r) => answerFor(r, meta)).filter(Boolean),
  })
}
