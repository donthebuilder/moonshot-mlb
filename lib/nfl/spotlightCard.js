// lib/nfl/spotlightCard.js — PLAYER SPOTLIGHT, TUDDY's showcase poster (1200 x 675).
//
// 2026-09-20, Donovan, one word: "wheres the card". Built as THE HOT STRETCH's football twin (lib/dash/homerCard.js hotStretchCard);
// REDRAWN 2026-10-12 with it as a landscape variant of the baseball-card look (lib/cards/posterKit.js): the face over a faded
// club-logo watermark with the hero number on its plate, the slanted display-caps name, ruled metric tiles, a bordered "this week vs
// his own average" panel and a closing banner. The accent is TUDDY's (lib/sportAccent.js), the club's own colour is the wash.
//
// THE HERO IS TOTAL TOUCHDOWNS. The tiles deliberately split a quarterback's scores across passing and rushing (Josh Allen's Thursday
// was 3 PASS TD and 2 RUSH TD), so the sum is the fact the poster leads with -- the same reason the tweet's closing line carries it.
//
// EVERY FIELD REAL OR ABSENT. A receiver with no carries gets no CAR tile; a missing headshot falls back to the club monogram. Nothing
// is invented and nothing draws an empty box.
//
// TEXT FIT (2026-10-12): every box is measured (lib/cards/fit.js through posterKit): the name steps down and wraps, the tile row shares
// one number size, the comparison cells fit their three runs, the claim steps down in the banner and the context wraps.
import { nflTones } from './teamColors'
import { SPORT_ACCENT } from '../sportAccent'
import {
  PORTRAIT_W, Poster, Portrait, NameLine, MatchLine, TileRow, tileRowPlan, tileRowH, Banner, planText, planH, Lines, fitAlts, textWidth, lineH, vlog, logFit, POSTER,
  assets, renderPoster, clubOf, nflFace, prettyDay, bodyH, bodyW, alpha, INK, DIM,
} from '../cards/posterKit'

const ACCENT = SPORT_ACCENT.nfl
const COL_W = bodyW - PORTRAIT_W
const INNER = COL_W - 24 - POSTER.pad            // text stays 48px or more from the poster's right edge
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const txt = (v) => { const t = String(v ?? '').trim(); return t && t !== 'undefined' && t !== 'null' && t !== 'NaN' ? t : '' }
const one = (v) => (fin(v) ? (Math.round(Number(v) * 10) / 10).toFixed(1) : '')
const n0 = (v) => (fin(v) ? Number(v) : 0)

/**
 * `pick` is a lib/nfl/tweetFeed.js spotlightPick() result. `windowLabel` and `statement` are the same strings the tweet uses, so the
 * poster and the post can never disagree about which week this is or what it claims. Returns an ImageResponse (PNG body).
 */
