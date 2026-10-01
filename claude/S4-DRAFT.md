# S4 DRAFT: "What am I looking at?" (for Donovan's review, 2026-10-01)

BATCH-SIGNAL-WHY S4: one panel, six answers, on every proprietary number, through the existing
tap-to-explain. The plan's rule is copy only from what the site already says, with no new claims and
no hit rate without its n and its source. Each answer below is a quote from the codebase, trimmed to
phone length and cited. Where nothing exists, it says **NEEDS YOUR WORDS**: tell me the line or
say "leave it out". Nothing ships until you answer.

**Decide first: HRW means three different things on the site today.**
- (A) lib/boardColumns.js:417: "The HR-window score. The 🌋 🚀 ⚡ 🌤️ 🧊 band on a hitter card is this number."
- (B) components/Explain.js:89: "HR Watch — the bot's separate 'he looks due to go deep' read."
- (C) RankedBoard.js:46, Shortlist.js:495, pills.js:21: "The HR score with tonight's park and weather folded in."

Which one is true? The answer also fixes the other two places that say otherwise.

---

## HR score (MOONSHOT)
1. **What it is:** Ranks the slate on how good tonight looks for him to go deep: his power, the arm he faces, the park and the weather, plus how many trips to the plate he is likely to get. *(Explain.js:66)*
2. **Why it matters:** A 70 is a lean, not a lock. It runs backwards on contact, so don't read a high HR score as "good hitter tonight". *(ScoreBands.js:240, :244–247)*
3. **What goes in:** Season-long power (ISO, slugging, homers per plate appearance) at 0.24 of the score since 2026-08-09, plus opportunity. *(Explain.js:69–70)*
4. **How to read it:** A ranking, not a percentage. A 78 sits above a 62; it is not a 78% chance. Bands: 70+ · 50–70 · 30–50 · under 30. *(Explain.js:51; scoreBands.js:68)*
5. **Timeframe:** Tonight's slate. *(AtThePlate.js:800)*
6. **How it's calculated:** **NEEDS YOUR WORDS.** The site lists the inputs but no formula.
- **Measured:** 70+ homered 19.8% against a 15.7% base, over 62 nights (2026-04-16 to 08-12, 5,807 rows). *(ScoreBands.js:238; scoreBands.js:81–116)*

## Power-3 (MOONSHOT)
1. **What it is:** Who hits it hardest and farthest all season: HR per ball in play, average EV and max EV. *(Guide.js:312)*
2. **Why it matters:** Who has hit the ball hardest and farthest all season. Almost nothing else survives testing. *(Guide.js:181)*
3. **What goes in:** Season home runs per batted ball, season average exit velocity, season hardest ball hit. *(Guide.js:194–196)*
4. **How to read it:** 100 is best on the slate in all three. *(Power3Board.js:45)*
5. **Timeframe:** Season-long inputs, ranked on tonight's slate. *(Explain.js:91)*
6. **How it's calculated:** Each input is ranked inside tonight's slate and the three ranks are averaged. *(Guide.js:198)*
- **Measured:** The top ten each night homered 21.4% of the time over 155 nights (11.2% base). *(Explain.js:91)*

## HRW (MOONSHOT): blocked on the decision above
1. **What it is:** depends on A, B or C.
2. **Why it matters:** The bot's strongest single term in the audit. *(Power3Board.js:63)* The "80+ homered 25%" line has **no n anywhere**, so it stays out until you give one.
3. **What goes in:** **NEEDS YOUR WORDS.** Only "park and weather folded in" exists, and that's reading C.
4. **How to read it:** 🌋 Erupting 80+ · 🚀 Launching 70+ · ⚡ Live 55+ · 🌤️ Warming 45+ · 🧊 Cold below. *(hrwBand.js:37–41)*
5. **Timeframe:** **NEEDS YOUR WORDS.**
6. **How it's calculated:** **NEEDS YOUR WORDS.**

## DC: damage conversion (MOONSHOT)
1. **What it is:** When he does square one up, how often it becomes real damage instead of an out. *(Explain.js:130)*
2. **Why it matters:** Hard contact plus damage conversion supports extra bases. *(verdict.js:161)*
3. **What goes in:** **NEEDS YOUR WORDS.**
4. **How to read it:** 0–100, higher is better. *(Explain.js:130; Shortlist.js:539)*
5. **Timeframe:** **NEEDS YOUR WORDS.**
6. **How it's calculated:** **NEEDS YOUR WORDS.**
- **Measured:** none on file.

