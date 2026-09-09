'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha, verdictInk } from '../lib/scales'
import { hr9Tone, hr9Title } from '../lib/hr9'
import { n, nn, clean, nameOf, hrScore } from '../lib/player'
import { airParts, airVerdict } from '../lib/conditions'
import { quoteFor, fmtOdds, CATEGORY_LINE } from '../lib/odds'
import { Dial } from './VerdictHero'
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

// LEAGUE_HR9 moved to lib/hr9.js (2026-09-03), along with the tone and the
// tooltip, so the fifteen hardcoded HR/9 thresholds across this codebase can
// start collapsing into one. Imported at the top of the file with the rest.
// The prose above still names 1.25 and lib/hr9.js still holds 1.25.

// ── The air ──────────────────────────────────────────────────────────────────

const toneColor = (t) => (t === 'hot' ? C.orange : t === 'cold' ? '#38bdf8' : C.text2)

// ── THE AIR, AS A LINE YOU CAN CLOSE (2026-08-23) ───────────────────────────
// Donovan: "put the weather park facts somewhere else so its not just just
// there." It was a two-line paragraph across the full width of the open game,
// above everything, on every game, every time — the park, the temperature, the
// wind, the park factor, the humidity, the rain chance, the roof and the
// lineup state, all as prose, whether or not any of it was interesting.
//
// It is a strip of chips now: the venue, then only the facts that HAVE a tone
// (the ones lib/conditions.js already decided were worth colouring), and a
// verdict word when the air is doing something. One line instead of four, and
// it collapses the day nothing is happening. The full sentence — every part,
// including the plain ones, with its tooltip — is one tap away on the chevron,
// so nothing was removed from the page, only from the default view.
function AirLine({ any, venue, confirmed }) {
  const [open, setOpen] = useState(false)
  const parts = airParts(any)
  const verdict = airVerdict(any)
  const loud = parts.filter((p) => p.tone && p.tone !== 'plain')
  const shown = open ? parts : loud
  const word = verdict === 'carrying' ? 'ball is carrying'
    : verdict === 'dead' ? 'dead air' : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      marginBottom: 9, minWidth: 0,
    }}>
      <span style={{ fontSize: 11.5, fontWeight: 900, color: C.text, whiteSpace: 'nowrap' }}>{venue}</span>
      {shown.map((p) => (
        <span key={p.key} title={p.title} style={{
          fontSize: 9.5, fontWeight: 700, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
          padding: '2px 7px', borderRadius: 999, cursor: 'default',
          color: p.tone && p.tone !== 'plain' ? toneColor(p.tone) : C.text2,
          border: `1px solid ${p.tone && p.tone !== 'plain' ? alpha(toneColor(p.tone), 0.4) : C.border}`,
          background: p.tone && p.tone !== 'plain' ? alpha(toneColor(p.tone), 0.08) : C.glass,
        }}>{p.text}</span>
      ))}
      {word && (
        <span style={{
          fontSize: 9.5, fontWeight: 900, letterSpacing: '.04em', whiteSpace: 'nowrap',
          color: verdict === 'carrying' ? C.orange : C.blue,
        }}>{word}</span>
      )}
      <span title={confirmed ? 'lineups confirmed' : 'lineups still projected'} style={{
        fontSize: 9.5, fontFamily: NUM_FONT, color: confirmed ? C.green : C.text3, whiteSpace: 'nowrap',
      }}>{confirmed ? '✓ lineups' : '◻ projected'}</span>
      {parts.length > loud.length && (
        <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
          title={open ? 'show only what stands out' : 'every condition, including the quiet ones'}
          style={{
            background: 'transparent', border: 'none', color: C.text3, cursor: 'pointer',
            fontSize: 10, fontWeight: 900, padding: '2px 4px', lineHeight: 1,
          }}>{open ? '▾' : `▸ ${parts.length - loud.length} more`}</button>
      )}
    </div>
  )
}

// ── The picks, with their price ──────────────────────────────────────────────

// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const PICK_META = () => ({
  TOP: { label: 'top play', bar: '1+ HR', color: '#FCD34D' },
  HR: { label: 'home run', bar: '1+ HR', color: C.orange },
  HIT: { label: 'base hit', bar: '1+ hit', color: C.purple },
  HRR: { label: 'H+R+RBI', bar: '2+ of hits / runs / RBI', color: C.cyan },
  CONTACT: { label: 'total bases', bar: '2+ bases', color: C.green },
})
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
  const meta = PICK_META()[role] || { label: role.toLowerCase(), bar: '', color: C.text3 }
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
// pitcher and recent tats plus hr luck plus or minus." Then, on the first
// attempt: "this does not look good the stacking is off … dont add lineup hrw,
// stat text is cool for those, just do era, recent whip, recent hr9, hr luck
// and hr/9 season. keep it clean. its all uneven."
//
// Both notes are the same note. Seven tiles plus two lineup tiles wrapped
// 5 + 1 + 2 on a phone — three ragged rows pretending to be a grid. FIVE, in a
// fixed five-column grid, always render (a missing one prints "—" rather than
// collapsing the row), so it is one even line at every width. The lineup
// numbers go back to being a sentence, which is what he said they should be.
//
// The five, in his order: ERA · WHIP L3 · HR/9 L3 · HR LUCK · HR/9 SZN. Two of
// them are the RECENT window (pitcher_l3_*) because that is what "recent" was
// asking for, and HR LUCK keeps its sign: −3.3 means three fewer homers than
// his contact deserved, so regression is on the hitters' side.
// ── THE COMMENT AND THE CODE DISAGREED (fixed 2026-09-03) ──────────────────
//
// The row above says, in its own comment: "A missing number prints '—' rather
// than dropping its tile, because a tile that disappears is what made the old
// row ragged." This function's first line then returned null on exactly that
// '—', and every caller passes '—' explicitly for a missing value. So the
// design was written down, the opposite was implemented, and the ragged row
// the comment was written to prevent is what shipped -- on any arm missing a
// last-3 line, an ERA or an xHR sample, which is most of them early in a week.
//
// The comment was right and the grid is a fixed five columns to make it right,
// so the code moved: a missing value renders as a dimmed placeholder tile and
// the line stays even. Only a genuinely absent prop (null/'') still drops.
function ArmStat({ label, value, tone, title }) {
  if (value == null || value === '') return null
  const missing = value === '—'
  const col = missing ? C.text3 : tone === 'hot' ? C.orange : tone === 'cold' ? C.blue : C.text
  return (
    <span title={missing ? `${label} — not published for this arm` : title} style={{
      minWidth: 0, textAlign: 'center', padding: '5px 4px', borderRadius: 9,
      border: `1px solid ${tone && !missing ? alpha(col, 0.4) : C.border}`,
      background: tone && !missing ? alpha(col, 0.07) : C.glass,
      opacity: missing ? 0.55 : 1,
      cursor: title ? 'inherit' : 'default',
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
  const l3whip = n(src('pitcher_l3_whip'), null)
  const l3n = n(src('pitcher_l3_starts_found'), 0)
  // ── THE COUNT AND THE HAND SPLIT (2026-09-03) ──────────────────────────
  // Donovan asked for these on the game page. The five tiles above are all
  // RATES, and a rate cannot answer "how many, and to whom" -- 1.44 HR/9
  // reads the same whether it is 26 homers over a season or 5 over four
  // starts, and it says nothing about the split that actually decides a
  // left-handed bat. Checked against the live payload: the two sides sum
  // exactly to the total on every arm on tonight's board.
  const hrTotal = n(src('pitcher_hr_allowed'), null)
  const hrL = n(src('pitcher_hr_vs_lhb'), null)
  const hrR = n(src('pitcher_hr_vs_rhb'), null)
  const hr9L = n(src('pitcher_hr9_vs_lhb'), null)
  const hr9R = n(src('pitcher_hr9_vs_rhb'), null)
  const attack = n(src('pitcher_attack_score'), null)
  const brl = n(src('pitcher_barrel_allowed'), null)
  const fb = n(src('pitcher_fb_rate'), null)
  // Warm = good for the BATS, the site-wide verdict pair. 30+ is the
  // "genuinely high" line MatchupPitcher.js already draws on this field; 12
  // and under is the bottom fifth of a slate's starters.
  const armInk = verdictInk(attack == null ? null : attack >= 30 ? true : attack <= 12 ? false : null)
  // ONE SENTENCE, then the numbers. This is the "words for the pitcher" ask,
  // and it lives HERE rather than in a second block above the panel pills —
  // that block said the same thing about the same two arms one screen higher,
  // which is most of why the area read as cluttered.
  const armWords = (() => {
    const bits = []
    if (hr9 != null && hr9 > 0) bits.push(`${hr9.toFixed(2)} HR/9`)
    if (brl != null) bits.push(`${(brl * 100).toFixed(0)}% barrels`)
    if (fb != null) bits.push(`${(fb * 100).toFixed(0)}% fly balls`)
    if (weakSide) bits.push(`weakest vs ${weakSide}`)
    if (!bits.length) return 'No season line published for this arm yet.'
    const lead = attack == null ? ''
      : attack >= 30 ? 'A live window for the bats — '
      : attack <= 12 ? 'A hard arm to attack — '
      : ''
    return `${lead}${bits.join(' · ')}.`
  })()
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

      {/* the dial and the one sentence */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 9, minWidth: 0 }}>
        <Dial value={attack} col={armInk.color} size={44} max={55}
          dp={attack != null && attack < 10 ? 1 : 0}
          title={`Attack score ${attack == null ? '—' : attack.toFixed(1)} — how much this arm gives the bats. The slate runs about 0–55 with a median near 18, so the ring is drawn against 55, not 100.`} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.text2, lineHeight: 1.5 }}>{armWords}</span>
      </div>

      {/* THE FIVE — fixed five columns, so it is one even line at every width.
          A missing number prints "—" rather than dropping its tile, because a
          tile that disappears is what made the old row ragged. */}
      <div style={{ display: 'grid', gap: 5, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', marginBottom: 8 }}>
        <ArmStat label="ERA" value={era != null ? era.toFixed(2) : '—'}
          tone={era == null ? null : era >= 5 ? 'hot' : era <= 3.2 ? 'cold' : null}
          title="Season earned-run average." />
        <ArmStat label={l3n > 0 ? `WHIP L${l3n}` : 'WHIP L3'} value={l3whip != null ? l3whip.toFixed(2) : '—'}
          tone={l3whip == null ? null : l3whip >= 1.4 ? 'hot' : l3whip <= 1.1 ? 'cold' : null}
          title="Walks + hits per inning over his last three starts — recent traffic. High traffic means more RBI chances for the bats. Three outings is a direction, not a rate." />
        {/* Same line as the season tile — L3 is this statistic over a shorter
            window, not a different statistic. `bleeding` stays as an extra way
            IN to hot: an arm under the league line whose last three are 0.2
            above his own season number is a live trend the line cannot see. */}
        <ArmStat label={l3n > 0 ? `HR/9 L${l3n}` : 'HR/9 L3'} value={l3hr9 != null && l3hr9 > 0 ? l3hr9.toFixed(2) : '—'}
          tone={bleeding ? 'hot' : hr9Tone(l3hr9)}
          title="Homers per nine over his last three starts. Above his season number means he is bleeding lately." />
        <ArmStat label="HR luck" value={xbbe >= 50 && xluck !== 0 ? `${xluck > 0 ? '+' : '−'}${Math.abs(xluck).toFixed(1)}` : '—'}
          tone={xbbe < 50 || xluck === 0 ? null : xluck < 0 ? 'hot' : 'cold'}
          title="Actual homers allowed minus expected-from-contact (calibrated xHR). NEGATIVE means fewer than his contact deserved — regression is on the hitters' side. Positive means he has been unlucky rather than hittable. Blank under 50 batted balls." />
        {/* The tooltip said "the league line is 1.25 — warm is over it" while
            the tone went warm at 1.40. Its own sentence and its own threshold
            disagreed. Both come from lib/hr9.js now. */}
        <ArmStat label="HR/9 szn" value={hr9 != null && hr9 > 0 ? hr9.toFixed(2) : '—'}
          tone={hr9Tone(hr9)}
          title={hr9Title(hr9)} />
      </div>

      {/* ── HOW MANY, AND TO WHOM ────────────────────────────────────────
          A sentence rather than two more tiles: the row above is a fixed five
          columns deliberately, so it reads as one even line at every width,
          and a seventh tile would break the thing that makes it work. This is
          the same "stat text is cool for those" idiom the lineup line below
          already uses. Warm on the side carrying two thirds or more of the
          damage, and only once there is enough of it to mean anything. */}
      {hrTotal != null && (
        <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 6 }}>
          <b style={{ color: C.text2 }}>{hrTotal}</b> HR allowed this season
          {hrL != null && hrR != null && (
            <>
              {' · '}
              <b style={{ color: hrTotal >= 6 && hrL / Math.max(hrTotal, 1) >= 0.66 ? C.orange : C.text2 }}>{hrL}</b> to LHB
              {hr9L != null && <span style={{ opacity: .75 }}> ({hr9L.toFixed(2)}/9)</span>}
              {', '}
              <b style={{ color: hrTotal >= 6 && hrR / Math.max(hrTotal, 1) >= 0.66 ? C.orange : C.text2 }}>{hrR}</b> to RHB
              {hr9R != null && <span style={{ opacity: .75 }}> ({hr9R.toFixed(2)}/9)</span>}
            </>
          )}
        </div>
      )}

      {/* the lineup stays a sentence — "stat text is cool for those" */}
      <div style={{ fontSize: 10.5, color: C.text3, fontFamily: NUM_FONT, marginBottom: 9 }}>
        lineup avg HRW <b style={{ color: avgHrw >= 55 ? C.orange : C.text2 }}>{avgHrw.toFixed(0)}</b>
        {' · '}<b style={{ color: weakCount ? C.yellow : C.text3 }}>{weakCount}</b> weak spot{weakCount === 1 ? '' : 's'}
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
