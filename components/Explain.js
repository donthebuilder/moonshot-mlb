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

// ── A SCORE IS A RANK, NOT A PERCENTAGE (2026-08-09) ────────────────────────
//
// Every board score on this site is an ORDERING. A 78 means "ahead of the 62",
// and nothing more. It is not a 78% chance of anything, and the archive is
// blunt about the real numbers: the headline picks homer about 29% of the time
// — good, and still wrong two nights in three.
//
// The definitions below used to open with "how LIKELY this hitter is to hit a
// home run", which reads as a probability to anybody who isn't already inside
// the model. That wording sat in the dictionary feeding EVERY ⓘ, every table
// header hover and the explain banner, so one loose sentence was making the
// same false promise on a dozen surfaces at once.
//
// The only genuine predictions on the site are the Proj HR / Adj HR columns in
// ProjectedOutput, which are expected COUNTS built from measured band rates.
// Those say so themselves. Everything else ranks.
//
// RANK_NOT_PERCENT is appended by the explain banner to any score term, so the
// caveat travels with the definition instead of relying on whoever writes the
// next component to remember it.
export const RANK_NOT_PERCENT =
  'This is a ranking, not a percentage — a 78 sits above a 62, it is not a 78% chance. '
  + 'The bot’s headline picks homer about 29% of the time.'

// Terms that get RANK_NOT_PERCENT attached automatically.
export const SCORE_TERMS = new Set([
  'hr', 'hr score', 'hrr', 'hrr score', 'hit', 'hit score', 'tb', 'tb score',
  'hrw', 'due', 'long', 'longest', 'damage', 'pmatch', 'pmix', 'pitch mix',
  'score', 'fit', 'adj', 'raw', 'ovr', 'overall', 'leak', 'leak score',
])

