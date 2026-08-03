# Video 1 — Going through the slate

Target: 9–11 minutes. Screen recording, you talking over it.

Structure: **one game start to finish**, then the tools that only make sense
once someone's seen a game. Don't tour the tabs in order — 17 tabs in a row is
how you lose people in ninety seconds.

Two rules for the whole thing:

1. **Say the sample size out loud every time you say a rate.** The site prints
   it next to every number for a reason. If you skip it on camera, the first
   comment is going to be someone pointing out a 4-for-9 slider split.
2. **Never say "the model likes him."** Say what it's reading. "He's got a 94
   average exit velo over his last 21 batted balls and the guy on the mound
   gives up 1.8 HR per nine" is a different video from "the model likes him."

---

## 0:00 — Cold open (30s)

Don't introduce yourself yet. Open on the **Games** board, already loaded.

> "This is every hitter on tonight's slate, scored. Fifteen games, two hundred
> and sixty-odd bats. I'm going to show you how I get from this to three names."

Then say who you are in one sentence. Not thirty.

---

## 0:30 — Games board (90s)

Point at the game tiles.

> "Each tile is a game. GS is the median of every hitter's four board scores,
> then the median across the lineup — so it's answering 'is this whole lineup
> dangerous', not 'is there one guy here'."

Click into one game with a high GS. **Pick a real one when you record — don't
script the name, the slate changes.**

Walk the lineup table left to right, but only name four columns. HR, HRW, EV,
and the ⭐ SPOT flag.

> "Bright is good for the hitter, everywhere on this site. Same orange, every
> board. The only columns that flip are the ones where low is good — strikeout
> rate, the pitcher's swinging-strike rate — and those are already flipped so
> bright still means good for the bat."

That line matters. It's the thing that makes the whole site readable and nobody
will notice it unless you say it.

---

## 2:00 — One hitter, all the way down (3 min)

This is the heart of the video. Click a hitter, open the card.

**Overview** — five seconds. "Scores, batted ball, season line."

**Pitcher tab** — spend real time here.

> "This is the arm he's facing. The arsenal is his mix *against this side* —
> not his overall usage, because a starter's mix to lefties can look nothing
> like his mix overall."

Point at the order-thirds table.

> "Damage by third of the order. I use this and not the lineup-spot table
> underneath, because the spot table splits one season nine ways and every row
> is about twelve plate appearances. Twelve. The thirds table pools three spots
> and it's the one I'd actually act on."

Saying that on camera buys you more credibility than any winning pick will.

**Pitch tab** — the batter against each pitch type.

> "Everything sortable. What I want is BBE first — balls in play. Sort by that
> and you find out which of these lines is real and which is one swing."

Click the BBE header. Let it sort on camera.

Then the HR-by-pitch panel underneath.

> "Home runs by pitch type, against tonight's arsenal. The denominator is how
> often he *sees* the pitch — four homers off fastballs means nothing if
> fastballs are most of what he sees."

**Spray tab** — this one is visual, let it breathe.

> "Where he actually puts the ball. Position is where it was fielded, not how
> far it carried — a chopper the shortstop takes at 130 feet belongs at 130
> feet. Carry's in the hover."

Point at the pitch chips.

> "These come up pre-selected to what tonight's starter throws, matched to the
> side he bats from. So what you're looking at first is only the balls he put in
> play against pitches he'll actually see."

Hit **L10**.

> "Ten games. Watch the sample counter — that's about 27 batted balls. L5 is
> around 14 and I don't trust the shape at 14."

---

## 5:00 — Pairs (2 min)

Go to **Pairs → Bot Picks**.

> "Five lanes, ten pairs. Top 30, then Core, Statcast, Flex, Value Power —
> those are the bot's own categories, not mine."

Now the thing worth explaining:

> "Scores don't compare across lanes. Top 30 runs around a hundred, the lettered
> lanes around twelve to sixteen. Different formulas. So each lane is ranked
> against itself and I don't put them on one scale — otherwise the lettered
> lanes look like garbage when they're just scored differently."

Then **Build a Pair**.

> "Pick a hitter, or several. Select three and it ranks who shares history with
> all three."

One caveat, say it plainly:

> "Same-day just means both went deep on the same date, maybe in different
> parks. That's two independent events. Same-game is the column that actually
> means something, and it's much rarer."

---

## 7:00 — Pools (90s)

> "This builds a ticket. Pick a market, pick your legs, and it prices it."

Point at the percentage.

> "That's not invented. Those are the rates each score band actually produced
> over thirty-four graded days. A 72 doesn't become 72% — it becomes 'hitters in
> the 70-plus band did this 18.7% of the time.'"

Demo re-roll and the leg swap. Then:

> "Re-rolling changes which legs get offered. It never changes the rate on a
> leg, because that rate is observed history, not something the page gets to
> tune."

If the ticket has two hitters in one game, point at the warning.

> "Same game. They rise and fall together, so the true number is higher than
> that and so is the variance."

---

## 8:30 — Results (60s)

> "This is how it graded. Capture rate, what hit, what got missed."

Show the top-5 longest. Then the HR-by-pitch tab, and be straight about it:

> "One thing this doesn't do — it won't tell you what pitch tonight's homer was
> hit off. That's not in the feed. What it shows is that hitter's season
> breakdown. Tonight's homer shows up in it in a day or two."

---

## 9:30 — Close (45s)

Don't recap. Say what you actually do with it.

> "Three names, and I want a reason for each that isn't a score. Facing a guy
> who's 1.8 HR per nine. Pulls the ball in the air. Gets the pitch he does
> damage on. If I can't say the reason out loud, I don't play it."

Then whatever your call-to-action is.

---

## Recording at 4am — what actually changes

Posting at 4am is fine. Checked against the live payload at 4:24am: 143 hitters
across 8 games, about 18 a game, which is a full nine per side. Nothing is
missing. What's true is that **`lineup_confirmed` is false on all 143** — every
batting order on screen is a projection.

That's one honest sentence, not a problem:

> "Lineups aren't posted yet, so batting order here is projected. That matters
> for one thing and I'll flag it when we get there."

Then adjust three things:

**Lead with the pitcher, not the lineup.** Probable starters are locked well
before lineups. Everything on the Pitcher tab — arsenal, HR/9, weak side,
damage by order third — is solid at 4am. Open on that instead of the lineup
table and the whole video gets sturdier.

**Skip the ⭐ SPOT column and the lineup-spot table.** Both depend on where a
guy actually hits, and that's the one thing not locked yet. Say why:

> "I'm not using the lineup-spot read this early — the order's projected, and if
> he hits sixth instead of third that whole column moves."

**Add a scratch line at the close.** You're publishing before lineups. Say it:

> "Check the lineup before you do anything with this. Projected leadoff guys get
> scratched and I'd rather you hear that from me now than find out later."

One thing to verify yourself the first time: whether the game count on screen
matches the actual MLB schedule for that day. Games enter the slate as probable
pitchers get announced, so a very early recording can be short a game or two. I
couldn't confirm whether 8 was the full Monday slate or a partial one — worth
checking once, and then you'll know how early is too early.

## Things to have open before you hit record

- One game picked and one hitter picked, so you're not scrolling and reading.
- **Hot Zones: don't open it.** It's empty until the bot pipeline change lands.
- If you ever record in the afternoon instead, lineups are confirmed and you can
  put the ⭐ SPOT column and the lineup-spot table back in.

## Things not to say

- "The model likes him." Say what it's reading.
- Any rate without its sample.
- Don't promise a hit rate. You have thirty-four graded days. That's not enough
  to promise anything and someone will hold you to it.
