#!/usr/bin/env node
// THE PLAYBOOK SERIES, PRINTED FOR DONOVAN TO PASTE (2026-09-30, BATCH-PLAYBOOK
// P2). Nothing here posts anywhere: it prints plain text, <= 280 chars, no
// link, with REAL numbers from the same payloads the site reads:
//   tonight's board  data branch current/today_slim.json (lib/mlb/boardReason.js
//                    for every "why" number, so a post can't disagree with the card)
//   the record       /api/dash/four-record (each category's #1 on its own bar)
//   yesterday        current/graded_results_<date>.json (the night's homers,
//                    labelled by lib/callStatus.js's one rule)
// A number that isn't there prints "NO DATA: <field>" instead of the post.
// Never invented, never rounded into a percentage on a small n.
//
//   node scripts/playbook/series.mjs              all ten + the pinned post + the bio
//   node scripts/playbook/series.mjs --part 1     one part
//   node scripts/playbook/series.mjs --part 1 --player "Alvarez"   that hitter
import '../_esm-resolve.mjs'
const { reasonContext, boardReasonFor } = await import('../../lib/mlb/boardReason.js')
const { callStatus } = await import('../../lib/callStatus.js')
const { nameOf, teamOf, oppOf, hrScore, hitScore, prodScore, tbScore } = await import('../../lib/player.js')

const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const SITE = process.env.DASH_SITE || 'https://dashnetwork.vercel.app'
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const getJson = async (url) => { try { const r = await fetch(url); return r.ok ? await r.json() : null } catch { return null } }

const board = await getJson(`${DATA}/today_slim.json`)
const rows = Array.isArray(board) ? board : (board?.players || [])
const rec = (await getJson(`${SITE}/api/dash/four-record`))?.record || null
const through = (await getJson(`${SITE}/api/dash/four-record`))?.through || null
const graded = through ? await getJson(`${DATA}/graded_results_${through}.json`) : null
const ctx = rows.length ? reasonContext(rows) : null

class NoData extends Error {}
const need = (v, field) => { if (v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v))) throw new NoData(field); return v }
const byRank = [...rows].filter((r) => Number(r?.board_rank) > 0).sort((a, b) => a.board_rank - b.board_rank)
const topBy = (fn) => [...rows].filter((r) => Number.isFinite(fn(r))).sort((a, b) => fn(b) - fn(a))[0]
const pick = (fallback) => {
  const q = arg('--player')
  if (q) return need(rows.find((r) => String(r.player_id) === q || nameOf(r).toLowerCase().includes(q.toLowerCase())), `player "${q}" on tonight's board`)
  return need(fallback, "tonight's board")
}
const why = (p) => boardReasonFor(p, ctx)
const recLine = (k, word) => { const r = need(rec?.[k], `four-record.${k}`); return `${word} calls: ${r.hit} of ${r.n} nights` }
const vs = (p) => `${teamOf(p)} vs ${oppOf(p) || need(p.opponent, 'opponent')}`
const f1 = (v) => Number(v).toFixed(1)
const avg = (v) => Number(v).toFixed(3).replace(/^0/, '')
const CLOSE = 'Board → Card → EV → Pitch mix. That’s where I’d start.'

// Build a post from required lines + optional lines; drop optional lines
// (last first) until it fits 280. Never shortens a number.
function post(head, lines, optional = [], close = CLOSE) {
  let opt = [...optional]
  for (;;) {
    const body = [head, ...lines, ...opt, close].filter(Boolean).join('\n')
    if (body.length <= 280 || !opt.length) return body.length <= 280 ? body : `${body}\n[TOO LONG: ${body.length} chars -- trim by hand]`
    opt = opt.slice(0, -1)
  }
}

