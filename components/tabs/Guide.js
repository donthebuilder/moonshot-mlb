'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { ORANGE_RAMP, inkFor } from '../Heatmap'
import PaletteToggle from '../PaletteToggle'
import { RAMPS, usePalette } from '../../lib/palette'

// GUIDE — rewritten short, 2026-08-09.
//
// It was 385 lines across eleven accordions, and most of it was either a
// changelog ("What's new", "The live layer") or a second copy of a tooltip
// that already exists on the thing it describes. A reference manual is the
// wrong shape for someone whose actual question is "what do I look at first?"
//
// What it is now: a five-step path at the top that answers that question, one
// short section on colour (the only visual language on the site that has no
// tooltip anywhere), a compact glossary of the symbols and stats, and a
// one-line-per-tab map. Everything cut was a duplicate of an in-page tooltip
// or a dated release note:
//
//   · "What's new — read this first" (11 rows) — a changelog, not a guide.
//   · "The live layer & accountability" (10 rows) — same.
//   · "Full emoji & symbol index (A–Z)" (24 rows) — every entry repeated the
//     Role tags and Signal pills sections directly above it.
//   · "How to read a player card" — every part of the card has a title
//     attribute that says the same thing when you hover it.
//   · "Baseball basics" — trimmed to the four terms the site actually
//     assumes; AB and "vs" were not the confusing part.
//   · "What is a trap?" — folded into the ⚠️ glossary row it explained.

// ── small pieces ─────────────────────────────────────────────────────────────

