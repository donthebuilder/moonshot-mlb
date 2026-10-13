// lib/nfl/tdCard.js — THE END ZONE: the live touchdown alert poster (1200 x 675), TUDDY-branded.
//
// REDRAWN 2026-10-12 as a landscape variant of the baseball-card look (lib/cards/posterKit.js on lib/cards/cardKit.js; Donovan:
// "everything should be the baseball card look"). The frame, the foil strip (a CALLED touchdown only), the letter-spaced status word, the
// face over a faded club-logo watermark with the plate's hero number, the slanted display-caps name, ruled metric tiles, the defense
// row and the closing status banner are the card kit's own. The accent is TUDDY's (lib/sportAccent.js SPORT_ACCENT.nfl), the club's own
// colour is the wash behind the face, the status words are lib/callStatus.js STATUS_WORD.
//
// EVERY FIELD HERE IS REAL OR ABSENT, NEVER GUESSED. lib/nfl/tdFeed.js's buildTdEvent() already enforces this on the data side (a
// missed roster join omits season-to-date / on-the-bot rather than fabricating them); this file's only job is to not draw a box for a
// field that came back null (or NaN / undefined). A scorer whose roster join failed gets the club monogram instead of a face and simply
// no board plate; a play with no parsed distance gets no distance tile.
//
// THE THREE STATES (project rule 14): a designated pick wears his own TD score (CALLED), a rated player wears his board seat (TD BOARD),
// and a scorer the model never surfaced wears the play itself (THE PLAY). The poster must never blur them, and only a CALLED touchdown
// carries the foil strip.
//
// TEXT FIT (2026-10-12): every box is measured (lib/cards/fit.js through posterKit): the name steps down and wraps, a tile's label
// wraps before its number is crowded, the defense line wraps, the matchup's extra words drop in order, and the column plans its height.
import { onBotWord, roleTag } from './tdFeed'
import { STATUS_WORD } from '../callStatus'
import { SPORT_ACCENT } from '../sportAccent'
import { periodWord } from './period'
import { nflTones } from './teamColors'
import { nflNickname } from './teams'
import { C } from './theme'
import {
  PORTRAIT_W, Poster, Portrait, NameLine, MatchLine, TileRow, tileRowPlan, tileRowH, Banner, planText, planH, Lines, textWidth, lineH, vlog, POSTER,
  assets, renderPoster, clubOf, nflFace, prettyDay, bodyH, bodyW, alpha, INK, INK2, DIM,
} from '../cards/posterKit'

const ACCENT = SPORT_ACCENT.nfl
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))
const txt = (v) => { const t = String(v ?? '').trim(); return t && t !== 'undefined' && t !== 'null' && t !== 'NaN' ? t : '' }
const COL_W = bodyW - PORTRAIT_W
const INNER = COL_W - 24 - POSTER.pad            // text stays 48px or more from the poster's right edge

/**
 * The touchdown alert poster. `ev` is a lib/nfl/tdFeed.js buildTdEvent() result. Every enrichment row is conditional on the field
 * actually being present. Returns an ImageResponse (PNG body).
 */