export const GLOSSARY = {
  // ── the board scores ──────────────────────────────────────────────────
  // Each one says WHAT IT RANKS ON and which way is good. None of them claims
  // a chance of anything; the banner adds RANK_NOT_PERCENT on top.
  'hr': 'Ranks the slate on how good tonight looks for him to go deep — his power, the arm he faces, the park and the weather. Higher ranks better.',
  'hr score': 'Ranks the slate on how good tonight looks for him to go deep — his power, the arm he faces, the park and the weather. Higher ranks better. Measured against 14 graded nights: the top 20 of this board homered 24.6% against 16.8% for a random 20 off the same slate, so the ordering is doing real work. Sorting by raw power alone did worse (21.8%).',
  'hits': 'Every base hit by every hitter on tonight’s slate, added up as the games go.',
  'vs typical': 'The league averages 16.4 hits per game this season, so the yardstick is that number times the games actually under way. It scales with the slate — a nine-game Thursday is not supposed to look like a fifteen-game Sunday.',
  'hits vs typical': 'Tonight’s hits against what a slate this size usually produces. The league averages 16.4 hits per game, so the yardstick grows as more games start. Orange means the bats are loud, blue means quiet.',
  'hrr': 'Ranks him on scoring a run or driving one in, not just homers. Higher ranks better.',
  'hrr score': 'Ranks him on scoring a run or driving one in, not just homers. Higher ranks better.',
  'hit': 'Ranks him on getting at least one base hit tonight. Higher ranks better.',
  'hit score': 'Ranks him on getting at least one base hit tonight. Higher ranks better.',
  'tb': 'Total bases — ranks him on piling up bases (a double is 2, a homer is 4). Higher ranks better.',
  'tb score': 'Total bases — ranks him on piling up bases (a double is 2, a homer is 4). Higher ranks better.',
  'hrw': 'HR Watch — the bot’s separate “he looks due to go deep” read, ranked. Higher ranks better.',
  'due': 'How long it has been since his last home run, scored. High means overdue — which is a story, not a reason.',
  'long': 'Ranks him on hitting the LONGEST ball of the night, which is a different question from hitting any homer. Higher ranks better.',
  'longest': 'Ranks him on hitting the LONGEST ball of the night, which is a different question from hitting any homer. Higher ranks better.',
  'damage': 'When he does hit the ball hard, how often that turns into real damage instead of an out. Higher ranks better.',
  'pmatch': 'How well his swing matches the exact pitches tonight’s starter throws. Higher ranks better.',
  'pmix': 'Same idea as PMatch, scored across the starter’s whole pitch mix. Higher ranks better.',
  'pitch mix': 'How well his swing matches the pitches tonight’s starter actually throws. Higher ranks better.',
  'score': 'The bot’s rating for this board’s question — an ordering of tonight’s hitters. Higher ranks better.',
  'fit': 'How well this hitter fits what the board is looking for tonight. Higher ranks better.',
  'leak': 'Ranks tonight’s starters on how likely they are to give up a homer, against each other rather than the league. Higher means easier to take deep.',
  'leak score': 'Ranks tonight’s starters on how likely they are to give up a homer, against each other rather than the league. Higher means easier to take deep.',
  'proj hr': 'The one real PREDICTION on the site: expected home runs, from the rate his score band and ISO band actually produced across the graded archive. Not a rank — a count.',


  // ── THE COVERAGE GAP (2026-08-09 survey) ──────────────────────────────
  // A sweep of every DenseTable column found 214 of 699 resolving to an entry
  // here — so two thirds of the numbers on this site had no explanation a
  // thumb could reach. These are the labels that came back most often, in the
  // order they came back. Same rules as everything above: one sentence, no
  // jargon inside the definition of the jargon, say which way is good.
  'tm': 'Team — his club’s three-letter code.',
  'team': 'Team — his club’s three-letter code.',
  'opp': 'Opponent — the club he is facing tonight.',
  'facing': 'The starting pitcher he is up against tonight.',
  'pitcher': 'The starting pitcher he is up against tonight.',
  'batter': 'The hitter this row is about.',
  'player': 'The hitter this row is about.',
  'pair': 'The two hitters in this combination. Both have to deliver for the pair to pay.',
  'ev': 'Exit velocity — how fast the ball leaves his bat, in mph. About 88 is average, 92+ is strong. Higher is better.',
  'iso': 'Isolated power — slugging minus batting average. What is left when you take the singles out, so it measures extra-base pop and nothing else. Roughly .140 is average, .230+ is real power. Higher is better.',
  'hh%': 'Hard-hit rate — the share of his batted balls leaving the bat at 95 mph or more. Higher is better.',
  'hh': 'Hard-hit rate — the share of his batted balls leaving the bat at 95 mph or more. Higher is better.',
  'brl%': 'Barrel rate — how often he hits the ball at the speed AND angle that produce home runs. Higher is better.',
  'brl': 'Barrel rate — how often he hits the ball at the speed AND angle that produce home runs. Higher is better.',
  'slg': 'Slugging percentage — total bases per at-bat. Around .400 is average, .500+ is strong. Higher is better.',
  'ba': 'Batting average — hits per at-bat. Higher is better.',
  'obp': 'On-base percentage — how often he reaches base at all, walks included. Higher is better.',
  'bbe': 'Batted-ball events — how many balls he has actually put in play. This is the SAMPLE behind the rates beside it; a small number means treat those rates lightly.',
  'dc': 'Damage conversion — when he does square one up, how often it becomes real damage instead of an out. Higher is better.',
  'rbi': 'Runs batted in — runners who scored because of his at-bat.',
  'l5': 'His last 5 games.',
  'l10': 'His last 10 games.',
  'l20': 'His last 20 games.',
  'last': 'His most recent game.',
  'ab': 'At-bats — plate appearances not counting walks and hit-by-pitches.',
  'b': 'Which side he bats from: R right-handed, L left-handed, S both.',
  'bb%': 'Walk rate — how often he takes a walk.',
  'gb%': 'Ground-ball rate. A ball on the ground cannot leave the yard, so lower is better for power.',
  'fb%': 'Fly-ball rate — the share of his contact hit in the air. Air is where homers come from. Higher is better for power.',
  'ld%': 'Line-drive rate — the batted-ball type that falls for hits most often. Higher is better.',
  'pull%': 'Pull rate — how often he hits it to his own side of the field, where the fence is usually shortest. Higher is better for power.',
  'era': 'Earned run average — runs the pitcher allows per nine innings. For your hitter, higher is better.',
  'k/9': 'Strikeouts the pitcher gets per nine innings. High means he misses bats, which is bad for your hitter.',
  // NOT 'whiff%' — that key already means the HITTER's swing-and-miss rate
  // further down, and a silent duplicate would have let the last one
  // written win on a pitcher table. The arm gets its own key.
  'p whiff%': 'How often hitters swing and miss against this pitcher. High is bad for your hitter.',
  'xhr': 'Expected home runs from the contact he has actually allowed — what the balls hit off him should have produced. Compare it with his real total to see who has been lucky.',
  'xwoba': 'Expected wOBA — what his contact quality alone says he should be producing, before luck and defense. Higher is better.',
  'woba': 'Weighted on-base average — one number for total offensive value, weighting a homer above a single. Higher is better.',
  'n': 'Sample size — how many events this rate is built on. A rate on fewer than about 20 is a hint, not a finding.',
  'when picked': 'His record the other times the bot designated him in this category. A rate at 3 or more picks; a raw fraction under that.',

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
  // THE CAVEAT TRAVELS WITH THE TERM. Attaching RANK_NOT_PERCENT here rather
  // than writing it into each definition means a score explained anywhere on
  // the site carries it — including from a component nobody has written yet.
  // Relying on the next author to remember is how the old "how likely" wording
  // survived on a dozen surfaces at once.
  const isScore = SCORE_TERMS.has(String(label || '').toLowerCase().trim())
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      background: 'rgba(249,115,22,.08)', border: '1px solid rgba(249,115,22,.3)',
      borderRadius: 9, padding: '7px 10px', marginBottom: 7,
    }}>
      <span style={{ fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT, color: C.orange, flexShrink: 0, letterSpacing: '.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 11, lineHeight: 1.5, color: C.text2, minWidth: 0 }}>
        {text}
        {isScore && (
          <span style={{ display: 'block', marginTop: 3, color: C.text3 }}>{RANK_NOT_PERCENT}</span>
        )}
      </span>
      <span
        onClick={onClose}
        style={{ marginLeft: 'auto', cursor: 'pointer', color: C.text3, fontSize: 13, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}
      >✕</span>
    </div>
  )
}
