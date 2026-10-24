'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { useSpot } from '../lib/spotlight'
import { nameOf, teamOf, oppOf, clean, mlbId, playerId } from '../lib/player'
import { compactRole, roleColor, scoreFor, gradeFor, signalPills, riskPill, bestBet, tierRole } from '../lib/scoring'
import { archetypeBadge } from '../lib/verdict'
import { roleBadge } from '../lib/roleBadge'
import { hrwRead } from '../lib/hrwBand'
import { hrGateVerdict } from '../lib/hrGate'
import { hrOverlayRead } from '../lib/hrOverlay'
import { Chip, Card, RoleTag } from './ui'
import StatStrip, { SlashLine } from './StatStrip'
import { statLineFor } from '../lib/statline'
import { InfoDot } from './Explain'
import RankCard from './card/RankCard'
import { gameDayOf } from './card/useStamps'
import PlayerFace from './PlayerFace'
import CallStatusBadge from './CallStatusBadge'

// 'watch' band changed 👀→🌤️ to match bots/today_bot.py hrw_emoji(); 👀 was
// double-booked with the old Power Watch role emoji (now 🔭).
// volatile_hot (80+) and strong_capped (70-80) used to share 🚀, but
// hrw_zone_score_value() in today_bot.py deliberately dampens 80+ scores
// down to 64 ("the graded sample favored 55-70 more than extreme 80+") while
// 70-80 only dampens to 70 -- these are different reliability tiers, not the
// same signal, so they now get different symbols. 🌋 reads as "hot but
// erratic" for the unreliable extreme, keeping 🚀 for the genuinely strong
// (but not over-extreme) band.
// Recency tiers for games_since_last_hr (0 = homered last game, 60 = no HR
// found in the lookback window). Plain numeric/text label, no emoji.
function lastHrRecency(p) {
  const g = p?.games_since_last_hr
  if (g == null) return null
  const n = Number(g)
  if (!Number.isFinite(n)) return null
  // 0 used to render as a bare '0g' — technically true, practically invisible.
  // Homered-last-game is the single recency fact people act on (the
  // back-to-back chase), so it gets words, not a code (2026-08-07).
  if (n === 0) return { label: '🔁 HR last gm', color: C.red }
  if (n < 60) return { label: `${n}g`, color: n <= 5 ? C.amber : '#71717a' }
  return { label: 'No HR', color: '#52525b' }
}

// The five-glyph HRW ladder used to be declared here, keyed on the hrw_zone
// STRING, while tabs/Bot.js declared the same five glyphs keyed on numeric cuts
// of hrw_score. One idea, two ladders, and no guarantee they agreed. It now
// lives in lib/hrwBand.js — score first, zone as the fallback — and it comes
// with the printed number, because on this card the emoji was the SOLE
// encoding of a five-state read whose score never appeared anywhere.


// The chip is his ARCHETYPE (lib/verdict hitterArchetype), the word the Rankings
// board, Shortlist and Scoreboard already use. The conviction tier moves to the
// tooltip (Donovan 2026-10-24). Still gated on a known tier, so a row the bot did
// not rate gets no chip, as before. See lib/roleBadge.js for the tier.
function roleTag(p) {
  const b = roleBadge(p?.final_hr_role, C)
  if (!b.known) return null
  const a = archetypeBadge(p)
  return { label: a.label, color: a.color, tier: tierRole(p) }
}

const ALT_GLOW = {
  hits:    { color: '#8B5CF6', label: 'HIT LOOK' },
  hrr:     { color: '#10B981', label: 'HRR LOOK' },
  contact: { color: '#3B82F6', label: 'CTG LOOK' },
}

// Matches Games.js's ROLE_CONFIG wording so the same per-game pick category
// reads the same everywhere on the site.
const GAME_PICK_LABELS = {
  TOP: 'Top Pick',
  HR: 'HR Pick',
  HIT: 'Hit Pick',
  HRR: 'HRR Pick',
  CONTACT: 'Contact Pick',
}

function gamePickLabelFor(p) {
  const primary = (p?.game_pick_role || '').split('/')[0].trim()
  return GAME_PICK_LABELS[primary] || null
}