## Board rank, # (MOONSHOT)
1. **What it is:** His position on tonight's board, #1 first, over the whole slate. *(boardColumns.js:321)*
2. **Why it matters:** On the pregame record that order finds more homers than the score alone. Same order as the full board, the alerts and the tweet. *(RankedBoard.js:57)*
3. **What goes in:** The HR score, season home runs and season exit velocity. *(boardColumns.js:321)*
4. **How to read it:** #1 first. Filtering hides rows; it never renumbers them. *(boardColumns.js:321)*
5. **Timeframe:** Tonight's board. *(boardColumns.js:321)*
6. **How it's calculated:** Each of the three is turned into a rank within tonight's slate, and the ranks are averaged. *(HitsHRR.js:151)*
- **Measured:** On 21 pregame nights, 22% of its top ten homered against 17% for the HR score alone. *(HitsHRR.js:151)*

## TD score (TUDDY)
1. **What it is:** Ranks the slate on how good this week looks for him to score a touchdown: how often he gets the ball near the end zone, how much his offense is expected to score, and the defense he faces. *(nfl/glossary.js:59)*
2. **Why it matters:** A top grade only appears where the evidence is genuinely elite. *(nfl/Guide.js:55)*
3. **What goes in:** Goal-line opportunity, red-zone touches, implied team total, expected TDs, touches, snap share, defense TD softness. *(nfl/scoreLabels.js:17–24)* "TD regression (due)" is left out: it was zeroed out of the model on 2026-09-14 *(glossary.js:199)*.
4. **How to read it:** A rank, not a probability; a 67 does not mean 67%. Grades: A+ 78, A 70, A- 62, B+ 54, B 46. *(nfl/Guide.js:40, :48–50)*
5. **Timeframe:** This week. Early-season carryover uses last season's per-game baseline. *(glossary.js:59; nfl/Guide.js:153)*
6. **How it's calculated:** Each component is ranked against every qualified player in the league, then the blend is ranked league-wide on the same scale as MOONSHOT's. *(nfl/Guide.js:45–49)*
- **Measured:** none quoted on purpose: two graded weeks isn't enough. *(glossary.js:35–38)* Points to the Report Card.

## Goal score (LAMP)
1. **What it is:** Tonight's goal-board score: the mean of three percentile ranks, shots, goals and ice time per game. *(lamp/Player.js:147)*
2. **Why it matters:** **NEEDS YOUR WORDS.**
3. **What goes in:** Shots, goals and ice time per game. *(lamp/Guide.js:58)*
4. **How to read it:** Ranks tonight's pool, 0–100; not a probability. *(LampHeadline.js:67)*
5. **Timeframe:** His last 82 NHL games, this season first and last season for the rest. *(lamp/Guide.js:67)*
6. **How it's calculated:** Three percentile ranks averaged; nothing hidden, nothing priced. *(lamp/tabExplainerTexts.js:11)*
- **Measured:** live on the record page; no fixed figure.

## CALLED (all three)
1. **What it is:** CALLED is one of the board's designated picks. ON THE BOARD is scored and ranked, but not a call. NOT ON THE BOARD is not scored. Same words, same meaning, on all three sports. *(lamp/Guide.js:66)*
2. **Why it matters:** A call is graded; a high board rank on its own is not a call. *(nfl/Picks.js:305)*
3. **What goes in:** MLB: a TOP, HR, HIT, HRR or CONTACT pick *(callStatus.js:25, a code comment until now, so this would be its first user-facing appearance)*. LAMP: the top three in his game *(lamp/FullBoard.js:83)*. TUDDY: the bot's designated TD picks.
4. **How to read it:** Tags are frozen when the event is first seen and never re-graded. *(called/page.js:110)*
5. **Timeframe:** Before first pitch, kickoff or puck drop. *(start/page.js:186; called/page.js:165)*
6. **How it's calculated:** The pregame role, stored at the time; nothing is re-derived after. *(called/page.js:110, :166)*
- **Measured:** live on /called.

---

**Also unsourced, kept out:** "The bot's headline picks homer about 29% of the time" *(Explain.js:52)* has no n.
