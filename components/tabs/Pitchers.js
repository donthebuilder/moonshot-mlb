'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { FilterPill, FilterLabel, FilterSelect } from '../Filters'
import { STATE, alpha } from '../../lib/scales'

// NOTE (2026-08-23): the accent tint is computed AT RENDER, never hoisted —
// applyTheme() mutates C in place after hydration, so a module-scope
// computed colour freezes the pre-hydration theme (the earned trap in the
// handoff doc).
import { penStatsFor, fetchPenFatigue, penTier, penFrom, penLineParts, penWorkParts, penWorkSentence } from '../../lib/bullpen'
import { teamAbbrs } from '../../lib/gamelogs'
import { groupPitchers } from '../../lib/data'
import { n, clean, surname } from '../../lib/player'
import { pitcherOverall } from '../../lib/scoring_additions'
import { PanelTitle, Empty, Chip, btnStyle, Band } from '../ui'
import { rankArms, armFormParts, armFormSentence, hrLuckPointers } from '../../lib/armLeak'
import { Dial } from '../VerdictHero'
import { verdictInk } from '../../lib/scales'
import { airParts, airSentence, airVerdict } from '../../lib/conditions'
import DenseTable from '../DenseTable'
import PitcherSpots from '../PitcherSpots'
import PitcherProfile from '../PitcherProfile'
import PitcherModal from '../PitcherModal'

// Rates arrive as 0–1 fractions; show them as percentages so a 0.38 fly-ball
// rate reads as 38.0 next to the ERA and WHIP columns instead of as 0.
const PCT = (v) => {
  const x = Number(v)
  return Number.isFinite(x) ? (x * 100).toFixed(1) : '—'
}

// MISSING IS NOT ZERO (2026-08-15). n(v, null) does not do what the columns
// above it look like they assume: Number(null) is 0 and 0 is finite, so a
// field that never published comes back as a measured 0.00 and DenseTable
// draws it as one. The columns added today route through this instead, which
// yields `undefined` — DenseTable prints that as an em dash, sinks it in every
// sort and leaves it out of the column's heat range. The older columns keep
// their existing behaviour deliberately; changing them would move heat ranges
// and sort order on a table people already read, and it is a separate fix.
const numOrGap = (v) => {
  if (v === null || v === undefined || v === '') return undefined
  const x = Number(v)
  return Number.isFinite(x) ? x : undefined
}
const textOrGap = (v) => {
  const s = String(v ?? '').trim()
  return s || undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// THREE THINGS THIS PAGE NEVER SAID (2026-08-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// Donovan: "pitcehrs breakdown page just needs to be better fill like more
// things can be now wiether about the bull pen piutcher or whats been going on
// for the pitcher or the invriment."
//
// Three named gaps, and all three were gaps of OMISSION rather than of data —
// every field below was already on 266 of 266 slate rows and simply never
// drawn on this page:
//
//   the pen         bullpen_era / _whip / _hr9 / _quality / _attack_score /
//                   _pitch_fit. The board was one bar (StatsAPI reliever HR/9)
//                   and a fatigue tag; six published pen fields sat unused.
//   what's going on pitcher_l3_* against the season line, the bot's own
//                   trend direction WITH its published reason, velocity
//                   against his own baseline, HR luck. One 58px "Trend"
//                   column carried all of that, abbreviated to one word.
//   the environment park_hr_factor, roof, weather_*. A page about arms that
//                   never mentioned the building or the air they throw in,
//                   while the hitter boards read exactly those fields.
//
// HOW IT IS SAID. Clauses, not tiles — every one of the three reads hands back
// the same { key, text, tone, title } shape (lib/armLeak armFormParts,
// lib/bullpen penLineParts/penWorkParts, lib/conditions airParts) and the
// Clauses renderer below strings them into one sentence with the numbers
// inside it. The air specifically goes through lib/conditions rather than a
// fifth private copy of the temp/wind/park chip logic, which is the exact
// duplication that file was created to end.

const toneColor = (t) => (t === 'hot' ? C.orange : t === 'cold' ? C.blue : C.text2)

/**
 * One voice for every clause list on this page. `lead` is the bold stub that
 * names what is being said ("Lately: ", "Behind him: "), each clause keeps its
 * own tooltip, and tone colours from the HITTER's side — ember means the
 * clause is good news for the bat.
 */
function Clauses({ lead, parts, size = 9.5, color, style, tail = null }) {
  if (!parts?.length) return null
  return (
    <div style={{ fontSize: size, lineHeight: 1.6, color: color || C.text3, ...style }}>
      {lead && <b style={{ color: C.text2 }}>{lead}</b>}
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && (i === parts.length - 1 ? ' and ' : ', ')}
          <span title={p.title} style={{
            color: toneColor(p.tone), fontWeight: p.tone === 'plain' ? 400 : 700, cursor: 'help',
          }}>{p.text}</span>
        </span>
      ))}
      .{tail}
    </div>
  )
}

/**
 * THE ENVIRONMENT, for one game.
 *
 * The whole point is that this goes through lib/conditions.js — temp, wind,
 * park factor, humidity, rain and roof were already written there once and
 * copied four times before that file existed, and this page is not going to be
 * the fifth copy. The only clause added on top is weather_hr_effect_pct, which
 * airParts does not carry: it is the bot's own published summary of what
 * tonight's air does to home runs here, and it is a percent effect on a rate,
 * not a chance of anything.
 */
function AirLine({ row, venue, lead, size = 9.5, style }) {
  if (!row) return null
  const parts = airParts(row)
  const hrEff = n(row.weather_hr_effect_pct, null)
  const all = [
    ...parts,
    ...(hrEff != null && hrEff !== 0 ? [{
      key: 'wxhr',
      text: `the bot puts the air at ${hrEff > 0 ? '+' : ''}${hrEff}% on home runs`,
      tone: hrEff > 0 ? 'hot' : 'cold',
      title: 'weather_hr_effect_pct — the bot\'s published summary of tonight\'s conditions as a percentage swing on home runs at this park. A published field, not derived here.',
    }] : []),
  ]
  if (!all.length) return null
  const verdict = airVerdict(row)
  return (
    <Clauses
      lead={lead ?? (venue ? `${venue}: ` : 'The air: ')}
      parts={all}
      size={size}
      style={style}
      tail={verdict === 'carrying'
        ? <span style={{ color: C.orange, fontWeight: 700 }}> The ball is carrying here tonight.</span>
        : verdict === 'dead'
          ? <span style={{ color: C.blue, fontWeight: 700 }}> This is dead air.</span>
          : null}
    />
  )
}

// A grouped starter carries his whole opposing lineup, and every hitter in it
// was stamped with the same pitcher_*, bullpen_* and park/weather fields — so
// any one of those rows is the starter's slate row. Same shortcut the Overall
// column already takes with pitcherOverall(p.lineup?.[0]?.raw).
const rawOf = (p) => p?.lineup?.[0]?.raw || null

const SORTS = [
  ['weak', 'Most Weak Spots'],
  ['hr9', 'Highest HR/9'],
  ['whip', 'Highest WHIP'],
  ['time', 'Game Time'],
]