export async function spotlightCard(pick, { site = 'dashnetwork.vercel.app', windowLabel = '', statement = '', context = '' } = {}) {
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nfl', pick?.team), nflFace(pick?.player_id)])
  const [c1] = nflTones(pick?.team)
  const td = n0(pick?.patd) + n0(pick?.rutd) + n0(pick?.rectd)
  const label = String(windowLabel || 'SPOTLIGHT').toUpperCase()

  // The supporting numerals. TOTAL TD is deliberately NOT here -- it is the hero on the portrait plate.
  const tiles = [
    n0(pick?.payd) > 0 ? { label: 'PASS YDS', value: pick.payd } : null,
    n0(pick?.patd) > 0 ? { label: 'PASS TD', value: pick.patd } : null,
    n0(pick?.ruyd) > 0 ? { label: 'RUSH YDS', value: pick.ruyd } : null,
    n0(pick?.rec) > 0 ? { label: 'REC', value: pick.rec } : null,
    n0(pick?.recyd) > 0 ? { label: 'REC YDS', value: pick.recyd } : null,
  ].filter(Boolean).slice(0, 5)

  // THIS WEEK vs HIS OWN AVERAGE. Per-game season rates off the slate row's `stats` block -- the same one RED ZONE TARGETS reads.
  // Only rows where both halves are real; a row blank on either side says nothing.
  const a = pick?.avg || {}
  const cmp = [
    fin(a.td) ? { label: 'TD', avg: one(a.td), now: String(td) } : null,
    fin(a.xtd) ? { label: 'EXPECTED TD', avg: one(a.xtd), now: String(td) } : null,
    n0(pick?.payd) > 0 && fin(a.payd) ? { label: 'PASS YDS', avg: one(a.payd), now: String(pick.payd) } : null,
    n0(pick?.ruyd) > 0 && fin(a.ruyd) ? { label: 'RUSH YDS', avg: one(a.ruyd), now: String(pick.ruyd) } : null,
    n0(pick?.recyd) > 0 && fin(a.rz) ? { label: 'RZ TOUCHES', avg: one(a.rz), now: '—' } : null,
  ].filter(Boolean).slice(0, 4).map((r) => ({ ...r, up: Number(r.now) >= Number(r.avg) }))

  const name = txt(pick?.name) || 'Unknown'
  const m = { ...club, name, face, tone: c1 }
  const info = [txt(pick?.position), txt(pick?.opp) ? `vs ${pick.opp}` : '', fin(pick?.seasonTd) ? `${pick.seasonTd} TD ON THE YEAR` : ''].filter(Boolean)
  const extraAlts = [info.join(' · '), info.slice(0, 2).join(' · '), info.slice(0, 1).join(' · ')].filter(Boolean)
  const claim = txt(statement).toUpperCase()
  const tp = tiles.length ? tileRowPlan(tiles, INNER, 52) : null

  // the comparison panel: the cells share the width, each cell's three runs (average, arrow, this week) step down to fit it
  const cellW = cmp.length ? Math.floor((INNER - 4) / cmp.length) : 0
  const cells = cmp.map((r) => {
    const inner = cellW - 2 - 32
    const lab = fitAlts([r.label], { sizes: [22], maxW: inner, id: `spot-cell:${r.label}`, weight: 800 })
    let pickSize = null
    outer: for (const s of [24, 22]) for (const n of [28, 24, 22]) {
      if (textWidth(r.avg, { size: s, weight: 700 }) + textWidth('▲', { size: 22, weight: 800 }) + textWidth(r.now, { size: n, weight: 800 }) + 16 <= inner) { pickSize = { s, n }; break outer }
    }
    // the last resort drops his average (the arrow and this week's number stay: the claim is the direction)
    let avg = r.avg
    if (!pickSize) { pickSize = { s: 22, n: 22 }; avg = '' }
    const w = textWidth(avg, { size: pickSize.s, weight: 700 }) + textWidth('▲', { size: 22, weight: 800 }) + textWidth(r.now, { size: pickSize.n, weight: 800 }) + 16
    logFit({ id: `spot-compare:${r.label}`, kind: 'row', text: `${avg} ${r.now}`, size: pickSize.n, w, maxW: inner, ok: w <= inner })
    return { ...r, avg, lab: lab.text, ...pickSize }
  })
  const ns = cells.length ? Math.min(...cells.map((c) => c.n)) : 0
  const headL = fitAlts([`${label} vs HIS AVERAGE`, `${label} vs AVERAGE`, label], { sizes: [22], maxW: INNER - 32 - 160, id: 'spot-head', weight: 800, ls: 3 })
  const panelH = 4 + lineH(22) + 10 + 2 + 12 + lineH(22) + lineH(Math.max(ns, 28))
  const ctx = txt(context) ? planText(txt(context), { sizes: [22], maxW: INNER, maxLines: 2, id: 'spot-context', weight: 700, ls: 1 }) : null
  const GAP = 8; const NAME_H = 80; const BANNER_H = 58
  const parts = [NAME_H, 48, tp ? tileRowH(tp) : 0, cells.length ? panelH : 0, claim ? BANNER_H : 0]
  const kids = parts.filter((x) => x > 0).length + (ctx ? 1 : 0)
  let used = 12 + 12 + parts.reduce((x, y) => x + y, 0) + (ctx ? planH(ctx) : 0) + (kids - 1) * GAP
  let showCtx = ctx
  if (ctx && used > bodyH()) { used -= planH(ctx) + GAP; showCtx = null }
  vlog('spotlight-column', used, bodyH())
  const el = (
    <Poster accent={ACCENT} tone={c1} grain={grain} word="THE BIGGEST NIGHT" chips={[label]} right={['PLAYER SPOTLIGHT', 'SPOTLIGHT']} brand="TUDDY" footRight={prettyDay(txt(pick?.day))}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={{ word: 'TOTAL TD', value: String(td) }} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `12px ${POSTER.pad}px 12px 24px`, gap: GAP }}>
        <NameLine name={name} size={92} maxW={INNER} h={NAME_H} />
        <MatchLine m={m} text={`${txt(pick?.team)}${fin(pick?.jersey) ? ` #${pick.jersey}` : ''}`} extra={extraAlts} maxW={INNER} />
        {tp ? <TileRow tiles={tiles} w={INNER} accent={ACCENT} plan={tp} /> : null}
        {cells.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: INNER, borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: lineH(22) + 10, padding: '0 16px', borderBottom: `2px solid ${alpha(INK, 0.14)}` }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{headL.text}</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>PER GAME</span>
            </div>
            <div style={{ display: 'flex', padding: '6px 0' }}>
              {cells.map((r) => (
                <div key={r.label} style={{ display: 'flex', flexDirection: 'column', width: cellW, padding: '0 16px', borderLeft: `2px solid ${alpha(INK, 0.1)}` }}>
                  <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: DIM, whiteSpace: 'nowrap' }}>{r.lab}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, height: lineH(Math.max(ns, 28)) }}>
                    <span style={{ fontSize: r.s, fontWeight: 700, color: DIM }}>{r.avg}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: r.up ? ACCENT : DIM }}>{r.up ? '▲' : '▼'}</span>
                    <span style={{ fontSize: r.n, fontWeight: 800, color: INK }}>{r.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {claim ? <Banner accent={ACCENT} called={false} line={claim} h={BANNER_H} w={INNER} /> : null}
        {showCtx ? <Lines plan={showCtx} weight={700} color={DIM} ls={1} /> : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'spotlight' })
}