const PARTS = {
  1: () => {
    const p = pick(byRank[0]); const w = why(p)
    // The card line is his top reason that ISN'T exit velo -- the EV log line
    // already prints that number.
    const card = need(w.why.find((r) => r.key !== 'ev'), 'a why line other than exit velo')
    return post('Researching a home run on DASH (1/10):', [
      `1 Board: #${need(p.board_rank, 'board_rank')} is ${nameOf(p)} (${vs(p)}).`,
      `2 Record: ${recLine('HR', 'HR')}.`,
      `3 Card: ${card.text}.`,
      `4 EV log: recent exit velo ${f1(need(p.recent_ev, 'recent_ev'))} mph.`,
    ], [w.watch ? `5 Watch: ${w.watch.text}.` : null].filter(Boolean))
  },
  2: () => {
    const p = pick(topBy((r) => hitScore(r))); const w = why(p)
    return post('How to find a hit with DASH (2/10):', [
      `1 Board, Hits lens: ${nameOf(p)} (${vs(p)}), hit score ${f1(hitScore(p))}.`,
      `2 Record: ${recLine('HIT', 'Hit')}.`,
      `3 Card: ${avg(need(p.season_avg, 'season_avg'))} AVG, ${f1(100 * need(p.season_k_rate, 'season_k_rate'))}% K.`,
    ], [w.watch ? `4 Watch: ${w.watch.text}.` : null].filter(Boolean), 'Contact first, then the arm. You make the read.')
  },
  3: () => {
    const p = pick(topBy((r) => prodScore(r)))
    return post('How to research hits + runs + RBI (3/10):', [
      `1 Board, HRR lens: ${nameOf(p)} (${vs(p)}), HRR score ${f1(prodScore(p))}.`,
      `2 Record: ${recLine('HRR', 'HRR')} (bar: 2+).`,
      `3 Card: bats #${need(p.lineup_spot, 'lineup_spot')} in the order. Lineup spot matters as much as the swing.`,
    ], [], 'HRR needs teammates. Read the whole lineup.')
  },
  4: () => {
    const p = pick(topBy((r) => tbScore(r)))
    return post('How to research 2+ total bases (4/10):', [
      `1 Board, Contact lens: ${nameOf(p)} (${vs(p)}), score ${f1(tbScore(p))}.`,
      `2 Record: ${recLine('CONTACT', 'Contact')} (bar: 2+ TB).`,
      `3 Card: ${avg(need(p.season_slg, 'season_slg'))} SLG, ${avg(need(p.season_iso, 'season_iso'))} ISO.`,
    ], [], 'One double clears it. So do two singles.')
  },
  5: () => {
    const p = pick(byRank[0])
    const brl = need(p.recent_barrel_rate, 'recent_barrel_rate')
    return post('How to use the EV log (5/10):', [
      `${nameOf(p)}, #${need(p.board_rank, 'board_rank')} on tonight's board:`,
      `- recent exit velo ${f1(need(p.recent_ev, 'recent_ev'))} mph`,
      `- recent barrel rate ${f1(brl <= 1 ? 100 * brl : brl)}%`,
      `- ${need(p.season_hr, 'season_hr')} HR this season`,
    ], [], 'The EV log shows every ball behind those numbers: speed, angle, distance.')
  },
  6: () => {
    const [a, b, c] = byRank
    need(c, 'three ranked hitters')
    return post('How to read the MOONSHOT board (6/10):', [
      `${rows.length} hitters rated tonight, #1 to #${rows.length}.`,
      `Top 3: ${nameOf(a)}, ${nameOf(b)}, ${nameOf(c)}.`,
      `The WHY column says in numbers why each name is up there. #1 is a ranking, not a lock.`,
    ], [], 'Find the name on the board. Then go understand him.')
  },
  7: () => {
    const p = pick(topBy((r) => Number(r.pitch_type_match_score)))
    return post('How to read a pitch mix (7/10):', [
      `${nameOf(p)} faces ${need(p.pitcher_name, 'pitcher_name')} tonight.`,
      `Pitch-type match score: ${f1(need(p.pitch_type_match_score, 'pitch_type_match_score'))}, the best fit on the board.`,
      `Open his card's Pitch tab: the starter's mix beside what he does against each pitch.`,
    ], [], 'What he throws vs what he hits. That’s the matchup.')
  },
  8: () => {
    const [a, b] = byRank
    need(b, 'two ranked hitters')
    const ra = why(a).why, rb = why(b).why
    need(ra[0], `why for ${nameOf(a)}`); need(rb[0], `why for ${nameOf(b)}`)
    // Same lead reason? Then the comparison is in the next one -- say so.
    const same = ra[0].key === rb[0].key
    const wa = same ? need(ra.find((r) => r.key !== ra[0].key), `second why for ${nameOf(a)}`) : ra[0]
    const wb = same ? need(rb.find((r) => r.key !== rb[0].key), `second why for ${nameOf(b)}`) : rb[0]
    return post('How to compare two players (8/10):', [
      same ? `#1 ${nameOf(a)} and #2 ${nameOf(b)} lead on the same number. The next one splits them:` : 'The top two, and why each is there:',
      `${nameOf(a)}: ${wa.text}.`,
      `${nameOf(b)}: ${wb.text}.`,
    ], [], 'Pick the reason you believe. You make the read.')
  },
  9: () => {
    const games = new Set(rows.map((r) => r.game_pk).filter(Boolean)).size
    need(games || null, 'games tonight')
    return post('How to use DASH during a live game (9/10):', [
      `${games} games on tonight's board.`,
      `At the Plate: the hitter up right now, every pitch of the at-bat.`,
      `The card's WHY block stays the same all game; the EV log fills in as he swings.`,
    ], [], 'Watch the contact, not just the result.')
  },
  10: () => {
    const g = need(graded, `graded_results_${through || '<date>'}.json`)
    const cap = need(g.hr_capture_report, 'hr_capture_report')
    const homers = need(cap.all_homer_entries, 'hr_capture_report.all_homer_entries')
    const total = need(cap.total_hrs_on_slate, 'hr_capture_report.total_hrs_on_slate')
    const onSheet = need(cap.caught_hrs_on_sheet, 'hr_capture_report.caught_hrs_on_sheet')
    // CALLED by lib/callStatus.js's rule, from the pregame role on the night's
    // graded slots (the designated rows). "On the board" is the bot's own
    // count of homers by rated hitters (caught on the sheet) -- the graded
    // file carries only the designated rows, so it can't be counted here.
    const role = new Map((g.graded_slots || []).map((s) => [`${s.player_id}-${s.game_pk}`, s.game_pick_role]))
    const called = homers.filter((h) => callStatus({ role: role.get(`${h.player_id}-${h.game_pk}`) }) === 'called').length
    return post(`How to review yesterday's calls (10/10), ${through}:`, [
      `${total} home runs. ${called} by CALLED hitters, ${onSheet - called} more ON THE BOARD, ${total - onSheet} not on it.`,
      `Every call is graded in public, hits and misses: the record page.`,
    ], [], 'Review the misses too. That’s how you learn the board.')
  },
}

