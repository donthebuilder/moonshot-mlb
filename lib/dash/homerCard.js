// THE MOONSHOT POSTERS (1200 x 675, what X and Discord show edge to edge), rendered on the server with next/og.
//
// REDRAWN 2026-10-12 in the baseball-card look (Donovan: "everything should be the baseball card look, even the one for the games"):
// every poster below is a LANDSCAPE VARIANT of the player card kit (lib/cards/posterKit.js on lib/cards/cardKit.js): the thin accent
// frame, the foil strip on a CALLED poster only, the letter-spaced status word, the portrait over a faded club-logo watermark, the
// slanted display-caps name, ruled metric tiles, the closing status banner and the quiet footer. The FACTS are unchanged: each poster
// reads the same fields with the same wording rules it always did; only the pixels moved.
//
//   homerCard(row)                         one home run                                 (app/api/dash/homers/card, the tick)
//   mlbhrCard(row, parsed, opts)           the @MLBHR reply card                         (the tick)
//   recapCard(day, rows, history)          the night: called / total, ten nights of bars (app/api/dash/homers/card)
//   pregameCard(day, picks)                the night's HR calls with the price           (app/api/dash/homers/card)
//   statCard(day, spec)                    one headline and its lines                    (the tick)
//   hotStretchCard(day, pick, opts)        THE HOT STRETCH                               (the tick)
//   pairsCard / longshotCard / numerologyCard                                            (the tick)
//
// Everything is read off the homer_feed row (or the board row the caller passes). Nothing is recomputed. A field the source lacks is
// simply not drawn. The accent is MOONSHOT's own (lib/sportAccent.js); the status words are lib/callStatus.js STATUS_WORD.
//
// TEXT FIT (2026-10-12): every text box below is measured with the real fonts (lib/cards/fit.js, through lib/cards/posterKit.js) before it
// is drawn: names step down and wrap, label / value rows give the value the width the label leaves, the price block shrinks before it
// crowds the banner, and the column plans its height so the footer never moves. scripts/check-poster-fit.mjs renders the worst cases.
//
// ONE STATUS WORD PER POSTER (same day): the kicker, the banner and the score caption all read callStatus(row) through STATUS_WORD. A
// CALLED player reads CALLED in all three; ON THE BOARD appears only on a player who is on the board and not called.
import { captureFrom, fmtOdds, matchupWord, roleWord } from './homerFeed'
import { callStatus, STATUS_WORD } from '../callStatus'
import { teamPrimary } from '../mlbTeams'
import { SPORT_ACCENT } from '../sportAccent'
import { surname } from '../player'
import {
  PORTRAIT_W, Poster, Portrait, posterStamps, NameLine, MatchLine, TileRow, TileCol, tileRowPlan, tileRowH, tileColH, KVTable, kvPlans, kvNatural, splitWidths, Banner, bannerRoom, oddsPlan, quietRight,
  Bullet, bulletPlan, bulletH, Chip, CellRow, cellsPlan, Lines, planText, planH, displayFit, fitAlts, splitLine, vlog, logFit, lineW, POSTER,
  assets, renderPoster, clubOf, mlbFace, prettyDay, bodyH, bodyW, alpha, lineH, textWidth, Logo, DISPLAY, INK, INK2, DIM, RULE, CHASSIS,
} from '../cards/posterKit'
// the font / mark / grain loaders and the palette stay importable from here (the prototype cards under lib/cards/proto read them)
export { INK, DIM, PANEL, RULE, DISPLAY, loadDisplay, loadFonts, loadGrain, loadMark } from '../cards/assets'
export { prettyDay }

