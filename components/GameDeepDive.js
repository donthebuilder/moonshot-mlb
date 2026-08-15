'use client'
import { C, NUM_FONT } from '../lib/theme'
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

  const hot = hr9 != null && hr9 >= 1.4
  const bleeding = l3hr9 != null && hr9 != null && l3hr9 > hr9 + 0.2

  return (
    <div style={{
      flex: '1 1 340px', minWidth: 0, background: C.bg2,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '10px 13px',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 900, marginBottom: 5 }}>
        {team} bats
        {projected && (
          <span title="No probable announced — this is the bot's rotation projection (the arm whose turn it is), not an official listing"
            style={{ color: C.yellow, fontSize: 10, fontWeight: 700 }}> · projected starter</span>
        )}
      </div>

      {/* THE ARM, in clauses. Every number the seven Stat tiles carried is
          here, each one next to the thing that makes it a read. */}
      <p style={{ margin: '0 0 7px', fontSize: 12, lineHeight: 1.72, color: C.text2 }}>
        They face <b style={{ color: C.text }}>{name}</b>{throws ? ` (${throws}HP)` : ''}
        {hr9 != null && hr9 > 0 ? (
          <>
            , who has given up <b title="Home runs allowed per nine innings" style={{ color: hot ? '#f87171' : C.text2 }}>{hr9.toFixed(2)} home runs per nine</b>
            {' '}— {hot ? 'well over' : hr9 <= 1.0 ? 'under' : 'right around'} the {LEAGUE_HR9.toFixed(2)} league line
          </>
        ) : ', whose home-run rate has not published yet'}
        {l3hr9 != null && l3hr9 > 0 && (
          <>
            {bleeding
              ? <>, and his last three starts are worse still at <b style={{ color: C.orange }}>{l3hr9.toFixed(2)}</b></>
              : <>, with his last three at {l3hr9.toFixed(2)}</>}
          </>
        )}
        {trend && <> — the trend reads <b style={{ color: /worse|up|hot/i.test(trend) ? C.green : C.text3 }}>{trend.toLowerCase()}</b></>}
        .
        {(era != null || whip != null) && (
          <> Behind that{era != null ? <> a <b style={{ color: C.text2 }}>{era.toFixed(2)}</b> ERA</> : ''}
            {era != null && whip != null ? ' and' : ''}
            {whip != null ? <> a <b style={{ color: C.text2 }}>{whip.toFixed(2)}</b> WHIP</> : ''}.
          </>
        )}
        {k9 != null && k9 > 0 && (
          <> He strikes out <b style={{ color: k9 >= 9.5 ? '#f87171' : C.text2 }}>{k9.toFixed(1)} per nine</b>
            {k9 >= 9.5 ? ' — a strikeout arm, which is the hitter\'s enemy' : k9 <= 7 ? ' — he lets you put it in play' : ''}.
          </>
        )}
        {weakSide && sideWord(weakSide) && (
          <> He bleeds to <b style={{ color: C.yellow }}>{sideWord(weakSide)} bats</b>
            {wsScore ? <span title="How hard he bleeds to that side, 0-100"> ({wsScore.toFixed(0)})</span> : ''}.
          </>
        )}
        {xbbe >= 50 && xluck !== 0 && (
          <> He has allowed <b style={{ color: xluck < 0 ? C.orange : '#38bdf8' }}>{Math.abs(xluck).toFixed(1)} {xluck < 0 ? 'fewer' : 'more'}</b> homers than his contact deserved
            {xluck < 0 ? ', so regression is on the hitters\' side' : ', so he has been unlucky rather than hittable'}
            <span title="Actual HRs allowed minus expected-from-contact (calibrated xHR)">.</span>
          </>
        )}
      </p>

      {/* THE LINEUP, one clause — was the dashed footer's stat line. */}
      <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.65, color: C.text3 }}>
        This lineup averages <b title="Average HR-watch score across the side" style={{ color: avgHrw >= 55 ? C.orange : C.text2 }}>{avgHrw.toFixed(0)} HRW</b>
        {weakCount > 0
          ? <>, and <b style={{ color: C.yellow }}>{weakCount}</b> of them hit into a spot this arm has already been beaten in.</>
          : <>, with no hitter in a spot this arm has been beaten in.</>}
      </p>

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

export default function GameDeepDive({ game, allPlayers = [], slateDate = '', results, odds = null, onPlayerClick }) {
  const gp = game?.players || []
  if (!gp.length) return null
  const any = gp[0]
  const teams = [...new Set(gp.map((p) => clean(p?.team, '')).filter(Boolean))]

  return (
    <div style={{ marginBottom: 12 }}>
      {/* live cockpit — renders only while this game is actually in progress */}
      <GameCockpit game={game} onPlayerClick={onPlayerClick} />

      <AirLine any={any} venue={clean(any?.venue_name, 'Ballpark')} confirmed={!!game?.lineup_confirmed} />

      {/* both sides */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {teams.map((t) => (
          <SidePanel key={t} team={t} rows={gp.filter((p) => clean(p?.team, '') === t)} odds={odds} onPlayerClick={onPlayerClick} />
        ))}
      </div>

      {/* 🆚 career vs the starter, both sides (2026-08-14 — the competitor
          feature Donovan asked for: "team vs pitcher splits... needs to be
          accessible somewhere". Same table also lives in the pitcher
          modal's Lineup-he-faces tab; one component, two mounts.) */}
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

      {/* this game's storylines — the same engine the Scoreboard runs,
          scoped to one building: its duels, revenge games, B2B bats,
          milestones in reach, birthdays and giveaway night (2026-08-08) */}
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
    </div>
  )
}
