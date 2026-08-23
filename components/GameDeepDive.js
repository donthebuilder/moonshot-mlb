'use client'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { n, nn, clean, nameOf, hrScore } from '../lib/player'
import { airParts, airVerdict } from '../lib/conditions'
import { quoteFor, fmtOdds, CATEGORY_LINE } from '../lib/odds'
import GameCockpit from './GameCockpit'
import Storylines from './Storylines'
import TeamVsStarter from './TeamVsStarter'

// GAME DEEP DIVE — what clicking a game actually earns you (2026-08-06).
//
// The strip chip used to just scroll; the selected game looked identical to
// every other section. Now the clicked game opens with an intelligence
// header: tonight's air, both pitching matchups in full (season + L3 trend +
// weak side + calibrated HR luck when the xHR fields carry), and each
// lineup's threat profile — all from slate fields already on the rows,
// assembled per game instead of scattered across four tabs.
//
// ── 2026-08-15 — THE HEADER, SAID OUT LOUD ──────────────────────────────────
//
// Donovan screenshotted this strip, which under his standing rule means he
// dislikes it, and when asked which part he said he wasn't sure. So it was
// rebuilt in the one direction every other call he has made points: TILES
// LOSE TO SENTENCES. That rule has now been earned four separate times (the
// ROI tiles, the Cold Case tiles, the park chips, and "i dont like the tile
// style id rather text just like the storylines section").
//
// What that meant here, concretely:
//
//   1. The conditions ribbon was nine free-floating chips — venue, temp,
//      wind, park ×, humidity, rain, roof, lineup state. It is now one
//      sentence out of lib/conditions.js, which four other surfaces can also
//      use. Every fact survives; the tooltips moved onto the words.
//   2. Each arm was a row of up to seven micro Stat blocks (HR/9, L3 HR/9,
//      ERA, WHIP, K/9, Weak vs, HR luck) — seven labels, seven numbers, in
//      7.5px caps. It is now a read: the same seven numbers inside clauses
//      that say what they mean, with the comparison baked in ("1.65 per nine,
//      well over the 1.25 league line") instead of left to the reader.
//   3. The three-pick chip row was the top three by hr_score with a bare
//      number — which is not what he bets. It is now the game's DESIGNATED
//      picks, each carrying its own market, its bar, and the book's price for
//      exactly that bar now that odds are live. Undesignated games fall back
//      to the top scores, and say so, rather than implying a call the bot
//      never made.
//
// NOTHING WAS REMOVED. The lineup HRW average and weak-spot count that used
// to sit in the dashed footer are in the read; the projected-pitcher caveat,
// the trend direction and the HR-luck regression note all still print.
//
// ── 2026-08-15 — `section`, SO THE GAME CARD CAN SWITCH INSTEAD OF SCROLL ───
//
// Donovan on the expanded game: "i keep having to scroll up to scroll back
// down." Opening a game rendered this whole component, then the full lineup
// table, then the pick cards — one column about four screens tall, and the
// only way from the arms to the head-to-head splits was your thumb.
//
// Games.js now puts a segmented control at the top of the open card and asks
// for one section at a time. That is all this prop does:
//
//   'all'  every block, in the original order — the DEFAULT, so any other
//          mount of this component (and every old deep link) is unchanged
//   'read' the live cockpit, the air, both arms as a read, the storylines
//   'h2h'  the career-vs-this-starter tables for both sides
//
// Splitting rather than deleting is deliberate: the sections still exist, they
// are just no longer stacked on top of each other by force.

const LEAGUE_HR9 = 1.25   // same reference ProjectedOutput's armOf() uses

// ── The air ──────────────────────────────────────────────────────────────────

const toneColor = (t) => (t === 'hot' ? C.orange : t === 'cold' ? '#38bdf8' : C.text2)