// rank / status (2026-10-10, cards brought to speed): the Rankings board hands its own rank and its one call word (lib/callStatus) so
// the card leads with them like every other sport's; every other mount passes neither and draws as before, minus the name clipping.
export default function PlayerCard({ p, type = 'hr', onAdd, onWatch, watched, onClick, rank = null, status = null, rankMove = null, compact = false, wide = false, kicker = null, kickerPills = [], accentColor = null }) {
  // compact / wide / kicker / accentColor (2026-10-12): the game page's pick cards. A compact card is drawn for a narrow column
  // (RankCard compact), its pick label rides in `kicker`, and `accentColor` is the SLOT's colour so a row of picks wears one outline style.
  const [openStat, setOpenStat] = useState(null)
  // TAP TARGETS (2026-08-12): the emoji stack, weak-spot star and score badge
  // used to carry their explanations in a bare title= — a hover tooltip,
  // invisible on phones (see Explain.js's header comment; PlayerCard is the
  // single most-clicked component on the site). Each now opens the same text
  // as a small line under the header via the tap-friendly InfoDot pattern.
  const [openEmoji, setOpenEmoji] = useState(false)
  const [openWeak, setOpenWeak] = useState(false)
  const [openScore, setOpenScore] = useState(false)
  const role      = compactRole(p)
  const baseColor = roleColor(role, C)
  const score     = scoreFor(p, type)
  const grade     = gradeFor(p, type)
  const risk      = riskPill(p, C, type)
  const pills     = signalPills(p, C, type, { shown: statLineFor(p, type, 4).map((s) => s.id) })   // the strip below shows these 4
  const bet       = bestBet(p, type)

  const isHardAvoid = p?.true_avoid_hr === true
  const isSoftCaution = !isHardAvoid && (
    p?.best_bet_type === 'Avoid HR' || p?.best_bet_type === 'Avoid for HR'
  )
  const nonHrCat = p?.best_non_hr_category || 'none'
  const altLook  = isHardAvoid && ALT_GLOW[nonHrCat] ? ALT_GLOW[nonHrCat] : null
  // Consolidated avoid signal: ONE chip, ONE color family, regardless of
  // how many separate fields (true_avoid_hr, best_bet_type, role text)
  // independently flag the same underlying "don't take this for HR" verdict.
  // Previously this could render as up to three separate chips (role chip
  // saying "Avoid HR", bet chip saying "Avoid for HR", and a signalPills
  // fallback also saying "Avoid HR") -- now it's exactly one, in its own
  // muted maroon tone distinct from the bright red used for Trap elsewhere,
  // and rendered in its own row below the main chips rather than mixed in.
  // "Skip for HR" instead of "Avoid HR" — the old wording read as a verdict
  // on the player when it was only ever a verdict on this market for tonight.
  const isAvoid = isHardAvoid || isSoftCaution || role === 'Skip HR'
  // ⛔ vs 🥇 (2026-08-15). Donovan, twice: "if the top pick is homerun why give
  // someone a skip hr if that is the bench mark." He is right — the TOP badge
  // is graded on a home run, so "Skip for HR" beside it is the card issuing two
  // opposite instructions. It is NOT right that these players should be
  // filtered out: measured over the archive, TOP picks carrying the flag
  // homered 18/55 (32.7%) against 124/631 (19.7%) without it. So the flag stops
  // being phrased as advice on these cards and starts carrying its own record.
  // See lib/hrGate.js for the full measurement. Every other case — a HIT or
  // HRR pick with a skip-HR note, which is genuinely useful — is untouched.
  const gate = hrGateVerdict(p)
  const avoidLabel = gate ? gate.label
    : altLook ? altLook.label
      : (role === 'Skip HR' ? 'Skip for HR' : (bet || 'Skip for HR'))
  const AVOID_COLOR = '#9F3247'
  const color    = altLook ? altLook.color : baseColor
  const aligned  = (p?.top_board_tags || []).some((t) => String(t).includes('🧩'))
  const gamePickLabel = gamePickLabelFor(p)
  const recency = lastHrRecency(p)
  const hrOverlay = hrOverlayRead(p)
  const showHrOverlay = type === 'hr' || type === 'top'
  // role/bet chips no longer render literal avoid text directly -- that's
  // now handled entirely by the single isAvoid/avoidLabel chip below, in
  // its own row and color, so it can't stack with the consolidated chip.
  const showRoleChip = role !== 'Skip HR'
  const showBetChip = !isAvoid && bet !== role

  // emoji stack — role, hrw, high confidence (weak-spot star is separate, see
  // below, so it can carry a tooltip). True Avoid's ⛔ already comes through
  // roleEmoji() since it's the first character of final_hr_role — pushing it
  // again here used to double it up. The softer "Be Careful" trap case
  // (best_bet_type === "Avoid for HR" without true_avoid_hr) is a different,
  // less severe situation and gets its own ⚠️ instead of borrowing ⛔.
  // DECLUTTER (2026-08-06, "make cleaner"): five emojis before a name
  // truncated the NAME — the one thing a card can't lose. Two emojis max,
  // the full stack lives in the tooltip.
  const emojisAll = []
  const hrw = hrwRead(p)
  if (hrw) emojisAll.push([hrw.glyph, hrw.title])
  if (p?.high_confidence_hr_flag === true) emojisAll.push(['🔒', 'high confidence'])
  if (Number(p?.pitch_type_match_score || 0) > 0) emojisAll.push(['🎯', 'pitch match'])
  if (isSoftCaution) emojisAll.push(['⚠️', 'HR caution'])
  const emojis = emojisAll.slice(0, 2).map(([e]) => e)
  const emojiTitle = emojisAll.map(([e, why]) => `${e} ${why}`).join(' · ')
  const { chipSpot, spotTitle } = useSpot()
  const spotStyle = chipSpot(p)
  const spotWhy = spotTitle(p)

  const weakSpotReason = p?.weak_spot_flag === true
    ? (p?.weak_spot_reason || 'Weak lineup spot vs this pitcher.')
    : null

  // THE CHIPS, AS ONE LIST (2026-10-12): the same chips in the same order as before, as an array, so a compact card can hold two rows
  // and say "+N" (RankCard ChipRows) while every other mount renders them exactly as it did. On a compact pick card the
  // "MOONSHOT's X Pick" chip is not drawn: the pick label is the card's own kicker line, in the slot's colour.
  const chipList = []
  if (showHrOverlay) {
    chipList.push(<span key="ov" title={hrOverlay.title}><Chip color={hrOverlay.color}>{hrOverlay.validated ? '✓ ' : ''}{hrOverlay.label}</Chip></span>)
  }
  if (gamePickLabel) {
    if (!(compact && kicker)) chipList.push(<Chip key="pick" color={C.yellow}>★ MOONSHOT&apos;s {gamePickLabel}</Chip>)
    if (aligned) chipList.push(<Chip key="al" color={C.purple}>🧩 Aligned</Chip>)
    if (recency) chipList.push(<Chip key="rec" color={recency.color}>{recency.label}</Chip>)
    pills.slice(0, 2).forEach((x, i) => chipList.push(<Chip key={`pl${i}`} color={x.color}>{x.label}</Chip>))
  } else {
    if (altLook) chipList.push(<Chip key="alt" color={altLook.color}>{altLook.label}</Chip>)
    // GLYPH HERE, TEXT IN TABLES (chosen 2026-08-14). A card has room and a
    // personality; a 25-column table has neither, and a pictograph's
    // unpredictable width is exactly what breaks a numeric column's
    // alignment. One glyph per tier, never stacked — which is the real
    // fix to the old problem, where a single card could carry a role
    // emoji, an HRW-zone emoji, a lock AND a target.
    const rt = roleTag(p)
    if (rt) chipList.push(<RoleTag key="rt" label={rt.label} color={rt.color} title={`${rt.label} — conviction tier: ${rt.tier}`} />)
    if (showRoleChip) chipList.push(<Chip key="role" color={color}>{role}</Chip>)
    if (showBetChip && bet !== role) chipList.push(<Chip key="bet" color={C.text2}>{bet}</Chip>)
    if (risk) chipList.push(<Chip key="risk" color={risk.color}>{risk.label}</Chip>)
    if (aligned) chipList.push(<Chip key="al" color={C.purple}>🧩 Aligned</Chip>)
    if (recency) chipList.push(<Chip key="rec" color={recency.color}>{recency.label}</Chip>)
    if (clean(p?.alt_look_tag, '')) chipList.push(<Chip key="altl" color={C.purple}>🔄 {clean(p.alt_look_tag)}</Chip>)
    if (isAvoid && !altLook) {
      chipList.push(<span key="avoid" title={gate ? gate.title : undefined}><Chip color={gate ? C.text3 : AVOID_COLOR}>{avoidLabel}</Chip></span>)
    }
    pills.slice(0, 2).forEach((x, i) => chipList.push(<Chip key={`pl${i}`} color={x.color}>{x.label}</Chip>))
  }

  // A HIGHLIGHT REACHES PLAYER CARDS NOW (2026-08-17). PlayerCard is the most
  // rendered hitter surface on the site — the boards, the Four, the top-tens,
  // Pitchers, the watchlist all draw it — and the highlight wash used to stop
  // at DenseTable rows, so a matching hitter looked identical to a
  // non-matching one everywhere except a table. Card already forwards `style`,
  // so this is one spread. See lib/spotlight.js's note above chipWashOf.
  return (
      <RankCard accent={accentColor || color} status={status} rankMove={rankMove} pos={clean(p?.handedness || p?.bats, '')} rank={rank} sport="mlb" club={teamOf(p) || null} name={nameOf(p)} opp={oppOf(p) || null}
        compact={compact} wide={wide} kicker={kicker} kickerPills={kickerPills}
        lockIn={{ key: `${playerId(p)}|${p?.game_pk ?? ''}`, time: p?.game_time, graded: p?.graded === true }}
        stampFor={compact && mlbId(p) && gameDayOf(p?.game_time) ? { sport: 'mlb', id: String(mlbId(p)), day: gameDayOf(p?.game_time) } : null}
        role={`${compact ? 'Bats ' : ''}${clean(p?.lineup_spot, '—')}${p?.lineup_confirmed === false ? ' (proj.)' : ''}`}
        face={<PlayerFace sport="mlb" id={mlbId(p)} team={teamOf(p)} name={nameOf(p)} variant="tile" size={compact ? 68 : 84} />}
        score={score.toFixed(0)} scoreWord="MOONSHOT" rankTags={grade ? [`GRADE ${grade}`] : []}
        explain={<>MOONSHOT&apos;s {type.toUpperCase()} score, 0–100 — its verdict, not a stat. The row below is where it comes from.</>}
        extraLine={<>

          {emojis.length > 0 && (
            <span
              onClick={(e) => { e.stopPropagation(); setOpenEmoji((v) => !v) }}
              style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, lineHeight: 1, letterSpacing: 1, flexShrink: 0, cursor: 'pointer' }}
            >
              {emojis.join('')}
              {/* THE GLYPH GETS ITS NUMBER (2026-08-22). The HRW band was five states carried entirely by a pictograph; two digits in
                  the band's own ramp colour, the value printed (see the note on lib/hrwBand.js). */}
              {hrw && hrw.score != null && (
                <span
                  title={hrw.title}
                  style={{ fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 800, color: hrw.color || C.text3, marginLeft: 1, lineHeight: 1 }}
                >{hrw.score.toFixed(0)}</span>
              )}
              <InfoDot on={openEmoji} onClick={() => setOpenEmoji((v) => !v)} />
            </span>
          )}
          {weakSpotReason && (
            <span
              onClick={(e) => { e.stopPropagation(); setOpenWeak((v) => !v) }}
              style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, lineHeight: 1, flexShrink: 0, cursor: 'pointer' }}
            >
              ⭐
              <InfoDot on={openWeak} onClick={() => setOpenWeak((v) => !v)} />
            </span>
          )}
        </>}
        chips={chipList}
        extraNotes={[openEmoji && emojiTitle, openWeak && <>⭐ {weakSpotReason}</>, openStat]}
        statsNode={compact
          ? <StatStrip p={p} type={type} count={4} cols={wide ? 4 : 2} tall wrap onPick={(t) => setOpenStat((cur) => (cur === t ? null : t))} />
          : <StatStrip p={p} type={type} count={4} />}
        back={{ rows: [], node: <SlashLine p={p} type={type} /> }}
        onClick={onClick} style={spotStyle} title={spotWhy || undefined}
        foot={<>

        <button
          onClick={(e) => { e.stopPropagation(); onAdd?.(p, bet) }}
          style={{
            flex: 1,
            background: `${color}22`,
            border: `1px solid ${color}66`,
            color,
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            ...(compact ? { minWidth: 0, whiteSpace: 'nowrap', padding: '6px 6px' } : null),
          }}
        >
          + Add to Slip
        </button>
        {onWatch && (
          <button
            onClick={(e) => { e.stopPropagation(); onWatch(p) }}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{
              background: watched ? `${C.yellow}22` : 'transparent',
              border: `1px solid ${watched ? C.yellow + '66' : C.border2}`,
              color: watched ? C.yellow : C.text3,
              borderRadius: 8,
              padding: '6px 9px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {watched ? '★' : '☆'}
          </button>
        )}
        </>} />
  )
}
