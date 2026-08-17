'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { useSpot } from '../lib/spotlight'
import { nameOf, teamOf, oppOf, clean } from '../lib/player'
import { compactRole, roleColor, scoreFor, gradeFor, signalPills, riskPill, bestBet } from '../lib/scoring'
import { roleBadge } from '../lib/roleBadge'
import { hrGateVerdict } from '../lib/hrGate'
import { Chip, Card, RoleTag } from './ui'
import StatStrip, { SlashLine } from './StatStrip'
import { InfoDot } from './Explain'

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
  if (n === 0) return { label: '🔁 HR last gm', color: '#f87171' }
  if (n < 60) return { label: `${n}g`, color: n <= 5 ? '#FCD34D' : '#71717a' }
  return { label: 'No HR', color: '#52525b' }
}

const HRW_EMOJI = {
  volatile_hot:  '🌋',
  strong_capped: '🚀',
  sweet_spot:    '⚡',
  watch:         '🌤️',
  cold:          '🧊',
}

// WAS: pulled the leading pictograph off final_hr_role and rendered it as the
// badge — emoji-as-UI in its purest form, and the reason the card's tier was
// unreadable at a glance for anyone who didn't already know the glyph key.
// The tier is now a word with a colour, resolved off a semantic token so it
// survives the bot changing its string format. See lib/roleBadge.js.
function roleTag(p) {
  const b = roleBadge(p?.final_hr_role, C)
  return b.known ? b : null
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

export default function PlayerCard({ p, type = 'hr', onAdd, onWatch, watched, onClick }) {
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
  const pills     = signalPills(p, C, type)
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
  const hrwE = HRW_EMOJI[(p?.hrw_zone || '').trim()]
  if (hrwE) emojisAll.push([hrwE, 'HRW zone'])
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

  // A HIGHLIGHT REACHES PLAYER CARDS NOW (2026-08-17). PlayerCard is the most
  // rendered hitter surface on the site — the boards, the Four, the top-tens,
  // Pitchers, the watchlist all draw it — and the highlight wash used to stop
  // at DenseTable rows, so a matching hitter looked identical to a
  // non-matching one everywhere except a table. Card already forwards `style`,
  // so this is one spread. See lib/spotlight.js's note above chipWashOf.
  return (
    <Card color={color + '55'} onClick={onClick} style={spotStyle} title={spotWhy || undefined}>

      {/* name + score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 7 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
            {/* emoji stack — no labels, no border, just emojis + a tap dot */}
            {emojis.length > 0 && (
              <span
                onClick={(e) => { e.stopPropagation(); setOpenEmoji((v) => !v) }}
                style={{ display: 'inline-flex', alignItems: 'center', fontSize: 14, lineHeight: 1, letterSpacing: 1, flexShrink: 0, cursor: 'pointer' }}
              >
                {emojis.join('')}
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
            {/* NAME FITS (2026-08-08): "Freddie Freem…" is not a name. Long
                names step the font down instead of losing letters, and the
                full name always rides in the tooltip as a backstop. */}
            <span title={nameOf(p)} style={{
              fontWeight: 900,
              fontSize: String(nameOf(p) || '').length > 18 ? 11.5 : String(nameOf(p) || '').length > 14 ? 12.5 : 14,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
            }}>
              {nameOf(p)}
            </span>
          </div>
          <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
            {teamOf(p) || '—'} vs {oppOf(p) || '—'} · {clean(p?.lineup_spot, '—')}{p?.lineup_confirmed === false ? <span style={{ color: C.text3 }}> (proj.)</span> : null} · {clean(p?.handedness || p?.bats, '—')}
          </div>
        </div>
        {/* THE SCORE, DEMOTED (2026-08-09). It used to be 22px and the first
            thing your eye hit — a 0–100 number the reader has no independent
            handle on. It is still here, still the bot's verdict, but it now
            sits as a badge beside the stats that earned it. Nothing was
            removed; the reading order changed. */}
        <div
          onClick={(e) => { e.stopPropagation(); setOpenScore((v) => !v) }}
          style={{
            textAlign: 'center', flexShrink: 0, cursor: 'pointer',
            border: `1px solid ${color}44`, background: `${color}10`,
            borderRadius: 8, padding: '3px 8px 4px',
          }}>
          <div style={{ fontSize: 7.5, letterSpacing: '.08em', color: C.text3, fontFamily: NUM_FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            BOT<InfoDot on={openScore} onClick={() => setOpenScore((v) => !v)} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color, lineHeight: 1.1, fontFamily: NUM_FONT }}>{score.toFixed(0)}</div>
          <div style={{ fontSize: 8, color: C.text3 }}>{grade}</div>
        </div>
      </div>

      {/* tap-opened explanations for the header row above — one shared strip
          so three dots don't mean three different popovers to hunt for. */}
      {(openEmoji || openWeak || openScore) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 7, marginTop: -3 }}>
          {openEmoji && (
            <div style={{
              fontSize: 10, lineHeight: 1.5, color: C.text2,
              background: 'rgba(249,115,22,.07)', border: '1px solid rgba(249,115,22,.28)',
              borderRadius: 7, padding: '5px 8px',
            }}>{emojiTitle}</div>
          )}
          {openWeak && (
            <div style={{
              fontSize: 10, lineHeight: 1.5, color: C.text2,
              background: 'rgba(249,115,22,.07)', border: '1px solid rgba(249,115,22,.28)',
              borderRadius: 7, padding: '5px 8px',
            }}>⭐ {weakSpotReason}</div>
          )}
          {openScore && (
            <div style={{
              fontSize: 10, lineHeight: 1.5, color: C.text2,
              background: 'rgba(249,115,22,.07)', border: '1px solid rgba(249,115,22,.28)',
              borderRadius: 7, padding: '5px 8px',
            }}>The bot&apos;s {type.toUpperCase()} score, 0–100 — its verdict, not a stat. The row below is where it comes from.</div>
          )}
        </div>
      )}

      {/* ONE chip row (2026-08-06). Designated pick cards were wearing every
          chip family at once — role + bet + risk + aligned + pick + recency +
          three pills, with a HIT pick showing "Avoid for HR" two lines under
          its own badge. Rule now: a designated card leads with its ONE job
          (the pick chip), keeps recency and its two strongest signals, and
          drops everything that restates the ring or contradicts the job —
          cross-market avoid verdicts included (they never applied to the
          card's own category anyway). Undesignated cards keep the fuller
          read, but in a single row. */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {gamePickLabel ? (
          <>
            <Chip color={C.yellow}>★ Bot&apos;s {gamePickLabel}</Chip>
            {aligned && <Chip color={C.purple}>🧩 Aligned</Chip>}
            {recency && <Chip color={recency.color}>{recency.label}</Chip>}
            {pills.slice(0, 2).map((x, i) => <Chip key={i} color={x.color}>{x.label}</Chip>)}
          </>
        ) : (
          <>
            {altLook && <Chip color={altLook.color}>{altLook.label}</Chip>}
            {(() => {
              const rt = roleTag(p)
              // GLYPH HERE, TEXT IN TABLES (chosen 2026-08-14). A card has room and a
              // personality; a 25-column table has neither, and a pictograph's
              // unpredictable width is exactly what breaks a numeric column's
              // alignment. One glyph per tier, never stacked — which is the real
              // fix to the old problem, where a single card could carry a role
              // emoji, an HRW-zone emoji, a lock AND a target.
              return rt ? <RoleTag label={rt.label} color={rt.color} glyph={rt.glyph} title={`Bot conviction tier: ${rt.label}`} /> : null
            })()}
            {showRoleChip && <Chip color={color}>{role}</Chip>}
            {showBetChip && !gamePickLabel && bet !== role && <Chip color={C.text2}>{bet}</Chip>}
            {risk && <Chip color={risk.color}>{risk.label}</Chip>}
            {aligned && <Chip color={C.purple}>🧩 Aligned</Chip>}
            {recency && <Chip color={recency.color}>{recency.label}</Chip>}
            {clean(p?.alt_look_tag, '') && <Chip color={C.purple}>🔄 {clean(p.alt_look_tag)}</Chip>}
            {isAvoid && !altLook && (
              <span title={gate ? gate.title : undefined}>
                <Chip color={gate ? C.text3 : AVOID_COLOR}>{avoidLabel}</Chip>
              </span>
            )}
            {pills.slice(0, 2).map((x, i) => <Chip key={i} color={x.color}>{x.label}</Chip>)}
          </>
        )}
      </div>

      {/* STATS FIRST (2026-08-09). This was "BA · HR · K" in 10px grey — the
          same three season numbers for a 40-homer bat and a leadoff slap
          hitter, in the colour we use for things that don't matter. It is now
          the four stats that actually drive THIS market, each coloured
          against tonight's slate. The old line survives underneath as the
          fine print it always was. */}
      <StatStrip p={p} type={type} count={4} style={{ marginBottom: 7 }} />
      {/* The old row was five unrelated numbers in grey — and two of them
          (BABIP, the opposing arm's HR/9) weren't even about his season. It's
          the slash line now, plus the counting stats it never had room for. */}
      <SlashLine p={p} type={type} style={{ marginBottom: 8 }} />

      {/* buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
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
      </div>
    </Card>
  )
}