function Section({ title, emoji, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          {emoji && <span style={{ fontSize: 16 }}>{emoji}</span>}
          {title}
        </span>
        <span style={{ color: C.text3, fontSize: 14, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
      </button>
      {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

function P({ children }) {
  return <p style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.65, marginBottom: 10 }}>{children}</p>
}

function Note({ children, color = C.orange }) {
  return (
    <div style={{ background: `${color}14`, border: `1px solid ${color}33`, borderRadius: 8, padding: '9px 12px', fontSize: 11.5, color: C.text2, lineHeight: 1.55, marginBottom: 12 }}>
      {children}
    </div>
  )
}

// One line per term. The old version carried an optional example line under
// every row; it doubled the height of the glossary and the examples were
// mostly restatements, so the definition has to do the whole job now.
function Term({ icon, term, def, tab, go }) {
  const clickable = !!(tab && go)
  return (
    <div
      onClick={clickable ? () => go(tab) : undefined}
      className={clickable ? 'tap-row' : undefined}
      title={clickable ? `Open the ${term} tab` : undefined}
      style={{
        display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}`,
        cursor: clickable ? 'pointer' : 'default',
      }}>
      <div style={{ width: 24, flexShrink: 0, fontSize: 14, textAlign: 'center', lineHeight: '18px' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: clickable ? C.orange : C.text }}>{term}</span>
        {clickable && <span style={{ color: C.orange, fontSize: 11, fontWeight: 900 }}> →</span>}
        <span style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.55 }}> — {def}</span>
      </div>
    </div>
  )
}

function Stat({ stat, def, good }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT, width: 74, flexShrink: 0 }}>{stat}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.text2, lineHeight: 1.55 }}>
        {def}
        {good && <span style={{ color: '#4ade80', fontFamily: NUM_FONT }}> · {good}</span>}
      </span>
    </div>
  )
}

// THE FIVE STEPS. First, second, third — in order, with the tab named and the
// one thing to read on it. This is the whole point of the page.
// ── EVERY STEP AND EVERY TAB ROW GOES SOMEWHERE (2026-08-09) ────────────────
// Donovan: "make sure when you click on certain things they happen and the
// right things happen."
//
// They didn't. Guide was mounted as `<Guide />` with NO PROPS, so every tab it
// named — "go to Scoreboard", "open Results" — was dead text telling you to go
// somewhere by hand. A guide whose instructions you have to follow manually is
// a pamphlet. Each step and each tab row is now a real button onto that tab.
const STEPS = [
  {
    n: 1,
    title: 'Open the Home tab and read the four tiles',
    body: 'Games tonight, the bot’s projected homer range, first pitch, and its base-hit record across every graded night. Thirty seconds tells you whether tonight is a big slate and whether the model has been right lately.',
  },
  {
    n: 2,
    tab: 'scoreboard',
    title: 'Go to Scoreboard and look at the top of the list',
    body: 'Every hitter on the slate, ranked. The brightest names at the top are the ones the model likes most tonight. You do not have to understand a single column to use the order.',
  },
  {
    n: 3,
    tab: 'board',
    title: 'Tap a name to open his card',
    body: 'The card says why he is up there: the arm he faces, his recent contact, where he does damage in the zone. Every number on it has a tooltip — hover anything you don’t recognise instead of coming back here.',
  },
  {
    n: 4,
    title: 'Check the tag, not just the score',
    body: 'A 🏆 HR Bet and a 💠 Contact are both good picks for different bets. The tag tells you which market he belongs in — betting a contact hitter to homer is the most common way to lose with a right read.',
  },
  {
    n: 5,
    tab: 'results',
    title: 'The next morning, open Results',
    body: 'Every pick graded against the job it was picked for, wins and losses alike. That is the tab that tells you how much to trust everything above it. Nothing on this site is worth anything without it.',
  },
]

// The colour ramp is the one visual language on the site with no tooltip
// attached to it, so it stays — trimmed to the two facts that actually change
// how you read a board.
function ColorKey() {
  // 2026-08-09: this used to hard-code "eight steps, dark is low, bright amber
  // is high" and a `steps` array indexed 0-7. Both were wrong the moment the
  // ramps became switchable and nine stops — the eighth label vanished and the
  // prose described a palette you might not be looking at. Everything now
  // derives from the active ramp.
  const active = usePalette()
  const stops = RAMPS[active]?.stops || []
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '13px 16px', marginBottom: 10,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>🎨 Reading the colours</div>
      <div style={{ fontSize: 10.5, color: C.text3, marginBottom: 9 }}>
        <b style={{ color: C.text2 }}>What this answers:</b> what a coloured cell on any board means.
      </div>

      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', marginBottom: 9 }}>
        {stops.map((c, i) => (
          <div key={c} style={{
            flex: 1, background: c, color: inkFor(c), fontFamily: NUM_FONT,
            fontSize: 8.5, fontWeight: 700, textAlign: 'center', padding: '7px 2px',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>{i === 0 ? 'lowest' : i === stops.length - 1 ? 'highest' : ''}</div>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}><PaletteToggle /></div>

      <P>
        {active === 'ember'
          ? 'One colour, eight steps: dark is low, bright amber is high. There is no second colour for “bad”, because a low score isn’t bad — it’s just low.'
          : active === 'verdict'
            ? 'Two colours and nothing else. Red is avoid, green is play, and the middle goes grey rather than yellow — a middling number is not a recommendation, so it gets out of the way.'
            : 'Dark is bad, bright is good. Red through amber to green, with every step in between visible — the one to use when ranking a whole column rather than spotting the extremes.'}
      </P>
      <P>
        <b>Every column is scaled on its own</b> — a strong colour means high <i>for tonight, in that
        column</i>, not big in absolute terms and never comparable across columns. On a quiet slate
        the best hitter available still lights up.
      </P>
      <P>
        Three columns run <b>backwards</b> on purpose, because the strong end always means good for the
        hitter: <b>K%</b> on the Scoreboard, <b>K/9</b> and <b>SwStr%</b> on Pitchers. A pitcher who
        misses bats stays at the weak end.
      </P>
    </div>
  )
}

export default function Guide({ onNavigate }) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6 }}>Guide</div>
        <P>
          This site predicts which hitters are most likely to go deep tonight, and then grades
          itself on it the next morning. You don&apos;t need to know a single advanced stat to use
          it — follow the five steps below in order.
        </P>
      </div>

      {/* The palette picker lives here rather than buried in a settings menu.
          Colour is how every board on this site says "high" and "low", so
          choosing the scale is part of learning to read the site, not an
          afterthought. */}
      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '11px 13px', marginBottom: 18, background: C.bg2,
      }}>
        <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 2 }}>🎨 Heat colours</div>
        <div style={{ fontSize: 10, color: C.text3, marginBottom: 8 }}>
          How every board shows strong versus weak. Pick the one you read fastest.
        </div>
        <PaletteToggle />
      </div>

      {/* ── START HERE — the whole reason this page exists ── */}
      <div style={{
        background: `linear-gradient(155deg, rgba(249,115,22,.11), ${C.bg2} 60%)`,
        border: `1px solid ${C.orange}55`, borderRadius: 14,
        padding: '16px 18px', marginBottom: 14,
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, color: C.orange, letterSpacing: '.1em', fontFamily: NUM_FONT, marginBottom: 3 }}>
          ▶ START HERE
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 10 }}>
          Five steps, in order
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {STEPS.map((s) => (
            <div key={s.n}
              onClick={s.tab && onNavigate ? () => onNavigate(s.tab) : undefined}
              className={s.tab && onNavigate ? 'tap-row' : undefined}
              title={s.tab && onNavigate ? 'Take me there' : undefined}
              style={{
                display: 'flex', gap: 11, alignItems: 'flex-start',
                cursor: s.tab && onNavigate ? 'pointer' : 'default',
                borderRadius: 9, padding: s.tab && onNavigate ? '3px 5px' : 0,
                margin: s.tab && onNavigate ? '-3px -5px' : 0,
              }}>
              <span style={{
                flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                border: `1px solid ${C.orange}77`, background: `${C.orange}18`,
                color: C.orange, fontFamily: NUM_FONT, fontWeight: 900, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{s.n}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>
                  {s.title}
                  {s.tab && onNavigate && <span style={{ color: C.orange, fontWeight: 900 }}> →</span>}
                </div>
                <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.6, marginTop: 2 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.text3, lineHeight: 1.6, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.orange}33` }}>
          That&apos;s the whole path. Everything below is reference — open a section only when a
          symbol or a stat on screen doesn&apos;t make sense, and remember that almost everything on
          this site explains itself if you hover it.
        </div>
      </div>

      <ColorKey />

      {/* ── SYMBOLS ── role tags and signal pills, merged. They were two
             sections plus an A–Z index that repeated both. ── */}
      <Section title="Symbols you'll see on a player" emoji="🔖" defaultOpen={true}>
        <P><b style={{ color: C.text }}>The role tag — which bet he belongs in</b></P>
        <Term icon="🏆" term="HR Bet" def="top-confidence home run play: recent power, a favourable matchup and a pitch-type fit all at once." />
        <Term icon="🔥" term="HR Lean" def="a good home run shot, not quite airtight. Historically the best-performing tag on the site." />
        <Term icon="🏁" term="HRR / XBH" def="extra-base hits rather than a homer specifically. Good for total-bases bets." />
        <Term icon="🔭" term="Power Watch" def="real raw power, more matchup uncertainty. Monitor, don't lead with him." />
        <Term icon="💠" term="Contact / Monitor" def="no homer projected. Can still be a fine hits pick — just not a power one." />
        <Term icon="⛔" term="True Avoid HR" def="the model expects no homer and has CAPPED his score. Steer clear for power." />
        <Term icon="↪️" term="Skip HR / redirect" def="a verdict on the market, never the player: his case is stronger on Hit, HRR or TB, and the tag says which." />

        <div style={{ height: 10 }} />
        <P><b style={{ color: C.text }}>The small pills — why the model likes him</b></P>
        <Term icon="⭐" term="Weak spot" def="this lineup spot has been beaten before against tonight's starter." />
        <Term icon="🎯" term="Pitch match" def="the pitcher throws a lot of something this exact hitter crushes." />
        <Term icon="🧩" term="Aligned signals" def="weak spot + pitch match + real recent hard contact, all at once. The strongest tested combination on the site — stronger than any of the three alone." />
        <Term icon="👻" term="Hidden value" def="the model likes him more than the field will." />
        <Term icon="⚠️" term="Trap" def="the surface stats look good but the contact underneath doesn't — cheap hits, weak grounders, a lucky stretch. A soft warning; ⛔ above is the hard one." />
        <Term icon="🛡️" term="Weak P" def="the opposing starter's own numbers are below average. Good news for the whole lineup." />
        <Term icon="🧊" term="GB / Trap arm" def="a ground-ball pitcher. Ground balls don't leave the yard, so this is a tough power matchup no matter how the rest reads." />
        <Term icon="🔁" term="Back-to-back watch" def="he homered in his most recent game and is trying again tonight." />
        <Term icon="≈" term="Projected pitcher" def="the starter isn't announced — this is whoever's rotation turn it is, not an official listing." />
      </Section>

      {/* ── STATS ── one line each, only the ones that appear on screen ── */}
      <Section title="Stats glossary" emoji="📊">
        <P><b style={{ color: C.text }}>Hitters</b></P>
        <Stat stat="BA" def="batting average — hits per at-bat." good=".280+ is good" />
        <Stat stat="ISO" def="isolated power — extra bases per at-bat, ignoring singles. The archive's strongest single HR predictor." good=".200+ is real power" />
        <Stat stat="K%" def="how often he strikes out. Lower means more balls in play." good="under 20% is low" />
        <Stat stat="EV" def="exit velocity — how fast the ball leaves the bat." good="95+ mph is hard contact" />
        <Stat stat="Barrel%" def="share of batted balls with the ideal exit-velocity-and-angle combination." good="10%+ is elite" />
        <Stat stat="HH%" def="hard-hit rate — share of batted balls at 95+ mph." good="40%+ is strong" />
        <Stat stat="BABIP" def="average on balls in play. Far from ~.300 in either direction usually means luck, not skill." />
        <Stat stat="xwOBA" def="overall hitting quality from contact rather than outcomes — strips luck out." good=".370+ is excellent" />

        <div style={{ height: 10 }} />
        <P><b style={{ color: C.text }}>Pitchers</b></P>
        <Stat stat="HR/9" def="home runs allowed per nine innings. The most direct 'is he homer-prone' number on the site." good="over 1.3 is leaky — good for you" />
        <Stat stat="ERA" def="runs allowed per nine innings. Lower is a tougher matchup for hitters." />
        <Stat stat="WHIP" def="walks plus hits per inning. Higher means more traffic." good="over 1.40 is leaky" />
        <Stat stat="K/9" def="strikeouts per nine. High means he misses bats — bad for your hitter, so it's coloured backwards." />
        <Stat stat="Meatball%" def="how often he leaves one over the plate. Higher is better for you." good="20%+ is mistake-prone" />
      </Section>

      {/* ── TAB MAP ── one line each ── */}
      <Section title="What each tab is for" emoji="🧭">
        <Term tab="home" go={onNavigate} icon="🏠" term="Home" def="tonight in four numbers, the headline game, and the way in." />
        <Term tab="scoreboard" go={onNavigate} icon="📊" term="Scoreboard" def="every hitter, every column, sortable. The wide view — start here." />
        <Term tab="atplate" go={onNavigate} icon="🎤" term="At the Plate" def="the hitter batting right now — the count, every pitch of the at-bat, and where his contact is going. Only alive during games." />
        <Term tab="games" go={onNavigate} icon="⚾" term="Games" def="one matchup at a time: the arm, the park, the lineup." />
        <Term tab="board" go={onNavigate} icon="🏆" term="HR Board" def="ranked purely by home-run score." />
        <Term tab="longest" go={onNavigate} icon="🚀" term="Longest" def="who hits the farthest ball, not who is likeliest to homer. It disagrees with the HR board on purpose." />
        <Term tab="due" go={onNavigate} icon="💣" term="Due" def="hitters overdue for one. Read the HR/PA column, not the drought — a long gap with no power behind it is just a hitter who doesn't homer." />
        <Term tab="board" go={onNavigate} icon="💎" term="Hits & HRR" def="contact and extra-base plays instead of power." />
        <Term tab="pairs" go={onNavigate} icon="🔗" term="Pairs / 🏊 Pools" def="two-man and four-to-six-man combinations, plus the Pair Builder for making your own." />
        <Term tab="pairhist" go={onNavigate} icon="🧬" term="Pair History" def="which two hitters have gone deep on the same day all season." />
        <Term tab="spray" go={onNavigate} icon="🗺️" term="Spray" def="where a hitter's batted balls actually land." />
        <Term tab="pitchers" go={onNavigate} icon="🎯" term="Pitchers" def="tonight's arms ranked by how much they leak." />
        <Term tab="leaders" go={onNavigate} icon="🏅" term="Leaders" def="season-long league leaders." />
        <Term tab="results" go={onNavigate} icon="✅" term="Results" def="the receipts — last night graded, and the season record behind it." />
        <Term tab="watch" go={onNavigate} icon="⭐" term="Watchlist" def="names you starred, followed across every tab." />
        <Term tab="bot" go={onNavigate} icon="🤖" term="Bot" def="the raw model output and its own text logs, unfiltered." />
      </Section>

      <Note>
        No model is ever right every night. Every score here is &ldquo;more or less likely&rdquo;,
        never a guarantee — and the Results tab exists so you can see exactly how much less.
      </Note>

    </div>
  )
}