const ACCENT = SPORT_ACCENT.mlb
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))
// Hook strings arrive with a leading emoji ("🔁 Back-to-back nights"). The poster bullets them instead, so the glyph and the variation
// selector come off the front; the tweet still carries them, which is where they earn their place.
const stripLead = (t) => String(t || '').replace(/^[^\p{L}\p{N}(#"']+/u, '').trim()
const pct = (v) => (fin(v) ? `${Math.round(Number(v) * 100)}%` : null)
const iso = (v) => (fin(v) ? Number(v).toFixed(3).replace(/^0/, '') : null)
const txt = (v) => { const t = String(v ?? '').trim(); return t && t !== 'undefined' && t !== 'null' && t !== 'NaN' ? t : '' }
const brand = 'MOONSHOT'
const PAD_L = 24
const COL_W = bodyW - PORTRAIT_W
/** The width a column's text can use beside the portrait: the left pad, and the poster's 48px safe margin on the right. */
const INNER = COL_W - PAD_L - POSTER.pad
const BALL_W = 164

/** A MOONSHOT player as the kit draws one: the club logo, the face, the club's own colour. */
async function playerOf(team, name, playerId) {
  const [club, face] = await Promise.all([clubOf('mlb', team), mlbFace(playerId)])
  return { ...club, name, face, tone: team ? teamPrimary(team) : null }
}

/**
 * The poster for one homer_feed row. Returns an ImageResponse (a Response whose body is the PNG). `site` is kept for the callers'
 * signature (the poster no longer prints a URL).
 */
export async function homerCard(row, { site = 'dashnetwork.vercel.app', stamps = undefined } = {}) {
  const stampsP = posterStamps({ sport: 'mlb', playerId: row?.player_id, day: txt(row?.day), stamps })   // ONE pregame situation stamp on the portrait (lib/cards/situations.js)
  const { grain } = await assets()
  const stampList = await stampsP
  const name = txt(row?.name) || 'Unknown'
  const team = txt(row?.team).toUpperCase()
  const score = fin(row?.hr_score) ? Math.round(Number(row.hr_score)) : null
  // ONE status, from lib/callStatus: the kicker, the banner and the score caption below all read it (a #12 who is CALLED must not wear
  // ON THE BOARD on the banner, and a #11 below the cut must not wear ON THE BOARD and NOT ON THE BOARD on one card)
  const status = callStatus(row)
  const called = status === 'called'
  const roles = txt(row?._roles || row?.role)
  const pickWord = roleWord(row?.role).toUpperCase()                    // "HRR PICK"
  const call = called
    ? [`${STATUS_WORD.called} — ${pickWord}${roles.includes('/') ? ` (${roles})` : ''}`, `${STATUS_WORD.called} — ${pickWord}`]
    : status === 'board' ? `${STATUS_WORD.board} — NO CALL` : STATUS_WORD.off
  // Short pick word. roleWord gives "TOP pick"; the tag has no room for the noun.
  const badgeWord = called ? roleWord(row.role).replace(/\s*pick$/i, '').toUpperCase() : ''
  const odds = Number(row?.odds_over)
  const book = txt(row?.odds_book)
  const hasOdds = Number.isFinite(odds) && odds !== 0 && !!book
  const nth = Number(row?.hr_n) > 1 ? `${Number(row.hr_n)} TONIGHT` : ''
  const s = row?.stats || {}
  const hooks = (Array.isArray(row?.hooks) ? row.hooks : []).slice(0, 3).map((h) => stripLead(h)).filter(Boolean)

  // THE BAT -- same rows, same thresholds as the site's card
  const bat = []
  // October: the regular season's line as it stands (nothing added) and the postseason count on its own row -- never one number made
  // of both seasons. Season unknown (postseason: null): the line, nothing added.
  if (s.postseason === true) {
    if (fin(s.post_nth)) bat.push({ label: 'Postseason', value: `${Number(s.post_nth)} HR`, hot: false })
    if (fin(s.season_hr)) bat.push({ label: ['Regular season', 'Reg. season', 'Season'], value: `${Number(s.season_hr)} HR${iso(s.season_iso) ? ` · ISO ${iso(s.season_iso)}` : ''}`, hot: false })
  } else if (fin(s.season_hr)) bat.push({ label: 'Season', value: `${Number(s.season_hr) + (s.postseason === null ? 0 : Number(row?.hr_n || 1))} HR${iso(s.season_iso) ? ` · ISO ${iso(s.season_iso)}` : ''}`, hot: false })
  if (fin(s.last5_hr) || fin(s.last5_hits)) bat.push({ label: 'Last 5', value: `${Number(s.last5_hr) || 0} HR · ${Number(s.last5_hits) || 0} H · ${Number(s.last5_xbh) || 0} XBH`, hot: Number(s.last5_hr) >= 2 })
  if (pct(s.barrel)) bat.push({ label: ['Barrel % (recent)', 'Barrel %'], value: pct(s.barrel), hot: Number(s.barrel) >= 0.12 })
  if (pct(s.hard_hit)) bat.push({ label: ['Hard-hit % (recent)', 'Hard-hit %'], value: pct(s.hard_hit), hot: Number(s.hard_hit) >= 0.45 })
  // 'Best recent ball' is the DISTANCE and EXIT VELO tiles when there is an exit velo; the row is the fallback when that column cannot draw.
  if (fin(s.max_distance) && Number(s.max_distance) > 0 && !fin(s.max_ev)) bat.push({ label: 'Best recent ball', value: `${Math.round(Number(s.max_distance))} ft`, hot: Number(s.max_distance) >= 400 })

  // THE ARM
  const arm = []
  if (txt(s.pitcher)) arm.push({ label: 'Pitcher', value: `${txt(s.pitcher)}${s.pitcher_throws && s.pitcher_throws !== '—' ? ` (${s.pitcher_throws}HP)` : ''}`, hot: false })
  if (fin(s.pitcher_hr9)) arm.push({ label: 'HR/9', value: Number(s.pitcher_hr9).toFixed(2), hot: Number(s.pitcher_hr9) >= 1.5 })
  if (fin(s.pitcher_whip)) arm.push({ label: 'WHIP', value: Number(s.pitcher_whip).toFixed(2), hot: Number(s.pitcher_whip) >= 1.4 })
  if (s.weak_side) {
    const his = (s.weak_side === 'LHB' && s.bats === 'L') || (s.weak_side === 'RHB' && s.bats === 'R')
    arm.push({ label: 'Weak vs', value: `${s.weak_side}${his ? ' — his side ✓' : ''}`, hot: his })
  }
  // The park: its name in full (the row wraps the HR factor under it when they cannot share a line), then the factor.
  if (fin(s.park_factor) && Number(s.park_factor) > 0) {
    const f = `${Number(s.park_factor) >= 1.05 ? '+' : ''}${Math.round(100 * (Number(s.park_factor) - 1))}% HR`
    arm.push({ label: 'Park', value: txt(s.venue) || 'Tonight', sub: f, hot: Number(s.park_factor) >= 1.05 })
  }
  // THE BALL -- the three numbers the card is named after.
  const ball = []
  if (fin(s.max_distance)) ball.push({ label: 'DISTANCE', value: String(Math.round(Number(s.max_distance))), unit: 'FT' })
  if (fin(s.max_ev)) ball.push({ label: 'EXIT VELO', value: String(Math.round(Number(s.max_ev))), unit: 'MPH' })
  if (fin(s.season_hr)) ball.push({ label: 'SEASON', value: String(Math.round(Number(s.season_hr))), unit: 'HR' })
  const hasStats = bat.length + arm.length > 0

  const m = await playerOf(team, name, row?.player_id)
  const rk = fin(row?.board_rank) && Number(row.board_rank) > 0 ? Math.round(Number(row.board_rank)) : null
  const caption = rk == null ? '' : status === 'off' ? `BOARD RANK #${rk}` : status === 'called' ? `#${rk} · ${STATUS_WORD.called}` : { lines: [`#${rk}`, STATUS_WORD.board] }
  const longshot = called && hasOdds && odds >= 700 ? `LONGSHOT ${fmtOdds(odds)}` : ''

  // THE COLUMN'S PLAN: heights first, so what is optional (the hook lines) is dropped before the column can grow past the body.
  const NAME_H = 80; const MATCH_H = 48; const BANNER_H = 56
  // three tightness levels: the normal column, one pixel less row padding, then the compact one (the worst stress case only)
  const LEVELS = [{ pad: 2, GAP: 6, pt: 14, pb: 12 }, { pad: 1, GAP: 6, pt: 14, pb: 12 }, { pad: 0, GAP: 4, pt: 10, pb: 8 }]
  let L = LEVELS[0]
  let plans = []
  let th = 0
  if (hasStats) {
    const groups = [bat, arm].filter((g) => g.length)
    const ballH = ball.length ? tileColH(ball, BALL_W, 36) : 0
    for (const lv of LEVELS) {
      L = lv
      const tw = INNER - (ball.length ? BALL_W + 10 : 0)
      const ws = splitWidths(groups.map(kvNatural), tw, 10)
      const kp = kvPlans(groups, ws, { pad: lv.pad })
      plans = groups.map((g, i) => ({ title: g === bat ? 'THE BAT' : 'THE ARM', plan: kp[i] }))
      th = Math.max(ballH, ...plans.map((p) => p.plan.h))
      if (NAME_H + MATCH_H + BANNER_H + 3 * lv.GAP + lv.GAP + th <= bodyH() - lv.pt - lv.pb) break
    }
  }
  const GAP = L.GAP
  const avail = bodyH() - L.pt - L.pb
  const fixed = NAME_H + MATCH_H + BANNER_H + 3 * GAP
  let used = fixed + (hasStats ? GAP + th : 0)
  const hookPlans = []
  let hookBlock = 0
  for (const h of hooks) {
    const bp = bulletPlan(h, { size: 22, maxW: INNER, id: 'hook' })
    const next = hookBlock + bulletH(bp) + (hookPlans.length ? 2 : 0)
    if (used + GAP + next > avail) break
    hookPlans.push(bp)
    hookBlock = next
  }
  if (hookPlans.length) used += GAP + hookBlock
  logFit({ id: 'hooks-shown', kind: 'info', shown: hookPlans.length, of: hooks.length })
  vlog('homer-column', used, avail)

  const price = hasOdds ? oddsPlan({ word: 'HR', value: fmtOdds(odds), book, accent: ACCENT }, bannerRoom(INNER, call)) : null
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} called={called} word={STATUS_WORD[status]} chips={[longshot, nth].filter(Boolean)} right={['HOME RUN · TONIGHT', 'HOME RUN']} brand={brand} footRight={[`${prettyDay(txt(row?.day))} · every home run, graded in public`, prettyDay(txt(row?.day))]}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={badgeWord} plate={score != null ? { word: ['MOONSHOT SCORE', 'SCORE'], value: score, caption } : null}  stamps={stampList} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `${L.pt}px ${POSTER.pad}px ${L.pb}px ${PAD_L}px`, gap: GAP }}>
        <NameLine name={name} size={96} maxW={INNER} h={NAME_H} />
        <MatchLine m={m} text={matchupWord(row)} maxW={INNER} />
        <Banner accent={ACCENT} called={called} line={call} h={BANNER_H} w={INNER} right={price} />
        {hasStats ? (
          <div style={{ display: 'flex', gap: 10, height: th }}>
            {plans.map((p) => <KVTable key={p.title} title={p.title} plan={{ ...p.plan, h: th }} accent={ACCENT} />)}
            {ball.length ? <TileCol tiles={ball} w={BALL_W} h={th} accent={ACCENT} big={36} /> : null}
          </div>
        ) : null}
        {hookPlans.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {hookPlans.map((bp, i) => <Bullet key={i} plan={bp} accent={ACCENT} color={ACCENT} />)}
          </div>
        ) : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'homer' })
}