function AirLine({ any, venue, confirmed }) {
  const parts = airParts(any)
  const verdict = airVerdict(any)
  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 13px', marginBottom: 8,
      fontSize: 12, lineHeight: 1.7, color: C.text2, maxWidth: 900,
    }}>
      <b style={{ color: C.text, fontSize: 12.5 }}>{venue}</b>
      {parts.length > 0 && (
        <>
          {' — '}
          {parts.map((p, i) => (
            <span key={p.key}>
              {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
              <span title={p.title} style={{ color: toneColor(p.tone), fontWeight: p.tone === 'plain' ? 400 : 700 }}>{p.text}</span>
            </span>
          ))}
          .
        </>
      )}
      {verdict === 'carrying' && <span style={{ color: C.orange }}> The ball is carrying here tonight.</span>}
      {verdict === 'dead' && <span style={{ color: '#38bdf8' }}> This is dead air.</span>}
      <span style={{ color: C.text3 }}>
        {confirmed ? ' Lineups are confirmed.' : ' Lineups are still projected.'}
      </span>
    </div>
  )
}

// ── The picks, with their price ──────────────────────────────────────────────

const PICK_META = {
  TOP: { label: 'top play', bar: '1+ HR', color: '#FCD34D' },
  HR: { label: 'home run', bar: '1+ HR', color: C.orange },
  HIT: { label: 'base hit', bar: '1+ hit', color: C.purple },
  HRR: { label: 'H+R+RBI', bar: '2+ of hits / runs / RBI', color: C.cyan },
  CONTACT: { label: 'total bases', bar: '2+ bases', color: C.green },
}
const rolesOf = (p) => String(p?.game_pick_role || '').split('/').map((s) => s.trim().toUpperCase()).filter(Boolean)

// COHERENCE: a pick wears ITS OWN market's score. The old chip row printed
// hr_score beside every name, which meant the HIT pick was labelled with his
// home-run number — Kevin McGonigle read "15" next to a base-hit call while
// his hit_score was 63. Same rule the modal chips, the slip label and The
// Read already follow. Mirrors CAT_SCORE in tabs/Games.js.
const SCORE_OF = {
  TOP: (p) => n(p?.top_board_score_v2, n(p?.overall_score, n(p?.hr_score, 0))),
  HR: (p) => n(p?.hr_score, 0),
  HIT: (p) => n(p?.hit_score, 0),
  HRR: (p) => n(p?.hrr_score, 0),
  CONTACT: (p) => n(p?.contact_score, 0),
}
const scoreFor = (p, role) => (SCORE_OF[role] || SCORE_OF.HR)(p)

// "RHB" already means right-handed batter, so "RHB-handed bats" said it twice.
const sideWord = (s) => {
  const v = String(s || '').trim().toUpperCase()
  if (v.startsWith('R')) return 'right-handed'
  if (v.startsWith('L')) return 'left-handed'
  if (v.startsWith('S') || v.startsWith('B')) return 'switch'
  return ''
}

