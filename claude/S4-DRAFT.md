# S4 DRAFT v2: "What am I looking at?" (for Donovan's review, 2026-10-01)

One panel, six answers, on every proprietary number, through the existing tap-to-explain.

v2 changes:
- **HRW** is the HR window (Donovan, 10-01).
- **"How it's calculated" gaps** are written from the bot's actual code (cited as `md:` =
  bots/mlb_dashboard.py), in plain words.
- **Archive percentages are gone.** Those files were written after the games (see
  HR-MODEL-FINDINGS-2026-10-01.md). The only "Measured" lines left come from the locked pregame record:
  21 nights, Sep 9–30, 4,096 hitter-games, 11.5% base.

**10-01, ~2 am: Donovan chose both missing lines** (DC and the goal score, below). Nothing in this draft
needs his words any more; S4 builds from it. Two notes for the build: (a) every "Measured" line must
stay por_rows-only with its n (0d); (b) the goal score section becomes lamp-goal-v2 when 0f ships —
CALLED = one per team, ON THE BOARD = top third of the night board — update items 1/4/6 then.

---

## HR score (MOONSHOT)
1. **What it is:** How good tonight looks for him to go deep: his power, the arm he faces, the park and weather, and his recent form. A ranking, 0–100.
2. **Why it matters:** It's the main score behind the HR board and the picks. A 70 is a lean, not a lock, and it's a power score, so don't read it as "good hitter tonight".
3. **What goes in:**
   - season power: ISO, HR per PA, slugging (the biggest single part);
   - damage conversion;
   - the starter's HR damage;
   - pitch-type fit;
   - pull and launch;
   - recent home runs and extra-base hits;
   - park and weather;
   - the pitcher's numbers against his side;
   - strikeout rate;
   - a few small terms. *(md:184–333)*
4. **How to read it:** A ranking, not a percentage; a 78 sits above a 62, it is not a 78% chance. Bands 70+ · 50–70 · 30–50 · under 30.
5. **Timeframe:** Built for tonight. Season stats to date, plus his last ~8 games of contact and last 5–20 PA of results.
6. **How it's calculated:** A weighted blend of those inputs. Penalties then apply for trap profiles (e.g. ground-ball contact, an ace on the mound), and it's capped at 59 unless three strong signals line up. The final number leans 70% on that blend and 30% on recent home-run form. *(md:8440–8588, 9069–9100)*
- **Measured (clean pregame, 21 nights):** 70+ homered 25.0% (14/56); under 30 homered 8.6% (184/2130); 11.5% base. Small at the top: 56 hitter-games.

## Power-3 (MOONSHOT)
1. **What it is:** Who hits it hardest and farthest all season: HR per batted ball, average exit velo, max exit velo.
2. **Why it matters:** Season power, the strongest single input in the clean record, on its own scale.
3. **What goes in:** Season HR per batted ball, season average EV, season max EV.
4. **How to read it:** 100 means best on tonight's slate in all three.
5. **Timeframe:** Season to date, ranked on tonight's slate.
6. **How it's calculated:** Each of the three is ranked within tonight's slate and the ranks are averaged. *(md:10861–10883)*
- **Measured:** none clean yet. The pregame record didn't log Power-3 (it does from bot commit 2026-10-01 on), and on 13 archived pregame boards its top ten homered 16.9% (22/130), too few to quote.

## HRW: the HR window (MOONSHOT)
1. **What it is:** How his bat has looked lately: recent contact quality plus recent results. 0–88.
2. **Why it matters:** A hot window is the short-term half of a home-run read. The season half is HR score and Power-3.
3. **What goes in:**
   - last 20 PA: ideal-HR contact, barrels, 350 and 375 ft balls, hard-hit, exit velo, fly balls, pull, xwOBA;
   - last 7 games: HR, XBH, hits, AVG, R+RBI;
   - last 5 games: the same, as confirmation. *(md:9531–9605)*
4. **How to read it:** 🌋 80+ · 🚀 70+ · ⚡ 55+ · 🌤️ 45+ · 🧊 below.
5. **Timeframe:** His last 20 plate appearances and his last 5–7 games.
6. **How it's calculated:** 42% recent contact, 38% last-7 results, 20% last-5 confirmation, plus a bump for recent homers. Scaled by how much recent data there is, and capped at 88.
- **Measured (clean pregame, 21 nights):** 80+ homered 17.0% (46/271); under 45 homered 9.9% (262/2637).

## DC: damage conversion (MOONSHOT)
1. **What it is:** When he squares one up, how often it becomes damage instead of an out.
2. **Why it matters:** It separates loud contact from loud outs. Two hitters can square it up the same amount; this says whose hard contact turns into extra bases. Weak on its own (clean pregame record: its top ten homered 15.2%, 32 of 210) — read it next to the HR score, not instead of it. *(Donovan's pick, 10-01)*
3. **What goes in:** His damage on the pitch types he'll see (ISO, SLG, barrels, hard-hit); his recent batted-ball shape (375+ ft balls, max EV, launch angle, pull-air); the starter's mistakes (barrels and hard-hit allowed, HR/9); how the two overlap; the park. *(md:7246–7379)*
4. **How to read it:** 0–100, higher is better.
5. **Timeframe:** Season and pitch-type history, plus his last ~8 games of batted balls.
6. **How it's calculated:** 30% his pitch damage, 24% recent shape, 22% pitcher mistakes, 14% overlap, 10% park and weather. Points are taken off for heavy ground-ball contact, high strikeouts or a thin sample.

## Board rank, # (MOONSHOT)
1. **What it is:** His place on tonight's board, #1 first, over the whole slate.
2. **Why it matters:** The same order as the full board, the alerts and the posts.
3. **What goes in:** HR score, season home runs, season average exit velo.
4. **How to read it:** #1 first. Filtering hides rows; it never renumbers them.
5. **Timeframe:** Tonight.
6. **How it's calculated:** Each of the three is ranked within tonight's slate and the ranks are averaged. *(md:10885–10916)*
- **Measured:** none clean yet. Board rank is logged pregame from 2026-10-01 on.

## TD score (TUDDY)
(Unchanged from v1 pending the NFL audit now running: the copy stays, and any measured line waits
for that audit's clean numbers.)

## Goal score (LAMP)
1. **What it is:** Tonight's goal-board score: three percentile ranks averaged (shots, goals and ice time per game).
2. **Why it matters:** Who gets the most shots, who's been finishing them, and who's on the ice the most — ranked against everyone playing tonight. It's the first filter for a goal; the goalie and the matchup aren't in it yet. *(Donovan's pick, 10-01)*
3. **What goes in:** Shots, goals and ice time per game.
4. **How to read it:** Ranks tonight's pool, 0–100; not a probability.
5. **Timeframe:** His last 82 NHL games, this season first.
6. **How it's calculated:** Three percentile ranks among tonight's scored skaters, averaged.
- **Measured:** waits for the NHL audit now running.

## CALLED (all three)
(Unchanged from v1.)