/**
 * THE @MLBHR REPLY CARD (tweets fix step 2b, 2026-09-26). Says each thing once, from real fields only:
 *   CALLED / HOME RUN / the date; NAME / "2-RUN · 389 FT · HR #26" (@MLBHR's own words); the matchup and the arm; the proof: the
 *   call, the score (and where it sat on the board when the board's size is known), and when the call was posted when that is known.
 * The caller sends it only when the row has its day and opponent and the post gave a distance; otherwise the reply goes out as text
 * alone. `parsed` = parseMlbhr(their post); opts.boardSize / opts.postedAt optional.
 */
export async function mlbhrCard(row, parsed, { site = 'dashnetwork.vercel.app', boardSize = null, postedAt = null, stamps = undefined } = {}) {
  const stampsP = posterStamps({ sport: 'mlb', playerId: row?.player_id, day: txt(row?.day), stamps })   // ONE pregame situation stamp on the portrait (lib/cards/situations.js)
  const { grain } = await assets()
  const stampList = await stampsP
  const name = txt(row?.name)
  const team = txt(row?.team).toUpperCase()
  const top = String(row?.role || '').toUpperCase().includes('TOP')
  const score = fin(row?.hr_score) ? Math.round(Number(row.hr_score)) : null
  const rank = Number(row?.board_rank)
  const s = row?.stats || {}
  const heroAlts = [
    [parsed?.kind ? String(parsed.kind).toUpperCase() : null, fin(parsed?.distance) ? `${parsed.distance} FT` : null, fin(parsed?.seasonHr) ? `HR #${parsed.seasonHr}` : null].filter(Boolean).join(' · '),
    [fin(parsed?.distance) ? `${parsed.distance} FT` : null, fin(parsed?.seasonHr) ? `HR #${parsed.seasonHr}` : null].filter(Boolean).join(' · '),
  ].filter(Boolean)
  const matchupAlts = [[matchupWord(row), txt(s.pitcher) ? `off ${txt(s.pitcher)}` : null].filter(Boolean).join(' · '), matchupWord(row)]
  const proof = [
    top ? 'TOP pick: #1 in his game on the Moonshot board' : 'HR pick on the Moonshot board',
    // "#3 of 36", not "top 9%": the denominator is the claim, stated.
    score != null ? `Moonshot score ${score}${Number.isFinite(rank) && rank > 0 && boardSize ? ` · #${rank} of ${boardSize} on tonight's board` : ''}` : null,
    postedAt ? `Posted before first pitch: ${new Date(postedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : null,
  ].filter(Boolean)
  const m = await playerOf(team, name, row?.player_id)
  const boxInner = INNER - 2 * 22 - 10
  const bps = proof.map((line) => bulletPlan(line, { size: 26, maxW: boxInner, maxLines: 2, id: 'proof' }))
  const hero = heroAlts.length ? displayFit(heroAlts[0], { sizes: [52, 48, 44, 40, 36, 32, 30], maxW: INNER, id: 'mlbhr-hero' }) : null
  const heroAlt = hero && hero.size <= 30 && heroAlts[1] ? displayFit(heroAlts[1], { sizes: [52, 48, 44, 40, 36, 32, 30], maxW: INNER, id: 'mlbhr-hero2' }) : null
  const heroPick = heroAlt && heroAlt.size > hero.size ? heroAlt : hero
  const NAME_H = 96
  const boxH = 36 + bps.reduce((a, b) => a + bulletH(b), 0) + (bps.length - 1) * 12
  const used = 18 + 14 + NAME_H + (heroPick ? lineH(heroPick.size) + 10 : 0) + 48 + 10 + 8 + boxH + 10
  vlog('mlbhr-column', used, bodyH())
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} called word={STATUS_WORD.called} right="HOME RUN" brand={brand} footRight={prettyDay(txt(row?.day))}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={top ? 'TOP' : 'HR'} stamps={stampList} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `18px ${POSTER.pad}px 14px ${PAD_L}px`, gap: 10 }}>
        <NameLine name={name} size={104} maxW={INNER} h={NAME_H} />
        {heroPick ? <span style={{ display: 'flex', fontFamily: DISPLAY, fontSize: heroPick.size, fontWeight: 900, lineHeight: 1.2, color: ACCENT, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{heroPick.text}</span> : null}
        <MatchLine m={m} text={matchupAlts[1]} extra={txt(s.pitcher) ? [`off ${txt(s.pitcher)}`, `off ${surname(txt(s.pitcher))}`] : null} maxW={INNER} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8, padding: '18px 22px', background: `linear-gradient(90deg, ${alpha(ACCENT, 0.2)} 0%, ${alpha(ACCENT, 0.04)} 100%)`, borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${ACCENT}` }}>
          {bps.map((bp, i) => <Bullet key={i} plan={bp} accent={ACCENT} />)}
        </div>
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'mlbhr' })
}

/**
 * The night's poster: called / total, the by-role split, ten nights of bars, and the names the bot had. `rows` are tonight's
 * homer_feed rows; `history` is every row from the last ten days (day, role) for the bars.
 */
