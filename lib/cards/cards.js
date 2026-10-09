// THE CARDS (fix14, 2026-10-08), every one a composition of lib/cards/kit.js.
// Five layouts serve seven buttons:
//   playerCard      one hitter                      (MOONSHOT player modal)
//   rankedCard      a ranked list, #1 as the lead   (Watchlist, Board, Game: one layout, three headers)
//   recordCard      the season record, per category (Track record)
//   pitcherCard     one starter and his tiles       (pitcher modal)
//   pickCard        one NFL pick, pregame or graded (TUDDY player modal, Accountability)
// Removed in this pass (said in the commit): the Pools, Pairs and Storylines
// cards. No face, no logo, no score: text lists that could not meet the card
// rules, and none had a score to lead with.
//
// Every function takes plain data, returns the finished card ({ c, log, ... });
// the download wrappers in components/shareCard.js and components/nfl/shareCard.js
// call savePng. Nothing here fetches except the pictures (faces, logos).
import { newCard, text, wrapText, statRow, proofLines, statusChip, face, logo, bar, note, loadImage, loadMark, logoUrl, logoPlate, dayWord, alpha, W, H, M, HEAD_H, FOOT_H, SANS, NUM } from './kit.js'
import { callStatus, STATUS_WORD } from '../callStatus.js'
import { mlbHeadshot } from '../mlbTeams.js'
import { nflHeadshot } from '../nfl/nflAssets.js'
import { nameOf, teamOf, oppOf, hrScore, mlbId, n, clean } from '../player.js'
import { gradeFor, compactRole } from '../scoring.js'

const BODY_BOTTOM = H - FOOT_H - 18

// the product's face picture, by the registry's sport key
const FACE_OF = {
  mlb: ({ id }) => (id ? mlbHeadshot(id, 480, { strict: true }) : null),
  nfl: ({ espnId }) => (espnId ? nflHeadshot(String(espnId), 240, 240) : null),
  nhl: ({ photo }) => photo || null,
  nba: ({ id }) => (id ? `https://a.espncdn.com/i/headshots/nba/players/full/${encodeURIComponent(id)}.png` : null),
}
const faceFor = (sport, a) => FACE_OF[sport]?.(a) || null

/** A hitter's status word key, from the one place (lib/callStatus.js). null = we cannot say, so no chip. */
export function hitterStatus(p, boardOf = null) {
  const role = String(p?.game_pick_role || '').trim()
  const of = boardOf ?? p?.board_of ?? p?.stats?.board_of ?? null
  if (!role && !(of > 0 && Number(p?.board_rank) > 0)) return null
  return callStatus({ role, board_rank: p?.board_rank, board_of: of })
}

const dayOf = (p) => String(p?.game_date || p?.day || p?.date || '').slice(0, 10)
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
const iso3 = (v) => v.toFixed(3).replace(/^0/, '')

// ── 1. THE PLAYER CARD ────────────────────────────────────────────────────
const BANDS = [['wall_scraper', 'WALL'], ['laser', 'LASER'], ['standard', 'STD'], ['moonshot', 'MOON'], ['no_doubter', 'NODBT']]

