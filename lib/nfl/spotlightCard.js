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
import { nflTones } from './teamColors'
import { SPORT_ACCENT } from '../sportAccent'
import {
  Poster, Portrait, NameLine, MatchLine, Tile, TileRow, Banner, assets, renderPoster, clubOf, nflFace, prettyDay, bodyH, bodyW,
  alpha, fs, INK, DIM,
} from '../cards/posterKit'

const ACCENT = SPORT_ACCENT.nfl
const PORTRAIT_W = 236
const one = (v) => (v == null ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1))

/**
 * `pick` is a lib/nfl/tweetFeed.js spotlightPick() result. `windowLabel` and `statement` are the same strings the tweet uses, so the
 * poster and the post can never disagree about which week this is or what it claims. Returns an ImageResponse (PNG body).
 */
export async function spotlightCard(pick, { site = 'dashnetwork.vercel.app', windowLabel = '', statement = '', context = '' } = {}) {
  const [{ grain }, club, face] = await Promise.all([assets(), clubOf('nfl', pick?.team), nflFace(pick?.player_id)])
  const [c1] = nflTones(pick?.team)
  const td = (pick?.patd || 0) + (pick?.rutd || 0) + (pick?.rectd || 0)
  const label = String(windowLabel || 'SPOTLIGHT').toUpperCase()

  // The supporting numerals. TOTAL TD is deliberately NOT here -- it is the hero on the portrait plate.
  const tiles = [
    pick?.payd > 0 ? { label: 'PASS YDS', value: pick.payd } : null,
    pick?.patd > 0 ? { label: 'PASS TD', value: pick.patd } : null,
    pick?.ruyd > 0 ? { label: 'RUSH YDS', value: pick.ruyd } : null,
    pick?.rec > 0 ? { label: 'REC', value: pick.rec } : null,
    pick?.recyd > 0 ? { label: 'REC YDS', value: pick.recyd } : null,
  ].filter(Boolean).slice(0, 5)

  // THIS WEEK vs HIS OWN AVERAGE. Per-game season rates off the slate row's `stats` block -- the same one RED ZONE TARGETS reads.
  // Only rows where both halves are real; a row blank on either side says nothing.
  const a = pick?.avg || {}
  const cmp = [
    a.td != null ? { label: 'TD', avg: one(a.td), now: String(td) } : null,
    a.xtd != null ? { label: 'EXPECTED TD', avg: one(a.xtd), now: String(td) } : null,
    pick?.payd > 0 && a.payd != null ? { label: 'PASS YDS', avg: one(a.payd), now: String(pick.payd) } : null,
    pick?.ruyd > 0 && a.ruyd != null ? { label: 'RUSH YDS', avg: one(a.ruyd), now: String(pick.ruyd) } : null,
    pick?.recyd > 0 && a.rz != null ? { label: 'RZ TOUCHES', avg: one(a.rz), now: '—' } : null,
  ].filter(Boolean).slice(0, 4).map((r) => ({ ...r, up: Number(r.now) >= Number(r.avg) }))

  const name = String(pick?.name || '')
  const m = { ...club, name, face, tone: c1 }
  const colW = bodyW - PORTRAIT_W
  const info = [pick?.position, pick?.opp ? `vs ${pick.opp}` : '', pick?.seasonTd != null ? `${pick.seasonTd} TD ON THE YEAR` : ''].filter(Boolean).join(' · ')
  const claim = String(statement || '').toUpperCase()
  const el = (
    <Poster accent={ACCENT} tone={c1} grain={grain} word="THE BIGGEST NIGHT" chips={[label]} right="PLAYER SPOTLIGHT" brand="TUDDY" footRight={prettyDay(String(pick?.day || ''))}>
      <Portrait m={m} w={PORTRAIT_W} h={bodyH()} accent={ACCENT} plate={{ word: 'TOTAL TD', value: String(td) }} />
      <div style={{ display: 'flex', flexDirection: 'column', width: colW, padding: '12px 24px 12px 24px', gap: 8 }}>
        <NameLine name={name} size={92} maxW={colW - 70} h={80} />
        <MatchLine m={m} text={`${pick?.team || ''}${pick?.jersey ? ` #${pick.jersey}` : ''}`} extra={info} />
        {tiles.length ? <TileRow>{tiles.map((t) => <Tile key={t.label} label={t.label} value={t.value} hot accent={ACCENT} big={52} />)}</TileRow> : null}
        {cmp.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, border: `2px solid ${alpha(INK, 0.14)}`, background: alpha(INK, 0.04) }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '4px 16px', borderBottom: `2px solid ${alpha(INK, 0.14)}` }}>
              <span style={{ fontSize: fs(22), fontWeight: 800, letterSpacing: 3, color: DIM, whiteSpace: 'nowrap' }}>{`${label} vs HIS AVERAGE`}</span>
              <span style={{ marginLeft: 'auto', fontSize: fs(22), fontWeight: 700, color: DIM, whiteSpace: 'nowrap' }}>PER GAME</span>
            </div>
            <div style={{ display: 'flex', padding: '6px 0' }}>
              {cmp.map((r) => (
                <div key={r.label} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, flexBasis: 0, padding: '0 16px', borderLeft: `2px solid ${alpha(INK, 0.1)}` }}>
                  <span style={{ fontSize: fs(22), fontWeight: 800, color: DIM, whiteSpace: 'nowrap' }}>{r.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: fs(24), fontWeight: 700, color: DIM }}>{r.avg}</span>
                    <span style={{ fontSize: fs(22), fontWeight: 800, color: r.up ? ACCENT : DIM }}>{r.up ? '▲' : '▼'}</span>
                    <span style={{ fontSize: fs(28), fontWeight: 800, color: INK }}>{r.now}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {claim ? <Banner accent={ACCENT} called={false} line={claim} h={58} maxW={colW - 140} /> : null}
        {context ? <span style={{ display: 'flex', fontSize: fs(22), fontWeight: 700, letterSpacing: 1, color: DIM, lineHeight: 1.2 }}>{context}</span> : null}
      </div>
    </Poster>
  )
  return renderPoster(el, { poster: 'spotlight' })
}