export async function recapCard(day, rows = [], history = [], { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const c = captureFrom(rows)
  const roles = Object.entries(c.byRole).sort((a, b) => b[1] - a[1])
  const called = rows.filter((r) => callStatus(r) === 'called').sort((a, b) => (a.board_rank || 999) - (b.board_rank || 999)).slice(0, 8)

  const days = []
  for (let i = 9; i >= 0; i -= 1) {
    const d = new Date(`${day}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - i)
    const iso8601 = d.toISOString().slice(0, 10)
    const cc = captureFrom(history.filter((r) => r.day === iso8601))
    days.push({ day: iso8601, ...cc })
  }
  const span = days.reduce((a, d) => ({ called: a.called + d.called, total: a.total + d.total }), { called: 0, total: 0 })
  const spanPct = span.total ? Math.round((100 * span.called) / span.total) : null
  // the day of the month; the month joins the first bar and the first of any month
  const dm = (d, i) => (i === 0 || d.slice(8) === '01' ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : String(Number(d.slice(8, 10))))

  // THE LEFT COLUMN: the big number steps down until "N of M home runs" fits beside it; the words step down, then drop "home runs"
  const PAD = POSTER.pad
  const PANEL_W = 600
  const LEFT_W = lineW - PANEL_W - 24
  const bigN = String(c.called)
  const rest = [`of ${c.total} home runs`, `of ${c.total}`]
  let bigSize = 64; let restPick = { text: rest[1], size: 32 }
  outer: for (const b of [132, 112, 96, 80, 64]) {
    const nw = textWidth(bigN, { family: DISPLAY, weight: 900, size: b }) + Math.ceil(b * 0.14)
    for (const t of rest) for (const rs of [48, 40, 32]) {
      if (nw + 14 + textWidth(t, { family: DISPLAY, weight: 900, size: rs }) + Math.ceil(rs * 0.14) <= LEFT_W) { bigSize = b; restPick = { text: t, size: rs }; break outer }
    }
  }
  const stats = `${c.pct ?? 0}% tonight${c.rated ? ` · ${c.rated} ${STATUS_WORD.board.toLowerCase()}, no call` : ''}${c.off ? ` · ${c.off} ${STATUS_WORD.off.toLowerCase()}` : ''}`
  const statsPlan = planText(stats, { sizes: [26, 24, 22], maxW: LEFT_W, maxLines: 2, id: 'recap-stats' })
  // the role chips flow onto rows of the column's width
  const chipTexts = roles.map(([r, n]) => `${roleWord(r).toUpperCase()} ${n}`)
  const chipRows = []
  let cur = []; let curW = 0
  for (const t of chipTexts) {
    const w = textWidth(t, { size: 22, weight: 800, ls: 2 }) + 32
    if (cur.length && curW + 10 + w > LEFT_W) { chipRows.push(cur); cur = []; curW = 0 }
    cur.push(t); curW += (cur.length > 1 ? 10 : 0) + w
  }
  if (cur.length) chipRows.push(cur)
  const chipRowsShown = chipRows.slice(0, 2)
  // the called names: as many as fit three lines, then "+ N more"
  const names = called.map((r) => `${txt(r.name)}${txt(r.team) ? ` (${txt(r.team)})` : ''}`)
  let namePlan3 = null
  for (let n = names.length; n >= 1 && !namePlan3; n -= 1) {
    const more = names.length - n
    const t = `${names.slice(0, n).join('  ·  ')}${more ? `  ·  + ${more} more` : ''}`
    const p = planText(t, { sizes: [22], maxW: LEFT_W, maxLines: 3, id: 'recap-names', weight: 700 })
    if (p.fits || n === 1) namePlan3 = p
  }
  const leftH = 24 + lineH(bigSize) + lineH(statsPlan.size, statsPlan.lines.length) + chipRowsShown.length * (lineH(22) + 8) + (namePlan3 ? lineH(22, namePlan3.lines.length) + 14 : 0)
  vlog('recap-left', leftH, bodyH() - 30)
  const heads = fitAlts(['LAST 10 NIGHTS · % CALLED', 'LAST 10 NIGHTS'], { sizes: [22], maxW: PANEL_W - 36 - 220, id: 'recap-head', weight: 800, ls: 2 })
  const el = (
    <Poster accent={ACCENT} grain={grain} word="THE NIGHT" chips={['RECAP']} right="HOME RUNS" brand={brand} footRight={[`${prettyDay(day)} · every home run, graded in public`, prettyDay(day)]}>
      <div style={{ display: 'flex', width: bodyW, padding: `16px ${PAD}px 14px ${PAD}px`, gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: LEFT_W, flexShrink: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, letterSpacing: 6, color: ACCENT }}>MOONSHOT CALLED</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: bigSize, fontWeight: 900, color: ACCENT, lineHeight: 1.2, transform: 'skewX(-8deg)' }}>{bigN}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: restPick.size, fontWeight: 900, color: INK2, transform: 'skewX(-8deg)' }}>{restPick.text}</span>
          </div>
          <Lines plan={statsPlan} color={INK} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
            {chipRowsShown.map((r, i) => <div key={i} style={{ display: 'flex', gap: 10 }}>{r.map((t) => <Chip key={t} text={t} accent={ACCENT} />)}</div>)}
          </div>
          {namePlan3 ? <div style={{ display: 'flex', marginTop: 14 }}><Lines plan={namePlan3} weight={700} color={INK2} /></div> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: PANEL_W, flexShrink: 0, padding: '14px 18px', borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2, color: DIM, whiteSpace: 'nowrap' }}>{heads.text}</span>
            {spanPct != null ? <span style={{ fontSize: 24, color: ACCENT, fontWeight: 800, whiteSpace: 'nowrap' }}>{`${span.called} / ${span.total} · ${spanPct}%`}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexGrow: 1, marginTop: 10 }}>
            {days.map((d, i) => (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: d.day === day ? INK : INK2, marginBottom: 4 }}>{d.total ? `${d.pct}` : '—'}</span>
                <div style={{ display: 'flex', width: '100%', height: `${Math.max(2, (d.pct || 0) * 0.72)}%`, background: d.day === day ? ACCENT : alpha(ACCENT, 0.38) }} />
                <span style={{ fontSize: 22, color: d.day === day ? INK : INK2, fontWeight: d.day === day ? 800 : 400, marginTop: 6 }}>{dm(d.day, i)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'recap' })
}

/** The pregame poster: the bot's HR calls for the night, with the price. Ten rows, the list's own height (712) as it always was. */
export async function pregameCard(day, picks = [], { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const list = (Array.isArray(picks) ? picks : []).slice(0, 10)
  const H = 712
  const clubs = await Promise.all(list.map((p) => clubOf('mlb', p.team)))
  const GAP = 12
  const COLS = { rank: 40, team: 46, opp: 250, score: 215, price: 190 }
  const nameW = lineW - 12 - COLS.rank - COLS.team - COLS.opp - COLS.score - COLS.price - 5 * GAP
  const rowsH = 54 * list.length + 16
  vlog('pregame-list', rowsH, bodyH(H))
  const el = (
    <Poster accent={ACCENT} grain={grain} word="TONIGHT'S CALLS" chips={['PREGAME']} right={["MOONSHOT'S HR CALLS", 'HR CALLS']} brand={brand} footRight={[`${prettyDay(day)} · posted before first pitch`, prettyDay(day)]} h={H}>
      <div style={{ display: 'flex', flexDirection: 'column', width: bodyW, padding: `8px ${POSTER.pad - 6}px 8px ${POSTER.pad - 6}px` }}>
        {list.map((p, i) => {
          const book = txt(p.odds_book)
          const hasPrice = fin(p.odds_over) && Number(p.odds_over) !== 0 && book
          const priceAlts = hasPrice ? [`${fmtOdds(p.odds_over)} · ${book}`, fmtOdds(p.odds_over)] : []
          // the arm's HR/9 over his last three starts is on every row; price still wins when there is one, and the dash is gone either way
          const armL3 = fin(p.pitcher_l3_hr9) ? `${Number(p.pitcher_l3_hr9).toFixed(2)} HR/9 L3` : ''
          const podium = i < 3
          const name = txt(p.name)
          const nf = displayFit(name, { sizes: [38, 34, 30, 28, 26, 24], maxW: nameW, id: 'pregame-name' })
          const last = surname(txt(p.pitcher))
          const opp = txt(p.opponent) ? fitAlts([`vs ${p.opponent}${txt(p.pitcher) ? ` · ${txt(p.pitcher)}` : ''}`, `vs ${p.opponent}${last ? ` · ${last}` : ''}`, `vs ${p.opponent}`], { sizes: [22], maxW: COLS.opp, id: 'pregame-opp', weight: 700 }) : null
          const sc = fin(p.hr_score) ? fitAlts([`MOONSHOT Score ${Math.round(Number(p.hr_score))}`, `Score ${Math.round(Number(p.hr_score))}`], { sizes: [22], maxW: COLS.score, id: 'pregame-score' }) : null
          const pr = priceAlts.length ? fitAlts(priceAlts, { sizes: [22], maxW: COLS.price, id: 'pregame-price' }) : armL3 ? fitAlts([armL3, `${Number(p.pitcher_l3_hr9).toFixed(2)} HR/9`], { sizes: [22], maxW: COLS.price, id: 'pregame-arm' }) : null
          return (
            <div key={p.player_id || i} style={{ display: 'flex', alignItems: 'center', gap: GAP, height: 54, padding: '0 6px', background: i % 2 ? alpha(INK, 0.04) : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: COLS.rank, height: 36, borderRadius: 6, fontFamily: DISPLAY, fontSize: 28, fontWeight: 900, color: podium ? CHASSIS.bg : ACCENT, background: podium ? ACCENT : alpha(ACCENT, 0.14), transform: 'skewX(-8deg)' }}>{String(i + 1)}</div>
              <span style={{ display: 'flex', width: nameW, fontFamily: DISPLAY, fontSize: nf.size, fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{nf.text}</span>
              <div style={{ display: 'flex', width: COLS.team, alignItems: 'center' }}>{p.team ? <Logo m={clubs[i]} size={38} /> : null}</div>
              <span style={{ display: 'flex', width: COLS.opp, fontSize: 22, fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{opp ? opp.text : ''}</span>
              <span style={{ display: 'flex', width: COLS.score, fontSize: 22, fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{sc ? sc.text : ''}</span>
              <span style={{ display: 'flex', width: COLS.price, justifyContent: 'flex-end', fontSize: 22, fontWeight: 800, color: hasPrice ? ACCENT : (armL3 ? INK : DIM), whiteSpace: 'nowrap' }}>{pr ? pr.text : ''}</span>
            </div>
          )
        })}
      </div>
    </Poster>
  )
  return renderPoster(el, { h: H, poster: 'pregame' })
}

/**
 * A one-headline poster for a single callout that doesn't need a table -- pairs to watch, tonight's longest call, the month's
 * breakdown. The body is a headline and whatever detail lines the caller passes, sized for a handful of lines.
 */
export async function statCard(day, { pill = '', label = '', headline = '', lines = [] } = {}, { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const W = lineW - 16
  const avail = bodyH() - 48
  const head = planText(String(headline || ''), { sizes: [72, 64, 56, 48, 44, 40], maxW: W - 16, maxLines: 3, id: 'stat-head', family: DISPLAY, weight: 900, upper: true })
  const headH = planH(head)
  // the detail lines: as many as the body has room for (the post's text carries them all)
  const detail = []
  let used = headH + 22 + 2 + 22
  for (const l of (Array.isArray(lines) ? lines : []).filter(Boolean)) {
    const p = planText(String(l), { sizes: [28, 26, 24, 22], maxW: W, maxLines: 2, id: 'stat-line', weight: 700 })
    const add = planH(p) + (detail.length ? 12 : 0)
    if (used + add > avail) break
    detail.push(p); used += add
  }
  vlog('stat-column', used, avail)
  const el = (
    <Poster accent={ACCENT} grain={grain} word={String(label || '').toUpperCase()} chips={pill ? [String(pill)] : []} brand={brand} footRight={prettyDay(day)}>
      <div style={{ display: 'flex', flexDirection: 'column', width: bodyW, padding: `24px ${POSTER.pad}px`, justifyContent: 'center', gap: 22 }}>
        <Lines plan={head} weight={900} upper family={DISPLAY} skew />
        <div style={{ display: 'flex', height: 2, background: alpha(ACCENT, 0.3) }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {detail.map((p, i) => <Lines key={i} plan={p} weight={700} color={INK2} />)}
        </div>
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'stat' })
}

/**
 * THE HOT STRETCH -- the showcase poster. His face and club, one HERO number (OPS: the number that decides who gets this card), the
 * slash line as a row of big numerals, and his window against his own season. `pick` is exactly what hotStretchPicks() returns;
 * `window` is 'month' or 'week' and only decides the label.
 */
export async function hotStretchCard(day, pick, { site = 'dashnetwork.vercel.app', window = 'month', windowLabel = '', stamps = undefined } = {}) {
  const stampsP = posterStamps({ sport: 'mlb', playerId: pick?.player_id, day: txt(day), stamps })   // ONE pregame situation stamp on the portrait (lib/cards/situations.js)
  const { grain } = await assets()
  const stampList = await stampsP
  const name = txt(pick?.name) || 'Unknown'
  const team = txt(pick?.team).toUpperCase()
  const m = await playerOf(team, name, pick?.player_id)
  const label = String(windowLabel || (window === 'week' ? 'LAST 7 DAYS' : 'THIS MONTH')).toUpperCase()
  const arm = surname(txt(pick?.pitcher))
  // The supporting numerals. OPS is deliberately NOT here -- it is the hero on the portrait.
  const tiles = [
    { label: 'AVG', value: txt(pick?.avg) },
    { label: 'OBP', value: txt(pick?.obp) },
    { label: 'SLG', value: txt(pick?.slg) },
    { label: 'HR', value: txt(pick?.hr) },
    { label: 'RBI', value: txt(pick?.rbi) },
  ].filter((t) => t.value !== '')
  // season vs window. Rate stats only -- HR and RBI over a 15-game window against a 150-game season is two different questions.
  const se = pick?.season || null
  const cmp = (key) => {
    const a = txt(se?.[key])
    const b = txt(pick?.[key])
    if (!a || !b) return null
    return { label: key.toUpperCase(), season: a, now: b, up: Number(b) >= Number(a) }
  }
  const seasonRows = se ? ['avg', 'obp', 'slg', 'ops'].map(cmp).filter(Boolean) : []
  const games = Number(pick?.games); const ab = Number(pick?.ab)
  const matchText = `${Number.isFinite(games) ? games : 0} GAMES · ${Number.isFinite(ab) ? ab : 0} AB`
  const tp = tiles.length ? tileRowPlan(tiles, INNER, 54) : null
  const cellW = seasonRows.length ? Math.floor((INNER - 4) / seasonRows.length) : 0
  const compare = seasonRows.map((r0) => {
    let r = r0
    const inner = cellW - 2 - 32
    const sizes = [24, 22]; const ns = [28, 24, 22]; let pick2 = null
    outer: for (const a of sizes) for (const n of ns) {
      if (textWidth(r.season, { size: a, weight: 800 }) + textWidth('▲', { size: 22, weight: 800 }) + textWidth(r.now, { size: n, weight: 800 }) + 16 <= inner) { pick2 = { a, n }; break outer }
    }
    // the last resort drops his season figure (the arrow and this window's number stay: the claim is the direction)
    if (!pick2) { pick2 = { a: 22, n: 22 }; r = { ...r, season: '' } }
    logFitCompare(r, pick2, inner)
    return { ...r, ...pick2 }
  })
  const cs = compare.length ? Math.min(...compare.map((r) => r.n)) : 0
  const headPanel = fitAlts([`${label} vs HIS SEASON`, `${label} vs SEASON`], { sizes: [22], maxW: INNER - 32 - 260, id: 'hot-head', weight: 800, ls: 3 })
  const tailPanel = fitAlts([`${Number(pick?.season?.games) || 0} GAMES ON THE YEAR`, `${Number(pick?.season?.games) || 0} G ON THE YEAR`], { sizes: [22], maxW: 280, id: 'hot-tail', weight: 700 })
  const panelH = 4 + lineH(22) + 10 + 2 + 12 + lineH(22) + lineH(Math.max(cs, 28))
  const NAME_H = 88; const BANNER_H = 58; const GAP = 10
  const used = 14 + 12 + NAME_H + 48 + (tp ? tileRowH(tp) : 0) + (seasonRows.length ? panelH : 0) + BANNER_H + 4 * GAP
  vlog('hot-column', used, bodyH())
  const bannerLine = arm ? [`On tonight's board — facing ${arm}`, "On tonight's board"] : "On tonight's board"
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} word="ON A HEATER" chips={[label]} right={['THE HOT STRETCH', 'HOT STRETCH']} brand={brand} footRight={[`${prettyDay(day)} · the hottest bat on tonight's board`, prettyDay(day)]}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={txt(pick?.ops) ? { word: 'OPS', value: txt(pick.ops), caption: label } : null}  stamps={stampList} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `14px ${POSTER.pad}px 12px ${PAD_L}px`, gap: GAP }}>
        <NameLine name={name} size={96} maxW={INNER} h={NAME_H} />
        <MatchLine m={m} text={matchText} maxW={INNER} />
        {tp ? <TileRow tiles={tiles} w={INNER} accent={ACCENT} plan={tp} /> : null}
        {seasonRows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: INNER, borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: lineH(22) + 10, padding: '0 16px', borderBottom: `2px solid ${alpha(INK, 0.14)}` }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{headPanel.text}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{tailPanel.text}</span>
            </div>
            <div style={{ display: 'flex', padding: '6px 0' }}>
              {compare.map((r) => (
                <div key={r.label} style={{ display: 'flex', flexDirection: 'column', width: cellW, padding: '0 16px', borderLeft: `2px solid ${alpha(INK, 0.1)}` }}>
                  <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: DIM }}>{r.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, height: lineH(Math.max(cs, 28)) }}>
                    <span style={{ fontSize: r.a, fontWeight: 700, color: DIM }}>{r.season}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: r.up ? ACCENT : DIM }}>{r.up ? '▲' : '▼'}</span>
                    <span style={{ fontSize: r.n, fontWeight: 800, color: INK }}>{r.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <Banner accent={ACCENT} called={false} line={bannerLine} h={BANNER_H} w={INNER} right={quietRight('MOONSHOT', { color: ACCENT })} />
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'hotstretch' })
}

