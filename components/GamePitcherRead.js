'use client'
import { C, NUM_FONT } from '../lib/theme'
import { n, clean } from '../lib/player'
import { alpha, verdictInk } from '../lib/scales'
import { Dial } from './VerdictHero'

// ══ THE TWO ARMS, IN WORDS, ON THE GAME ═════════════════════════════════════
//
// Donovan, 2026-08-23: "i also talke about the words for the pitcher and watch
// stats i wanted to be shown for thethem."
//
// The Games tab already carried both starters — as a name, an ERA and an HR/9
// on the card's meta line. Three numbers with no sentence around them is the
// exact complaint the mobile users made about the whole site: you reach the
// numbers and the numbers do not make the decision. The pitcher modal answers
// it for ONE arm at a time and costs a tap plus a page; the game is where you
// are actually deciding, and both arms belong there.
//
// So each side of the open game gets the same block the pitcher modal opens
// with, at game scale: the attack dial, the arm, ONE sentence, and the four
// stats worth watching on him.
//
// THE DIAL IS NOT OUT OF 100, and that is deliberate — the same note as
// PitcherModal. `pitcher_attack_score` is not a board score;
// MatchupPitcher.js has it measured at 0–53.9 with a median of 19.5, and the
// 08-22 slate agrees (30 starters: 1.8 low, 17.8 median, 66.9 high). Drawn
// against 100 a genuinely leaky arm fills a fifth of the ring and reads as
// harmless. It fills against a stated 55; the printed number is the real one.
//
// EVERY CLAUSE IS A PUBLISHED FIELD. A stat the bot did not publish drops out
// of the sentence rather than printing a zero, and an arm with nothing
// published says so instead of drawing an empty instrument.

const pctText = (v) => (v == null ? null : `${(v * 100).toFixed(0)}%`)

