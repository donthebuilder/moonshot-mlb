'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// 📖 GLOSSARY-ON-TAP (2026-08-09).
//
// THE PROBLEM THIS SOLVES, stated plainly because it is not obvious from the
// code: every explanation on this site lives in a `title=` attribute, and a
// title attribute is a HOVER tooltip. Touch devices have no hover. So on a
// phone — which is where the owner's Discord says people actually read this —
// literally every explanation we have written is invisible. That is most of
// "too much info and numbers and not knowing what it means": the numbers are
// all there and none of the words are.
//
// The fix is a tap target, not more prose. A stat label gets a small ⓘ; tap it
// and one plain-English line appears under the label. Tap again and it goes.
// No modal, no drawer, no second page — the explanation arrives exactly where
// the confusion is.
//
// WHO THE TEXT IS WRITTEN FOR: someone who has never heard of Statcast. Not
// "Barrel% — batted balls with the optimal EV/LA combination". That sentence
// is for people who already know. These say what the number means about the
// hitter and which direction is good, in the words you'd use out loud.
//
// Rules for anything added here:
//   · one sentence, then "Higher is better" / "Lower is better" if it applies
//   · no jargon inside the definition of the jargon
//   · never claim a number is predictive; say what it measures

export const GLOSSARY = {
  // ── the board scores ──────────────────────────────────────────────────
  'hr': 'The bot’s 0–100 rating of how likely this hitter is to hit a home run tonight. Higher is better.',
  'hr score': 'The bot’s 0–100 rating of how likely this hitter is to hit a home run tonight. Higher is better.',
  'hrr': 'A 0–100 rating for scoring a run or driving one in — not just homers. Higher is better.',
  'hrr score': 'A 0–100 rating for scoring a run or driving one in — not just homers. Higher is better.',
  'hit': 'A 0–100 rating of how likely he is to get at least one base hit. Higher is better.',
  'hit score': 'A 0–100 rating of how likely he is to get at least one base hit. Higher is better.',
  'tb': 'Total bases — a 0–100 rating for piling up bases (a double is 2, a homer is 4). Higher is better.',
  'tb score': 'Total bases — a 0–100 rating for piling up bases (a double is 2, a homer is 4). Higher is better.',
  'hrw': 'HR Watch — the bot’s separate “he looks due to go deep” read. Higher is better.',
  'due': 'How long it has been since his last home run, scored. High means he is overdue — which is a story, not a guarantee.',
  'long': 'How likely he is to hit the LONGEST ball of the night, not just any homer. Higher is better.',
  'longest': 'How likely he is to hit the LONGEST ball of the night, not just any homer. Higher is better.',
  'damage': 'When he does hit the ball hard, how often that turns into real damage instead of an out. Higher is better.',
  'pmatch': 'How well his swing matches the exact pitches tonight’s starter throws. Higher is better.',
  'pmix': 'Same idea as PMatch, scored across the starter’s whole pitch mix. Higher is better.',
  'pitch mix': 'How well his swing matches the pitches tonight’s starter actually throws. Higher is better.',
  'score': 'The bot’s 0–100 rating for this board’s question. Higher is better.',
  'fit': 'How well this hitter fits what the board is looking for tonight. Higher is better.',

  // ── contact quality ───────────────────────────────────────────────────
  'barrel %': 'How often he hits the ball at the perfect speed AND angle — the combination that turns into homers. Higher is better.',
  'barrel%': 'How often he hits the ball at the perfect speed AND angle — the combination that turns into homers. Higher is better.',
  'barrel': 'How often he hits the ball at the perfect speed AND angle — the combination that turns into homers. Higher is better.',
  'hard hit %': 'How often he hits the ball at least 95 mph. Hard contact is the thing you can control; hits are partly luck. Higher is better.',
  'hard hit%': 'How often he hits the ball at least 95 mph. Hard contact is the thing you can control; hits are partly luck. Higher is better.',
  'avg ev': 'Average exit velocity — how fast the ball leaves his bat, in mph. Roughly 88 is average, 92+ is strong. Higher is better.',
  'max ev': 'The hardest ball he has hit all year, in mph. It shows his ceiling, not his habit.',
  'launch angle': 'The average angle he hits the ball into the air. Around 12–20° is the homer window; near 0° means ground balls.',
  'ihr': 'Ideal HR contact — the share of his batted balls hit at both the speed and the angle homers come from. Higher is better.',
  'ideal hr %': 'The share of his batted balls hit at both the speed and the angle homers come from. Higher is better.',
  '350+ count': 'How many balls he has hit at least 350 feet recently. A count, not a rate.',
  '375+ count': 'How many balls he has hit at least 375 feet recently — roughly warning-track depth.',
  '400+ count': 'How many balls he has hit at least 400 feet recently. These are the no-doubt ones.',
  '375+': 'How many balls he has hit at least 375 feet recently — roughly warning-track depth.',

  // ── swing and miss ────────────────────────────────────────────────────
  'whiff %': 'How often he swings and misses completely. A high number means he strikes out a lot. Lower is better for the hitter.',
  'whiff%': 'How often he swings and misses completely. A high number means he strikes out a lot. Lower is better for the hitter.',
  'whiff': 'How often he swings and misses completely. A high number means he strikes out a lot. Lower is better for the hitter.',
  'swstr %': 'Swinging strikes as a share of EVERY pitch he sees, not just the ones he swings at. Lower is better for the hitter.',
  'swstr%': 'Swinging strikes as a share of EVERY pitch he sees, not just the ones he swings at. Lower is better for the hitter.',
  'k%': 'Strikeout rate — how often his trips to the plate end in a strikeout. Lower is better for the hitter.',
  'k rate': 'Strikeout rate — how often his trips to the plate end in a strikeout. Lower is better for the hitter.',
  'k risk': 'Our combined read on how likely he is to strike out tonight, given this pitcher. Lower is better for the hitter.',

  // ── the pitcher he faces ──────────────────────────────────────────────
  'p hr/9': 'Home runs this starter gives up per 9 innings. Above about 1.3 is a pitcher who gets taken deep. Higher is better for the hitter.',
  'hr/9': 'Home runs this starter gives up per 9 innings. Above about 1.3 is a pitcher who gets taken deep. Higher is better for the hitter.',
  'whip': 'Runners this pitcher allows per inning. Above about 1.30 means traffic on the bases. Higher is better for the hitter.',
  'p375 ag': 'How many balls of 375+ feet this starter has already allowed this year. Higher is better for the hitter.',
  'p400 ag': 'How many balls of 400+ feet this starter has already allowed this year. Higher is better for the hitter.',
  'p-babip': 'How often balls hit against this pitcher fall in for hits. Very high often means he has been unlucky, not bad.',
  'babip': 'How often his balls in play fall in for hits. Well above .300 usually means he has been lucky; well below, unlucky.',
  'throws': 'Which hand the pitcher throws with. Hitters generally do better against the opposite hand.',
  'weak side': 'The batting side this pitcher struggles against. If it matches how this hitter bats, that is a point in his favour.',

  // ── tonight’s conditions ──────────────────────────────────────────────
  'park': 'How much this ballpark helps home runs. 1.00 is neutral; ×1.10 means about 10% more homers than an average park.',
  'park factor': 'How much this ballpark helps home runs. 1.00 is neutral; ×1.10 means about 10% more homers than an average park.',
  'gs': 'Game Score — how dangerous the whole lineup in this game looks tonight, not one hitter. Higher is better.',
  'spot': 'Where he bats in the order, 1 through 9. Batting higher means more trips to the plate.',
  'role': 'Which category the bot designated him in tonight — its HR pick, hit pick, and so on.',

  // ── season / recent form ──────────────────────────────────────────────
  'avg': 'Batting average — hits divided by at-bats. .250 is about average, .300 is very good.',
  'pa': 'Plate appearances — how many times he has come to bat this season. It tells you how big the sample is.',
  'ops': 'On-base plus slugging, the quick all-round hitting number. .800 is good, .900+ is excellent.',
  'l5 hits': 'Hits over his last five games — recent form, nothing more.',
  'l5 hr': 'Home runs over his last five games.',
  'l5 xbh': 'Extra-base hits (doubles, triples, homers) over his last five games.',
  'vs rhp': 'His batting average against right-handed pitchers.',
  'vs lhp': 'His batting average against left-handed pitchers.',

  // ── flags ─────────────────────────────────────────────────────────────
  '★': 'A weak spot: this pitcher gets hit hard by the batting-order slot this hitter is standing in.',
  '◆': 'Aligned: the weak spot, the pitch match and his recent hard contact all agree. The rare all-three.',
  '▲': 'Matchup edge: this pitcher struggles against the side this hitter bats from.',
}