function pinned() {
  const hr = need(rec?.HR, 'four-record.HR'), hit = need(rec?.HIT, 'four-record.HIT')
  return post('CALLED IT is DASH’s public record: every pick posted before first pitch, graded after, hits and misses.', [
    `Last ${hr.nights} nights: HR calls ${hr.hit} of ${hr.n}, hit calls ${hit.hit} of ${hit.n}.`,
    'How to research a pick yourself: dashnetwork.vercel.app/playbook',
  ], [], '')
}
const BIO = 'DASH Network: MLB home runs, NFL touchdowns, NHL goals. Picks posted before the game, graded in public. Use the board to find the player; you make the read.'

const run = (label, fn) => {
  try { const t = fn(); console.log(`── ${label} (${t.length} chars) ──\n${t}\n`) } catch (e) {
    if (e instanceof NoData) console.log(`── ${label} ──\nNO DATA: ${e.message}\n`); else throw e
  }
}
const only = arg('--part')
if (!rows.length) console.log("NO DATA: tonight's board (today_slim.json)\n")
for (const k of Object.keys(PARTS)) if (!only || only === k) run(`PART ${k}`, PARTS[k])
if (!only) { run('PINNED', pinned); console.log(`── BIO (${BIO.length} chars) ──\n${BIO}\n`) }