// the season-vs-window cell is composed by hand (three runs in one line): its width is checked the same way the fitted boxes are
function logFitCompare(r, p, inner) {
  const w = textWidth(r.season, { size: p.a, weight: 800 }) + textWidth('▲', { size: 22, weight: 800 }) + textWidth(r.now, { size: p.n, weight: 800 }) + 16
  logFit({ id: `compare:${r.label}`, kind: 'row', text: `${r.season} ${r.now}`, size: p.n, w, maxW: inner, ok: w <= inner })
}

/**
 * THE PAIR TRAP -- two men already on tonight's board with a real same-day history. Each man gets his own row -- recent form, who
 * he's facing, his own price tonight -- off the same board row the Hot Zone / Danger Combos posts already read.
 */
export async function pairsCard(day, hits, { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const main = hits[0]
  const rest = hits.slice(1)
  const [ca, cb] = await Promise.all([clubOf('mlb', main.a.team), clubOf('mlb', main.b.team)])
  const PLATE_W = 250
  const BOX_W = lineW - 20 - PLATE_W                    // the left box, inside the poster's text margins
  const ROW_W = BOX_W - 2 * 24 - 4
  const rowsOut = []
  const playerRow = (p, club, last) => {
    const nameMax = ROW_W - 40 - 16 - 16 - 120
    const nf = displayFit(txt(p.name), { sizes: [48, 44, 40, 36, 32, 28], maxW: nameMax, id: 'pairs-name' })
    const oppFit = txt(p.opponent) ? fitAlts([`vs ${p.opponent}`], { sizes: [24], maxW: 110, id: 'pairs-opp' }) : null
    const blast = fin(p.blastPct) ? `${p.blastPct}% blast rate` : ''
    const blastW = blast ? textWidth(blast, { size: 22, weight: 800 }) + 22 : 0
    const facing = txt(p.pitcher) ? fitAlts([`facing ${txt(p.pitcher)}${txt(p.pitcherTeam) ? ` (${txt(p.pitcherTeam)})` : ''}`, `facing ${surname(txt(p.pitcher))}`], { sizes: [22], maxW: ROW_W - blastW, id: 'pairs-facing', weight: 700 }) : null
    const price = fin(p.over) && txt(p.book) ? `HR odds tonight: ${fmtOdds(p.over)} · ${txt(p.book)}` : ''
    const l3 = splitLine({
      left: price ? { texts: [price, `HR odds: ${fmtOdds(p.over)} · ${txt(p.book)}`, `HR odds: ${fmtOdds(p.over)}`], sizes: [24, 22], color: ACCENT } : null,
      right: fin(p.hr_score) ? { texts: [`Moonshot Score ${Math.round(Number(p.hr_score))}`, `Score ${Math.round(Number(p.hr_score))}`], sizes: [22], weight: 700, color: DIM } : null,
      w: ROW_W, id: 'pairs-l3',
    })
    const h1 = Math.max(40, lineH(nf.size)) + 4
    const h2 = (blast || facing ? lineH(22) : 0)
    const h3 = (price || fin(p.hr_score)) ? l3.h : 0
    rowsOut.push(h1 + h2 + h3 + 8 + 24 + (last ? 0 : 2))
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: last ? 'none' : `2px solid ${RULE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: ROW_W }}>
          <Logo m={{ ...club, name: p.name }} size={40} />
          <span style={{ display: 'flex', fontFamily: DISPLAY, fontSize: nf.size, fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{nf.text}</span>
          {oppFit ? <span style={{ marginLeft: 'auto', fontSize: oppFit.size, fontWeight: 800, color: DIM, whiteSpace: 'nowrap' }}>{oppFit.text}</span> : null}
        </div>
        {(blast || facing) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, width: ROW_W }}>
            {blast ? <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: ACCENT, whiteSpace: 'nowrap' }}>{blast}</span> : null}
            {facing ? <span style={{ fontSize: facing.size, fontWeight: 700, lineHeight: 1.2, color: DIM, whiteSpace: 'nowrap' }}>{facing.text}</span> : null}
          </div>
        ) : null}
        {(price || fin(p.hr_score)) ? l3.node : null}
      </div>
    )
  }
  const A = playerRow(main.a, ca, false)
  const B = playerRow(main.b, cb, !rest.length)
  const restLines = rest.slice(0, 2).map((r) => fitAlts([`+ ${txt(r.a.name)} & ${txt(r.b.name)} — ${r.count}x same-day`, `+ ${surname(txt(r.a.name))} & ${surname(txt(r.b.name))} — ${r.count}x`], { sizes: [22], maxW: ROW_W, id: 'pairs-rest', weight: 700 }))
  const boxH = 8 + lineH(22) + 8 + rowsOut.reduce((a, b) => a + b, 0) + (restLines.length ? 20 + lineH(22, restLines.length) + 4 : 0)
  vlog('pairs-box', boxH, bodyH() - 28)
  const countPlan = displayFit(String(main.count), { sizes: [104, 88, 72, 60, 48], maxW: PLATE_W - 32 - 4, id: 'pairs-count' })
  const el = (
    <Poster accent={ACCENT} grain={grain} word="THE PAIR TRAP" chips={['PAIRS']} right="PREGAME" brand={brand} footRight={[`${prettyDay(day)} · pregame`, prettyDay(day)]}>
      <div style={{ display: 'flex', width: bodyW, padding: `14px ${POSTER.pad}px`, gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: BOX_W, flexShrink: 0, justifyContent: 'center', padding: '4px 24px', borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: 5, color: ACCENT, padding: '8px 0 2px 0', whiteSpace: 'nowrap' }}>BOTH ON THE BOARD TONIGHT</span>
          {A}
          {B}
          {restLines.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', gap: 4, borderTop: `2px solid ${RULE}` }}>
              {restLines.map((r, i) => <span key={i} style={{ fontSize: r.size, fontWeight: 700, lineHeight: 1.2, color: DIM, whiteSpace: 'nowrap' }}>{r.text}</span>)}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: PLATE_W, flexShrink: 0, padding: '16px', borderRadius: 14, border: `2px solid ${alpha(ACCENT, 0.55)}`, background: alpha(ACCENT, 0.08) }}>
          <span style={{ fontFamily: DISPLAY, fontSize: countPlan.size, fontWeight: 900, lineHeight: 1, color: ACCENT, transform: 'skewX(-8deg)' }}>{countPlan.text}</span>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: 2, color: INK, textAlign: 'center', marginTop: 4, whiteSpace: 'nowrap' }}>SAME-DAY HRs</span>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: 2, color: INK, textAlign: 'center', whiteSpace: 'nowrap' }}>THIS SEASON</span>
          {fin(main.rate) ? <span style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, color: DIM, marginTop: 12, whiteSpace: 'nowrap' }}>{`${main.rate}% of games`}</span> : null}
          {main.sameGame ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 14, paddingTop: 12, width: '100%', borderTop: `2px solid ${alpha(ACCENT, 0.3)}` }}>
              <span style={{ fontFamily: DISPLAY, fontSize: displayFit(String(main.sameGame), { sizes: [48, 40, 34], maxW: PLATE_W - 36 - 4, id: 'pairs-same' }).size, fontWeight: 900, lineHeight: 1.1, color: ACCENT, transform: 'skewX(-8deg)' }}>{String(main.sameGame)}</span>
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, letterSpacing: 2, color: INK, whiteSpace: 'nowrap' }}>SAME GAME</span>
            </div>
          ) : null}
        </div>
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'pairs' })
}

/**
 * THE MOONSHOT -- tonight's single longest-priced TOP/HR call on the board: identity, the odds bar, and a recent-form /
 * who-he's-facing row underneath, off the same board row the Hot Zone / Danger Combos posts already read.
 */
export async function longshotCard(day, pick, { site = 'dashnetwork.vercel.app', stamps = undefined } = {}) {
  const stampsP = posterStamps({ sport: 'mlb', playerId: pick?.player_id, day: txt(day), stamps })   // ONE pregame situation stamp on the portrait (lib/cards/situations.js)
  const { grain } = await assets()
  const stampList = await stampsP
  const team = txt(pick?.team).toUpperCase()
  const name = txt(pick?.name)
  const m = await playerOf(team, name, pick?.player_id)
  // roleWord() here is the same one every tweet uses ("TOP pick", "HRR pick", ...); a pick with no role wears no tag (never a status word it was not given)
  const badgeWord = pick?.role ? [roleWord(pick.role).toUpperCase(), roleWord(pick.role).replace(/\s*pick$/i, '').toUpperCase()] : ''
  const batting = [
    fin(pick?.blastPct) ? { label: 'BLAST RATE', value: `${pick.blastPct}%` } : null,
    fin(pick?.barrelPct) ? { label: 'BARREL %', value: `${pick.barrelPct}%` } : null,
    fin(pick?.hardHitPct) ? { label: 'HARD-HIT %', value: `${pick.hardHitPct}%` } : null,
  ].filter(Boolean)
  const tp = batting.length ? tileRowPlan(batting, INNER, 48) : null
  const facing = txt(pick?.pitcher) ? [`${txt(pick.pitcher)}${txt(pick?.pitcherTeam) ? ` (${txt(pick.pitcherTeam)})` : ''}`, txt(pick.pitcher)] : null
  const hasPrice = fin(pick?.over) && Number(pick.over) !== 0
  const line = 'HR odds to go deep'
  const price = hasPrice ? oddsPlan({ value: fmtOdds(pick.over), book: txt(pick?.book), accent: ACCENT }, bannerRoom(INNER, line)) : null
  const cells = []
  if (facing) cells.push({ label: 'FACING TONIGHT', value: facing[0], grow: 2 })
  if (fin(pick?.pitcherHr9)) cells.push({ label: 'PITCHER HR/9', value: Number(pick.pitcherHr9).toFixed(2), hot: true })
  const cp = cells.length ? cellsPlan(cells, INNER, 30) : null
  // the facing cell falls back to the pitcher's name alone when the club will not fit beside it
  if (cp && facing) {
    const c = cp.cells[0]
    if (!c.val.fits) { c.val = fitAlts(facing, { sizes: [30, 28, 26, 24, 22], maxW: c.cw - 34, id: 'longshot-facing' }); c.val = { size: c.val.size, lines: [c.val.text] } }
  }
  const NAME_H = 88; const BANNER_H = 72; const GAP = 12
  const used = 14 + 12 + NAME_H + (txt(pick?.opponent) ? 48 : 0) + BANNER_H + (tp ? tileRowH(tp) : 0) + (cp ? cp.h : 0) + 4 * GAP
  vlog('longshot-column', used, bodyH())
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} word={["TONIGHT'S LONGEST CALL", 'LONGEST CALL']} chips={['LONGSHOT']} right={['THE MOONSHOT', 'MOONSHOT']} brand={brand} footRight={[`${prettyDay(day)} · pregame`, prettyDay(day)]}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={badgeWord} plate={fin(pick?.hr_score) ? { word: ['MOONSHOT SCORE', 'SCORE'], value: Math.round(Number(pick.hr_score)) } : null}  stamps={stampList} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `14px ${POSTER.pad}px 12px ${PAD_L}px`, gap: GAP }}>
        <NameLine name={name} size={96} maxW={INNER} h={NAME_H} />
        {txt(pick?.opponent) ? <MatchLine m={m} text={`vs ${pick.opponent}`} maxW={INNER} /> : null}
        <Banner accent={ACCENT} called={false} line={line} h={BANNER_H} w={INNER} right={price} />
        {tp ? <TileRow tiles={batting} w={INNER} accent={ACCENT} plan={tp} /> : null}
        {cp ? <CellRow plan={cp} accent={ACCENT} /> : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'longshot' })
}

/**
 * THE NUMEROLOGY MOMENT -- trifecta / jersey-match / cluster / gematria. Jersey-match and cluster tiers (2+ players) get a per-player
 * table -- jersey, opponent, and whether that man was also a bot pick tonight -- beside the one number the moment is about.
 */
export async function numerologyCard(day, moment, { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const label = { trifecta: 'TRIFECTA', gematria: 'GEMATRIA', jersey: 'JERSEY MATCH' }[moment.tier] || 'CLUSTER'
  const root = moment.tier === 'jersey' ? null : moment.tier === 'gematria' ? moment.players.length : moment.root
  const gemDates = moment.tier === 'gematria' ? [...new Map(moment.players.map((p) => [p.gem?.dateText, p.gem?.value])).entries()].map(([d, v]) => `${d} = ${v}`).join(' · ') : ''
  const shown = moment.players.slice(0, 5)
  const rest = moment.players.length - shown.length
  const clubs = await Promise.all(shown.map((p) => clubOf('mlb', p.team)))
  const PLATE_W = 250
  const BOX_W = lineW - 20 - PLATE_W
  const ROW_IN = BOX_W - 4 - 2 * 20
  const GAP = 12
  const COLS = { jersey: 60, logo: 40, opp: 90, role: 110 }
  const nameW = 280
  const rightW = ROW_IN - COLS.jersey - nameW - COLS.logo - COLS.opp - COLS.role - 5 * GAP
  const playerRow = (p, i) => {
    const nf = displayFit(txt(p.name), { sizes: [40, 36, 32, 28, 26, 24], maxW: nameW, id: 'num-name' })
    const opp = txt(p.opponent) ? fitAlts([`vs ${p.opponent}`], { sizes: [22], maxW: COLS.opp, id: 'num-opp', weight: 700 }) : null
    const roleAlts = p.role ? [roleWord(p.role).toUpperCase(), roleWord(p.role).replace(/\s*pick$/i, '').toUpperCase()] : []
    const role = roleAlts.length ? fitAlts(roleAlts, { sizes: [22], maxW: COLS.role, id: 'num-role' }) : null
    const rightText = p.gem && fin(p.gem.value) ? `= ${p.gem.value}` : p.nth ? `HR #${p.nth}` : ''
    const rt = rightText ? fitAlts([rightText], { sizes: [24, 22], maxW: rightW, id: 'num-right' }) : null
    const jersey = fin(p.jersey) ? displayFit(`#${p.jersey}`, { sizes: [34, 30, 26], maxW: COLS.jersey, id: 'num-jersey' }) : null
    return (
      <div key={p.player_id || i} style={{ display: 'flex', alignItems: 'center', gap: GAP, height: 62, padding: '0 20px', borderBottom: i < shown.length - 1 ? `2px solid ${alpha(INK, 0.08)}` : 'none' }}>
        <span style={{ display: 'flex', width: COLS.jersey, fontFamily: DISPLAY, fontSize: jersey ? jersey.size : 34, fontWeight: 900, color: ACCENT, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{jersey ? jersey.text : ''}</span>
        <span style={{ display: 'flex', width: nameW, fontFamily: DISPLAY, fontSize: nf.size, fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{nf.text}</span>
        <div style={{ display: 'flex', width: COLS.logo }}>{p.team ? <Logo m={clubs[i]} size={38} /> : null}</div>
        <span style={{ display: 'flex', width: COLS.opp, fontSize: 22, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{opp ? opp.text : ''}</span>
        <span style={{ display: 'flex', width: COLS.role, fontSize: 22, fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>{role ? role.text : ''}</span>
        <span style={{ display: 'flex', justifyContent: 'flex-end', width: rightW, fontSize: rt ? rt.size : 24, fontWeight: 800, color: DIM, whiteSpace: 'nowrap' }}>{rt ? rt.text : ''}</span>
      </div>
    )
  }
  // the plate on the right: its words and number fitted to its inside
  const PI = PLATE_W - 32 - 4
  const plate = (top, big, bottom, small) => {
    const bp = displayFit(String(bottom), { sizes: [big, 96, 80, 64, 52, 44], maxW: PI, id: 'num-plate-number' })
    const tp = planText(top, { sizes: [22], maxW: PI, maxLines: 2, id: 'num-plate-top', ls: 3, weight: 800 })
    const sp = small ? planText(small, { sizes: [22], maxW: PI, maxLines: 3, id: 'num-plate-small', weight: 700 }) : null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: PLATE_W, flexShrink: 0, padding: '16px', borderRadius: 14, border: `2px solid ${alpha(ACCENT, 0.55)}`, background: alpha(ACCENT, 0.08) }}>
        <Lines plan={tp} color={INK} ls={3} align="center" />
        <span style={{ fontFamily: DISPLAY, fontSize: bp.size, fontWeight: 900, lineHeight: 1.05, color: ACCENT, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{bp.text}</span>
        {sp ? <Lines plan={sp} weight={700} color={DIM} align="center" /> : null}
      </div>
    )
  }
  const boxH = shown.length * 62 + (rest > 0 ? lineH(22) + 16 : 0) + 4
  vlog('numerology-box', boxH, bodyH() - 36)
  const el = (
    <Poster accent={ACCENT} grain={grain} word={label} chips={['NUMEROLOGY']} right="LIVE" brand={brand} footRight={[`${prettyDay(day)} · live`, prettyDay(day)]}>
      <div style={{ display: 'flex', width: bodyW, padding: `18px ${POSTER.pad}px`, gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: BOX_W, flexShrink: 0, borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04), overflow: 'hidden' }}>
          {shown.map((p, i) => playerRow(p, i))}
          {rest > 0 ? <span style={{ display: 'flex', fontSize: 22, fontWeight: 700, lineHeight: 1.2, color: DIM, padding: '8px 20px' }}>{`+ ${rest} more`}</span> : null}
        </div>
        {root != null
          ? plate(moment.tier === 'gematria' ? 'NAMES = DATE' : 'DIGIT ROOT', 112, root, { trifecta: 'jersey · HR count · birthday', gematria: gemDates }[moment.tier] || 'shared jersey digit')
          : plate('SAME NUMBER, SAME NIGHT', 96, `#${moment.jersey}`, '')}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'numerology' })
}