export async function playerCard(p, { jersey = null, boardOf = null, sport = 'mlb', day = '' } = {}) {
  const team = teamOf(p), opp = oppOf(p)
  const [mark, faceImg, logoImg] = await Promise.all([loadMark(), loadImage(faceFor(sport, { id: mlbId(p) })), loadImage(logoUrl(sport, team))])
  const card = newCard(sport, { label: 'Player card', day: dayWord(day || dayOf(p)), sub: `${team} vs ${opp}`, mark })
  const { g, brand } = card
  const status = hitterStatus(p, boardOf)
  const called = status === 'called'

  // hero: the face, the status, the name, the club
  const fcx = M + 120, fcy = HEAD_H + 150
  face(card, faceImg, fcx, fcy, 240, { name: nameOf(p), team, ring: called ? brand.accent : brand.rule })
  const x0 = M + 240 + 40, mw = W - M - x0
  let cx = x0
  if (status) cx += statusChip(card, status, cx, HEAD_H + 62) + 14
  // the grade is on HIS market, as The Read enforces: a Skip HR never wears one
  const role = compactRole(p)
  const skipHr = /skip/i.test(role)
  const roleType = /hit/i.test(role) && !skipHr ? 'hit' : /hrr/i.test(role) ? 'hrr' : /(tb|contact)/i.test(role) ? 'tb' : 'hr'
  const grade = !skipHr && hrScore(p) > 0 ? gradeFor(p, roleType) : null
  if (grade) {
    g.strokeStyle = alpha(brand.ink, 0.35); g.lineWidth = 2
    const gw = text(card, `GRADE ${grade}`, cx + 18, HEAD_H + 63, { size: 26, weight: 800, color: brand.ink2 }).w
    g.beginPath(); g.roundRect(cx, HEAD_H + 62 - 24, gw + 36, 48, 10); g.stroke()
  }
  text(card, `${jersey != null ? `#${jersey} ` : ''}${nameOf(p)}`, x0, HEAD_H + 138, { size: 64, weight: 900, maxW: mw, min: 40 })
  const ty = HEAD_H + 138 + 76
  logo(card, logoImg, x0, ty - 32, 64, team, { plate: logoPlate(sport) })
  text(card, `${team}  vs ${opp}`, x0 + 82, ty, { size: 34, weight: 700, color: brand.ink2, maxW: mw - 82 })

  const spot = n(p?.lineup_spot, NaN)
  const bats = clean(p?.bats || p?.handedness, '')
  const bits = []
  if (bats && bats !== '—') bits.push(`${bats}HB`)
  if (Number.isFinite(spot) && spot >= 1 && spot <= 9) bits.push(`hitting ${ORD[spot]}`)
  const gs = n(p?.games_since_last_hr, NaN)
  if (Number.isFinite(gs)) bits.push(gs === 0 ? 'went yard last game' : `${gs}g since a homer`)
  if (bits.length) text(card, bits.join('  ·  '), x0, ty + 62, { size: 28, weight: 600, color: brand.dim, maxW: mw })

  // the score
  const sy = HEAD_H + 430
  const score = hrScore(p)
  text(card, 'HR SCORE', M, sy - 72, { size: 26, weight: 800, color: brand.dim })
  const sw = text(card, score.toFixed(0), M, sy + 22, { size: 140, weight: 900, color: brand.accent, family: 'num', maxW: 260 }).w
  bar(card, M + sw + 36, sy + 30, W - M - (M + sw + 36), score, { h: 22 })
  text(card, "MOONSHOT's own 0–100 ranking, not a probability", M + sw + 36, sy - 24, { size: 26, weight: 600, color: brand.dim, maxW: W - M - (M + sw + 36) })

  // the other four scores
  const hit = n(p?.hit_score, 0)
  const tiles = [['HIT', hit], ['HRR', n(p?.hrr_score, 0)], ['TB', n(p?.contact_score, 0)], ['OVR', n(p?.overall_score, 0)]]
  const ry = sy + 110
  statRow(card, tiles.map(([label, v]) => ({ label, value: v ? v.toFixed(0) : '—' })), ry, { h: 112 })

  // proof: 4 short lines of real stats
  const brl = n(p?.recent_barrel_rate, NaN), hh = n(p?.recent_hard_hit_rate, NaN)
  const iso = n(p?.season_iso, NaN)
  const hr9 = n(p?.pitcher_hr9, NaN)
  const pn = clean(p?.pitcher_name, '')
  const throws = clean(p?.pitcher_throws, '')
  const lines = [
    { label: 'This season', value: `${n(p?.season_hr, 0)} HR${Number.isFinite(iso) ? ` · ISO ${iso3(iso)}` : ''}`, hot: false },
    { label: 'Last 5 games', value: `${n(p?.last5_hr, 0)} HR · ${n(p?.last5_hits, 0)} H · ${n(p?.last5_xbh, 0)} XBH`, hot: n(p?.last5_hr, 0) >= 2 },
  ]
  if (Number.isFinite(brl) || Number.isFinite(hh)) lines.push({ label: 'Recent contact', value: [Number.isFinite(brl) ? `Barrel ${Math.round(brl * 100)}%` : null, Number.isFinite(hh) ? `Hard-hit ${Math.round(hh * 100)}%` : null].filter(Boolean).join(' · '), hot: Number.isFinite(brl) && brl >= 0.12 })
  if (pn && pn !== '—') lines.push({ label: 'Facing', value: `${pn}${throws && throws !== '—' ? ` (${throws}HP)` : ''}${Number.isFinite(hr9) ? ` · ${hr9.toFixed(2)} HR/9` : ''}`, hot: Number.isFinite(hr9) && hr9 >= 1.4 })
  const py = ry + 112 + 38
  const ph = proofLines(card, lines.slice(0, 4), py, { rowH: 64 })

  // his homer signature, when the season has one
  const prof = p?.hr_shape_profile || {}
  const sigN = n(prof?.n, 0)
  if (sigN > 0) {
    const y4 = py + ph + 34
    text(card, `💥 HIS HOMER SIGNATURE`, M, y4, { size: 28, weight: 800, color: brand.ink })
    text(card, `${sigN} tracked HR${sigN === 1 ? '' : 's'}${sigN < 4 ? ' · thin sample' : ''}`, W - M, y4, { size: 26, weight: 600, color: brand.dim, align: 'right' })
    const bx = M, bw = W - 2 * M, by = y4 + 50, bh = 28
    g.save(); g.beginPath(); g.roundRect(bx, by, bw, bh, 8); g.clip()
    g.fillStyle = alpha(brand.ink, 0.07); g.fillRect(bx, by, bw, bh)
    let acc = 0
    const shades = [0.28, 0.45, 0.62, 0.8, 1]
    BANDS.forEach(([key], i) => {
      const ct = n(prof?.[key], 0)
      if (!ct) return
      const sw2 = (ct / sigN) * bw
      g.fillStyle = i === 4 ? brand.accent : alpha(brand.ink, shades[i] * 0.55)
      g.fillRect(bx + acc, by, Math.max(0, sw2 - 3), bh)
      acc += sw2
    })
    g.restore()
    const legend = BANDS.map(([key, short]) => (n(prof?.[key], 0) ? `${short} ${n(prof[key], 0)}` : null)).filter(Boolean).join('   ·   ')
    text(card, legend, M, by + bh + 34, { size: 26, weight: 700, color: brand.ink2, maxW: bw })
  }
  return card
}

// ── 2. THE RANKED LIST (Watchlist, Board, Game) ────────────────────────────
// rows: [{ rank, name, team, opp, id, status, score, result }]
//   result: { text, hot } replaces the score once a game is graded
const ROW_H = 100

async function loadRowImages(sport, rows) {
  return Promise.all(rows.map(async (r) => ({
    face: await loadImage(faceFor(sport, { id: r.id, espnId: r.espnId, photo: r.photo })),
    logo: await loadImage(logoUrl(sport, r.team)),
  })))
}

function listRow(card, r, imgs, y, i, plate) {
  const { g, brand } = card
  if (i % 2 === 0) { g.fillStyle = alpha(brand.ink, 0.035); g.fillRect(0, y, W, ROW_H) }
  const mid = y + ROW_H / 2
  text(card, String(r.rank), M + 46, mid, { size: 34, weight: 800, color: r.rank <= 3 ? brand.ink : brand.dim, align: 'right', family: 'num' })
  face(card, imgs.face, M + 110, mid, 76, { name: r.name, team: r.team })
  logo(card, imgs.logo, M + 168, mid - 26, 52, r.team, { plate: plate })
  const nx = M + 244
  const sw = r.result ? text(card, r.result.text, W - M, mid, { size: 40, weight: 900, color: r.result.hot ? brand.accent : brand.ink, align: 'right', family: 'num', maxW: 250 }).w
    : text(card, r.score == null ? '—' : String(Math.round(r.score)), W - M, mid, { size: 46, weight: 900, color: brand.accent, align: 'right', family: 'num', maxW: 120 }).w
  const maxW = W - M - sw - 20 - nx
  text(card, r.name, nx, mid - 17, { size: 34, weight: 800, maxW })
  const sub = `${r.team}${r.opp ? ` vs ${r.opp}` : ''}`
  const sx = nx + text(card, sub, nx, mid + 24, { size: 26, weight: 600, color: brand.dim, maxW: Math.min(maxW, 300) }).w
  if (r.status) {
    // the status word, quiet text on a list row: accent only when it is a call
    text(card, `  ·  ${statusWord(r.status)}`, sx, mid + 24, { size: 26, weight: 800, color: r.status === 'called' ? brand.accent : brand.dim, maxW: Math.max(40, W - M - sw - 20 - sx) })
  }
}

const statusWord = (s) => STATUS_WORD[s] || ''

/**
 * @param {{ label:string, sub?:string, day?:string, lead?:object|null, banner?:object|null, rows:object[], total?:number, note?:string, maxRows?:number }} o
 *   lead: the #1 row, drawn big ({ rank, name, team, opp, id, status, score, scoreLabel, line })
 *   banner: a game's two clubs ({ away, home, when }) instead of a lead
 */
export async function rankedCard(sport, o) {
  const { label, sub = '', day = '', lead = null, banner = null, rows = [], total = null, note: noteText = '', maxRows = banner ? 8 : 8 } = o
  const list = rows.slice(0, maxRows)
  const mark = await loadMark()
  const [leadImgs] = lead ? await loadRowImages(sport, [lead]) : [null]
  const imgs = await loadRowImages(sport, list)
  const awayLogo = banner ? await loadImage(logoUrl(sport, banner.away)) : null
  const homeLogo = banner ? await loadImage(logoUrl(sport, banner.home)) : null
  const card = newCard(sport, { label, day: dayWord(day), sub, mark })
  const { g, brand } = card
  let y = HEAD_H

  if (lead) {
    const hh = 250
    const cy = y + 125
    const called = lead.status === 'called'
    face(card, leadImgs.face, M + 90, cy, 180, { name: lead.name, team: lead.team, ring: called ? brand.accent : brand.rule })
    const x0 = M + 180 + 34
    const sw = text(card, String(Math.round(lead.score ?? 0)), W - M, cy + 6, { size: 124, weight: 900, color: brand.accent, align: 'right', family: 'num', maxW: 260 }).w
    text(card, lead.scoreLabel || 'SCORE', W - M, cy - 70, { size: 26, weight: 800, color: brand.dim, align: 'right' })
    const mw = W - M - sw - 24 - x0
    let chipW = 0
    if (lead.status) chipW = statusChip(card, lead.status, x0, y + 44, { size: 24 })
    text(card, `#${lead.rank} ON THIS LIST`, x0 + chipW + (chipW ? 14 : 0), y + 44, { size: 24, weight: 800, color: brand.dim, maxW: mw - chipW - 14 })
    text(card, lead.name, x0, y + 108, { size: 50, weight: 900, maxW: mw, min: 30 })
    logo(card, leadImgs.logo, x0, y + 142, 52, lead.team, { plate: logoPlate(sport) })
    text(card, `${lead.team}${lead.opp ? `  vs ${lead.opp}` : ''}`, x0 + 68, y + 168, { size: 30, weight: 700, color: brand.ink2, maxW: mw - 68 })
    if (lead.line) text(card, lead.line, x0, y + 220, { size: 26, weight: 600, color: brand.dim, maxW: W - M - x0 })
    y += hh
    g.strokeStyle = alpha(brand.accent, 0.35); g.lineWidth = 2
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke()
  }

  if (banner) {
    const hh = 200, cy = y + hh / 2
    logo(card, awayLogo, M + 60, cy - 56, 112, banner.away, { plate: logoPlate(sport) })
    text(card, banner.away, M + 190, cy, { size: 64, weight: 900 })
    text(card, '@', W / 2, cy - 6, { size: 40, weight: 700, color: brand.dim, align: 'center' })
    logo(card, homeLogo, W / 2 + 40, cy - 56, 112, banner.home, { plate: logoPlate(sport) })
    text(card, banner.home, W / 2 + 170, cy, { size: 64, weight: 900 })
    if (banner.when) text(card, banner.when, W - M, y + hh - 28, { size: 26, weight: 600, color: brand.dim, align: 'right' })
    y += hh
    g.strokeStyle = alpha(brand.ink, 0.12); g.lineWidth = 2
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke()
  }

  if (!list.length) {
    text(card, o.empty || 'Nothing to show on this list.', M, y + 60, { size: 30, weight: 700, color: brand.dim, maxW: W - 2 * M })
  }
  list.forEach((r, i) => { listRow(card, r, imgs[i], y + i * ROW_H, i, logoPlate(sport)) })
  y += list.length * ROW_H
  const more = (total ?? rows.length + (lead ? 1 : 0)) - list.length - (lead ? 1 : 0)
  if (more > 0) text(card, `+ ${more} more on the list`, M, y + 44, { size: 28, weight: 700, color: brand.dim })
  if (noteText) note(card, noteText, { lines: 1 })
  return card
}

// ── 3. THE TRACK RECORD ───────────────────────────────────────────────────
export async function recordCard(sport, { rows = [], seasonOk = 0, seasonN = 0, seasonPct = null, lockOk = 0, lockN = 0, lockPct = null, lockNights = 0, days = 0 } = {}) {
  const mark = await loadMark()
  const card = newCard(sport, { label: 'Track record', day: dayWord(''), sub: `${days} graded day${days === 1 ? '' : 's'} · every category, its own bar`, mark })
  const { brand } = card
  let y = HEAD_H + 50
  text(card, 'SEASON, EVERY PICK', M, y, { size: 26, weight: 800, color: brand.dim })
  const rec = seasonN ? `${seasonOk}/${seasonN}` : '—'
  const rw = text(card, rec, M, y + 84, { size: 112, weight: 900, family: 'num', maxW: 560 }).w
  if (seasonPct != null) text(card, `${seasonPct.toFixed(1)}%`, M + rw + 28, y + 84, { size: 64, weight: 900, color: brand.accent, family: 'num', maxW: W - M - (M + rw + 28) })
  if (lockN) {
    text(card, 'FROZEN AT FIRST PITCH', M, y + 176, { size: 26, weight: 800, color: brand.dim })
    text(card, `${lockOk}/${lockN}${lockPct != null ? ` · ${lockPct.toFixed(1)}%` : ''}`, W - M, y + 176, { size: 44, weight: 900, align: 'right', family: 'num', maxW: 560 })
  }
  y += 224
  const g = card.g
  g.strokeStyle = alpha(brand.ink, 0.12); g.lineWidth = 2
  g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke()
  const list = rows.slice(0, 6)
  const rowH = Math.min(150, Math.floor((BODY_BOTTOM - 70 - y) / Math.max(1, list.length)))
  list.forEach((r, i) => {
    const ry = y + i * rowH
    const cat = r.cat || {}
    const label = String(cat.label || '').toUpperCase()
    text(card, label, M, ry + 38, { size: 34, weight: 900 })
    text(card, r.base != null ? `${r.base.toFixed(1)}%` : '—', W - M, ry + 38, { size: 44, weight: 900, color: brand.accent, align: 'right', family: 'num' })
    bar(card, M, ry + 80, W - 2 * M, r.base || 0, { h: 16 })
    text(card, `${r.ok}/${r.n} · grade ${r.grade?.g || '—'}`, M, ry + 114, { size: 26, weight: 600, color: brand.dim, maxW: W - 2 * M })
  })
  note(card, lockNights
    ? `locked ${lockNights} night${lockNights === 1 ? '' : 's'} — every locked pick froze at first pitch`
    : 'own-bar rate, pooled across every graded night', { lines: 1 })
  return card
}

// ── 4. THE PITCHER ────────────────────────────────────────────────────────
export async function pitcherCard(sport, { id = null, name, team, opp, throws, weakSide, tiles = [], topBat = null, day = '' } = {}) {
  const [mark, faceImg, logoImg, batFace] = await Promise.all([
    loadMark(), loadImage(faceFor(sport, { id })), loadImage(logoUrl(sport, team)),
    topBat ? loadImage(faceFor(sport, { id: mlbId(topBat) })) : null,
  ])
  const card = newCard(sport, { label: 'Pitcher card', day: dayWord(day), sub: `${team || ''}${opp ? ` vs ${opp}` : ''}`, mark })
  const { brand } = card
  face(card, faceImg, M + 120, HEAD_H + 150, 240, { name, team, ring: brand.rule })
  const x0 = M + 280, mw = W - M - x0
  text(card, "TONIGHT’S STARTER", x0, HEAD_H + 62, { size: 26, weight: 800, color: brand.accent, maxW: mw })
  text(card, name || 'Unknown', x0, HEAD_H + 138, { size: 64, weight: 900, maxW: mw, min: 40 })
  const ty = HEAD_H + 138 + 76
  logo(card, logoImg, x0, ty - 32, 64, team, { plate: logoPlate(sport) })
  const bits = [opp ? `vs ${opp}` : null, throws ? `${throws}HP` : null].filter(Boolean).join('  ·  ')
  text(card, bits, x0 + 82, ty, { size: 34, weight: 700, color: brand.ink2, maxW: mw - 82 })
  if (weakSide) text(card, `bleeds vs ${weakSide}`, x0, ty + 62, { size: 28, weight: 600, color: brand.dim, maxW: mw })
  const T = tiles.slice(0, 8).map((t) => ({ label: String(t.label || ''), value: String(t.value ?? '—'), hot: t.tone === 'hot' }))
  const ty2 = HEAD_H + 400
  const used = statRow(card, T, ty2, { cols: 4, h: 150 })
  let y = ty2 + used + 50
  if (topBat) {
    const { g } = card
    g.strokeStyle = alpha(brand.ink, 0.12); g.lineWidth = 2
    g.beginPath(); g.moveTo(M, y - 24); g.lineTo(W - M, y - 24); g.stroke()
    text(card, 'THE BAT THIS ARSENAL SPLIT IS BUILT AROUND', M, y + 12, { size: 26, weight: 800, color: brand.dim, maxW: W - 2 * M })
    face(card, batFace, M + 60, y + 110, 100, { name: nameOf(topBat), team: teamOf(topBat) })
    text(card, nameOf(topBat), M + 140, y + 98, { size: 38, weight: 800, maxW: 560 })
    text(card, `${teamOf(topBat)}${oppOf(topBat) ? ` vs ${oppOf(topBat)}` : ''}`, M + 140, y + 138, { size: 26, weight: 600, color: brand.dim, maxW: 560 })
    text(card, hrScore(topBat).toFixed(0), W - M, y + 112, { size: 72, weight: 900, color: brand.accent, align: 'right', family: 'num' })
  }
  note(card, 'hot = good for the bats facing him · cold = his strength', { lines: 1 })
  return card
}

// ── 5. THE NFL PICK, PREGAME OR GRADED ────────────────────────────────────
// The data decides, as it always did: a `hit` (true/false/null-void) makes it a
// result card; otherwise it is the pregame case.
export async function pickCard(sport, pick = {}) {
  const graded = pick.hit === true || pick.hit === false || pick.void === true
  const [mark, faceImg, logoImg] = await Promise.all([loadMark(), loadImage(faceFor(sport, { espnId: pick.espnId, id: pick.id })), loadImage(logoUrl(sport, pick.team))])
  const card = newCard(sport, {
    label: graded ? 'Result card' : 'Pick card', day: dayWord(pick.day || ''),
    sub: `${pick.marketLabel || ''}${pick.rank ? ` · rung ${pick.rank} of 5` : ''}`, mark,
  })
  const { g, brand } = card
  const won = pick.hit === true
  const lost = graded && !won
  // a miss is built from the greys: dim ring, grey photo, no accent on the result
  face(card, faceImg, M + 120, HEAD_H + 150, 240, { name: pick.name, team: pick.team, ring: won || !graded ? brand.accent : brand.rule, gray: lost })
  const x0 = M + 280, mw = W - M - x0
  let cx = x0
  if (pick.status) cx += statusChip(card, pick.status, cx, HEAD_H + 62, { quiet: lost }) + 14
  if (pick.grade) {
    const gw = text(card, `GRADE ${pick.grade}`, cx + 18, HEAD_H + 63, { size: 26, weight: 800, color: brand.ink2 }).w
    g.strokeStyle = alpha(brand.ink, 0.35); g.lineWidth = 2
    g.beginPath(); g.roundRect(cx, HEAD_H + 62 - 24, gw + 36, 48, 10); g.stroke()
  }
  text(card, pick.name || 'Unknown', x0, HEAD_H + 138, { size: 64, weight: 900, maxW: mw, min: 40 })
  const ty = HEAD_H + 138 + 76
  logo(card, logoImg, x0, ty - 32, 64, pick.team, { plate: logoPlate(sport) })
  text(card, [pick.position, pick.team].filter(Boolean).join(' · ') + (pick.opp ? `  vs ${pick.opp}` : ''), x0 + 82, ty, { size: 34, weight: 700, color: brand.ink2, maxW: mw - 82 })
  const idBits = []
  if (pick.questionable) idBits.push('Q')
  if (pick.low_sample) idBits.push('backfilled, thin sample')
  if (idBits.length) text(card, idBits.join('  ·  '), x0, ty + 62, { size: 28, weight: 600, color: brand.dim, maxW: mw })

  const y1 = HEAD_H + 420
  g.strokeStyle = alpha(brand.ink, 0.12); g.lineWidth = 2
  g.beginPath(); g.moveTo(0, y1 - 40); g.lineTo(W, y1 - 40); g.stroke()
  const lines = []
  let lineY = y1 + (graded ? 190 : 270)
  if (!graded) {
    text(card, pick.marketLabel ? pick.marketLabel.toUpperCase() : 'SCORE', M, y1 + 8, { size: 26, weight: 800, color: brand.dim, maxW: 520 })
    const has = Number.isFinite(pick.score)
    const sw = text(card, has ? String(Math.round(pick.score)) : '—', M, y1 + 140, { size: 220, weight: 900, color: brand.accent, family: 'num', maxW: 420 }).w
    if (has) bar(card, M + sw + 40, y1 + 150, W - M - (M + sw + 40), pick.score, { h: 28 })
    if (Number.isFinite(pick.bar)) lines.push({ label: 'The market’s bar', value: String(pick.bar) })
    if (pick.rank) lines.push({ label: 'Rung', value: `${pick.rank} of 5` })
  } else {
    const word = won ? 'HIT' : lost && pick.hit === false ? 'MISS' : 'VOID'
    // the stamp: HIT wears the accent, filled. MISS and VOID are outlined grey.
    g.font = `900 120px ${SANS}`
    const ww = g.measureText(word).width + 80
    if (won) { g.fillStyle = brand.accent; g.beginPath(); g.roundRect(M, y1 - 6, ww, 150, 24); g.fill() }
    else { g.strokeStyle = alpha(brand.ink, 0.28); g.lineWidth = 4; g.beginPath(); g.roundRect(M + 2, y1 - 4, ww - 4, 146, 22); g.stroke() }
    text(card, word, M + 40, y1 + 72, { size: 120, weight: 900, color: won ? brand.bg : brand.dim, maxW: ww - 60 })
    if (Number.isFinite(pick.actual)) {
      text(card, 'ACTUAL', W - M, y1 + 20, { size: 26, weight: 800, color: brand.dim, align: 'right' })
      text(card, String(pick.actual), W - M, y1 + 96, { size: 100, weight: 900, color: won ? brand.accent : brand.ink2, align: 'right', family: 'num', maxW: 300 })
    }
    if (Number.isFinite(pick.actual) && Number.isFinite(pick.bar) && pick.bar > 0) {
      // actual against the market's own bar: the tick is the bar, the fill is what he did
      const top = Math.max(pick.actual, pick.bar) * 1.12
      const bx = M, bw = W - 2 * M, by = y1 + 196
      g.fillStyle = alpha(brand.ink, 0.09); g.beginPath(); g.roundRect(bx, by - 12, bw, 24, 12); g.fill()
      g.fillStyle = won ? brand.accent : alpha(brand.ink, 0.38)
      g.beginPath(); g.roundRect(bx, by - 12, Math.max(24, bw * (pick.actual / top)), 24, 12); g.fill()
      const tx = bx + bw * (pick.bar / top)
      g.fillStyle = brand.ink; g.fillRect(tx - 2, by - 26, 4, 52)
      text(card, `BAR ${pick.bar}`, Math.min(tx, W - M - 90), by + 54, { size: 26, weight: 800, color: brand.ink2, align: tx > W - M - 90 ? 'right' : 'center' })
      lineY += 90
    }
    if (pick.marketLabel) lines.push({ label: 'Market', value: pick.marketLabel })
    if (pick.void && !Number.isFinite(pick.actual)) lines.push({ label: 'No result', value: 'cut, inactive, or a bye' })
    if (pick.grade) lines.push({ label: 'Called pregame at grade', value: pick.grade })
  }
  proofLines(card, lines.slice(0, 4), lineY, { rowH: 84, size: 36 })
  note(card, graded ? 'graded against the market’s own bar — see Accountability for the full card' : 'not a probability — a 0–100 ranking for this market', { lines: 1 })
  return card
}