export async function tdCard(ev, { site = 'dashnetwork.vercel.app' } = {}) {
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nfl', ev?.team), nflFace(ev?.gsisId)])
  const [c1] = nflTones(ev?.team)

  const headline = txt(ev.scorerName) || txt(ev.text) || 'Touchdown'
  const scoreLine = (fin(ev.awayScore) && fin(ev.homeScore)) ? `${ev.awayScore}–${ev.homeScore}` : null
  const distanceYd = fin(ev.parsed?.yards) ? Number(ev.parsed.yards) : null
  const subhead = ev.parsed && distanceYd != null
    ? (ev.parsed.passer ? `${distanceYd} yd from ${txt(ev.parsed.passer)}` : `${distanceYd} yd ${txt(ev.parsed.kind)}`.trim())
    : null
  // a board seat is real only with both numbers; a pick's score only when it is a number
  const board = ev.tdBoard && fin(ev.tdBoard.rank) && fin(ev.tdBoard.of) ? ev.tdBoard : null
  const pick = ev.onBot && fin(ev.onBot.score) ? ev.onBot : null

  // THE PLATE'S HERO, in the order the product ranks them (see the header).
  const plate = pick
    ? { label: STATUS_WORD.called, hero: String(pick.score), caption: [`${onBotWord(pick).toUpperCase()}${txt(pick.grade) ? ` · ${txt(pick.grade)}` : ''}`, onBotWord(pick).toUpperCase()] }
    : board
      ? { label: 'TD BOARD', hero: `#${board.rank}`, caption: [`OF ${board.of} RATED`] }
      : distanceYd != null
        ? { label: 'THE PLAY', hero: String(distanceYd), caption: ['YARD TOUCHDOWN'] }
        : null

  // THE DISTANCE IS PRINTED ONCE. When no board state exists the play itself is the plate's hero, so repeating it as a tile -- and
  // again in the line under the name -- turned one fact into three.
  const std = ev.seasonToDate && fin(ev.seasonToDate.td) ? ev.seasonToDate : null
  const tiles = [
    (distanceYd != null && plate?.label !== 'THE PLAY') ? { label: 'TD DISTANCE', value: distanceYd, unit: 'YD' } : null,
    scoreLine ? { label: 'SCORE NOW', value: scoreLine } : null,
    fin(ev.quarter) ? { label: 'QUARTER', value: periodWord(ev.quarter), unit: txt(ev.clock) } : null,
    std ? { label: 'TD ENTERING TODAY', value: std.td } : null,
    std?.last3Games && fin(std.last3Td) ? { label: `LAST ${std.last3Games} G`, value: std.last3Td, unit: 'TD' } : null,
  ].filter(Boolean).slice(0, 4)

  // The closing line: whichever of the three states this scorer is in, said once, in the account's own voice -- evidence, not a victory lap.
  const statement = pick
    ? [`${onBotWord(pick).toUpperCase()}. IT LANDED.`, `${STATUS_WORD.called}.`]
    : board
      ? [`#${board.rank} OF ${board.of} RATED.`]
      : [`${nflNickname(ev.team)} FIND THE END ZONE.`]

  // The line under the statement carries what the tiles do NOT: his season shape and, when the board plate took the hero slot, the play itself.
  const context = [
    plate?.label === 'THE PLAY' ? '' : subhead,
    std
      ? (fin(std.games) && std.games ? `${std.td} TD IN ${std.games} G` : `${std.td} TD ENTERING TODAY`)
      : '',
    (std?.last3Games && !tiles.some((t) => t.label.startsWith('LAST ')))
      ? `${std.last3Td} IN THE LAST ${std.last3Games}` : '',
  ].filter(Boolean).join('  ·  ').toUpperCase()

  const called = Boolean(pick)
  const m = { ...club, name: headline, face, tone: c1 }
  const tagColor = ev.defense?.tag === 'AVOID' ? C.red : ev.defense?.tag === 'TARGET' ? ACCENT : INK2
  const tp = tiles.length ? tileRowPlan(tiles, INNER, 52) : null
  // THE DEFENSE: the detail line fitted beside its pill (it wraps onto a second line before it is cut)
  let def = null
  if (ev.defense && txt(ev.defense.detail)) {
    const tag = txt(ev.defense.tag)
    const pillW = tag ? textWidth(tag, { size: 22, weight: 800, ls: 2 }) + 32 + 4 : 0
    const detail = planText(txt(ev.defense.detail), { sizes: [24, 22], maxW: INNER - 32 - pillW - 16, maxLines: 2, id: 'td-defense', weight: 800 })
    def = { tag, detail, h: 8 + lineH(22) + planH(detail) + 4 }
  }
  const ctx = context ? planText(context, { sizes: [22], maxW: INNER, maxLines: 2, id: 'td-context', weight: 700, ls: 1 }) : null
  const kickerText = `${nflNickname(ev.team)} TOUCHDOWN`
  const extraAlts = [[roleTag(ev), ev.opponent ? `vs ${ev.opponent}` : '', subhead || ''], [roleTag(ev), ev.opponent ? `vs ${ev.opponent}` : ''], [ev.opponent ? `vs ${ev.opponent}` : '']].map((a) => a.filter(Boolean).join(' · ')).filter(Boolean)

  const GAP = 8; const NAME_H = 76; const BANNER_H = 58
  const parts = [lineH(22), NAME_H, 48, tp ? tileRowH(tp) : 0, def ? def.h : 0, BANNER_H]
  const kids = parts.filter((x) => x > 0).length + (ctx ? 1 : 0)
  let used = 12 + 12 + parts.reduce((a, b) => a + b, 0) + (ctx ? planH(ctx) : 0) + (kids - 1) * GAP
  let showCtx = ctx
  if (ctx && used > bodyH()) { used -= planH(ctx) + GAP; showCtx = null }       // the context line is the first thing to go
  vlog('td-column', used, bodyH())
  const el = (
    <Poster accent={ACCENT} tone={c1} grain={grain} called={called} word={plate ? plate.label : 'TOUCHDOWN'} chips={txt(ev.kindWord) ? [txt(ev.kindWord).toUpperCase()] : []} right={['TOUCHDOWN']} brand="TUDDY" footRight={[`${prettyDay(txt(ev?.day))} · every touchdown, graded in public`, prettyDay(txt(ev?.day))]}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={plate ? { value: plate.hero, caption: plate.caption } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: COL_W, padding: `12px ${POSTER.pad}px 12px 24px`, gap: GAP }}>
        <span style={{ display: 'flex', fontSize: 22, fontWeight: 800, letterSpacing: 6, lineHeight: 1.2, color: ACCENT, whiteSpace: 'nowrap' }}>{kickerText}</span>
        <NameLine name={headline} size={92} maxW={INNER} h={NAME_H} />
        <MatchLine m={m} text={`${txt(ev.team)}${fin(ev.jersey) || txt(ev.jersey) ? ` #${ev.jersey}` : ''}`} extra={extraAlts} maxW={INNER} />
        {tp ? <TileRow tiles={tiles} w={INNER} accent={ACCENT} plan={tp} /> : null}
        {/* THE DEFENSE: the same TARGET / AVOID / EVEN tag Games.js / Matchups.js render pregame, applied after the fact to the defense he just scored on. */}
        {def ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: INNER, padding: '4px 16px', borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, lineHeight: 1.2, color: DIM }}>THE DEFENSE</span>
              <Lines plan={def.detail} color={INK} />
            </div>
            {def.tag ? <span style={{ display: 'flex', fontSize: 22, fontWeight: 800, letterSpacing: 2, color: tagColor, border: `2px solid ${alpha(tagColor, 0.55)}`, borderRadius: 999, padding: '1px 16px', whiteSpace: 'nowrap' }}>{def.tag}</span> : null}
          </div>
        ) : null}
        <Banner accent={ACCENT} called={called} line={statement} h={BANNER_H} w={INNER} />
        {showCtx ? <Lines plan={showCtx} weight={700} color={DIM} ls={1} /> : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'td' })
}
