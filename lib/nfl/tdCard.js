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
// field that came back null. A scorer whose roster join failed gets the club monogram instead of a face and simply no board plate; a
// play with no parsed distance gets no distance tile.
//
// THE THREE STATES (project rule 14): a designated pick wears his own TD score (CALLED), a rated player wears his board seat (TD BOARD),
// and a scorer the model never surfaced wears the play itself (THE PLAY). The poster must never blur them, and only a CALLED touchdown
// carries the foil strip.
import { onBotWord, roleTag } from './tdFeed'
import { STATUS_WORD } from '../callStatus'
import { SPORT_ACCENT } from '../sportAccent'
import { periodWord } from './period'
import { nflTones } from './teamColors'
import { nflNickname } from './teams'
import { C } from './theme'
import {
  Poster, Portrait, NameLine, MatchLine, Tile, TileRow, Banner, assets, renderPoster, clubOf, nflFace, prettyDay, bodyH, bodyW,
  alpha, fs, INK, INK2, DIM,
} from '../cards/posterKit'

const ACCENT = SPORT_ACCENT.nfl
const PORTRAIT_W = 236

/**
 * The touchdown alert poster. `ev` is a lib/nfl/tdFeed.js buildTdEvent() result. Every enrichment row is conditional on the field
 * actually being present. Returns an ImageResponse (PNG body).
 */
export async function tdCard(ev, { site = 'dashnetwork.vercel.app' } = {}) {
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nfl', ev?.team), nflFace(ev?.gsisId)])
  const [c1] = nflTones(ev?.team)

  const headline = ev.scorerName || ev.text
  const scoreLine = (ev.awayScore != null && ev.homeScore != null) ? `${ev.awayScore}–${ev.homeScore}` : null
  const distanceYd = ev.parsed?.yards ?? null
  const subhead = ev.parsed
    ? (ev.parsed.passer ? `${distanceYd} yd from ${ev.parsed.passer}` : `${distanceYd} yd ${ev.parsed.kind}`)
    : null

  // THE PLATE'S HERO, in the order the product ranks them (see the header).
  const plate = ev.onBot
    ? { label: STATUS_WORD.called, hero: String(ev.onBot.score), caption: `${onBotWord(ev.onBot).toUpperCase()}${ev.onBot.grade ? ` · ${ev.onBot.grade}` : ''}` }
    : ev.tdBoard
      ? { label: 'TD BOARD', hero: `#${ev.tdBoard.rank}`, caption: `OF ${ev.tdBoard.of} RATED` }
      : distanceYd != null
        ? { label: 'THE PLAY', hero: String(distanceYd), caption: 'YARD TOUCHDOWN' }
        : null

  // THE DISTANCE IS PRINTED ONCE. When no board state exists the play itself is the plate's hero, so repeating it as a tile -- and
  // again in the line under the name -- turned one fact into three.
  const tiles = [
    (distanceYd != null && plate?.label !== 'THE PLAY') ? { label: 'TD DISTANCE', value: distanceYd, unit: 'YD' } : null,
    scoreLine ? { label: 'SCORE NOW', value: scoreLine } : null,
    ev.quarter != null ? { label: 'QUARTER', value: periodWord(ev.quarter), unit: ev.clock || '' } : null,
    ev.seasonToDate ? { label: 'TD ENTERING TODAY', value: ev.seasonToDate.td } : null,
    ev.seasonToDate?.last3Games ? { label: `LAST ${ev.seasonToDate.last3Games} G`, value: ev.seasonToDate.last3Td, unit: 'TD' } : null,
  ].filter(Boolean).slice(0, 4)

  // The closing line: whichever of the three states this scorer is in, said once, in the account's own voice -- evidence, not a victory lap.
  const statement = ev.onBot
    ? `${onBotWord(ev.onBot).toUpperCase()}. IT LANDED.`
    : ev.tdBoard
      ? `#${ev.tdBoard.rank} OF ${ev.tdBoard.of} RATED.`
      : `${nflNickname(ev.team)} FIND THE END ZONE.`

  // The line under the statement carries what the tiles do NOT: his season shape and, when the board plate took the hero slot, the play itself.
  const context = [
    plate?.label === 'THE PLAY' ? '' : subhead,
    ev.seasonToDate
      ? (ev.seasonToDate.games ? `${ev.seasonToDate.td} TD IN ${ev.seasonToDate.games} G` : `${ev.seasonToDate.td} TD ENTERING TODAY`)
      : '',
    (ev.seasonToDate?.last3Games && !tiles.some((t) => t.label.startsWith('LAST ')))
      ? `${ev.seasonToDate.last3Td} IN THE LAST ${ev.seasonToDate.last3Games}` : '',
  ].filter(Boolean).join('  ·  ').toUpperCase()

  const called = Boolean(ev.onBot)
  const m = { ...club, name: String(headline || ''), face, tone: c1 }
  const colW = bodyW - PORTRAIT_W
  const tagColor = ev.defense?.tag === 'AVOID' ? C.red : ev.defense?.tag === 'TARGET' ? ACCENT : INK2
  const el = (
    <Poster accent={ACCENT} tone={c1} grain={grain} called={called} word={plate ? plate.label : 'TOUCHDOWN'} chips={ev.kindWord ? [String(ev.kindWord).toUpperCase()] : []} right="TOUCHDOWN" brand="TUDDY" footRight={`${prettyDay(String(ev?.day || ''))} · every touchdown, graded in public`}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={plate ? { value: plate.hero, caption: plate.caption, h: plate.caption.length > 17 ? 148 : 116 } : null} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: '12px 24px 12px 24px', gap: 8 }}>
        <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 6, color: ACCENT, whiteSpace: 'nowrap' }}>{`${nflNickname(ev.team)} TOUCHDOWN`}</span>
        <NameLine name={headline} size={92} maxW={colW - 70} h={76} />
        <MatchLine m={m} text={`${ev.team || ''}${ev.jersey ? ` #${ev.jersey}` : ''}`} extra={[roleTag(ev), ev.opponent ? `vs ${ev.opponent}` : '', subhead || ''].filter(Boolean).join(' · ')} />
        {tiles.length ? <TileRow>{tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} unit={t.unit} hot accent={ACCENT} big={52} />)}</TileRow> : null}
        {/* THE DEFENSE: the same TARGET / AVOID / EVEN tag Games.js / Matchups.js render pregame, applied after the fact to the defense he just scored on. */}
        {ev.defense ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '4px 16px', borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM }}>THE DEFENSE</span>
              <span style={{ fontSize: fs(24), fontWeight: 800, color: INK, whiteSpace: 'nowrap' }}>{ev.defense.detail}</span>
            </div>
            <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 800, letterSpacing: 2, color: tagColor, border: `2px solid ${alpha(tagColor, 0.55)}`, borderRadius: 999, padding: '1px 16px' }}>{ev.defense.tag}</span>
          </div>
        ) : null}
        <Banner accent={ACCENT} called={called} line={statement} h={58} maxW={colW - 140} />
        {context ? <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 700, letterSpacing: 1, color: DIM, lineHeight: 1.2 }}>{context}</span> : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'td' })
}
