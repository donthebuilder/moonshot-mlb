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
import { captureFrom, fmtOdds, matchupWord, roleWord } from './homerFeed'
import { isCalledRole, callStatus, STATUS_WORD } from '../callStatus'
import { teamPrimary } from '../mlbTeams'
import { SPORT_ACCENT } from '../sportAccent'
import {
  Poster, Portrait, NameLine, MatchLine, Tile, TileRow, KVTable, Banner, Odds, Bullet, Cell, Chip, assets, renderPoster, clubOf, mlbFace,
  prettyDay, fitDisplay, bodyH, bodyW, alpha, fs, Logo, DISPLAY, INK, INK2, DIM, RULE, CHASSIS,
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
const brand = 'MOONSHOT'
const PORTRAIT_W = 236
const COL_PAD = '14px 24px 14px 24px'

/** A MOONSHOT player as the kit draws one: the club logo, the face, the club's own colour. */
async function playerOf(team, name, playerId) {
  const [club, face] = await Promise.all([clubOf('mlb', team), mlbFace(playerId)])
  return { ...club, name, face, tone: team ? teamPrimary(team) : null }
}

/**
 * The poster for one homer_feed row. Returns an ImageResponse (a Response whose body is the PNG). `site` is kept for the callers'
 * signature (the poster no longer prints a URL).
 */
export async function homerCard(row, { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const name = String(row?.name || 'Unknown')
  const team = String(row?.team || '').toUpperCase()
  const score = fin(row?.hr_score) ? Math.round(Number(row.hr_score)) : null
  const called = isCalledRole(row?._roles || row?.role) // lib/callStatus.js
  // the row's status from lib/callStatus -- the banner, the word and the rank line all read it (R2: a #11 below the cut must not wear
  // ON THE BOARD and NOT ON THE BOARD on one card)
  const status = callStatus(row)
  const roles = String(row?._roles || row?.role || '')
  const call = called
    ? `ON THE BOARD — ${roleWord(row.role).toUpperCase()}${roles.includes('/') ? ` (${roles})` : ''}`
    : status === 'board' ? `${STATUS_WORD.board} — NO CALL` : STATUS_WORD.off
  // Short pick word. roleWord gives "TOP pick"; the tag has no room for the noun.
  const badgeWord = called ? roleWord(row.role).replace(/\s*pick$/i, '').toUpperCase() : ''
  const odds = Number(row?.odds_over)
  const book = String(row?.odds_book || '')
  const hasOdds = Number.isFinite(odds) && odds !== 0 && book
  const nth = Number(row?.hr_n) > 1 ? `${row.hr_n} TONIGHT` : ''
  const s = row?.stats || {}
  const hooks = (Array.isArray(row?.hooks) ? row.hooks : []).slice(0, 3)

  // THE BAT -- same rows, same thresholds as the site's card
  const bat = []
  // October: the regular season's line as it stands (nothing added) and the postseason count on its own row -- never one number made
  // of both seasons. Season unknown (postseason: null): the line, nothing added.
  if (s.postseason === true) {
    if (fin(s.post_nth)) bat.push({ label: 'Postseason', value: `${Number(s.post_nth)} HR`, hot: false })
    if (fin(s.season_hr)) bat.push({ label: 'Regular season', value: `${Number(s.season_hr)} HR${iso(s.season_iso) ? ` · ISO ${iso(s.season_iso)}` : ''}`, hot: false })
  } else if (fin(s.season_hr)) bat.push({ label: 'Season', value: `${Number(s.season_hr) + (s.postseason === null ? 0 : Number(row?.hr_n || 1))} HR${iso(s.season_iso) ? ` · ISO ${iso(s.season_iso)}` : ''}`, hot: false })
  if (fin(s.last5_hr) || fin(s.last5_hits)) bat.push({ label: 'Last 5', value: `${Number(s.last5_hr) || 0} HR · ${Number(s.last5_hits) || 0} H · ${Number(s.last5_xbh) || 0} XBH`, hot: Number(s.last5_hr) >= 2 })
  if (pct(s.barrel)) bat.push({ label: 'Barrel % (recent)', value: pct(s.barrel), hot: Number(s.barrel) >= 0.12 })
  if (pct(s.hard_hit)) bat.push({ label: 'Hard-hit % (recent)', value: pct(s.hard_hit), hot: Number(s.hard_hit) >= 0.45 })
  // 'Best recent ball' is the DISTANCE and EXIT VELO tiles when there is an exit velo; the row is the fallback when that column cannot draw.
  if (fin(s.max_distance) && Number(s.max_distance) > 0 && !fin(s.max_ev)) bat.push({ label: 'Best recent ball', value: `${Math.round(Number(s.max_distance))} ft`, hot: Number(s.max_distance) >= 400 })

  // THE ARM
  const arm = []
  if (s.pitcher) arm.push({ label: 'Pitcher', value: `${s.pitcher}${s.pitcher_throws && s.pitcher_throws !== '—' ? ` (${s.pitcher_throws}HP)` : ''}`, hot: false })
  if (fin(s.pitcher_hr9)) arm.push({ label: 'HR/9', value: Number(s.pitcher_hr9).toFixed(2), hot: Number(s.pitcher_hr9) >= 1.5 })
  if (fin(s.pitcher_whip)) arm.push({ label: 'WHIP', value: Number(s.pitcher_whip).toFixed(2), hot: Number(s.pitcher_whip) >= 1.4 })
  if (s.weak_side) {
    const his = (s.weak_side === 'LHB' && s.bats === 'L') || (s.weak_side === 'RHB' && s.bats === 'R')
    arm.push({ label: 'Weak vs', value: `${s.weak_side}${his ? ' — his side ✓' : ''}`, hot: his })
  }
  if (fin(s.park_factor)) arm.push({ label: 'Park', value: `${(s.venue || 'tonight').split(' ').slice(0, 3).join(' ')} · ${Number(s.park_factor) >= 1.05 ? '+' : ''}${Math.round(100 * (Number(s.park_factor) - 1))}% HR`, hot: Number(s.park_factor) >= 1.05 })
  // THE BALL -- the three numbers the card is named after.
  const ball = []
  if (fin(s.max_distance)) ball.push({ label: 'DISTANCE', value: String(Math.round(Number(s.max_distance))), unit: 'FT' })
  if (fin(s.max_ev)) ball.push({ label: 'EXIT VELO', value: String(Math.round(Number(s.max_ev))), unit: 'MPH' })
  if (fin(s.season_hr)) ball.push({ label: 'SEASON', value: String(Math.round(Number(s.season_hr))), unit: 'HR' })
  const hasStats = bat.length + arm.length > 0

  const m = await playerOf(team, name, row?.player_id)
  const colW = bodyW - PORTRAIT_W
  const rank = row?.board_rank ? (status === 'off' ? `BOARD RANK #${row.board_rank}` : `#${row.board_rank} ON THE BOARD`) : ''
  const longshot = called && Number(row?.odds_over) >= 700 ? `LONGSHOT ${fmtOdds(row.odds_over)}` : ''
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} called={status === 'called'} word={STATUS_WORD[status]} chips={[longshot, nth].filter(Boolean)} right="HOME RUN · TONIGHT" brand={brand} footRight={`${prettyDay(String(row?.day || ''))} · every home run, graded in public`}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={badgeWord} plate={score != null ? { word: 'MOONSHOT SCORE', value: score, caption: rank } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: COL_PAD, gap: 6 }}>
        <NameLine name={name} size={96} maxW={colW - 70} h={80} />
        <MatchLine m={m} text={matchupWord(row)} />
        <Banner accent={ACCENT} called={called} line={call} h={56} right={hasOdds ? <Odds word="HR" value={fmtOdds(odds)} book={book} accent={ACCENT} /> : null} />
        {hasStats ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <KVTable title="THE BAT" rows={bat} accent={ACCENT} />
            <KVTable title="THE ARM" rows={arm} accent={ACCENT} />
            {ball.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', width: 176, borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04), justifyContent: 'space-around' }}>
                {ball.map((b) => <Tile key={b.label} label={b.label} value={b.value} unit={b.unit} hot accent={ACCENT} big={40} grow={false} />)}
              </div>
            ) : null}
          </div>
        ) : null}
        {hooks.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {hooks.map((h) => <Bullet key={h} text={stripLead(h)} accent={ACCENT} color={ACCENT} size={22} />)}
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
export async function mlbhrCard(row, parsed, { site = 'dashnetwork.vercel.app', boardSize = null, postedAt = null } = {}) {
  const { grain } = await assets()
  const name = String(row?.name || '')
  const team = String(row?.team || '').toUpperCase()
  const top = String(row?.role || '').toUpperCase().includes('TOP')
  const score = fin(row?.hr_score) ? Math.round(Number(row.hr_score)) : null
  const rank = Number(row?.board_rank)
  const s = row?.stats || {}
  const hero = [parsed?.kind ? String(parsed.kind).toUpperCase() : null, fin(parsed?.distance) ? `${parsed.distance} FT` : null, fin(parsed?.seasonHr) ? `HR #${parsed.seasonHr}` : null].filter(Boolean).join(' · ')
  const matchup = [matchupWord(row), s.pitcher ? `off ${s.pitcher}` : null].filter(Boolean).join(' · ')
  const proof = [
    top ? 'TOP pick: #1 in his game on the Moonshot board' : 'HR pick on the Moonshot board',
    // "#3 of 36", not "top 9%": the denominator is the claim, stated.
    score != null ? `Moonshot score ${score}${Number.isFinite(rank) && rank > 0 && boardSize ? ` · #${rank} of ${boardSize} on tonight's board` : ''}` : null,
    postedAt ? `Posted before first pitch: ${new Date(postedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : null,
  ].filter(Boolean)
  const m = await playerOf(team, name, row?.player_id)
  const colW = bodyW - PORTRAIT_W
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} called word={STATUS_WORD.called} right="HOME RUN" brand={brand} footRight={prettyDay(String(row?.day || ''))}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={top ? 'TOP' : 'HR'} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: '18px 24px 14px 24px', gap: 10 }}>
        <NameLine name={name} size={104} maxW={colW - 70} h={96} />
        {hero ? <span style={{ display: 'flex', fontFamily: DISPLAY, fontSize: fitDisplay(hero, 52, colW - 70, 30), fontWeight: 900, color: ACCENT, transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{hero}</span> : null}
        <MatchLine m={m} text={matchup} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8, padding: '18px 22px', background: `linear-gradient(90deg, ${alpha(ACCENT, 0.2)} 0%, ${alpha(ACCENT, 0.04)} 100%)`, borderStyle: 'solid', borderWidth: '2px 2px 2px 8px', borderColor: `${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${alpha(ACCENT, 0.4)} ${ACCENT}` }}>
          {proof.map((line) => <Bullet key={line} text={line} accent={ACCENT} size={26} />)}
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
  const called = rows.filter((r) => isCalledRole(r?.role)).sort((a, b) => (a.board_rank || 999) - (b.board_rank || 999)).slice(0, 8)

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
  const el = (
    <Poster accent={ACCENT} grain={grain} word="THE NIGHT" chips={['RECAP']} right="HOME RUNS" brand={brand} footRight={`${prettyDay(day)} · every home run, graded in public`}>
      <div style={{ display: 'flex', width: bodyW, padding: '16px 24px 14px 24px', gap: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontSize: fs(24), fontWeight: 800, letterSpacing: 6, color: ACCENT }}>MOONSHOT CALLED</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 132, fontWeight: 900, color: ACCENT, lineHeight: 1.05, transform: 'skewX(-8deg)' }}>{String(c.called)}</span>
            <span style={{ fontFamily: DISPLAY, fontSize: 48, fontWeight: 900, color: INK2, transform: 'skewX(-8deg)' }}>{`of ${c.total} home runs`}</span>
          </div>
          <span style={{ fontSize: fs(26), fontWeight: 800, color: INK }}>{`${c.pct ?? 0}% tonight${c.rated ? ` · ${c.rated} ${STATUS_WORD.board.toLowerCase()}, no call` : ''}${c.off ? ` · ${c.off} ${STATUS_WORD.off.toLowerCase()}` : ''}`}</span>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {roles.map(([r, n]) => <Chip key={r} text={`${roleWord(r).toUpperCase()} ${n}`} accent={ACCENT} />)}
          </div>
          {called.length ? (
            <span style={{ fontSize: fs(22), fontWeight: 700, color: INK2, marginTop: 14, lineHeight: 1.35 }}>
              {called.map((r) => `${r.name}${r.team ? ` (${r.team})` : ''}`).join('  ·  ')}
            </span>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', width: 600, padding: '14px 18px', borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM }}>LAST 10 NIGHTS</span>
            {spanPct != null ? <span style={{ fontSize: fs(24), color: ACCENT, fontWeight: 800 }}>{`${span.called} / ${span.total} · ${spanPct}%`}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexGrow: 1, marginTop: 10 }}>
            {days.map((d, i) => (
              <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: fs(22), fontWeight: 800, color: d.day === day ? INK : INK2, marginBottom: 4 }}>{d.total ? `${d.pct}%` : '—'}</span>
                <div style={{ display: 'flex', width: '100%', height: `${Math.max(2, (d.pct || 0) * 0.72)}%`, background: d.day === day ? ACCENT : alpha(ACCENT, 0.38) }} />
                <span style={{ fontSize: fs(22), color: d.day === day ? INK : INK2, fontWeight: d.day === day ? 800 : 600, marginTop: 6 }}>{dm(d.day, i)}</span>
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
  const COLS = { rank: 46, team: 70, opp: 300, score: 214, price: 214 }
  const nameW = bodyW - 48 - COLS.rank - COLS.team - COLS.opp - COLS.score - COLS.price - 5 * 14
  const el = (
    <Poster accent={ACCENT} grain={grain} word="TONIGHT'S CALLS" chips={['PREGAME']} right="MOONSHOT'S HR CALLS" brand={brand} footRight={`${prettyDay(day)} · posted before first pitch`} h={H}>
      <div style={{ display: 'flex', flexDirection: 'column', width: bodyW, padding: '8px 24px 8px 24px' }}>
        {list.map((p, i) => {
          const price = p.odds_over && p.odds_book ? `${fmtOdds(p.odds_over)} · ${p.odds_book}` : ''
          // the arm's HR/9 over his last three starts is on every row; price still wins when there is one, and the dash is gone either way
          const armL3 = fin(p.pitcher_l3_hr9) ? `${Number(p.pitcher_l3_hr9).toFixed(2)} HR/9 L3` : ''
          const podium = i < 3
          const name = String(p.name || '')
          return (
            <div key={p.player_id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 54, padding: '0 6px', background: i % 2 ? alpha(INK, 0.04) : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: COLS.rank - 12, height: 36, borderRadius: 6, fontFamily: DISPLAY, fontSize: 28, fontWeight: 900, color: podium ? CHASSIS.bg : ACCENT, background: podium ? ACCENT : alpha(ACCENT, 0.14), transform: 'skewX(-8deg)' }}>{String(i + 1)}</div>
              <span style={{ display: 'block', width: nameW, fontFamily: DISPLAY, fontSize: fitDisplay(name, 38, nameW, 24), fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
              <div style={{ display: 'flex', width: COLS.team, alignItems: 'center' }}>{p.team ? <Logo m={clubs[i]} size={38} /> : null}</div>
              <span style={{ display: 'flex', width: COLS.opp, fontSize: fs(22), fontWeight: 700, color: INK2, whiteSpace: 'nowrap' }}>{p.opponent ? `vs ${p.opponent}${p.pitcher ? ` · ${p.pitcher}` : ''}` : ''}</span>
              <span style={{ display: 'flex', width: COLS.score, fontSize: fs(22), fontWeight: 800, color: INK2, whiteSpace: 'nowrap' }}>{p.hr_score != null ? `MOONSHOT Score ${Math.round(Number(p.hr_score))}` : ''}</span>
              <span style={{ display: 'flex', width: COLS.price, justifyContent: 'flex-end', fontSize: fs(22), fontWeight: 800, color: price ? ACCENT : (armL3 ? INK : DIM), whiteSpace: 'nowrap' }}>{price || armL3 || ''}</span>
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
  const detail = (Array.isArray(lines) ? lines : []).filter(Boolean)
  const head = String(headline || '')
  const el = (
    <Poster accent={ACCENT} grain={grain} word={String(label || '').toUpperCase()} chips={pill ? [pill] : []} brand={brand} footRight={prettyDay(day)}>
      <div style={{ display: 'flex', flexDirection: 'column', width: bodyW, padding: '24px 40px', justifyContent: 'center', gap: 22 }}>
        <span style={{ display: 'flex', fontFamily: DISPLAY, fontSize: head.length > 70 ? 56 : 72, fontWeight: 900, lineHeight: 1.1, textTransform: 'uppercase', transform: 'skewX(-8deg)' }}>{head}</span>
        <div style={{ display: 'flex', height: 2, background: alpha(ACCENT, 0.3) }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {detail.map((l, i) => <span key={i} style={{ display: 'flex', fontSize: fs(28), fontWeight: 700, color: INK2 }}>{String(l)}</span>)}
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
export async function hotStretchCard(day, pick, { site = 'dashnetwork.vercel.app', window = 'month', windowLabel = '' } = {}) {
  const { grain } = await assets()
  const name = String(pick?.name || 'Unknown')
  const team = String(pick?.team || '').toUpperCase()
  const m = await playerOf(team, name, pick?.player_id)
  const label = String(windowLabel || (window === 'week' ? 'LAST 7 DAYS' : 'THIS MONTH')).toUpperCase()
  const arm = String(pick?.pitcher || '').trim().split(/\s+/).slice(-1)[0] || ''
  // The supporting numerals. OPS is deliberately NOT here -- it is the hero on the portrait.
  const tiles = [
    { label: 'AVG', value: String(pick?.avg || '') },
    { label: 'OBP', value: String(pick?.obp || '') },
    { label: 'SLG', value: String(pick?.slg || '') },
    { label: 'HR', value: String(pick?.hr ?? '') },
    { label: 'RBI', value: String(pick?.rbi ?? '') },
  ].filter((t) => t.value !== '' && t.value !== 'null' && t.value !== 'undefined')
  // season vs window. Rate stats only -- HR and RBI over a 15-game window against a 150-game season is two different questions.
  const se = pick?.season || null
  const cmp = (key) => {
    const a = String(se?.[key] || '')
    const b = String(pick?.[key] || '')
    if (!a || !b) return null
    return { label: key.toUpperCase(), season: a, now: b, up: Number(b) >= Number(a) }
  }
  const seasonRows = se ? ['avg', 'obp', 'slg', 'ops'].map(cmp).filter(Boolean) : []
  const colW = bodyW - PORTRAIT_W
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} word="ON A HEATER" chips={[label]} right="THE HOT STRETCH" brand={brand} footRight={`${prettyDay(day)} · the hottest bat on tonight's board`}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={pick?.ops ? { word: 'OPS', value: String(pick.ops), caption: label } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: COL_PAD, gap: 10 }}>
        <NameLine name={name} size={96} maxW={colW - 70} h={88} />
        <MatchLine m={m} text={`${pick?.games || 0} GAMES · ${pick?.ab || 0} AB`} />
        {tiles.length ? <TileRow>{tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} hot accent={ACCENT} big={54} />)}</TileRow> : null}
        {seasonRows.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 16px', borderBottom: `2px solid ${alpha(INK, 0.14)}` }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{`${label} vs HIS SEASON`}</span>
              <span style={{ marginLeft: 'auto', fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{`${pick?.season?.games || 0} GAMES ON THE YEAR`}</span>
            </div>
            <div style={{ display: 'flex', padding: '6px 0' }}>
              {seasonRows.map((r) => (
                <div key={r.label} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, padding: '0 16px', borderLeft: `2px solid ${alpha(INK, 0.1)}` }}>
                  <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM }}>{r.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: fs(24), fontWeight: 700, color: DIM }}>{r.season}</span>
                    <span style={{ fontSize: fs(22), fontWeight: 800, color: r.up ? ACCENT : DIM }}>{r.up ? '▲' : '▼'}</span>
                    <span style={{ fontSize: fs(28), fontWeight: 800, color: INK }}>{r.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <Banner accent={ACCENT} called={false} line={arm ? `On tonight's board — facing ${arm}` : "On tonight's board"} h={58} right={<span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 4, color: ACCENT }}>MOONSHOT</span>} />
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'hotstretch' })
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
  const playerRow = (p, club, last) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 0', borderBottom: last ? 'none' : `2px solid ${RULE}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo m={{ ...club, name: p.name }} size={40} />
        <span style={{ display: 'flex', fontFamily: DISPLAY, fontSize: fitDisplay(p.name, 48, 520, 28), fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap' }}>{p.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: fs(24), fontWeight: 800, color: DIM, whiteSpace: 'nowrap' }}>{p.opponent ? `vs ${p.opponent}` : ''}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {p.blastPct != null ? <span style={{ fontSize: fs(22), fontWeight: 800, color: ACCENT }}>{`${p.blastPct}% blast rate`}</span> : null}
        {p.pitcher ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{`facing ${p.pitcher}${p.pitcherTeam ? ` (${p.pitcherTeam})` : ''}`}</span> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        {(p.over != null && p.book) ? <span style={{ fontSize: fs(24), fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>{`HR odds tonight: ${fmtOdds(p.over)} · ${p.book}`}</span> : null}
        {p.hr_score != null ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{`Moonshot Score ${Math.round(p.hr_score)}`}</span> : null}
      </div>
    </div>
  )
  const el = (
    <Poster accent={ACCENT} grain={grain} word="THE PAIR TRAP" chips={['PAIRS']} right="PREGAME" brand={brand} footRight={`${prettyDay(day)} · pregame`}>
      <div style={{ display: 'flex', width: bodyW, padding: '14px 24px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', padding: '4px 24px', borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 5, color: ACCENT, padding: '8px 0 2px 0' }}>BOTH ON THE BOARD TONIGHT</span>
          {playerRow(main.a, ca, false)}
          {playerRow(main.b, cb, !rest.length)}
          {rest.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0', gap: 4, borderTop: `2px solid ${RULE}` }}>
              {rest.map((r) => <span key={`${r.a.player_id}-${r.b.player_id}`} style={{ fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{`+ ${r.a.name} & ${r.b.name} — ${r.count}x same-day`}</span>)}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 250, padding: '16px', borderRadius: 14, border: `2px solid ${alpha(ACCENT, 0.55)}`, background: alpha(ACCENT, 0.08) }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 104, fontWeight: 900, lineHeight: 1, color: ACCENT, transform: 'skewX(-8deg)' }}>{String(main.count)}</span>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: INK, textAlign: 'center', marginTop: 4 }}>SAME-DAY HRs</span>
          <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: INK, textAlign: 'center' }}>THIS SEASON</span>
          {main.rate != null ? <span style={{ fontSize: fs(24), fontWeight: 700, color: DIM, marginTop: 12 }}>{`${main.rate}% of games`}</span> : null}
          {main.sameGame ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 14, paddingTop: 12, width: '100%', borderTop: `2px solid ${alpha(ACCENT, 0.3)}` }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 48, fontWeight: 900, color: ACCENT, transform: 'skewX(-8deg)' }}>{String(main.sameGame)}</span>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: INK }}>SAME GAME</span>
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
export async function longshotCard(day, pick, { site = 'dashnetwork.vercel.app' } = {}) {
  const { grain } = await assets()
  const team = String(pick?.team || '').toUpperCase()
  const m = await playerOf(team, String(pick.name || ''), pick?.player_id)
  // roleWord() here is the same one every tweet uses ("TOP pick", "HRR pick", ...)
  const badgeWord = pick.role ? roleWord(pick.role).toUpperCase() : 'ON THE BOARD'
  const batting = [
    pick.blastPct != null ? { label: 'BLAST RATE', value: `${pick.blastPct}%` } : null,
    pick.barrelPct != null ? { label: 'BARREL %', value: `${pick.barrelPct}%` } : null,
    pick.hardHitPct != null ? { label: 'HARD-HIT %', value: `${pick.hardHitPct}%` } : null,
  ].filter(Boolean)
  const colW = bodyW - PORTRAIT_W
  const el = (
    <Poster accent={ACCENT} tone={m.tone} grain={grain} word="TONIGHT'S LONGEST CALL" chips={['LONGSHOT']} right="THE MOONSHOT" brand={brand} footRight={`${prettyDay(day)} · pregame`}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} tag={badgeWord} plate={pick.hr_score != null ? { word: 'MOONSHOT SCORE', value: Math.round(pick.hr_score) } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: COL_PAD, gap: 12 }}>
        <NameLine name={pick.name} size={96} maxW={colW - 70} h={88} />
        {pick.opponent ? <MatchLine m={m} text={`vs ${pick.opponent}`} /> : null}
        <Banner accent={ACCENT} called={false} line="HR odds to go deep" h={72} right={<Odds value={fmtOdds(pick.over)} book={pick.book} accent={ACCENT} />} />
        {batting.length ? <TileRow>{batting.map((s) => <Tile key={s.label} label={s.label} value={s.value} hot accent={ACCENT} big={48} />)}</TileRow> : null}
        {(pick.pitcher || pick.pitcherHr9 != null) ? (
          <div style={{ display: 'flex' }}>
            {pick.pitcher ? <Cell label="FACING TONIGHT" value={`${pick.pitcher}${pick.pitcherTeam ? ` (${pick.pitcherTeam})` : ''}`} accent={ACCENT} grow={2} /> : null}
            {pick.pitcherHr9 != null ? <Cell label="PITCHER HR/9" value={Number(pick.pitcherHr9).toFixed(2)} accent={ACCENT} hot /> : null}
          </div>
        ) : null}
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
  const nameW = 330
  const playerRow = (p, i) => (
    <div key={p.player_id || i} style={{ display: 'flex', alignItems: 'center', gap: 14, height: 62, padding: '0 20px', borderBottom: i < shown.length - 1 ? `2px solid ${alpha(INK, 0.08)}` : 'none' }}>
      <span style={{ display: 'flex', width: 70, fontFamily: DISPLAY, fontSize: 34, fontWeight: 900, color: ACCENT, transform: 'skewX(-8deg)' }}>{p.jersey != null ? `#${p.jersey}` : ''}</span>
      <span style={{ display: 'block', width: nameW, fontFamily: DISPLAY, fontSize: fitDisplay(p.name, 40, nameW, 24), fontWeight: 900, textTransform: 'uppercase', transform: 'skewX(-8deg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
      <div style={{ display: 'flex', width: 44 }}>{p.team ? <Logo m={clubs[i]} size={38} /> : null}</div>
      <span style={{ display: 'flex', width: 110, fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>{p.opponent ? `vs ${p.opponent}` : ''}</span>
      <span style={{ display: 'flex', width: 150, fontSize: fs(22), fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}>{p.role ? roleWord(p.role).toUpperCase() : ''}</span>
      <span style={{ display: 'flex', marginLeft: 'auto', fontSize: fs(24), fontWeight: 800, color: DIM, whiteSpace: 'nowrap' }}>{p.gem ? `= ${p.gem.value}` : p.nth ? `HR #${p.nth}` : ''}</span>
    </div>
  )
  const plate = (top, big, bottom, small) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 250, padding: '16px', borderRadius: 14, border: `2px solid ${alpha(ACCENT, 0.55)}`, background: alpha(ACCENT, 0.08) }}>
      <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: INK, textAlign: 'center' }}>{top}</span>
      <span style={{ fontFamily: DISPLAY, fontSize: big, fontWeight: 900, lineHeight: 1.05, color: ACCENT, transform: 'skewX(-8deg)' }}>{String(bottom)}</span>
      {small ? <span style={{ fontSize: fs(22), fontWeight: 700, color: DIM, textAlign: 'center' }}>{small}</span> : null}
    </div>
  )
  const el = (
    <Poster accent={ACCENT} grain={grain} word={label} chips={['NUMEROLOGY']} right="LIVE" brand={brand} footRight={`${prettyDay(day)} · live`}>
      <div style={{ display: 'flex', width: bodyW, padding: '18px 24px', gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, borderRadius: 14, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04), overflow: 'hidden' }}>
          {shown.map((p, i) => playerRow(p, i))}
          {rest > 0 ? <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 700, color: DIM, padding: '8px 20px' }}>{`+ ${rest} more`}</span> : null}
        </div>
        {root != null
          ? plate(moment.tier === 'gematria' ? 'NAMES = DATE' : 'DIGIT ROOT', 112, root, { trifecta: 'jersey · HR count · birthday', gematria: gemDates }[moment.tier] || 'shared jersey digit')
          : plate('SAME NUMBER, SAME NIGHT', 96, `#${moment.jersey}`, '')}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'numerology' })
}