// Normalised lookup. Labels arrive with arrows, percent signs, casing and the
// odd emoji, so everything is lowercased and stripped before matching.
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[▾▴↓↑]/g, '')
  .replace(/\s+/g, ' ')
  .trim()

export function explainFor(...keys) {
  for (const k of keys) {
    if (!k) continue
    const key = norm(k)
    if (GLOSSARY[key]) return GLOSSARY[key]
    // "Barrel %" ↔ "barrel%" ↔ "barrel"
    const tight = key.replace(/\s/g, '')
    if (GLOSSARY[tight]) return GLOSSARY[tight]
    const bare = key.replace(/[%\s]/g, '')
    if (GLOSSARY[bare]) return GLOSSARY[bare]
  }
  return null
}

// The ⓘ itself. Deliberately its own tiny component so the tap target can be
// padded out to something a thumb can hit without moving the label.
export function InfoDot({ on, onClick, color }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="What does this mean?"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick() }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onClick() } }}
      className="explain-dot"
      style={{
        cursor: 'pointer', userSelect: 'none', marginLeft: 3,
        fontSize: 9.5, lineHeight: 1, verticalAlign: 'baseline',
        color: on ? (color || C.orange) : C.text3,
        opacity: on ? 1 : 0.75,
      }}
    >ⓘ</span>
  )
}