function WatchTile({ label, value, tone }) {
  const col = tone === 'hot' ? C.orange : tone === 'cold' ? C.blue : C.text
  return (
    <span style={{
      flex: 1, minWidth: 0, textAlign: 'center', padding: '5px 3px', borderRadius: 10,
      border: `1px solid ${tone ? alpha(col, 0.4) : C.border}`,
      background: tone ? alpha(col, 0.07) : C.glass,
    }}>
      <span style={{
        display: 'block', fontSize: 7.5, fontWeight: 800, letterSpacing: '.09em',
        color: C.text3, fontFamily: NUM_FONT,
      }}>{label}</span>
      <span style={{
        display: 'block', fontSize: 12, fontWeight: 800, fontFamily: NUM_FONT, color: col,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{value}</span>
    </span>
  )
}

function ArmCard({ side }) {
  const r = side?.lineup?.[0] || {}
  const arm = clean(side?.arm || r?.pitcher_name, 'TBD')
  const throws = clean(side?.throws || r?.pitcher_throws, '')
  const attack = n(r?.pitcher_attack_score, null)
  const tag = clean(r?.pitcher_attack_tag, '')
  const hr9 = n(r?.pitcher_hr9, null)
  const era = n(r?.pitcher_era, null)
  const whip = n(r?.pitcher_whip, null)
  const k9 = n(r?.pitcher_k9, null)
  const brl = n(r?.pitcher_barrel_allowed, null)
  const fb = n(r?.pitcher_fb_rate, null)
  const weak = clean(r?.pitcher_weak_side, '')

  // Warm = good for the BATS, the site-wide verdict pair. 30+ is the
  // "genuinely high" line MatchupPitcher.js already draws on this same field;
  // 12 and under is the bottom fifth of a slate's starters.
  const ink = verdictInk(attack == null ? null : attack >= 30 ? true : attack <= 12 ? false : null)
  const col = ink.color

  const words = (() => {
    const bits = []
    if (hr9 != null) bits.push(`${hr9.toFixed(2)} HR/9`)
    if (brl != null) bits.push(`${pctText(brl)} barrels`)
    if (fb != null) bits.push(`${pctText(fb)} fly balls`)
    if (weak) bits.push(`weakest vs ${weak}`)
    if (!bits.length) return 'No season line published for this arm yet.'
    const lead = attack == null ? ''
      : attack >= 30 ? 'A live window for the bats — '
      : attack <= 12 ? 'A hard arm to attack — '
      : ''
    return `${lead}${bits.join(' · ')}.`
  })()

  // Thresholds are the starter table's own documented slate means, the same
  // ones the pitcher modal's tiles use — so a number cannot be "hot" here and
  // neutral one tap away.
  const tiles = [
    { label: 'HR/9', value: hr9 == null ? '—' : hr9.toFixed(2), tone: hr9 == null ? null : hr9 >= 1.3 ? 'hot' : hr9 <= 0.85 ? 'cold' : null },
    { label: 'ERA', value: era == null ? '—' : era.toFixed(2), tone: era == null ? null : era >= 5 ? 'hot' : era <= 3.2 ? 'cold' : null },
    { label: 'WHIP', value: whip == null ? '—' : whip.toFixed(2), tone: whip == null ? null : whip >= 1.4 ? 'hot' : whip <= 1.1 ? 'cold' : null },
    { label: 'K/9', value: k9 == null ? '—' : k9.toFixed(1), tone: k9 == null ? null : k9 <= 7 ? 'hot' : k9 >= 9.5 ? 'cold' : null },
  ]

  return (
    <div style={{
      flex: '1 1 260px', minWidth: 0, borderRadius: 14, padding: '11px 12px',
      border: `1px solid ${alpha(col, 0.24)}`,
      background: `linear-gradient(158deg, ${alpha(col, 0.11)}, ${C.bg2} 56%)`,
      display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <Dial
          value={attack}
          col={col}
          size={48}
          max={55}
          dp={attack != null && attack < 10 ? 1 : 0}
          title={`Attack score ${attack == null ? '—' : attack.toFixed(1)} — how much this arm gives the bats. The slate runs about 0–55 with a median near 18, and the ring is drawn against 55, not 100.`}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 900, letterSpacing: '-.01em', minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{arm}{throws ? <span style={{ color: C.text3, fontWeight: 700, fontSize: 10 }}> {throws}HP</span> : null}</div>
          <div style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT, marginTop: 2 }}>
            the arm {side?.team || '—'} bats face
            {side?.projected ? ' · projected' : ''}
            {side?.stars ? ` · ${side.stars} ★ weak spot${side.stars === 1 ? '' : 's'}` : ''}
          </div>
          {tag && tag !== 'Neutral' && (
            <div style={{
              display: 'inline-block', marginTop: 4, fontSize: 8, fontWeight: 900,
              letterSpacing: '.06em', padding: '2px 7px', borderRadius: 999,
              color: col, border: `1px solid ${alpha(col, 0.5)}`, background: alpha(col, 0.1),
            }}>{tag}</div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.5 }}>{words}</div>

      <div style={{ display: 'flex', gap: 6 }}>
        {tiles.map((t) => <WatchTile key={t.label} {...t} />)}
      </div>
    </div>
  )
}

export default function GamePitcherRead({ sides = [] }) {
  const usable = sides.filter((s) => s && (s.lineup || []).length)
  if (!usable.length) return null
  return (
    <div style={{ padding: '0 12px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 9px' }}>
        <span style={{
          fontSize: 9, fontWeight: 900, letterSpacing: '.14em', textTransform: 'uppercase',
          color: C.text3, whiteSpace: 'nowrap',
        }}>the arms · what to watch</span>
        <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
        <span style={{ fontSize: 8.5, color: C.text3 }}>warm = good for the bats</span>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {usable.map((s) => <ArmCard key={s.team} side={s} />)}
      </div>
    </div>
  )
}