function sortPitchers(pitchers, sortKey) {
  const list = [...pitchers]
  if (sortKey === 'weak') return list.sort((a, b) => b.weak_spot_count - a.weak_spot_count)
  if (sortKey === 'hr9') return list.sort((a, b) => (b.pitcher_hr9 ?? -1) - (a.pitcher_hr9 ?? -1))
  if (sortKey === 'whip') return list.sort((a, b) => (b.pitcher_whip ?? -1) - (a.pitcher_whip ?? -1))
  return list.sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

// 🚪 BULLPEN BOARD (audit #5, 2026-08-08). The starter table above answers
// "who starts weak"; this answers the OTHER six innings — which pens on
// tonight's slate leak homers (season reliever-only HR/9, sitCodes=rp, the
// verified split behind penStatsFor) and which ones come in already tired
// (yesterday's workload). Both live-API context lanes; nothing here scores.
//
// USABILITY PASS 2026-08-09 ("make it more usable"): the board was a ranked
// bar and a fatigue tag, with no answer to "whose pen is this playing
// against tonight", no way to reorder it, and no way to get from a row to
// the game it belongs to. All three are here now.
//
// NOT here, deliberately: the pen's team RECORD. Nothing in the slate payload
// carries team wins/losses — the closest fields are per-pitcher season lines —
// and a record is exactly the kind of number that would be trivial to
// approximate and wrong. The caption says the pen's real workload numbers
// instead, which are measured.
//
// DEPTH PASS 2026-08-15 ("more about the bull pen"): the board knew one thing
// about a pen — its StatsAPI reliever HR/9 — and the slate had been publishing
// five more on every row the whole time. Now each row also carries the bot's
// quality grade, its ERA and its WHIP; the sentences under the list say the
// attack score against tonight's real spread, the pitch fit of the bats it has
// to face, and which individual arms were emptied yesterday (fetchPenFatigue
// has collected those names since day one and nothing ever showed them). The
// two sources are labelled rather than blended — see lib/bullpen.js.
function BullpenBoard({ pitchers, onTeamClick }) {
  const [pen, setPen] = useState(null)          // ABBR → {hr9, hr, ip}
  const [fatByAbbr, setFatByAbbr] = useState(null)
  const [open, setOpen] = useState(false)
  const [sortKey, setSortKey] = useState('hr9') // hr9 | fatigue | attack

  useEffect(() => {
    penStatsFor().then((m) => setPen(m)).catch(() => {})
    Promise.all([fetchPenFatigue(), teamAbbrs()]).then(([fat, abbrs]) => {
      const m = {}
      Object.entries(fat || {}).forEach(([tid, t]) => {
        const ab = abbrs?.[tid]
        if (ab) m[String(ab).toUpperCase()] = t
      })
      setFatByAbbr(m)
    }).catch(() => {})
  }, [])

  // WHO THEY FACE. Every grouped starter carries his own team and his
  // opponent, so both directions of each matchup are already on the page —
  // the pen board just never used them. opp[TEAM] = the club its relievers
  // will be pitching to tonight; arm[TEAM] = that club's own starter, which
  // is the row's click target.
  const { oppOfTeam, starterOfTeam } = useMemo(() => {
    const oppMap = {}
    const armMap = {}
    pitchers.forEach((p) => {
      const t = String(p.team || '').toUpperCase()
      const o = String(p.opponent_team || '').toUpperCase()
      if (t && o) { oppMap[t] = o; oppMap[o] = t }
      if (t) armMap[t] = p
    })
    return { oppOfTeam: oppMap, starterOfTeam: armMap }
  }, [pitchers])

  // THE PUBLISHED PEN LINE, joined by team. bullpen_* on a hitter's row belongs
  // to the pen of the club he FACES, so team T's block is read off T's own
  // starter's opposing lineup — the verification is in lib/bullpen.js penFrom.
  // pitch fit is per hitter, so the board carries the average across the bats
  // that pen actually has to get out tonight, and says how many that is.
  const slatePen = useMemo(() => {
    const m = {}
    pitchers.forEach((p) => {
      const t = String(p.team || '').toUpperCase()
      if (!t || m[t]) return
      const line = penFrom(rawOf(p))
      if (!line) return
      const fits = (p.lineup || [])
        .map((b) => Number(b?.raw?.bullpen_pitch_fit))
        .filter((v) => Number.isFinite(v))
      m[t] = {
        ...line,
        fitAvg: fits.length ? fits.reduce((a, b) => a + b, 0) / fits.length : null,
        fitN: fits.length,
      }
    })
    return m
  }, [pitchers])

  // The attack score's REAL spread tonight, so the number can be read against
  // what it actually does rather than against an instinctive 0-100.
  const attackRange = useMemo(() => {
    const xs = Object.values(slatePen).map((x) => x.attack).filter((v) => v != null)
    return xs.length >= 3 ? [Math.min(...xs), Math.max(...xs)] : null
  }, [slatePen])

  const rows = useMemo(() => {
    const tonight = new Set()
    pitchers.forEach((p) => {
      [p.team, p.opponent_team].forEach((t) => t && tonight.add(String(t).toUpperCase()))
    })
    const built = [...tonight]
      .map((ab) => ({
        ab, st: pen?.get(ab), tier: penTier(fatByAbbr?.[ab]), fat: fatByAbbr?.[ab], line: slatePen[ab],
      }))
      // A pen earns a row on either source now. It used to need the StatsAPI
      // split, so on a night that call failed the whole board vanished even
      // though the slate was carrying a full pen line for all thirty clubs.
      .filter((r) => r.st?.hr9 != null || r.line)
    if (sortKey === 'fatigue') {
      // Heaviest yesterday first; pens with no workload logged sink, because
      // "no data" and "fresh" are not the same claim and shouldn't share a slot.
      return built.sort((a, b) =>
        (b.fat?.pitches ?? -1) - (a.fat?.pitches ?? -1)
        || (b.fat?.used ?? -1) - (a.fat?.used ?? -1)
        || (b.st?.hr9 ?? -1) - (a.st?.hr9 ?? -1))
    }
    if (sortKey === 'attack') {
      // The bot's own view of how attackable the pen is — a different question
      // from HR/9, which is why it gets its own sort rather than a blend.
      return built.sort((a, b) => (b.line?.attack ?? -1) - (a.line?.attack ?? -1)
        || (b.st?.hr9 ?? -1) - (a.st?.hr9 ?? -1))
    }
    return built.sort((a, b) => (b.st?.hr9 ?? -1) - (a.st?.hr9 ?? -1))
  }, [pen, fatByAbbr, pitchers, slatePen, sortKey])

  if (!rows.length) return null
  const shown = open ? rows : rows.slice(0, 8)
  const worst = Math.max(...rows.map((r) => r.st?.hr9 ?? 0), 0.01)
  const anyFatigue = rows.some((r) => r.fat)
  const anyAttack = rows.some((r) => r.line?.attack != null)

  // THE READ UNDER THE LIST. Up to three pens worth saying something about —
  // graded weak, leaking 1.25+, or emptied yesterday — each as one sentence
  // with its numbers inside it rather than as another strip of boxes.
  const notable = [...rows]
    .filter((r) => r.line?.quality === 'weak' || (r.line?.hr9 ?? r.st?.hr9 ?? 0) >= 1.25 || r.tier?.key === 'gassed')
    .sort((a, b) => (b.line?.attack ?? -1) - (a.line?.attack ?? -1)
      || (b.st?.hr9 ?? -1) - (a.st?.hr9 ?? -1))
    .slice(0, 3)

  return (
    <div style={{
      background: `linear-gradient(155deg, ${C.bg2}, rgba(248,113,113,.04))`,
      border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 13px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ fontSize: 11.5, fontWeight: 900 }}>🚪 Bullpen board</span>
        <span style={{ fontSize: 9.5, color: C.text3, flex: '1 1 220px', minWidth: 0 }}>
          the other six innings — whose pen, who they face, how good it is and how hard it worked yesterday
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 8.5, color: C.text3, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sort</span>
          {[['hr9', 'HR/9'], ['fatigue', 'Fatigue'], ['attack', 'Attack']].map(([k, label]) => {
            const dead = (k === 'fatigue' && !anyFatigue) || (k === 'attack' && !anyAttack)
            return (
              <button key={k} onClick={() => setSortKey(k)}
                disabled={dead}
                title={k === 'fatigue'
                  ? (anyFatigue ? "Heaviest reliever workload yesterday first. Pens with nothing logged sink — no data isn't the same claim as fresh."
                    : 'No reliever workload logged for yesterday, so there is nothing to sort by')
                  : k === 'attack'
                    ? (anyAttack ? "The bot's own bullpen_attack_score, most attackable first. A different question from HR/9 — it reads the pen against the bats it has to face — so it gets its own sort instead of being blended into one number."
                      : 'No bullpen attack score published on tonight\'s slate')
                    : 'Season reliever-only HR/9, leakiest first'}
                style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 9.5, fontWeight: 800, fontFamily: NUM_FONT,
                  cursor: dead ? 'not-allowed' : 'pointer',
                  border: `1px solid ${sortKey === k ? C.orange : C.border}`,
                  background: sortKey === k ? alpha(STATE.on().color, 0.14) : 'transparent',
                  color: dead ? C.text3 : sortKey === k ? C.orange : C.text2,
                  opacity: dead ? 0.45 : 1,
                }}>{label}</button>
            )
          })}
        </div>
      </div>
      {/* SINGLE-COLUMN, RANKED (owner feedback 2026-08-08): the two-column
          grid read as noise — one pen per row, top to bottom, is the list.
          MOBILE OVERFLOW FIX (2026-08-21, Phase 3): each row's fixed-width
          spans (rank/team/opp/HR9 value/raw counts/pen line, none of them
          allowed to shrink) sum to roughly 400px before the HR/9 bar or any
          gap is even counted — wider than a 390px phone. Nothing here was
          wrapping, so that overflow had nowhere to go but the page itself.
          overflowX makes THIS box scroll sideways on a narrow phone, same
          pattern the dense tables already use elsewhere, instead of forcing
          the whole page wider than the viewport. Desktop is unaffected —
          the row already fits with room to spare above ~460px. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, overflowX: 'auto' }}>
        {shown.map((r, i) => {
          const opp = oppOfTeam[r.ab] || ''
          const arm = starterOfTeam[r.ab] || null
          const clickable = !!(arm && onTeamClick)
          // The whole row as one sentence, for the tooltip. Every number the
          // row draws plus the ones it has no width for — attack score, pitch
          // fit, and which arms carried yesterday.
          const apiLine = r.st?.hr9 != null
            ? `${r.ab} relievers this season (StatsAPI, relievers only): ${r.st.hr} HR in ${r.st.ip} IP — HR/9 ${r.st.hr9.toFixed(2)}.`
            : `No StatsAPI reliever split loaded for ${r.ab}; the pen numbers on this row are the slate's own.`
          const slateLine = r.line
            ? ` Published pen line: ${penLineParts(r.line, { attackRange, fitAvg: r.line.fitAvg, fitN: r.line.fitN, liveHr9: r.st?.hr9 }).map((x) => x.text).join(', ')}.`
            : ''
          return (
            <div key={r.ab}
              onClick={clickable ? () => onTeamClick(arm) : undefined}
              title={`${apiLine}${slateLine}${opp ? ` They pitch to ${opp} tonight.` : ''} ${penWorkSentence(r.fat)}${clickable ? ` Click to open ${arm.pitcher_name}, ${r.ab}'s starter in this game.` : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '2px 5px', borderRadius: 6,
                cursor: clickable ? 'pointer' : 'default',
                background: clickable ? 'transparent' : 'transparent',
              }}
              onMouseEnter={(e) => { if (clickable) e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 16, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, width: 34, flexShrink: 0 }}>{r.ab}</span>
              {/* WHO THEY FACE — the question the board couldn't answer. */}
              <span style={{ fontFamily: NUM_FONT, fontSize: 9, color: C.text3, width: 46, flexShrink: 0 }}>
                {opp ? `vs ${opp}` : '—'}
              </span>
              <div style={{ flex: '1 1 60px', maxWidth: 130, height: 7, background: C.bg3, borderRadius: 4, overflow: 'hidden' }}>
                {r.st?.hr9 != null && (
                  <div style={{
                    width: `${Math.min(100, (100 * r.st.hr9) / worst)}%`, height: '100%',
                    background: r.st.hr9 >= 1.3 ? C.red : r.st.hr9 >= 1.05 ? C.orange : C.green,
                  }} />
                )}
              </div>
              <span style={{ fontFamily: NUM_FONT, fontSize: 10.5, fontWeight: 800, width: 38, flexShrink: 0, color: (r.st?.hr9 ?? 0) >= 1.3 ? C.red : C.text2 }}>
                {r.st?.hr9 != null ? r.st.hr9.toFixed(2) : '—'}
              </span>
              {/* The raw counts the bar is built from, on the row instead of
                  hidden in a tooltip — a 1.40 on 180 IP and a 1.40 on 40 IP
                  are not the same statement. */}
              <span style={{ fontFamily: NUM_FONT, fontSize: 8.5, color: C.text3, width: 82, flexShrink: 0 }}>
                {r.st?.hr9 != null ? `${r.st.hr} HR / ${r.st.ip} IP` : 'no split'}
              </span>
              {/* THE SLATE'S OWN PEN LINE (2026-08-15). HR/9 alone can't tell a
                  pen that walks the yard from one that gives up the odd solo
                  shot — ERA and WHIP can, and the bot's grade is its summary of
                  both. Different source from the bar to its left, which is why
                  they sit apart and the caption names each. */}
              <span title={r.line
                ? `Slate-published bullpen line for ${r.ab}: ${penLineParts(r.line, { attackRange, fitAvg: r.line.fitAvg, fitN: r.line.fitN, liveHr9: r.st?.hr9 }).map((x) => x.text).join(', ')}.`
                : `No bullpen line published on tonight's slate for ${r.ab}`}
                style={{
                  fontFamily: NUM_FONT, fontSize: 8.5, width: 128, flexShrink: 0, cursor: 'help',
                  color: r.line?.quality === 'weak' ? C.orange : r.line?.quality === 'strong' ? C.text3 : C.text2,
                }}>
                {r.line
                  ? `${r.line.quality || '—'} · ${r.line.era != null ? r.line.era.toFixed(2) : '—'} ERA · ${r.line.whip != null ? r.line.whip.toFixed(2) : '—'} WHIP`
                  : 'no pen line'}
              </span>
              {/* ATTACK SCORE, ON THE ROW (2026-08-22). This board offers an
                  "Attack" sort and then never drew the number it sorted by —
                  the order changed and nothing on screen explained it. It was
                  spoken only in the two or three `notable` sentences below,
                  which is exactly the wrong two or three: the rows you cannot
                  read are the ones further down. Narrow, quiet, and always
                  present when the slate publishes one. */}
              {anyAttack && (
                <span
                  title={r.line?.attack != null
                    ? `Bullpen attack score ${r.line.attack.toFixed(0)} — the bot's 0-100 rating of how attackable this pen is against the bats it faces tonight, on a slate spread of ${attackRange ? `${attackRange[0].toFixed(0)}–${attackRange[1].toFixed(0)}` : 'n/a'}. A score, not a chance of anything. This is the number the Attack sort uses.`
                    : `No bullpen attack score published for ${r.ab} tonight — a blank, not a zero, so the Attack sort puts it last.`}
                  style={{
                    fontFamily: NUM_FONT, fontSize: 9, width: 44, flexShrink: 0, cursor: 'help',
                    textAlign: 'right',
                    fontWeight: sortKey === 'attack' ? 900 : 700,
                    color: sortKey === 'attack' ? C.orange : C.text3,
                  }}>
                  {r.line?.attack != null ? `atk ${r.line.attack.toFixed(0)}` : 'atk —'}
                </span>
              )}
              {/* The workload tag keeps its exact three states — the third one
                  ("no log") is the honesty case and is never spoken as rest.
                  What is new is that the tooltips now name the arms that were
                  actually emptied, which fetchPenFatigue has always collected
                  and this board has never shown. */}
              {r.tier ? (
                <span title={penWorkSentence(r.fat)}
                  style={{ fontSize: 9, fontWeight: 900, color: r.tier.col, flexShrink: 0, cursor: 'help' }}>
                  {r.tier.icon} {r.tier.word}
                </span>
              ) : r.fat ? (
                <span title={penWorkSentence(r.fat)}
                  style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0, cursor: 'help' }}>
                  {r.fat.used}a / {r.fat.pitches}p
                </span>
              ) : (
                <span title="No reliever workload logged for this club yesterday — an off day, or the boxscore hasn't landed. Unknown, NOT rested." style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0, cursor: 'help' }}>
                  no log
                </span>
              )}
            </div>
          )
        })}
      </div>
      {rows.length > 8 && (
        <button onClick={() => setOpen(!open)} style={{
          marginTop: 6, fontSize: 9.5, fontWeight: 700, cursor: 'pointer', color: C.text3,
          background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 6, padding: '2px 9px',
        }}>{open ? 'show less' : `all ${rows.length} pens`}</button>
      )}

      {/* ── THE PENS WORTH TALKING ABOUT ─────────────────────────────────────
          A ranked list tells you the order; it doesn't tell you what any one
          pen IS. These are the two or three that carry a reason — graded weak,
          leaking 1.25+, or emptied yesterday — each as a sentence with its
          numbers inside it. This is where the attack score, the pitch fit and
          the individual arms from yesterday get said out loud, because none of
          them fit on a row and all three are the point. */}
      {notable.length > 0 && (
        <div style={{ marginTop: 7, paddingTop: 6, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notable.map((r) => {
            const arm = starterOfTeam[r.ab] || null
            return (
              <Clauses
                key={r.ab}
                lead={`${r.ab}${oppOfTeam[r.ab] ? ` vs ${oppOfTeam[r.ab]}` : ''}${arm ? `, behind ${arm.pitcher_name}` : ''}: `}
                parts={[
                  ...penLineParts(r.line, { attackRange, fitAvg: r.line?.fitAvg, fitN: r.line?.fitN, liveHr9: r.st?.hr9 }),
                  ...penWorkParts(r.fat),
                ]}
              />
            )
          })}
        </div>
      )}

      {/* ── FOLDED (2026-08-17) ─────────────────────────────────────────────
          Donovan, for the third time: "the pitchers page still has all them
          fucking words." This was a nine-sentence paragraph pinned under the
          bullpen board. One line stays visible — the two symbols you need to
          scan the bars — and every other sentence is one tap behind it.
          Nothing deleted; the form condensed, every fact kept. */}
      <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
        Red bar = pen giving up 1.30+ HR/9 · 🥵 = threw heavy yesterday · click a row for that club&apos;s starter.
        <details style={{ display: 'inline', marginLeft: 6 }}>
          <summary style={{ display: 'inline', cursor: 'pointer', color: C.orange }}>the fine print</summary>
          {' '}<b style={{ color: C.text2 }}>vs</b> is who those relievers pitch to tonight.
          HR/9 is season reliever-only (sitCode rp); the HR / IP beside it is what the rate is built from.
          <b style={{ color: C.text2 }}> &ldquo;no log&rdquo;</b> means nothing was recorded yesterday — not the
          same as rested, so never sorted as if it were. The bar&apos;s rate is the live StatsAPI reliever-only
          split and is the only HR rate on this board; grade, ERA and WHIP come from the slate&apos;s published
          pen line, and bullpen_hr9 keeps its labelled column in the full starter table. The attack score is a
          0-100 rating against tonight&apos;s real spread — a score, not a chance of anything. Context lane:
          this ranks nothing else on the site.
        </details>
      </div>
    </div>
  )
}