/**
 * Explain — a stat label you can tap for a plain-English line.
 *
 *   <Explain label="Barrel %" />                    // looks itself up
 *   <Explain label="Fit" term="score" />            // explicit glossary key
 *   <Explain label="Edge" text="…custom line…" />   // one-off, no glossary
 *
 * Renders nothing extra when there is no explanation to give, so it is safe
 * to wrap a label whether or not the glossary knows about it.
 */
export default function Explain({ label, term, text, color, style }) {
  const [open, setOpen] = useState(false)
  const line = text || explainFor(term, label)
  if (!line) return <>{label}</>
  return (
    <span style={{ display: 'inline-block', minWidth: 0, ...style }}>
      <span>{label}</span>
      <InfoDot on={open} color={color} onClick={() => setOpen((v) => !v)} />
      {open && (
        <span style={{
          display: 'block', marginTop: 3, maxWidth: 260,
          fontSize: 10, lineHeight: 1.5, fontWeight: 500,
          color: C.text2, fontFamily: 'inherit',
          background: 'rgba(249,115,22,.07)',
          border: `1px solid rgba(249,115,22,.28)`,
          borderRadius: 7, padding: '5px 8px', whiteSpace: 'normal',
        }}>{line}</span>
      )}
    </span>
  )
}

/**
 * ExplainBanner — the table version. A dense table header cell has no room to
 * grow a paragraph (and its click already sorts), so the ⓘ in a header opens
 * the explanation in a banner ABOVE the table instead, where there is width.
 */
export function ExplainBanner({ label, text, onClose }) {
  if (!text) return null
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.3)',
      borderRadius: 9, padding: '7px 10px', marginBottom: 7,
    }}>
      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT, color: C.orange, flexShrink: 0, letterSpacing: '.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 11, lineHeight: 1.5, color: C.text2, minWidth: 0 }}>{text}</span>
      <span
        onClick={onClose}
        style={{ marginLeft: 'auto', cursor: 'pointer', color: C.text3, fontSize: 13, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}
      >✕</span>
    </div>
  )
}