function PickCard({ p, role, alsoRoles = [], odds, onPlayerClick }) {
  const meta = PICK_META[role] || { label: role.toLowerCase(), bar: '', color: C.text3 }
  // Only a quote asking for the same thing the bar asks for. quoteFor already
  // enforces that (matches); a mismatched line here would be quoting a
  // different bet beside this pick's name.
  const q = quoteFor(odds, p, role)
  const priced = q && q.matches !== false && q.over != null
  return (
    <button
      onClick={() => onPlayerClick?.(p)}
      style={{
        flex: '1 1 210px', minWidth: 0, textAlign: 'left', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 2,
        background: `linear-gradient(160deg, ${meta.color}14, transparent 70%)`,
        border: `1px solid ${meta.color}44`, borderRadius: 9, padding: '7px 10px',
      }}
    >
      <div style={{ fontSize: 8, fontFamily: NUM_FONT, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase', color: meta.color }}>
        {meta.label}{meta.bar ? ` · ${meta.bar}` : ''}
        {/* A dual-slotted player keeps his other tags (2026-08-12: TOP is
            allowed to also hold HR). The card is priced and scored on the
            primary market — the others are stated, not silently dropped. */}
        {alsoRoles.length > 0 && (
          <span style={{ color: C.text3 }} title="He is also designated in these categories"> · also {alsoRoles.join('/')}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(p)}</span>
        {p?.weak_spot_flag && <span title="He is hitting into a spot this arm has been beaten in" style={{ fontSize: 10 }}>⭐</span>}
      </div>
      <div style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text3 }}>
        <span title={`His ${meta.label} score — this pick's own market, not his HR number`}>score <b style={{ color: C.text2 }}>{scoreFor(p, role).toFixed(0)}</b></span>
        {priced
          ? <> · book <b style={{ color: C.text2 }}>{fmtOdds(q.over)}</b> on {Number(q.line).toFixed(1)}+</>
          : <> · <span title="No book price matching this pick's bar is published yet">no price yet</span></>}
      </div>
    </button>
  )
}

// ── THE ARM, AS STATS (2026-08-23) ──────────────────────────────────────────
// Donovan, on the "STL bats / PHI bats" paragraphs: "the area with the words
// make them just stats please look into older style wherer it showed the
// pitcher and recent tats plus hr luck plus or minus."
//
// The prose version (2026-08-15) took the seven tiles this panel used to carry
// and dissolved them into a sentence, on the theory that a number next to the
// thing that makes it a read is worth more than a number in a box. On a phone
// it is four wrapped lines you have to READ to find 0.72, and the whole point
// of this panel is that you are scanning two arms side by side and comparing
// them. Prose cannot be compared at a glance; a column of tiles can.
//
// So the tiles come back — the same seven, the same tooltips, the same
// thresholds, including HR LUCK signed (−3.3 = three fewer homers than his
// contact deserved, so regression is on the hitters' side). They come back in
// the CURRENT tile language rather than the 2026-08-06 one: rounded, tinted
// by meaning, and a grid so they wrap into even rows on a narrow screen
// instead of a ragged flex line.
function ArmStat({ label, value, tone, title }) {
  if (value == null || value === '' || value === '—') return null
  const col = tone === 'hot' ? C.orange : tone === 'cold' ? C.blue : C.text
  return (
    <span title={title} style={{
      minWidth: 0, textAlign: 'center', padding: '5px 4px', borderRadius: 9,
      border: `1px solid ${tone ? alpha(col, 0.4) : C.border}`,
      background: tone ? alpha(col, 0.07) : C.glass,
      cursor: title ? 'help' : 'default',
    }}>
      <span style={{
        display: 'block', fontSize: 7.5, fontWeight: 800, letterSpacing: '.08em',
        textTransform: 'uppercase', color: C.text3, fontFamily: NUM_FONT,
      }}>{label}</span>
      <span style={{
        display: 'block', fontSize: 12.5, fontWeight: 900, fontFamily: NUM_FONT, color: col,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</span>
    </span>
  )
}

// ── One side: the arm, then the bats, as a read ──────────────────────────────

function SidePanel({ team, rows, odds, onPlayerClick }) {
  // These rows are the hitters ON this team; their pitcher_* fields describe
  // the OPPOSING starter they face.
  const src = (k) => {
    for (const p of rows) { const v = p?.[k]; if (v !== null && v !== undefined && v !== '') return v }
    return null
  }
  const name = clean(src('pitcher_name'), 'a TBD arm')
  const throws = clean(src('pitcher_throws'), '')
  const hr9 = n(src('pitcher_hr9'), null)
  const l3hr9 = n(src('pitcher_l3_hr9'), null)
  const era = n(src('pitcher_era'), null)
  const whip = n(src('pitcher_whip'), null)
  const k9 = n(src('pitcher_k9'), null)
  const weakSide = clean(src('pitcher_weak_side'), '')
  const wsScore = n(src('pitcher_weak_side_score'), 0)
  const trend = clean(src('pitcher_trend_direction'), '')
  const xluck = n(src('pitcher_hr_luck'), 0)
  const xbbe = n(src('pitcher_xhr_bbe'), 0)
  const projected = rows.some((r) => r?.pitcher_projected)

  const weakCount = rows.filter((p) => p?.weak_spot_flag).length
  const avgHrw = rows.length ? rows.reduce((a, p) => a + nn(p?.hrw_score), 0) / rows.length : 0

  // The designated picks on this side, in the bot's own category order —
  // what he actually bets, rather than the three highest hr_scores.
  const ORDER = ['TOP', 'HR', 'HRR', 'HIT', 'CONTACT']
  const designated = []
  const seen = new Set()
  ORDER.forEach((role) => {
    rows.filter((p) => rolesOf(p).includes(role))
      .sort((a, b) => scoreFor(b, role) - scoreFor(a, role))
      .forEach((p) => {
        const id = p?.player_id ?? nameOf(p)
        if (seen.has(id)) return
        seen.add(id)
        designated.push({ p, role, alsoRoles: rolesOf(p).filter((r) => r !== role) })
      })
  })
  const picks = designated.slice(0, 3)
  const fallback = picks.length === 0
    ? [...rows].sort((a, b) => hrScore(b) - hrScore(a)).slice(0, 2)
    : []

  // `hot` went with the prose — the HR/9 tile states its own threshold now.
  const bleeding = l3hr9 != null && hr9 != null && l3hr9 > hr9 + 0.2

  return (
    <div style={{
      flex: '1 1 340px', minWidth: 0, background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 13px',
    }}>
      {/* header: whose bats, which arm, and which way he is trending */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 900 }}>{team} bats</span>
        <span style={{ fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, minWidth: 0 }}>
          vs {name}{throws ? ` (${throws}HP)` : ''}
          {projected && (
            <span title="No probable announced — this is the bot's rotation projection (the arm whose turn it is), not an official listing"
              style={{ color: C.yellow }}> ≈ projected</span>
          )}
        </span>
        {trend && (
          <span title="The starter's recent direction, from his last-three vs season gap"
            style={{ fontSize: 9, fontWeight: 800, fontFamily: NUM_FONT, color: /improv|better|down/i.test(trend) ? C.blue : /worse|up|hot|bleed/i.test(trend) ? C.orange : C.text3 }}>
            {trend.toLowerCase()}
          </span>
        )}
      </div>

      {/* THE SEVEN — scannable, comparable side by side, and each one still
          carries the sentence it used to be, in its tooltip. */}
      <div style={{
        display: 'grid', gap: 6, marginBottom: 8,
        gridTemplateColumns: 'repeat(auto-fit, minmax(56px, 1fr))',
      }}>
        <ArmStat label="HR/9" value={hr9 != null && hr9 > 0 ? hr9.toFixed(2) : null}
          tone={hr9 == null ? null : hr9 >= 1.4 ? 'hot' : hr9 <= 1.0 ? 'cold' : null}
          title={`Home runs allowed per nine innings. The league line is ${LEAGUE_HR9.toFixed(2)} — warm is over it, and over it is good for the bats.`} />
        <ArmStat label="L3 HR/9" value={l3hr9 != null && l3hr9 > 0 ? l3hr9.toFixed(2) : null}
          tone={bleeding ? 'hot' : null}
          title="His last three starts. Above his season number means he is bleeding lately — three outings is a direction, not a rate." />
        <ArmStat label="ERA" value={era != null ? era.toFixed(2) : null}
          tone={era == null ? null : era >= 5 ? 'hot' : era <= 3.2 ? 'cold' : null}
          title="Season earned-run average." />
        <ArmStat label="WHIP" value={whip != null ? whip.toFixed(2) : null}
          tone={whip == null ? null : whip >= 1.4 ? 'hot' : whip <= 1.1 ? 'cold' : null}
          title="Walks + hits per inning — traffic. High traffic means more RBI chances for the bats." />
        <ArmStat label="K/9" value={k9 != null && k9 > 0 ? k9.toFixed(1) : null}
          tone={k9 == null ? null : k9 <= 7 ? 'hot' : k9 >= 9.5 ? 'cold' : null}
          title="Strikeouts per nine. LOW is good for the bats — more balls in play. High is his strength and the hitter's enemy." />
        {weakSide && (
          <ArmStat label="Weak vs" value={`${weakSide}${wsScore ? ` ${wsScore.toFixed(0)}` : ''}`} tone="hot"
            title="The batter side this arm bleeds against, and how hard (0-100)." />
        )}
        {xbbe >= 50 && xluck !== 0 && (
          <ArmStat label="HR luck" value={`${xluck > 0 ? '+' : '−'}${Math.abs(xluck).toFixed(1)}`}
            tone={xluck < 0 ? 'hot' : 'cold'}
            title="Actual homers allowed minus expected-from-contact (calibrated xHR). NEGATIVE means fewer than his contact deserved — regression is on the hitters' side. Positive means he has been unlucky rather than hittable." />
        )}
      </div>

      {/* the lineup, as its own two numbers */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
        <ArmStat label="Lineup HRW" value={avgHrw.toFixed(0)} tone={avgHrw >= 55 ? 'hot' : null}
          title="Average HR-watch score across this side." />
        <ArmStat label="Weak spots" value={String(weakCount)} tone={weakCount ? 'hot' : null}
          title="How many of these hitters bat in a lineup spot this arm has already been beaten in." />
      </div>

      {picks.length > 0 ? (
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {picks.map(({ p, role, alsoRoles }) => (
            <PickCard key={p?.player_id || nameOf(p)} p={p} role={role} alsoRoles={alsoRoles} odds={odds} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 10, color: C.text3, marginBottom: 5 }}>
            The bot designated nobody on this side. Its two best scores:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {fallback.map((p) => (
              <button key={p?.player_id || nameOf(p)} onClick={() => onPlayerClick?.(p)} style={{
                display: 'flex', gap: 6, alignItems: 'baseline', cursor: 'pointer',
                border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 9px', background: 'transparent',
              }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{nameOf(p)}</span>
                <span style={{ fontSize: 10, fontFamily: NUM_FONT, fontWeight: 800, color: C.text3 }}>{hrScore(p).toFixed(0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GameDeepDive({ game, allPlayers = [], slateDate = '', results, odds = null, onPlayerClick, section = 'all' }) {
  const gp = game?.players || []
  if (!gp.length) return null
  const any = gp[0]
  const teams = [...new Set(gp.map((p) => clean(p?.team, '')).filter(Boolean))]
  // 'all' is the default and means every block — an unknown value degrades to
  // showing everything rather than to showing nothing, which is the safe
  // direction for a component eighty per cent of whose job is not losing facts.
  const show = (k) => section === 'all' || section === k

  return (
    <div style={{ marginBottom: 12 }}>
      {show('read') && (<>
      {/* live cockpit — renders only while this game is actually in progress */}
      <GameCockpit game={game} onPlayerClick={onPlayerClick} />

      <AirLine any={any} venue={clean(any?.venue_name, 'Ballpark')} confirmed={!!game?.lineup_confirmed} />

      {/* both sides */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {teams.map((t) => (
          <SidePanel key={t} team={t} rows={gp.filter((p) => clean(p?.team, '') === t)} odds={odds} onPlayerClick={onPlayerClick} />
        ))}
      </div>
      </>)}

      {/* 🆚 career vs the starter, both sides (2026-08-14 — the competitor
          feature Donovan asked for: "team vs pitcher splits... needs to be
          accessible somewhere". Same table also lives in the pitcher
          modal's Lineup-he-faces tab; one component, two mounts.) */}
      {show('h2h') && (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {teams.map((t) => {
          const rows = gp.filter((p) => clean(p?.team, '') === t)
          const first = rows[0] || {}
          return (
            <div key={`vs-${t}`} style={{ flex: '1 1 330px', minWidth: 0 }}>
              <TeamVsStarter
                players={rows}
                team={t}
                pitcherName={clean(first?.pitcher_name, '')}
                pitcherThrows={clean(first?.pitcher_throws, '')}
                onPlayerClick={onPlayerClick}
                compact
              />
            </div>
          )
        })}
      </div>
      )}

      {/* this game's storylines — the same engine the Scoreboard runs,
          scoped to one building: its duels, revenge games, B2B bats,
          milestones in reach, birthdays and giveaway night (2026-08-08).
          Rides with 'read': it is narrative about this game, and it is the
          part you want under the arms rather than on a pill of its own. */}
      {show('read') && (
      <div style={{ marginTop: 8 }}>
        <Storylines
          players={gp}
          fetchPlayers={allPlayers.length ? allPlayers : gp}
          gamePk={game?.game_pk}
          compact
          slateDate={slateDate}
          results={results}
          onPlayerClick={onPlayerClick}
        />
      </div>
      )}
    </div>
  )
}