function localTime(gameTime) {
  if (!gameTime) return '—'
  const d = new Date(gameTime)
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
}

// Same plain-stat-bar look used by Games.js's bot-view player rows, scaled
// down for HR/9 and WHIP since those don't run 0-100 like the hr/hrr scores.
function StatBar({ label, value, max, color }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
      <span style={{ width: 34, fontSize: 9, color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ width: 32, fontSize: 10, color: 'rgba(255,255,255,0.7)', fontFamily: NUM_FONT, textAlign: 'right' }}>
        {value == null ? '—' : value.toFixed(2)}
      </span>
    </div>
  )
}

function LineupRow({ b, onPlayerClick }) {
  return (
    <div
      onClick={() => onPlayerClick?.(b.raw)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
        cursor: onPlayerClick ? 'pointer' : 'default',
        borderRadius: 6,
      }}
    >
      <span style={{ width: 18, fontSize: 10, color: C.text3, fontFamily: NUM_FONT, textAlign: 'center', flexShrink: 0 }}>
        {b.lineup_spot ?? '?'}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {b.name}
      </span>
      <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.bats}HB</span>
      {!b.lineup_confirmed && (
        <span style={{ fontSize: 9, color: C.text3, flexShrink: 0 }}>(proj.)</span>
      )}
      {b.weak_spot_flag && (
        <span title="Weak pitcher spot" style={{ fontSize: 11, flexShrink: 0 }}>⭐</span>
      )}
      {b.pitch_type_match_score > 0 && (
        <span title="Matchup edge" style={{ fontSize: 11, flexShrink: 0 }}>🎯</span>
      )}
      <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT, width: 28, textAlign: 'right', flexShrink: 0 }}>
        {Math.round(b.hr_score)}
      </span>
    </div>
  )
}

// ══ THE ATTACK CARD, REBUILT (2026-08-23) ═══════════════════════════════════
//
// Donovan, three times now: "the pitcher page — so much reaching, not enough
// give and go info. good info just presented bad." "i dk what im looking at."
// "too much on mobile." And, asked whether the arsenal or the splits should
// lead: "both. want the both to look better."
//
// The old card was eleven numbers in three monospace strips with no hierarchy
// — HR/9, ERA, WHIP, weak spots, worst-on, L3 HR/9, pen ERA, pen attack, air,
// then the bats. Every one of them true, none of them ordered, and the actual
// DECISION (attack this arm, with these three) sat at the bottom under all of
// it. That is what "reaching" means: the reader doing the sorting the card
// should have done.
//
// So it has a reading order now, and it is the same one every time:
//
//   1. THE VERDICT   the dial, the name, and one plain sentence naming the
//                    single worst thing about him tonight.
//   2. WHAT HE GIVES the arsenal half — the damage he allows, and whether it
//                    is getting worse. Labelled tiles, not a mono strip.
//   3. WHO GETS HIM  the splits half — which side he bleeds to, which lineup
//                    spots, and the three bats to do it with.
//
// "Both" is answered by giving each half its own titled band rather than
// picking a winner: on a phone you read one, then the other, and the labels
// tell you which question you are in. The bullpen and the air moved into the
// existing fold, because they are about the game and not about the arm.
//
// Nothing was deleted. Every figure the old card printed is still here, in a
// tile with a label instead of a mono run-on, and the folded read is unchanged.

