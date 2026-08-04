'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { ORANGE_RAMP, inkFor } from '../Heatmap'

// ── Reusable bits ─────────────────────────────────────────────────────────────

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

function GlossaryRow({ icon, term, def, example }) {
  return (
    <div style={{ display: 'flex', gap: 11, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ width: 28, flexShrink: 0, fontSize: 16, textAlign: 'center', lineHeight: '20px' }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 2 }}>{term}</div>
        <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.55 }}>{def}</div>
        {example && <div style={{ fontSize: 10.5, color: C.text3, marginTop: 3, fontFamily: NUM_FONT }}>e.g. {example}</div>}
      </div>
    </div>
  )
}

function StatRow({ stat, def, good, bad }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.orange, fontFamily: NUM_FONT }}>{stat}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.55, marginBottom: good||bad ? 4 : 0 }}>{def}</div>
      {(good || bad) && (
        <div style={{ display: 'flex', gap: 10, fontSize: 10.5, fontFamily: NUM_FONT }}>
          {good && <span style={{ color: '#4ade80' }}>✓ {good}</span>}
          {bad && <span style={{ color: '#f87171' }}>✕ {bad}</span>}
        </div>
      )}
    </div>
  )
}

// ── Main Guide ───────────────────────────────────────────────────────────────