/** One labelled figure. The label is the point — a bare 1.73 is the reaching. */
function ArmStat({ label, value, sub, tone, tip }) {
  const col = tone === 'hot' ? verdictInk(true).color
    : tone === 'cold' ? verdictInk(false).color : C.text
  return (
    <span title={tip} style={{
      flex: '1 1 68px', minWidth: 68, padding: '5px 8px', borderRadius: 9,
      border: `1px solid ${tone ? alpha(col, 0.32) : C.border}`,
      background: tone ? alpha(col, 0.07) : C.glass,
      cursor: tip ? 'help' : 'default',
    }}>
      <span style={{
        display: 'block', fontSize: 7.5, fontWeight: 800, letterSpacing: '.09em',
        color: C.text3, fontFamily: NUM_FONT, textTransform: 'uppercase',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{label}</span>
      <span style={{
        display: 'block', fontSize: 13.5, fontWeight: 900, fontFamily: NUM_FONT,
        color: col, lineHeight: 1.15,
      }}>{value}</span>
      {sub && (
        <span style={{ display: 'block', fontSize: 8, color: C.text3, fontFamily: NUM_FONT }}>{sub}</span>
      )}
    </span>
  )
}

/** A titled band. Two of these are the card's whole structure. */
function ArmBand({ title, note, children }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
        <span style={{
          fontSize: 8, fontWeight: 900, letterSpacing: '.11em', color: C.text3,
          fontFamily: NUM_FONT, textTransform: 'uppercase', flexShrink: 0,
        }}>{title}</span>
        {note && (
          <span style={{
            fontSize: 8.5, color: C.text3, minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{note}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * The sentence. ONE clause, naming the worst single thing about him tonight,
 * because "i dk what im looking at" is answered by a sentence and not by a
 * fourth number.
 *
 * It reads the leak score's own driver list rather than re-deciding — the
 * ranking already worked out what is carrying his score, and a card that
 * disagreed with the number printed beside it would be worse than silent.
 */
function armVerdict(p, leak, raw) {
  const hr9 = n(p.pitcher_hr9, 0)
  const l3 = Number(raw?.pitcher_l3_hr9)
  const l3n = n(raw?.pitcher_l3_starts_found, 0)
  const worsening = Number.isFinite(l3) && l3n >= 2 && l3 > hr9 + 0.25
  const top = leak?.drivers?.[0]
  const spots = n(p.weak_spot_count, 0)
  const bits = []
  if (top) bits.push(`worst on ${String(top.label).toLowerCase()} (${top.text})`)
  else if (hr9 > 0) bits.push(`${hr9.toFixed(2)} HR/9`)
  if (worsening) bits.push(`and it has got worse — ${l3.toFixed(2)} over his last ${l3n}`)
  if (spots > 0) bits.push(`${spots} lineup spot${spots > 1 ? 's' : ''} tonight he has been beaten in`)
  if (!bits.length) return 'Not enough published on him tonight to say where he leaks.'
  return `${bits[0]}${bits[1] ? `, ${bits[1]}` : ''}${bits[2] ? ` · ${bits[2]}` : ''}.`
}

function PitcherCard({ pitcher, isOpen, onToggle, onPlayerClick, onOpenPitcher }) {
  const hasWeak = pitcher.weak_spot_count > 0
  // BAND PERSONALITY (2026-08-07, same language as parks/games): from the
  // HITTER's point of view — a leaky starter is a 🎯 TARGET and burns, a
  // stingy one is a 🔒 WALL and cools. HR/9 + weak spots decide it.
  const hr9 = Number(pitcher.pitcher_hr9) || 0
  const band = (hr9 >= 1.5 || pitcher.weak_spot_count >= 3) ? { icon: '🎯', word: 'TARGET', col: '#f97316' }
    : (hr9 >= 1.2 || pitcher.weak_spot_count >= 1) ? { icon: '🔥', word: 'LEAKY', col: '#fb923c' }
    : hr9 > 0 && hr9 <= 0.85 ? { icon: '🔒', word: 'WALL', col: '#38bdf8' }
    : { icon: '', word: '', col: '' }
  return (
    <div style={{
      background: band.col ? `linear-gradient(160deg, ${band.col}0e 0%, ${C.bg2} 55%)` : C.bg2,
      border: `1px solid ${band.col ? `${band.col}44` : C.border}`,
      borderRadius: 12, overflow: 'hidden', marginBottom: 8,
    }}>
      <div
        onClick={() => onToggle(pitcher.pitcher_id)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', cursor: 'pointer', gap: 10, flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: C.text3, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', display: 'inline-block', width: 10 }}>▸</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{pitcher.pitcher_name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{pitcher.pitcher_throws}HP</span>
              {band.word && (
                <span title={band.word === 'WALL'
                  ? 'Stingy: HR/9 ≤ 0.85 — hitters facing him fight uphill tonight'
                  : `From the hitter's side: HR/9 ${hr9 ? hr9.toFixed(2) : '—'}${pitcher.weak_spot_count ? ` + ${pitcher.weak_spot_count} weak spot${pitcher.weak_spot_count > 1 ? 's' : ''}` : ''} — this is an arm to attack`}
                  style={{ fontSize: 8, fontWeight: 900, color: band.col, letterSpacing: '.09em', fontFamily: NUM_FONT }}>
                  {band.icon} {band.word}
                </span>
              )}
              {hasWeak && <Chip color="#f59e0b">⭐ {pitcher.weak_spot_count} weak spot{pitcher.weak_spot_count > 1 ? 's' : ''}</Chip>}
            </div>
            <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
              {pitcher.team} vs {pitcher.opponent_team} · {localTime(pitcher.game_time)}
              {pitcher.venue_name ? ` · ${pitcher.venue_name}` : ''}
              {' · '}{pitcher.lineup_confirmed ? 'Lineup confirmed' : 'Projected lineup'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onOpenPitcher?.(pitcher) }}
            style={{
              padding: '4px 10px', fontSize: 10.5, fontWeight: 700, borderRadius: 6,
              cursor: 'pointer', border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text3, whiteSpace: 'nowrap',
            }}
          >Open card</button>
          <div style={{ minWidth: 130 }}>
            <StatBar label="ERA" value={pitcher.pitcher_era} max={6} color={C.cyan} />
            <StatBar label="HR/9" value={pitcher.pitcher_hr9} max={3} color={C.orange} />
            <StatBar label="WHIP" value={pitcher.pitcher_whip} max={2} color={C.purple} />
          </div>
        </div>
      </div>

      {isOpen && (
        <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${C.border}` }}>
          {/* Spot-by-spot first. The plain row list underneath is the roster;
              this is the question you actually opened the card to answer. */}
          <PitcherSpots pitcher={pitcher} onPlayerClick={onPlayerClick} />
          <PitcherProfile pitcher={pitcher} />

          <div style={{ fontSize: 9, color: C.text3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 4px' }}>
            Opposing Lineup ({pitcher.lineup.length})
          </div>
          {pitcher.lineup.map((b) => (
            <LineupRow key={b.player_id ?? b.name} b={b} onPlayerClick={onPlayerClick} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Pitchers({ players, onPlayerClick }) {
  const [sortKey, setSortKey] = useState('weak')
  const [openId, setOpenId] = useState(null)
  const [modalPitcher, setModalPitcher] = useState(null)
  const [colGroup, setColGroup] = useState('core')
  // DROPDOWN FILTERS (2026-08-14 upgrade — Donovan, from the competitor
  // screenshots: "i like how they have drop down menus, it saves space in
  // some situations"). Two compact selects narrow the starter TABLE only —
  // the attack cards and pen board stay slate-wide, since their whole job
  // is ranking the full night.
  const [gameSel, setGameSel] = useState('all')   // 'all' | 'TEAM|TEAM' sorted pair
  const [armSel, setArmSel] = useState('all')     // 'all' | 'L' | 'R'

  const pitchers = useMemo(() => groupPitchers(players), [players])
  const sorted = useMemo(() => sortPitchers(pitchers, sortKey), [pitchers, sortKey])
  const gameKey = (p) => [String(p.team || ''), String(p.opponent_team || '')].sort().join('|')
  const gameOptions = useMemo(() => {
    const m = new Map()
    pitchers.forEach((p) => {
      const k = gameKey(p)
      if (!k.replace('|', '')) return
      if (!m.has(k)) {
        const [a, b] = k.split('|')
        m.set(k, `${a} – ${b} · ${localTime(p.game_time)}`)
      }
    })
    return [...m.entries()].sort((x, y) => x[1].localeCompare(y[1]))
  }, [pitchers])
  const tableSource = useMemo(() => sorted.filter((p) =>
    (gameSel === 'all' || gameKey(p) === gameSel)
    && (armSel === 'all' || String(p.pitcher_throws || '').toUpperCase() === armSel)),
  [sorted, gameSel, armSel])
  // HR LUCK, ONCE. This used to be computed inside the DenseTable rows IIFE
  // and was therefore reachable by exactly one column; the form read in the
  // cards needs the same number, and two copies of a percentile ladder is how
  // two surfaces start quietly disagreeing. It moved to lib/armLeak
  // (hrLuckPointers) with the same fields and the same maths, and it is still
  // built over the FULL slate even when the dropdowns narrow the table — a
  // percentile against one filtered opponent means nothing.
  const luckPts = useMemo(() => hrLuckPointers(players), [players])
  // The pen attack score's real spread tonight, so the cards can quote a 79
  // against the 15–79 it actually runs rather than against an imagined 100.
  const penAtkRange = useMemo(() => {
    const xs = pitchers.map((p) => penFrom(rawOf(p))?.attack).filter((v) => v != null)
    return xs.length >= 3 ? [Math.min(...xs), Math.max(...xs)] : null
  }, [pitchers])
  // One line per game, in start order — the environment section below.
  const games = useMemo(() => {
    const m = new Map()
    pitchers.forEach((p) => {
      const k = p.game_pk ?? gameKey(p)
      if (!m.has(k)) m.set(k, { key: k, arms: [], row: rawOf(p), venue: p.venue_name, time: p.game_time })
      m.get(k).arms.push(p)
      if (!m.get(k).row) m.get(k).row = rawOf(p)
    })
    return [...m.values()].sort((a, b) => new Date(a.time || 0) - new Date(b.time || 0))
  }, [pitchers])
  const tableRef = useRef(null)

  if (!pitchers.length) return <Empty text="No pitcher data found yet." />

  // THE WORKBENCH (2026-08-08 redesign — "lazy and unusable" no more). The
  // old verdict was 3+3 bare names in two boxes: it told you WHO but never
  // WITH WHAT. Every pitcher entry from groupPitchers already carries his
  // full opposing lineup, so each attack card now answers the page's real
  // question in one glance: this arm, his leak numbers, and the three bats
  // best equipped to punish him tonight — clickable, straight to the hitter.
  // ── ONE NUMBER FOR "HOW ATTACKABLE IS THIS ARM" (2026-08-09) ────────────
  //
  // The site was carrying two, and they disagreed. Home ranked the weakest
  // arms with lib/armLeak (eight published fields, ranked against tonight's
  // other starters); this page ranked them with pitcherOverall (a 70/30
  // season-and-recent blend of a narrower set). Same question, two answers,
  // no explanation of the difference anywhere — which is the kind of thing
  // that quietly costs trust on a site whose whole pitch is that the numbers
  // are explainable.
  //
  // armLeak wins the headline because it is the better answer to THIS
  // question: it carries the park the man is pitching in, tonight's contact
  // quality against him, and his velocity against his own baseline, and it
  // names the two terms driving each ranking. pitcherOverall survives as the
  // table's Overall column, where it's labelled as what it is — a season and
  // recent-form blend, a different lens rather than a rival verdict.
  const leaks = rankArms(players)
  const leakBy = new Map(leaks.map((a) => [a.name, a]))
  const byOverall = [...pitchers]
    .map((p) => ({
      p,
      ov: pitcherOverall(p.lineup?.[0]?.raw || {}),
      leak: leakBy.get(p.pitcher_name) || null,
    }))
    .filter((x) => x.ov > 0 || x.leak)
    // Leak score leads; the old blend only breaks ties for arms the leak
    // ranker couldn't score (too few published fields on a thin slate).
    .sort((a, b) => (b.leak?.leak ?? -1) - (a.leak?.leak ?? -1) || b.ov - a.ov)
  const targets = byOverall.slice(0, 3)
  const avoids = byOverall.slice(-3).reverse()
  const topBats = (p, k = 3) => [...(p.lineup || [])].sort((a, b) => b.hr_score - a.hr_score).slice(0, k)

  return (
    <div>
      <PanelTitle
        title="Pitchers"
        sub={`${pitchers.length} starters ranked by leak score — who to attack, with which bats, what he has been doing lately, who follows him and the air he throws in`}
        right={
          <button
            onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            style={btnStyle(C.cyan, false)}
          >↓ Full starter table</button>
        }
      />

      {/* ── ATTACK CARDS — the arm, his leaks, and the bats to do it with ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {targets.map(({ p, ov, leak }, i) => {
          const raw = rawOf(p)
          const hr9 = n(p.pitcher_hr9, 0)
          const l3 = Number(raw?.pitcher_l3_hr9)
          const l3n = n(raw?.pitcher_l3_starts_found, 0)
          const brl = Number(raw?.pitcher_barrel_allowed)
          const airPct = Number(raw?.weather_hr_effect_pct ?? raw?.weather_hr_pct)
          const penEra = Number(raw?.bullpen_era)
          const penAtk = Number(raw?.bullpen_attack_score)
          const weakSide = clean(raw?.pitcher_weak_side, '')
          const score = leak ? leak.leak : Math.round(ov)
          const bats = topBats(p)
          return (
          <div key={p.pitcher_id ?? p.pitcher_name} style={{
            flex: '1 1 300px', minWidth: 0, position: 'relative', overflow: 'hidden',
            background: `linear-gradient(158deg, rgba(249,115,22,${i === 0 ? '.13' : '.08'}), ${C.bg2} 56%)`,
            border: `1px solid rgba(249,115,22,${i === 0 ? '.5' : '.28'})`,
            borderRadius: 18, padding: '12px 13px 11px',
          }}>
            {/* the light bar — the same one every prop card on this site wears */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, ${C.orange}, ${alpha(C.orange, 0)} 72%)`,
            }} />

            {/* ── 1. THE VERDICT ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <Dial
                value={score}
                col={C.orange}
                size={52}
                title={leak
                  ? `Leak score ${leak.leak}/100 — ranked against tonight's ${leaks.length} starters only, not the league. Built from ${leak.scoredOn} published fields: ${leak.terms.map((t) => `${t.label} ${t.text}`).join(' · ')}.${leak.thin ? ' Small Statcast sample behind the contact-quality terms.' : ''} The same number the Home page ranks arms with.`
                  : "Season and recent-form blend — this arm didn't carry enough published fields for the leak score."}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{
                    fontSize: 8.5, fontWeight: 900, color: C.orange, letterSpacing: '.1em',
                    fontFamily: NUM_FONT, flexShrink: 0,
                  }}>🎯 ATTACK #{i + 1}</span>
                  {leak?.thin && (
                    <span title="Small Statcast sample behind the contact-quality terms"
                      style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>thin sample</span>
                  )}
                  {!p.lineup_confirmed && (
                    <span title="The opposing lineup is projected, not posted — the bats below can change"
                      style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, marginLeft: 'auto' }}>◻ proj</span>
                  )}
                </div>
                <div onClick={() => setModalPitcher(p)} style={{ cursor: 'pointer', minWidth: 0 }}>
                  <div style={{
                    fontSize: 15.5, fontWeight: 900, letterSpacing: '-.01em', minWidth: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{p.pitcher_name}</div>
                  <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
                    {p.pitcher_throws}HP · {p.team} vs {p.opponent_team} · {localTime(p.game_time)}
                  </div>
                </div>
              </div>
            </div>

            {/* ONE SENTENCE. The answer to "i dk what im looking at" is a
                sentence, not a fourth number. */}
            <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.5, marginTop: 8 }}>
              {armVerdict(p, leak, raw)}
            </div>

            {/* ── 2. WHAT HE GIVES UP ────────────────────────────────────── */}
            <ArmBand title="What he gives up" note="season, and lately">
              <div style={{ display: 'flex', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                <ArmStat label="HR/9" value={hr9 ? hr9.toFixed(2) : '—'}
                  tone={hr9 >= 1.3 ? 'hot' : hr9 && hr9 <= 0.9 ? 'cold' : null}
                  tip="Home runs allowed per nine innings — the leak itself. Warm is bad for him." />
                <ArmStat label={l3n ? `Last ${l3n}` : 'Last 3'}
                  value={Number.isFinite(l3) && l3n > 0 ? l3.toFixed(2) : '—'}
                  sub={Number.isFinite(l3) && l3n > 0 && hr9 ? (l3 > hr9 ? 'worse' : 'better') : null}
                  tone={Number.isFinite(l3) && l3n > 0 && hr9 ? (l3 > hr9 ? 'hot' : 'cold') : null}
                  tip={l3n ? `HR/9 over his last ${l3n} starts, against a season ${hr9.toFixed(2)}. Blank means the bot has not logged enough recent starts.` : 'No recent starts logged for him yet.'} />
                <ArmStat label="Barrels" value={Number.isFinite(brl) ? `${(brl * 100).toFixed(1)}%` : '—'}
                  tone={Number.isFinite(brl) ? (brl >= 0.09 ? 'hot' : brl <= 0.055 ? 'cold' : null) : null}
                  tip="Share of batted balls against him hit at a home-run launch angle and speed. The contact-quality half of the leak." />
                {/* "ERA / WHIP" ellipsised to "ERA / WH…" at 390px — caught in
                    the render. The label is the shorter word and the second
                    figure carries its own name underneath. */}
                <ArmStat label="ERA"
                  value={n(p.pitcher_era, 0) ? n(p.pitcher_era, 0).toFixed(2) : '—'}
                  sub={n(p.pitcher_whip, 0) ? `${n(p.pitcher_whip, 0).toFixed(2)} WHIP` : null}
                  tip="Season ERA, with season WHIP underneath. Context for the two numbers to the left, not the reason to attack him." />
              </div>
            </ArmBand>

            {/* ── 3. WHO GETS HIM ────────────────────────────────────────── */}
            <ArmBand
              title="Who gets him"
              note={weakSide
                ? `weakest to ${weakSide === 'LHB' ? 'left' : 'right'}-handed bats`
                : 'no side split published'}>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
                {bats.map((b) => (
                  <button key={b.player_id ?? b.name} onClick={() => onPlayerClick?.(b.raw)}
                    title={`${b.name} — HR score ${Math.round(b.hr_score)}${b.weak_spot_flag ? ' · sits in a lineup spot this arm has been beaten in' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 6, cursor: 'pointer',
                      flex: '1 1 0', minWidth: 0,
                      background: C.glass,
                      border: `1px solid ${b.weak_spot_flag ? 'rgba(252,211,77,.5)' : C.border}`,
                      borderRadius: 10, padding: '5px 9px',
                    }}>
                    <span style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>{b.lineup_spot ?? '·'}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: C.text, minWidth: 0, flex: '1 1 auto',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{/* surname(), not split(' ').pop() — the latter renders
                          Bobby Witt Jr. as a chip that says "Jr.", which is
                          exactly what this card did until it was rendered and
                          looked at. lib/player.js has been suffix-aware since
                          the game chips hit the same bug. */}
                      {surname(b.name)}</span>
                    {b.weak_spot_flag && <span style={{ fontSize: 9, flexShrink: 0 }}>⭐</span>}
                    <span style={{ fontSize: 11, fontWeight: 900, color: C.orange, fontFamily: NUM_FONT, flexShrink: 0 }}>{Math.round(b.hr_score)}</span>
                  </button>
                ))}
                {!bats.length && <span style={{ fontSize: 9.5, color: C.text3 }}>no opposing bats on the slate yet</span>}
              </div>
              {n(p.weak_spot_count, 0) > 0 && (
                <div style={{ fontSize: 9, color: '#FCD34D', fontFamily: NUM_FONT, marginTop: 4 }}
                  title="Lineup positions this arm has historically been beaten in, that tonight's order actually fills">
                  ★ {p.weak_spot_count} weak lineup spot{p.weak_spot_count > 1 ? 's' : ''} in tonight's order
                </div>
              )}
            </ArmBand>

            {/* ── THE GAME, not the arm — folded, unchanged ───────────────── */}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 9, color: C.orange, listStyle: 'revert' }}>
                the game around him — his form in words, his pen, the air
                {(Number.isFinite(penEra) || Number.isFinite(airPct)) && (
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}>
                    {Number.isFinite(penEra) ? `  ·  pen ${penEra.toFixed(2)}` : ''}
                    {Number.isFinite(penAtk) ? `/${penAtk.toFixed(0)}` : ''}
                    {Number.isFinite(airPct) ? `  ·  air ${airPct > 0 ? '+' : ''}${airPct.toFixed(0)}%` : ''}
                  </span>
                )}
              </summary>
              <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Clauses lead="Lately: "
                  parts={armFormParts(raw, { luckPointer: luckPts.get(p.pitcher_name) })} />
                <Clauses lead="Behind him: "
                  parts={penLineParts(penFrom(raw), {
                    attackRange: penAtkRange,
                    fitAvg: (() => {
                      const f = (p.lineup || []).map((b) => Number(b?.raw?.bullpen_pitch_fit)).filter((v) => Number.isFinite(v))
                      return f.length ? f.reduce((a, b) => a + b, 0) / f.length : null
                    })(),
                    fitN: (p.lineup || []).filter((b) => Number.isFinite(Number(b?.raw?.bullpen_pitch_fit))).length,
                  })} />
                <AirLine row={raw} lead={`${p.venue_name || 'The air'}: `} />
              </div>
            </details>
          </div>
          )
        })}
      </div>

      {/* ── STAY AWAY — one compact strip, not a twin box of dead space ── */}
      {avoids.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'stretch', marginBottom: 12,
        }}>
          {avoids.map(({ p, ov, leak }) => {
            const best = topBats(p, 1)[0]
            return (
              <div key={p.pitcher_id ?? p.pitcher_name} style={{
                flex: '1 1 220px', minWidth: 0,
                background: 'linear-gradient(160deg, rgba(96,165,250,.08), transparent 65%)',
                border: '1px solid rgba(96,165,250,.3)', borderRadius: 11, padding: '7px 11px',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, minWidth: 0 }}>
                  <span style={{ fontSize: 8.5, fontWeight: 900, color: '#60a5fa', letterSpacing: '.08em', fontFamily: NUM_FONT, flexShrink: 0 }}>🧊 STAY AWAY</span>
                  <span
                    title={leak ? `Leak score ${leak.leak}/100 against tonight's starters — the same scale the attack cards use.` : 'Season and recent-form blend.'}
                    style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 900, color: '#60a5fa', fontFamily: NUM_FONT, cursor: 'help' }}>
                    {leak ? leak.leak : ov.toFixed(0)}
                  </span>
                </div>
                <div onClick={() => setModalPitcher(p)} style={{ cursor: 'pointer', marginTop: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{p.pitcher_name}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginLeft: 5 }}>{p.team} vs {p.opponent_team} · HR/9 {n(p.pitcher_hr9, 0).toFixed(2)} · ERA {n(p.pitcher_era, 0).toFixed(2)}</span>
                </div>
                {/* A STAY-AWAY IS A CLAIM ABOUT FORM TOO. An arm can be the
                    stingiest on the slate all season and still be the one
                    coming apart this month — so the same recent-form read the
                    attack cards get is here, where it is most likely to change
                    somebody's mind. */}
                {/* Folded, same as the attack cards — stats are in the line
                    above, the sentences one tap behind. */}
                <details style={{ marginTop: 3 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 8.5, color: '#60a5fa', listStyle: 'revert' }}>the read</summary>
                  <Clauses lead="Lately: "
                    parts={armFormParts(rawOf(p), { luckPointer: luckPts.get(p.pitcher_name) })}
                    size={9} style={{ marginTop: 3 }} />
                  <AirLine row={rawOf(p)} lead={`${p.venue_name || 'The air'}: `} size={9} style={{ marginTop: 1 }} />
                </details>
                {best && (
                  <div style={{ fontSize: 9, color: C.text3, marginTop: 3 }}>
                    If you must:{' '}
                    <span onClick={() => onPlayerClick?.(best.raw)} style={{ color: C.text2, fontWeight: 700, cursor: 'pointer' }}>
                      {best.name} <b style={{ fontFamily: NUM_FONT, color: C.blue }}>{Math.round(best.hr_score)}</b>
                    </span>
                    {' '}is his lineup&apos;s best-armed bat.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <BullpenBoard
        pitchers={pitchers}
        onTeamClick={(p) => {
          // A pen row is a team; the way into that team's game from here is
          // its own starter's card, which carries the matchup, the lineup and
          // the arsenal. Scroll the table into view behind the modal so
          // closing it leaves you somewhere sensible rather than back at the top.
          tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          setModalPitcher(p)
        }}
      />

      {/* ── 🌤️ WHERE THEY'RE THROWING ────────────────────────────────────────
          The third gap. Every hitter board on this site reads the park and the
          air; the page about the men throwing into that air never mentioned it
          once, so a starter with a 1.10 HR/9 in Oracle Park and the same 1.10
          in Coors read identically here.

          One line per game, in first-pitch order, both starters named — click
          either to open his card. Everything spoken comes out of
          lib/conditions.js airParts, which is the single copy of the
          temp/wind/park/humidity/rain/roof logic, plus the bot's own
          weather_hr_effect_pct. A game whose weather hasn't published simply
          doesn't get a line rather than getting a made-up mild evening. */}
      {games.length > 0 && (
        <div style={{
          background: `linear-gradient(155deg, ${C.bg2}, rgba(34,211,238,.04))`,
          border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 13px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 900 }}>🌤️ Where they&apos;re throwing</span>
            <span style={{ fontSize: 9.5, color: C.text3, flex: '1 1 220px', minWidth: 0 }}>
              the building and the air each starter works in — the same read the hitter boards get
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {games.map((g) => {
              const arms = [...g.arms].sort((a, b) => String(a.team).localeCompare(String(b.team)))
              return (
                <div key={g.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, width: 74, flexShrink: 0 }}>
                    {localTime(g.time)}
                  </span>
                  <span style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <AirLine row={g.row} lead={`${g.venue || 'Venue not published'} — `} size={10} />
                    <div style={{ fontSize: 9, color: C.text3, marginTop: 1 }}>
                      {arms.map((a, i) => (
                        <span key={a.pitcher_id ?? a.pitcher_name}>
                          {i > 0 && ' vs '}
                          <span onClick={() => setModalPitcher(a)}
                            title={`${a.pitcher_name} — ${armFormSentence(rawOf(a), { luckPointer: luckPts.get(a.pitcher_name) }) || 'no recent-form fields published'}`}
                            style={{ color: C.text2, fontWeight: 700, cursor: 'pointer' }}>
                            {a.pitcher_name}
                          </span>
                          <span style={{ fontFamily: NUM_FONT }}> ({a.team})</span>
                        </span>
                      ))}
                      {arms.length < 2 && <span> — the other starter hasn&apos;t published</span>}
                    </div>
                  </span>
                </div>
              )
            })}
          </div>
          {/* One visible line; the rest folds. Same rule as the bullpen note. */}
          <div style={{ fontSize: 9, color: C.text3, marginTop: 6, lineHeight: 1.5 }}>
            Ember = air that helps the ball, blue = air that kills it.
            <details style={{ display: 'inline', marginLeft: 6 }}>
              <summary style={{ display: 'inline', cursor: 'pointer', color: C.orange }}>the fine print</summary>
              {' '}Hover the park clause for the raw <b style={{ color: C.text2 }}>park HR factor</b>. A closed
              roof takes the weather out of the game, which is why it is said even though it moves nothing by
              itself. The <b style={{ color: C.text2 }}>+% on home runs</b> is the bot&apos;s own published
              weather effect — a swing on the HR rate, not anybody&apos;s chance of hitting one. Games with no
              weather published get no line instead of a plausible-looking default.
            </details>
          </div>
        </div>
      )}

      {/* Column groups — the other half of the usability fix. Thirty columns
          at once was a wall; each group is one question. */}
      <div ref={tableRef} style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center', scrollMarginTop: 130 }}>
        {/* UNIVERSAL FILTER (2026-08-23): this row was the ninth hand-rolled
            chip recipe on the site — radius 7, ember's orange in an rgba
            literal. Same control as the modal's tabs now. */}
        <FilterLabel>Columns</FilterLabel>
        {[['core', 'Core'], ['recent', 'Recent form'], ['cmd', 'Command'], ['bot', 'Bot scores'], ['bb', 'Batted ball'], ['pen', 'His pen'], ['air', 'The air'], ['all', 'Everything']].map(([k, label]) => (
          <FilterPill key={k} active={colGroup === k} onClick={() => setColGroup(k)}>{label}</FilterPill>
        ))}
        {/* the space-saving dropdowns (2026-08-14) — see the state block */}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={gameSel} onChange={(e) => setGameSel(e.target.value)}
            title="Narrow the table to one game's two starters"
            style={{
              background: C.bg3, border: `1px solid ${gameSel !== 'all' ? C.orange : C.border}`,
              color: gameSel !== 'all' ? C.orange : C.text2, borderRadius: 7,
              fontSize: 10, fontFamily: NUM_FONT, padding: '3px 6px', cursor: 'pointer', maxWidth: 190,
            }}>
            <option value="all">All games ({pitchers.length} arms)</option>
            {gameOptions.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <select value={armSel} onChange={(e) => setArmSel(e.target.value)}
            title="Narrow the table by throwing arm"
            style={{
              background: C.bg3, border: `1px solid ${armSel !== 'all' ? C.orange : C.border}`,
              color: armSel !== 'all' ? C.orange : C.text2, borderRadius: 7,
              fontSize: 10, fontFamily: NUM_FONT, padding: '3px 6px', cursor: 'pointer',
            }}>
            <option value="all">Any arm</option>
            <option value="L">LHP only</option>
            <option value="R">RHP only</option>
          </select>
          {(gameSel !== 'all' || armSel !== 'all') && (
            <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>
              {tableSource.length} of {pitchers.length}
            </span>
          )}
        </span>
      </div>
      {/* The card list below is one starter at a time. This is the slate:
          which arms are actually attackable, and on which axis. */}
      {/* One sortable table of EVERY starter, replacing the old "most
          attackable" heatmap. That heatmap showed the top 15 and the card list
          below it showed all 28 — the same starters twice, with the top of one
          list also being the top of the other. This does the heatmap's job
          (scan the slate, sort on whatever you care about) without being a
          second copy of the thing underneath it.

          L3 columns are the addition: pitcher_l3_era, _l3_whip, _l3_hr9 and
          _l3_starts_found are on 143 of 143 slate rows. Season K/9 is here too
          — there is no L3 K/9 published, so it isn't invented. */}
      <DenseTable
        heatMode="sorted"
rows={(() => {
        // Built over the FULL slate even when the dropdowns narrow the view:
        // the HR-luck column percentiles each arm against tonight's other
        // starters, and a percentile against one filtered opponent is
        // meaningless. Filtered AFTER the math, below.
        const built = sorted.map((p) => {
          const src = (k) => {
            for (const b of p.lineup || []) {
              const v = b?.raw?.[k]
              if (v !== null && v !== undefined && v !== '') return v
            }
            return null
          }
          return {
            _key: p.pitcher_id ?? p.pitcher_name,
            _raw: p,
            name: `${p.pitcher_name}${(p.lineup || []).some((x) => x?.raw?.pitcher_projected) ? ' ≈' : ''}`,
            t: p.pitcher_throws,
            tm: p.team,
            vs: p.opponent_team,
            era: n(p.pitcher_era, null),
            whip: n(p.pitcher_whip, null),
            hr9: n(p.pitcher_hr9, null),
            k9: n(src('pitcher_k9'), null),
            l3era: n(src('pitcher_l3_era'), null),
            l3whip: n(src('pitcher_l3_whip'), null),
            l3hr9: n(src('pitcher_l3_hr9'), null),
            l3n: n(src('pitcher_l3_starts_found'), 0),
            trend: clean(src('pitcher_trend_direction'), ''),
            // The bot's own pitcher scoring. All five are on 268/268 slate rows
            // and none of them were shown anywhere on this board.
            attack: n(src('pitcher_attack_score'), null),
            attackTag: clean(src('pitcher_attack_tag'), ''),
            wsScore: n(src('pitcher_weak_side_score'), null),
            spotDmg: n(src('pitcher_spot_damage_score'), null),
            zoneDmg: n(src('pitcher_zone_damage_score'), null),
            lowK: src('pitcher_low_k_flag') === true ? 1 : 0,
            overall: pitcherOverall(p.lineup?.[0]?.raw || {}),
            // The attack tag as three flags instead of a sentence — see the
            // column block below for why.
            gbTrap: /GB\/TRAP/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            hardCon: /HARD CONTACT/i.test(clean(src('pitcher_attack_tag'), '')) ? 1 : 0,
            weakSide: clean(p.pitcher_weak_side, ''),
            spots: p.weak_spot_count,
            conf: p.lineup_confirmed ? 1 : 0,

            // BATTED BALL ALLOWED. All four verified on 268 of 268 slate rows
            // and none of them were on this board before. For a home-run site
            // these are closer to the point than ERA is: fly balls are the only
            // batted ball that leaves the yard, and hard-hit and barrel rate are
            // what separates a fly ball from a can of corn.
            //
            // WHAT IS MISSING, and it matters: pitcher_gb_rate, pitcher_ld_rate
            // and pitcher_popup_rate are published as 0 on all 268 rows. The
            // only GB/LD/popup fields with real values in the payload are
            // l25pa_gb_rate and friends, which are the HITTER's last-25-PA
            // rates, not the pitcher's. Using those here would be silently
            // wrong, so the ground-ball and line-drive columns are simply not
            // built. See BOT-DATA-REQUESTS.md — this is a bot-side fix.
            // Docket #20 calibrated fields — null until the bot's xHR machine
            // publishes; the columns only appear once they carry values.
            // 2026-08-15: these two were resolving to `null`, and DenseTable
            // renders null as 0.0 (Number(null) is 0) — so in the Everything
            // group both calibrated columns printed a confident "0.0" for
            // every arm on a slate where the bot has not published them at
            // all. numOrGap makes an unpublished field read as a dash.
            xallowed: numOrGap(src('pitcher_xhr_allowed')) || undefined,
            xluck: (() => { const v = numOrGap(src('pitcher_hr_luck')); return v === 0 ? undefined : v })(),
            fb: n(src('pitcher_fb_rate'), null),
            fbSc: n(src('pitcher_statcast_fb_rate'), null),
            hh: n(src('pitcher_hardhit_allowed'), null),
            brl: n(src('pitcher_barrel_allowed'), null),
            hrfb: n(src('pitcher_hr_fb_pct'), null),
            pullAir: n(src('pitcher_pullair_allowed_pct'), null),
            // XBH allowed comes split by batter hand; the total is what the
            // column shows, and the two sides stay available in the modal.
            xbh: (() => {
              const l = n(src('pitcher_xbh_vs_lhb'), null)
              const r = n(src('pitcher_xbh_vs_rhb'), null)
              if (l == null && r == null) return null
              return (l || 0) + (r || 0)
            })(),

            // ── FORM · COMMAND · PEN · AIR (2026-08-15) ───────────────────
            // The same three subjects the cards above now speak, as sortable
            // columns — the cards read the top three arms and the bottom
            // three, and this is how you ask the question of all thirty.
            //
            // Velocity is gated on pitcher_fb_velo_status: 'missing' on nine
            // of 266 rows tonight, and a missing delta is NOT 0.0 mph.
            velo: (() => {
              const st = clean(src('pitcher_fb_velo_status'), '')
              return st.toLowerCase() === 'missing' ? undefined : numOrGap(src('pitcher_fb_velo_delta'))
            })(),
            meat: numOrGap(src('pitcher_meatball_pct')),
            whiff: numOrGap(src('pitcher_whiff_pct')),
            swstr: numOrGap(src('pitcher_swstr_pct')),
            put: numOrGap(src('pitcher_putaway_pct')),
            fps: numOrGap(src('pitcher_first_pitch_strike_pct')),
            ev: numOrGap(src('pitcher_ev_allowed')),
            hr9L: numOrGap(src('pitcher_hr9_vs_lhb')),
            hr9R: numOrGap(src('pitcher_hr9_vs_rhb')),
            // The pen that comes in behind HIM — bullpen_* on his opposing
            // lineup's rows belongs to his own club (see lib/bullpen penFrom).
            penQual: textOrGap(src('bullpen_quality')),
            penEra: numOrGap(src('bullpen_era')),
            penWhip: numOrGap(src('bullpen_whip')),
            penHr9: numOrGap(src('bullpen_hr9')),
            penAtk: numOrGap(src('bullpen_attack_score')),
            penFit: (() => {
              const f = (p.lineup || []).map((b) => Number(b?.raw?.bullpen_pitch_fit)).filter((v) => Number.isFinite(v))
              return f.length ? f.reduce((a, b) => a + b, 0) / f.length : undefined
            })(),
            // The building and the air, straight off the row.
            venue: textOrGap(p.venue_name),
            roof: textOrGap(src('roof')),
            temp: numOrGap(src('weather_temp_f')),
            wind: numOrGap(src('weather_wind_mph')),
            windDir: textOrGap(src('weather_wind_direction_label')),
            humid: numOrGap(src('weather_humidity')),
            parkHr: numOrGap(src('park_hr_factor')),
            wxHr: numOrGap(src('weather_hr_effect_pct')),
          }
        })
        // HR LUCK (2026-08-06, from the expected-vs-actual teardown): rank
        // every starter on the slate by the LOUDNESS of contact he allows
        // (barrel + hard-hit + pull-air + fly-ball, equal parts of what's
        // present) and by his actual HR/9, both as slate percentiles. The gap
        // is the luck read: allowed loud contact but few homers so far =
        // "lucky", the regression bet says TARGET him; homers without loud
        // contact = "unlucky", his HR/9 overstates him. Published fields
        // only, no expected-HR model — a pointer, not a projection.
        //
        // 2026-08-15: the ladder itself now lives in lib/armLeak
        // (hrLuckPointers) because the recent-form sentences on the cards need
        // the identical number. Same fields, same maths, computed once over
        // the whole slate — this line is the only thing that changed here.
        built.forEach((r) => { r.luck = luckPts.get(r._raw?.pitcher_name) ?? null })
        // the dropdown filters apply here, AFTER the slate-relative math
        const keep = new Set(tableSource.map((p) => p.pitcher_id ?? p.pitcher_name))
        return built.filter((r) => keep.has(r._key))
        })()}
        columns={(() => {
          // Calibrated xHR columns appear on their own once the bot publishes
          // (docket #20) — until then they'd be a blank stripe, so they don't.
          const hasX = sorted.some((p) => (p.lineup || []).some((b) => Number(b?.raw?.pitcher_xhr_bbe) >= 50))
          // Column groups. 'core' answers tonight; the rest are drill-ins.
          // Three groups joined the row on 2026-08-15 — command, pen and air —
          // for the same reason the sentences above them exist: the page could
          // rank an arm but couldn't tell you what has been happening to him,
          // who follows him, or where he is throwing.
          const GROUPS = {
            core:   ['name','t','tm','vs','weakSide','trend','gbTrap','hardCon','lowK','conf','overall','hr9',...(hasX ? ['xallowed','xluck'] : ['luck']),'era','whip','spots'],
            recent: ['name','tm','vs','trend','overall','l3hr9','l3era','l3whip','l3n','velo','hr9',...(hasX ? ['xallowed','xluck'] : ['luck'])],
            cmd:    ['name','t','tm','vs','meat','fps','put','whiff','swstr','k9','ev','hr9L','hr9R'],
            bot:    ['name','tm','vs','overall','attack','wsScore','zoneDmg','spotDmg','spots','gbTrap','hardCon','lowK'],
            bb:     ['name','tm','vs','overall','fb','fbSc','hh','brl','hrfb','pullAir','xbh','k9','ev',...(hasX ? ['xallowed','xluck'] : ['luck'])],
            pen:    ['name','tm','vs','penQual','penEra','penWhip','penHr9','penAtk','penFit'],
            air:    ['name','tm','vs','venue','roof','windDir','temp','wind','humid','parkHr','wxHr','hr9'],
          }
          const all = [
          // LAYOUT RULE: every text column first, every number after, nothing
          // interleaved. The table had Trend and Weak side sitting between
          // numeric columns, which breaks the eye's run down a block of digits
          // and makes the whole row harder to scan than it needs to be.
          { key: 'name',   label: 'Starter', heat: false, w: 148, bold: true, sticky: true },
          { key: 't',      label: 'T',   heat: false, w: 24, mono: true, dim: true },
          { key: 'tm',     label: 'Tm',  heat: false, w: 32, mono: true, dim: true },
          { key: 'vs',     label: 'vs',  heat: false, w: 32, mono: true, dim: true },
          { key: 'weakSide', label: 'Weak', heat: false, w: 44, mono: true, dim: true,
            title: 'The side this pitcher struggles against',
            // 2026-08-12: 'weak' alone isn't a glossary key, so this column
            // got no tap-dot at all on mobile despite having a title. Its
            // neighbor wsScore had the opposite problem — see that column.
            explain: 'The side (L or R) this pitcher struggles against. If it matches how this hitter bats, that’s a point in his favor.' },
          { key: 'trend',  label: 'Trend', heat: false, w: 58, dim: true },
          // The three new text columns sit with the other text, per the layout
          // rule below: nothing textual is allowed to interrupt a run of digits.
          { key: 'penQual', label: 'Pen', heat: false, w: 54, mono: true, dim: true,
            title: 'The bot\'s one-word grade on the bullpen behind THIS starter (bullpen_quality) — strong, average or weak. Who finishes the game he starts.',
            explain: 'The bot’s grade on the bullpen that comes in behind this starter — strong, average or weak. It says nothing about the starter himself; it is who you get in the seventh.' },
          { key: 'venue',  label: 'Park', heat: false, w: 128, dim: true,
            title: 'The building he is throwing in tonight' },
          { key: 'roof',   label: 'Roof', heat: false, w: 56, mono: true, dim: true,
            title: 'Roof state — a closed roof takes the weather out of the game entirely' },
          { key: 'windDir', label: 'Wind dir', heat: false, w: 96, mono: true, dim: true,
            title: 'Reported wind direction at first pitch. "Out" is the one that matters for home runs.' },
          // Flags, as dots. The attack tag used to print "🧊 GB/TRAP" and
          // "⚠️ HARD CONTACT" as words in a 104px column — three values wearing
          // a lot of width, and the emoji made every row look busy. As dots
          // they scan instantly and sort like the booleans they are.
          { key: 'gbTrap', label: 'GB',  flag: true, mark: '●', w: 30,
            title: 'Bot tag: ground-ball / trap profile' },
          { key: 'hardCon', label: 'HRD', flag: true, mark: '●', w: 32,
            title: 'Bot tag: gives up hard contact' },
          { key: 'lowK',   label: 'LoK', flag: true, mark: '●', w: 32,
            title: 'Bot’s low-strikeout flag — fires on 98 of 268, so it’s common' },
          { key: 'conf',   label: 'LU',  flag: true, mark: '●', w: 28,
            title: 'Lineup confirmed' },
          // ── numbers from here down, uninterrupted ──
          { key: 'overall', label: 'Overall', w: 58, dp: 0,
            title: 'A SECOND LENS, not the headline. Blended attackability: HR/9 30%, attack 25%, zone damage 20%, weak side 15%, minus swinging-strike 10%, weighted 70% season / 30% recent form. The cards above rank on the LEAK SCORE instead (lib/armLeak) — eight published fields ranked against tonight\'s other starters, including the park and tonight\'s contact quality, which this column has no view of. Both unvalidated: none of these inputs has reached the graded archive.' },
          { key: 'hr9',    label: 'HR/9', w: 46, dp: 2 },
          { key: 'xallowed', label: 'xHR', w: 48, dp: 1,
            title: 'Expected homers allowed from the contact he\'s actually given up — the bot\'s league (EV, LA) table, no park or weather. Compare with his real HR total.' },
          { key: 'xluck', label: 'HR luck', w: 54, dp: 1, invert: true,
            title: 'Actual HRs allowed minus expected-from-contact. NEGATIVE = fewer homers than his contact deserved — the "lucky" arm, and the regression bet says target him. Positive = he\'s paid more than the contact warranted. Calibrated (docket #20), replaces the old percentile pointer.' },
          { key: 'luck',   label: 'HR luck', w: 54, dp: 0,
            title: 'Loudness of contact allowed (barrel/HH/pull-air/FB percentiles) minus HR/9 percentile, both within tonight\'s slate. POSITIVE = loud contact but few homers paid so far — the "lucky" arm, and the regression bet says target him. Negative = his HR/9 overstates the damage he actually allows. A pointer, not a projection.' },
          { key: 'era',    label: 'ERA', w: 44, dp: 2 },
          { key: 'whip',   label: 'WHIP', w: 46, dp: 2 },
          { key: 'k9',     label: 'K/9', w: 44, dp: 1, invert: true,
            title: 'Season strikeouts per nine. Inverted — a high K/9 is bad for the hitter.' },
          { key: 'l3hr9',  label: 'L3 HR/9', w: 54, dp: 2,
            title: 'Last three starts. Small by construction — check the L3 GS column.' },
          { key: 'l3era',  label: 'L3 ERA', w: 50, dp: 2 },
          { key: 'l3whip', label: 'L3 WHIP', w: 54, dp: 2 },
          { key: 'l3n',    label: 'L3 GS', w: 44,
            title: 'How many recent starts the L3 numbers actually found. Under 3 and they are thinner than they look.' },
          { key: 'attack', label: 'Attack', w: 52, dp: 0,
            title: 'The bot’s attack score. Range on tonight’s slate is 0–54, median 19 — so 30+ is genuinely high, not middling.' },
          { key: 'wsScore', label: 'Weak side', w: 58, dp: 0,
            title: 'How exploitable his platoon split is. 0–90 on tonight’s slate.',
            // 2026-08-12: label collided with the GLOSSARY's 'weak side' entry
            // (written for the categorical L/R column, weakSide above) — the
            // tap-dot was showing "which side he's weak against" on what is
            // actually a 0-90 exploitability SCORE. Own explain now.
            explain: 'How exploitable his platoon split is — a 0–90 score, not which side he’s weak against. Higher is easier to attack.' },
          { key: 'zoneDmg', label: 'Zone dmg', w: 58, dp: 0,
            title: 'Damage he allows by order third — pooled, so sturdier than the per-spot number' },
          { key: 'spotDmg', label: 'Spot dmg', w: 56, dp: 0,
            title: 'Damage by individual lineup spot. Thin by construction.' },
          { key: 'spots',  label: '★ Spots', w: 52,
            title: 'Weak lineup spots he faces tonight' },

          // Batted ball allowed. Grouped at the end so the bot-score block
          // above stays one uninterrupted run of numbers.
          { key: 'fb',     label: 'FB%', w: 46, fmt: PCT,
            title: 'Fly-ball rate allowed, season. The only batted ball that can leave the yard — slate mean is 38%.' },
          { key: 'fbSc',   label: 'FB% sc', w: 54, fmt: PCT,
            title: 'Statcast fly-ball rate allowed. Classified from launch angle rather than scorer judgement, so it reads a few points lower than FB% — slate mean 34%.' },
          { key: 'hh',     label: 'HH%', w: 46, fmt: PCT,
            title: 'Hard-hit rate allowed — share of batted balls at 95+ mph. Slate mean 38%.' },
          { key: 'brl',    label: 'Brl%', w: 48, fmt: PCT,
            title: 'Barrel rate allowed. The single best contact-quality signal for home runs. Slate mean 7%.' },
          { key: 'hrfb',   label: 'HR/FB', w: 52, fmt: PCT,
            title: 'Share of his fly balls that left the yard. Slate mean 10%. Noisy year to year — a high number is as often park and luck as it is the arm.' },
          { key: 'pullAir', label: 'Pull air', w: 54, fmt: PCT,
            title: 'Pulled air contact allowed. Pulled fly balls are where the short porch lives.' },
          { key: 'xbh',    label: 'XBH', w: 44, dp: 0,
            title: 'Extra-base hits allowed this season, both batter sides combined. A count, not a rate — it scales with innings pitched, so read it next to ERA rather than alone.' },

          // ── WHAT HAS BEEN GOING ON WITH HIM ────────────────────────────────
          { key: 'velo',   label: 'Velo Δ', w: 54, dp: 2, invert: true,
            title: 'Fastball velocity against HIS OWN season baseline, in mph (pitcher_fb_velo_delta). Inverted, because a man throwing harder than usual is bad news for the bat. Blank rather than 0.0 where pitcher_fb_velo_status reads missing — nine arms tonight — since an unmeasured delta is not a flat one.',
            explain: 'How his fastball is sitting against his own normal, in mph. Negative means he has lost velocity, which favours the hitter. It is measured against himself, not against the league.' },

          // ── COMMAND. His weapons, so every one of these is INVERTED: a big
          // number here is the pitcher's edge, not the hitter's, and this
          // table is bright-is-good-for-the-bat throughout.
          { key: 'meat',   label: 'Meat%', w: 52, fmt: PCT,
            title: 'Meatball rate — the share of his pitches down the middle. NOT inverted: these are the ones that get hit a long way, so more of them is good for the bat. Slate range tonight runs roughly 16–30%.' },
          { key: 'fps',    label: '1st-K%', w: 56, fmt: PCT, invert: true,
            title: 'First-pitch strike rate. Inverted — an arm that gets ahead is working from in front all night, which is his edge.' },
          { key: 'put',    label: 'Putaway%', w: 62, fmt: PCT, invert: true,
            title: 'Share of two-strike counts he finishes. Inverted: his strength, not yours.' },
          { key: 'whiff',  label: 'Whiff%', w: 56, fmt: PCT, invert: true,
            title: 'Misses per swing against him. Inverted — bat-missing is the pitcher\'s weapon.' },
          { key: 'swstr',  label: 'SwStr%', w: 56, fmt: PCT, invert: true,
            title: 'Swinging strikes per pitch thrown. Inverted, same reason as Whiff%.' },
          { key: 'ev',     label: 'EV alw', w: 54, dp: 1,
            title: 'Average exit velocity allowed, mph. Not inverted — loud contact against him is the hitter\'s news.' },
          { key: 'hr9L',   label: 'HR/9 vL', w: 58, dp: 2,
            title: 'Home runs per nine against left-handed bats. Read it against HR/9 vR beside it — the gap is the platoon hole, and the Weak column names which side it is.' },
          { key: 'hr9R',   label: 'HR/9 vR', w: 58, dp: 2,
            title: 'Home runs per nine against right-handed bats.' },

          // ── THE PEN BEHIND HIM. Not his numbers at all: these describe the
          // relievers who finish the game he starts, which is the other six
          // innings of the same bet. Higher is better for the bat throughout.
          { key: 'penEra', label: 'Pen ERA', w: 60, dp: 2,
            title: 'Season ERA of the bullpen behind this starter (bullpen_era). His own line says nothing about who follows him.' },
          { key: 'penWhip', label: 'Pen WHIP', w: 64, dp: 2,
            title: 'Season WHIP of that same bullpen — traffic in the late innings.' },
          { key: 'penHr9', label: 'Pen HR/9', w: 62, dp: 2,
            title: 'Home runs per nine allowed by that bullpen. This is the slate\'s published number; the Bullpen board above also shows a live StatsAPI reliever-only split, and the two are separate pulls rather than one blended figure.' },
          { key: 'penAtk', label: 'Pen atk', w: 58, dp: 0,
            title: 'bullpen_attack_score — how attackable the bot rates that pen, 0-100. A SCORE, not a chance of anything, and it does not use the whole scale: tonight it runs roughly 15–79.' },
          { key: 'penFit', label: 'Pen fit', w: 56, dp: 0,
            title: 'Average published bullpen_pitch_fit across the lineup that will actually bat against this pen — how well those swings match what the relievers throw. The mean of a published per-hitter field, not a model.' },

          // ── THE AIR. The same six fields every hitter board reads, on the
          // page about the men throwing into them.
          { key: 'temp',   label: 'Temp', w: 48, dp: 0,
            title: 'Game-time temperature, °F. Warm air is less dense, so the ball carries.' },
          { key: 'wind',   label: 'Wind', w: 48, dp: 0,
            title: 'Wind speed in mph. Meaningless without the direction beside it — a 15 mph wind in is the opposite bet from a 15 mph wind out.' },
          { key: 'humid',  label: 'Humid', w: 52, dp: 0,
            title: 'Relative humidity, %. Humid air is slightly thinner than dry air, so the ball carries a touch further.' },
          { key: 'parkHr', label: 'Park HR', w: 60, dp: 2,
            title: 'The park\'s home-run factor as a multiplier against a neutral park. Above 1.00 helps the hitter.' },
          { key: 'wxHr',   label: 'Wx HR%', w: 58, dp: 0, fmt: (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(0)}%`),
            title: 'weather_hr_effect_pct — the bot\'s published swing on the home-run RATE from tonight\'s conditions at this park. A percentage change to a rate, not anybody\'s chance of hitting one.' },
        ]
          if (colGroup === 'all') return all
          const keep = new Set(GROUPS[colGroup] || GROUPS.core)
          return all.filter((c) => keep.has(c.key))
        })()}
        onRowClick={(p) => setModalPitcher(p)}
        initialSort="hr9"
        maxHeight={420}
        caption="Every starter on the slate, now including the bot's own pitcher scoring — Attack, Weak side, Zone damage and Spot damage, none of which appeared anywhere on this board before. Read Attack against its real range: it runs 0–54 tonight with a median of 19, so a 35 is a strong signal even though it looks low on a 100-point instinct. Bright is good for the hitter throughout, so K/9 is inverted — a high strikeout rate is his strength, not yours. L3 columns are the last three starts and are thin on purpose: three outings is a handful of innings, so read them as a direction rather than a rate, and check L3 GS before trusting them. Click a header to sort, shift-click to add a tiebreaker, a row to open the starter. The batted-ball block at the right is what he actually gives up: fly balls, hard contact, barrels, pulled air and extra-base hits. Ground-ball, line-drive and popup rate now compute for real off that same batted-ball pull (2026-08-12, they used to publish flat 0) — not broken out as their own columns yet, so this block stays fly-ball-led for now. Overall now blends 70% season with 30% last-three-starts wherever L3 HR/9 exists, so a starter who has been getting hit lately no longer reads like his April self. Three column groups are new (2026-08-15): COMMAND is how he beats hitters — meatball rate, first-pitch strikes, putaway, whiff and swinging strikes — and every one of those except Meat% is INVERTED, because they are his weapons and this table is bright-is-good-for-the-bat throughout. HIS PEN is not about him at all: it is the relievers who finish the game he starts, read off the slate's own published bullpen line, and it is the other six innings of the same bet. THE AIR is the park and the weather he throws into, the same fields the hitter boards have always read and this page never did — a 1.10 HR/9 in Oracle Park and a 1.10 in Coors used to sit here looking identical. Velo Δ is measured against the arm's OWN baseline rather than the league's and is blank, not zero, for the arms whose velocity status reads missing."
      />

      {/* The per-pitcher accordion card list that lived here is GONE
          (2026-08-05, on feedback: "I wanna use it but it doesn't seem like
          much"). It was a third rendering of the same starters — everything
          it held (weak spots, order-zone damage, arsenal, the vs-side and
          zone reads) lives in the modal a row-click opens, where it's
          organized instead of stacked. One table, one click, one deep view. */}
      {/* The column-group buttons already carry their own labels; a paragraph
          re-describing each one was words for words' sake. One sentence. */}
      <div style={{ fontSize: 10, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
        Click any starter for his full card. A dash means the field has not published — never a zero.
      </div>

      {modalPitcher && (
        <PitcherModal
          pitcher={modalPitcher}
          onClose={() => setModalPitcher(null)}
          onPlayerClick={(p) => { setModalPitcher(null); onPlayerClick?.(p) }}
        />
      )}
    </div>
  )
}