// Colour is now doing real work on every board, and a colour scale nobody
// explained is just decoration that looks like information. This is the one
// place the ramp is defined in words.
function ColorKey() {
  const steps = ['lowest', '', '', '', '', '', '', 'highest']
  return (
    <div style={{
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
      padding: '13px 16px', marginBottom: 10,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>🎨 Reading the colours</div>

      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', marginBottom: 7 }}>
        {ORANGE_RAMP.map((c, i) => (
          <div key={c} style={{
            flex: 1, background: c, color: inkFor(c), fontFamily: NUM_FONT,
            fontSize: 8.5, fontWeight: 700, textAlign: 'center', padding: '7px 2px',
            textTransform: 'uppercase', letterSpacing: '.04em',
          }}>{steps[i]}</div>
        ))}
      </div>

      <P>
        One colour, eight steps. Brightness is the value — dark means low, bright amber means high.
        There's no second colour for &ldquo;bad&rdquo;, because on these boards a low score isn&apos;t
        bad, it&apos;s just low.
      </P>

      <P>
        <b>Every column is scaled on its own.</b> This is the part worth internalising: a bright cell
        means high <i>for today&apos;s slate, in that column</i>. It does not mean the number is big,
        and it does not compare across columns. On a quiet slate the best hitter still lights up —
        he&apos;s the brightest of what&apos;s available, not necessarily good.
      </P>

      <P>
        Two columns run <b>backwards</b> on purpose, because this is a hitter&apos;s site and bright
        always means good for the hitter: <b>K%</b> on the Scoreboard, and <b>K/9</b> and{' '}
        <b>SwStr%</b> on Pitchers. A pitcher who misses bats is bad news for the lineup no matter how
        the rest of his line reads, so he stays dark.
      </P>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
        {[['★', 'Weak spot — this starter has already been beaten in this lineup slot'],
          ['◆', 'Aligned — weak spot, pitch match and real recent contact all stacking'],
          ['▲', 'Matchup edge — bats into the side of the plate this pitcher is worst against']].map(([m, t]) => (
          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: C.text2 }}>
            <span style={{
              background: ORANGE_RAMP[5], color: '#1a0d02', fontFamily: NUM_FONT,
              fontWeight: 800, fontSize: 11, borderRadius: 4, padding: '2px 6px',
            }}>{m}</span>
            <span style={{ maxWidth: 260, lineHeight: 1.45 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Guide() {
  // Centred. A 720px column pinned to the left of a 1300px page left half the
  // screen empty and made the text look like it had fallen over. The reading
  // width stays capped — long lines are harder to read, not easier — but the
  // column now sits in the middle of the page like every other tab's content.
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* Intro */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 6 }}>Guide</div>
        <P>
          This dashboard predicts which MLB batters are most likely to hit a home run today.
          You don't need to know advanced baseball stats to use it — this page explains every
          symbol, color, and number you'll see, in plain language.
        </P>
        <Note>
          New here? Start with <b>Reading the colours</b> directly below, then{' '}
          <b>&quot;How to read a player card&quot;</b>, then check the
          <b> Emoji &amp; Symbol Key</b> any time you see something you don&apos;t recognize.
        </Note>
      </div>

      {/* ── What changed ── kept at the top because the rest of this page was
          written against an older build and a reader who's used the site will
          notice the gaps before they reach the glossary. */}
      <Section title="What's new — read this first" emoji="🆕" defaultOpen={true}>
        <P>
          The site has changed a lot recently. If you used it before, these are the differences that
          matter, and a few honest notes about what still isn&apos;t working.
        </P>
        <GlossaryRow icon="📋" term="Scoreboard is the first tab" def="Every hitter, every column, sortable. Start wide and narrow down. Games moved further along — it's a per-game read, which is where you go once you already know who you're interested in." />
        <GlossaryRow icon="↕️" term="Shift-click to multi-sort" def="Click a header to sort. SHIFT-click another to add it as a tiebreaker under the first — the small number in the header shows the order. Third shift-click drops it. Works on every table on the site." />
        <GlossaryRow icon="⭐" term="Watchlist from the boards" def="The ☆ column on Scoreboard, Due and Longest adds a hitter to your watchlist without opening him. The player card has it too, plus buttons to add him straight to the slip." />
        <GlossaryRow icon="🥎" term="Player card now has seven tabs" def="Overview, Pitcher, Pitch, Spray, EV Log, Splits, Hot Zones. Pitch and Spray used to share one cramped tab, and the opposing starter had no home at all — now he has his own, with his arsenal matched to the side you bat from." />
        <GlossaryRow icon="🗺" term="Spray charts were plotting the wrong number" def="They used the ball's projected carry, which for a ground ball is about 30 feet — so roughly 43% of every hitter's chart was piled on top of home plate. They now plot where the ball was actually fielded. If you looked at this before and it seemed broken, that's why." />
        <GlossaryRow icon="🎯" term="Pitch chips pre-select tonight's arsenal" def="On the Spray tab the pitch filters come up already set to what tonight's starter throws, matched to your platoon side. So the first thing you see is only the balls he put in play against pitches he'll actually see." />
        <GlossaryRow icon="🧩" term="Pairs are grouped by the bot's own lanes" def="TOP 30, Core, Statcast, Flex, Value Power. Scores are NOT comparable between lanes — TOP 30 runs around 100 and the lettered lanes around 12–16, different formulas — so each lane is ranked against itself only." />
        <GlossaryRow icon="📅" term="Results has a day picker" def="Nine graded days are kept, so last night's card doesn't vanish in the morning. Only the Results tab moves when you switch days; everything else stays on tonight's slate." />
        <GlossaryRow icon="🔥" term="Hot Zones is empty, and it's not your fault" def="The zone data has never been published. The bot that computes it runs daily and succeeds, but its output is thrown away before it reaches the site. Until that's fixed the tab stays honestly empty rather than showing invented numbers." />
        <GlossaryRow icon="📉" term="Backtest 'Pooled' only has an HR column" def="The bot writes pooled_metrics as an empty object, so the other columns can't be pooled from what's published. HR is recomputed from total home runs over total pool size, which is a real pooled rate. Blank cells mean unmeasured — NOT zero. Day average has all six columns." />
      </Section>

      <ColorKey />

      {/* ── 1. Absolute basics ── */}
      <Section title="Baseball basics (skip if you already know)" emoji="⚾" defaultOpen={true}>
        <P>A few terms used everywhere on this site:</P>
        <GlossaryRow icon="🏃" term="At-bat (AB)" def="One turn a batter gets to hit against the pitcher." />
        <GlossaryRow icon="🏠" term="Home run (HR)" def="The batter hits the ball over the outfield wall and scores automatically. The best possible outcome for a batter." />
        <GlossaryRow icon="🎯" term="Pitcher / Batter matchup" def="Every at-bat is one pitcher throwing to one batter. This site is about predicting which batters will go deep against today's specific pitcher." />
        <GlossaryRow icon="🤚" term="Batter's hand (L/R)" def="Whether a batter swings left-handed (LHB) or right-handed (RHB). This matters because pitchers perform differently against each side." />
        <GlossaryRow icon="🫱" term="Pitcher's arm (LHP/RHP)" def="Whether the pitcher throws left-handed (LHP) or right-handed (RHP). Same-handed matchups (RHP vs RHB) usually favor the pitcher; opposite-handed matchups usually favor the batter." />
        <GlossaryRow icon="📋" term="Lineup spot" def="A number 1-9 showing where in the batting order a player hits. Spots 1-5 ('top of the order') usually get more chances to bat and are often the team's best hitters." />
        <GlossaryRow icon="🆚" term="vs" def="Shorthand for 'against.' 'Soto vs Lowder' means Juan Soto batting against pitcher Lowder today." />
      </Section>

      {/* ── 2. How to read a player card ── */}
      <Section title="How to read a player card" emoji="🃏" defaultOpen={true}>
        <P>
          Every player card on the Games, Board, and Pool pages follows the same layout. Here's
          what each part means, top to bottom:
        </P>
        <GlossaryRow icon="🔢" term="Score (top right, big number)" def="The model's overall home run confidence for this player today, on a 0-100 scale. Higher = more likely to homer. Anything 70+ is a strong play; under 50 is a longshot." example="78 = strong play, 45 = longshot" />
        <GlossaryRow icon="🅰️" term="Grade letter (next to score)" def="A simpler version of the score, like a school grade. A+ is the best, down through B, C, D." />
        <GlossaryRow icon="🏷️" term="Role tag (colored pill, e.g. '🏆 HR Bet')" def="The model's recommended way to use this player — see the Role Tags section below for what each one means." />
        <GlossaryRow icon="🔖" term="Signal pills (small tags like '375+', 'Low-K P')" def="Short callouts explaining WHY the model likes this player. See the Signal Pills glossary below for every one." />
        <GlossaryRow icon="📊" term="Stat line (BA · HR · K% · BABIP · WHIP)" def="The player's and pitcher's underlying season numbers — explained fully in the Stats Glossary below." />
        <GlossaryRow icon="👆" term="Tap the name" def="Tapping any player's name opens their full profile: hot zones, pitch-by-pitch breakdown, recent batted balls, and more." />
      </Section>

      {/* ── 3. Role tags ── */}
      <Section title="Role tags — what each colored pill means" emoji="🏷️">
        <P>The model sorts every player into one role based on how confident it is. From best to longshot:</P>
        <GlossaryRow icon="🏆" term="HR Bet" def="The model's top-confidence home run play. Requires strong recent power, a favorable damage-conversion matchup, and a good pitch-type fit all lining up at once. (Changed from 🧨 — same meaning, new icon so it doesn't collide with the HR pick_type tag elsewhere in the app.)" />
        <GlossaryRow icon="🔥" term="HR Lean" def="A good home run shot — strong signals, but not quite as airtight as an 'HR Bet'. Historically this has been the single best-performing tag in the app." />
        <GlossaryRow icon="🏁" term="HRR / XBH" def="HRR = 'Home Run Race' — these are good bets for extra-base hits (doubles, triples, HRs) even if a home run isn't a lock. Good for Total Bases bets." />
        <GlossaryRow icon="🔭" term="Power Watch" def="Has real raw power but more uncertainty in the matchup. Worth monitoring, lower-confidence HR shot. (Changed from 👀 — that icon was being used for two unrelated things at once; see the HRW timing section below.)" />
        <GlossaryRow icon="💠" term="Contact / Monitor" def="The model isn't projecting a home run here. May still be a fine pick for hits/contact bets, just not power." />
        <GlossaryRow icon="⛔" term="True Avoid HR" def="The model actively expects this player to NOT homer today and has capped their score accordingly — usually a tough pitcher matchup or cold recent power. Steer clear for HR bets. (The ⛔ marks an actual score cap, not just a caution — see ⚠️ below for the softer version.)" />
        <GlossaryRow icon="🏆" term="Top" def="The single best play on the entire slate across all categories — the model's #1 most confident pick of the day." />
      </Section>

      {/* ── 4. Signal pills ── */}
      <Section title="Signal pills — the short tags on each card" emoji="🔖">
        <P>These small tags explain the specific reasons behind a player's score:</P>
        <GlossaryRow icon="⭐" term="weak pitcher spot" def="This batter's lineup spot has historically performed well against this pitcher specifically." />
        <GlossaryRow icon="🎯" term="pitch type match (PMix)" def="The pitcher throws a pitch type that this exact batter crushes. E.g. 'PMix: SL' means the pitcher throws a lot of sliders and this batter hits sliders hard." />
        <GlossaryRow icon="🧩" term="Aligned Signals" def="New tag: fires when a weak pitcher spot, a pitch-type match, AND real recent contact quality (hard-hit balls or a home run already in the recent sample) all line up together. This combination has tested as the strongest signal in the app — stronger than any of the three alone." />
        <GlossaryRow icon="👻" term="hidden value" def="A player the model likes more than the public would expect — often a good 'value' pick that won't be heavily picked by others." />
        <GlossaryRow icon="⚠️" term="trap flag" def="A caution that this player's surface stats look good but the model found a red flag underneath (see Trap Flag note below). This is a soft warning — the score may be lightly adjusted but isn't hard-capped. Compare to ⛔ above, which means the score WAS capped." />
        <GlossaryRow icon="🛡️" term="Weak P (Weak Pitcher)" def="The opposing pitcher has below-average numbers (high ERA/WHIP, allows lots of hard contact) — generally good news for any batter facing them." />
        <GlossaryRow icon="" term="375+ / 350+ / 400+" def="Counts of how many times recently this player has hit a ball at least that many feet. More long fly balls = closer to clearing the fence for a home run." example="'375+' badge = hit a ball 375ft or further recently" />
        <GlossaryRow icon="" term="L5 2HR / L5 Hits" def="'Last 5 games' stats — L5 2HR means 2 home runs in their last 5 games. Shows if a player is hot right now." />
        <GlossaryRow icon="" term="Pull 80%" def="This batter pulls the ball (hits it to their power side) 80% of the time recently. Pulled fly balls travel shorter distances to the fence and are more likely to be home runs." />
        <GlossaryRow icon="" term="HH 50%" def="'Hard Hit' rate — 50% of this player's batted balls recently were hit 95+ mph. Higher is better; means they're squaring the ball up." />
        <GlossaryRow icon="" term="Low-K P" def="The opposing pitcher has a low strikeout rate, meaning batters put the ball in play against them more often — more chances for damage." />
        <GlossaryRow icon="🧊" term="GB/TRAP (pitcher tag)" def="This pitcher mostly induces ground balls, which rarely become home runs. A tougher matchup for power hitters even if other stats look appealing." />
        <GlossaryRow icon="🔥" term="HR ENVIRONMENT (pitcher tag)" def="Conditions favor home runs against this pitcher — hot weather, hitter-friendly park, and/or a fly-ball-prone pitcher." />
      </Section>

      {/* ── 5. Trap flag explainer ── */}
      <Section title="What is a 'trap'?" emoji="⚠️">
        <P>
          A trap is when a player's basic stats look impressive (good batting average, recent
          hits) but the model has found a deeper reason to be cautious — for example, most of
          their recent hits were weakly-hit ground balls or singles rather than hard contact, or
          they've been getting lucky on bloop hits that won't show up as a home run today.
        </P>
        <Note color="#f87171">
          Think of a trap flag as the model saying: "Don't be fooled by the surface-level
          numbers — look closer before betting on this player for power."
        </Note>
      </Section>

      {/* ── 6. Stats glossary ── */}
      <Section title="Stats glossary — every abbreviation explained" emoji="📊">
        <P><b style={{ color: C.text }}>Batter stats</b></P>
        <StatRow stat="BA (Batting Average)" def="How often a batter gets a hit per at-bat, on a scale of 0 to 1.000 (written like .275). Higher = better hitter." good=".280+ = good" bad="below .230 = weak" />
        <StatRow stat="HR (Home Runs)" def="Total home runs hit this season." />
        <StatRow stat="K% (Strikeout rate)" def="The percentage of at-bats that end in a strikeout. Lower is generally better for a hitter — it means more balls in play." good="under 20% = good" bad="over 28% = high" />
        <StatRow stat="BB% (Walk rate)" def="Percentage of at-bats ending in a walk (free pass to first base)." />
        <StatRow stat="ISO (Isolated Power)" def="Measures raw power — extra bases per at-bat, ignoring singles. Higher means more doubles/triples/homers." good=".200+ = real power" bad="under .120 = limited power" />
        <StatRow stat="BABIP" def="Batting average only on balls put in play (excludes home runs/strikeouts/walks). Used to spot lucky or unlucky stretches — a BABIP way above or below ~.300 often means regression is coming." />
        <StatRow stat="EV (Exit Velocity)" def="How fast the ball comes off the bat, in mph. Higher = harder contact = more likely to go far." good="95+ mph = hard hit" bad="under 85 mph = weak contact" />
        <StatRow stat="Launch Angle" def="The vertical angle the ball leaves the bat, in degrees. Home runs usually come from balls hit between roughly 25-35°. Too low = ground ball, too high = pop-up." />
        <StatRow stat="Barrel %" def="Percentage of batted balls hit with the ideal combination of exit velocity and launch angle for extra-base damage. The single best predictor of home run power." good="10%+ = elite power" />
        <StatRow stat="Hard Hit %" def="Percentage of batted balls hit 95+ mph. A simpler cousin of barrel rate." good="40%+ = strong contact quality" />
        <StatRow stat="xwOBA (expected weighted on-base average)" def="A advanced all-in-one hitting quality stat based on contact quality, not actual outcomes. Strips out luck — shows how well a batter is really hitting the ball." good=".370+ = excellent" bad="under .300 = poor contact quality" />
        <StatRow stat="xSLG (expected slugging)" def="Like xwOBA but focused specifically on power/extra bases. Higher = more raw power based on contact quality." />

        <div style={{ height: 8 }} />
        <P><b style={{ color: C.text }}>Pitcher stats</b></P>
        <StatRow stat="ERA (Earned Run Average)" def="Average runs a pitcher allows per 9 innings. Lower is better for the pitcher (= tougher matchup for batters)." good="under 3.50 = strong pitcher" bad="over 4.75 = vulnerable" />
        <StatRow stat="WHIP" def="Walks + Hits allowed per inning pitched. Lower = pitcher allows fewer batters on base." good="under 1.20 = stingy" bad="over 1.40 = leaky" />
        <StatRow stat="HR/9" def="Home runs allowed per 9 innings pitched. The most direct 'is this pitcher homer-prone' stat." good="under 1.0 = stingy" bad="over 1.3 = homer-prone" />
        <StatRow stat="P-BABIP (Pitcher BABIP)" def="Same idea as batter BABIP, but for the pitcher — shows if their results have been lucky or unlucky lately." />
        <StatRow stat="K9 / K-rate" def="Strikeouts per 9 innings, or as a percentage of batters faced. Lower means more contact allowed — more opportunity for batters." />
        <StatRow stat="Meatball rate" def="How often a pitcher throws a pitch in an easily-hittable location. Higher = more mistakes = good for batters." good="20%+ = mistake-prone" />
        <StatRow stat="Whiff %" def="How often batters swing and miss against this pitcher. Lower = easier to make contact against." />
      </Section>

      {/* ── 7. Hot Zones tab ── */}
      <Section title="Understanding the Hot Zones tab" emoji="🔥">
        <Note>
          <b>Not live yet.</b> This panel needs zone profiles from the bot&apos;s spray_cache step,
          and those aren&apos;t in the published data at the moment — checked across all 298 detail
          files. The tab will fill in on its own once the bot publishes them; until then it shows an
          empty state rather than guessing.
        </Note>
        <P>
          When it is running: open any player&apos;s profile and tap &quot;Hot Zones&quot; to see
          exactly where in the strike zone this matchup favours the batter.
        </P>
        <GlossaryRow icon="🟥🟧⬜🟦" term="Zone map colors" def="Each of the 9 boxes is a location in the strike zone (imagine looking at the zone from the catcher's view). Red = the batter performs great there. Orange = decent. Gray = average. Blue = the batter struggles there." />
        <GlossaryRow icon="🔥" term="'KILL' zone badge" def="A zone marked KILL means three things line up at once: the pitcher often throws the ball there, the pitcher gets hit hard there, AND this batter is dangerous there. These are the best spots to watch for a home run." />
        <GlossaryRow icon="🎯" term="Pitch toggle pills" def="Tap a pitch type (like 'SL' for slider) to highlight stats for just that pitch — shows how the batter does specifically against that pitch type." />
        <GlossaryRow icon="📡" term="Signals tab" def="Shows pitcher 'control' numbers like meatball rate and whiff rate, plus how the pitcher performs specifically against left-handed or right-handed batters." />
        <GlossaryRow icon="🎯" term="Edge score (Kill Zone tab)" def="A single 0-100 number combining pitch mix fit, meatball rate, and zone overlap — a quick summary of how favorable this matchup is." />
      </Section>

      {/* ── 8. Other tabs ── */}
      <Section title="What's on each tab" emoji="🧭">
        <GlossaryRow icon="🏟️" term="Games" def="Pick a game from the card strip, then read its full lineup as a dense table. Projected output for the whole slate sits at the bottom." />
        <GlossaryRow icon="🚀" term="Longest" def="Who hits the farthest ball tonight — a distance board, not a probability board. It disagrees with the HR tab regularly, and that's the point." />
        <GlossaryRow icon="💣" term="Due" def="Hitters overdue for a homer. Read the Ratio and HR/PA columns, not the drought: a long gap with no power behind it is just a hitter who doesn't homer." />
        <GlossaryRow icon="🧬" term="Pair History" def="Which two hitters have gone deep on the same day all season, plus the Pair Builder — pick an anchor and get his partners who are playing tonight." />
        <GlossaryRow icon="🔍" term="Player" def="The player card as a full page instead of a popup, for when you want to sit with one hitter." />
        <GlossaryRow icon="🏆" term="HR Board" def="A ranked leaderboard of every player by home run score, highest to lowest." />
        <GlossaryRow icon="💎" term="Hits & HRR" def="Focused on contact and extra-base-hit plays rather than pure home run bets." />
        <GlossaryRow icon="🔗" term="Pairs" def="Suggested 2-player combinations for parlay-style bets, picked because both players' matchups work well together." />
        <GlossaryRow icon="🏊" term="Pools" def="Groups of 4-6 players for pool-style contests, balanced for diversity across games." />
        <GlossaryRow icon="📈" term="Scoreboard" def="Live/today's actual game scores and status." />
        <GlossaryRow icon="🏅" term="Leaders" def="Season-long statistical leaders across the league." />
        <GlossaryRow icon="✅" term="Results" def="Shows how the model's picks actually performed after games finish — how many home runs were 'on the sheet' (predicted) vs missed." />
        <GlossaryRow icon="⭐" term="Watchlist" def="Save specific players to track them across the day, even if you switch tabs." />
        <GlossaryRow icon="🗺️" term="Spray" def="Visual chart showing exactly where on the field a player's batted balls have landed recently." />
        <GlossaryRow icon="🤖" term="Bot" def="A live-updating ranked board with raw model output, plus access to the bot's text logs." />
      </Section>

      {/* ── 9. Color key ── */}
      {/* ── 10. Full emoji index ── */}
      <Section title="Full emoji & symbol index (A-Z reference)" emoji="🔤">
        <P>Every emoji used anywhere on the site, alphabetized by where it appears:</P>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <GlossaryRow icon="🚀" term="🚀 — Strong HR timing (HRW 70-80)" def="A solid, reliable HRW score. Used on the Bot board and player cards." />
          <GlossaryRow icon="🌋" term="🌋 — Extreme HR timing (HRW 80+)" def="Very hot, but the model treats scores this high as less reliable than 70-80 — deliberately downweighted since the graded sample favored 55-70 over extreme 80+." />
          <GlossaryRow icon="⚡" term="⚡ — Playable HR timing (HRW 60-69)" def="Also used for the 'EV Log' tab icon in the player profile." />
          <GlossaryRow icon="🌤️" term="🌤️ — Borderline HR timing (HRW 50-59)" def="Building/uncertain conditions — not cold, not hot." />
          <GlossaryRow icon="🧊" term="🧊 — Weak HR timing (under 50) / GB-Trap pitcher" def="Either a cold HR Watch score, or (on a pitcher) a ground-ball-heavy pitcher who suppresses home runs." />
          <GlossaryRow icon="🏆" term="🏆 — HR Bet role / Top pick of the slate" def="The model's top home run confidence tier, or the single highest-confidence play across the entire day. See Role Tags." />
          <GlossaryRow icon="🔥" term="🔥 — HR Lean role / HR-friendly pitcher / Kill Zone" def="Multiple meanings by context: a strong-but-not-top role tag, a pitcher tag meaning conditions favor homers, or a 'kill zone' badge in Hot Zones." />
          <GlossaryRow icon="🏁" term="🏁 — HRR / XBH role" def="Good bet for extra-base hits. See Role Tags." />
          <GlossaryRow icon="🔭" term="🔭 — Power Watch role" def="Real raw power, more matchup uncertainty. See Role Tags." />
          <GlossaryRow icon="💠" term="💠 — Contact / Monitor role" def="Lower home run confidence, may still be good for contact bets." />
          <GlossaryRow icon="⛔" term="⛔ — True Avoid HR role (score capped)" def="Model expects no home run and has actively capped the score. See Role Tags." />
          <GlossaryRow icon="🧩" term="🧩 — Aligned Signals" def="Weak-spot + pitch-match + real recent contact quality all stacking together. The strongest validated combo." />

          <GlossaryRow icon="⭐" term="⭐ — Weak pitcher spot signal" def="This lineup spot has done well historically vs this pitcher." />
          <GlossaryRow icon="🎯" term="🎯 — Pitch type match signal / Pitch tab icon" def="The pitcher throws something this batter crushes — or, the 'Pitch' tab in a player profile." />
          <GlossaryRow icon="👻" term="👻 — Hidden value signal" def="A player the model likes more than the public would expect." />
          <GlossaryRow icon="⚠️" term="⚠️ — Trap flag warning" def="Surface stats look good but a deeper red flag exists. See Trap explainer above." />
          <GlossaryRow icon="✅" term="✅ — Confirmed home run result" def="Used on the Results tab to mark a home run that the model predicted." />
          <GlossaryRow icon="❌" term="❌ — Missed result" def="Used on the Results tab for home runs the model did not predict." />
          <GlossaryRow icon="✓" term="✓ — Matches a noted weakness" def="Shown next to 'Weak Side' in a player profile when the batter's hand matches the pitcher's known weak side." />
          <GlossaryRow icon="🗺️" term="🗺️ — Spray tab" def="Opens the visual batted-ball location chart." />
          <GlossaryRow icon="📡" term="📡 — Signals tab" def="Pitcher control/danger metrics inside Hot Zones." />
          <GlossaryRow icon="⚾" term="⚾ — Contact pick category" def="Used to label contact-focused (non-power) picks." />
          <GlossaryRow icon="🏊" term="🏊 — Pool grouping" def="Used to label 4-man / 6-man pool sections." />
          <GlossaryRow icon="🔗" term="🔗 — Pairs section" def="Used to label paired-player betting combinations." />
        </div>
      </Section>

      {/* ── 11. For absolute beginners ── */}
      <Section title="New to baseball betting? Start here" emoji="🌱">
        <P>If all of this still feels like a lot, here's the simplest possible way to use this site:</P>
        <ol style={{ fontSize: 12.5, color: C.text2, lineHeight: 1.8, paddingLeft: 18, marginBottom: 10 }}>
          <li>Go to the <b>HR Board</b> tab.</li>
          <li>Look at the players with the <b>🏆 HR Bet</b> tag and the highest score (top of the list).</li>
          <li>Tap a player's name to open their profile and check the <b>🔥 Hot Zones → Kill zone</b> tab — a high "Edge score" is a good sign.</li>
          <li>That's it. Everything else on this site is for going deeper once you're comfortable.</li>
        </ol>
        <Note>
          No prediction model is ever 100% — these are probability-based picks, not guarantees.
          Treat every score as "more or less likely," never as a sure thing.
        </Note>
      </Section>

    </div>
  )
}
