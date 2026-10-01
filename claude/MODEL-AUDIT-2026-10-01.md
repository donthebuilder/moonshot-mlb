# All three sports: models, markets, backtests, health (2026-10-01)

Four read-only audits plus a site health check. Every number below is measured only on data
written before the game. Samples are small throughout, so treat everything as direction, not proof.

## Health
- **Pages and APIs:** all 19 return 200 in 0.2–1.4 s.
- **Bot workflows:** all 9 most recent runs green.
- **Data:** MLB is ~5 h old, NFL ~2 h.
- **Per-minute jobs:** all writing (push, LAMP lock and grade, odds, FRANCHISE sync hourly at ~4 s).

## MLB (MOONSHOT)
- **The leak:** the graded archive is post-game. Fixed at the source: every locked pregame row is
  kept permanently (`por_rows`, bot b41f7684).
- **On clean data (21 nights, 229 games, 11.5% base):**
  - TOP pick 18.5%; HR pick 13.5%.
  - HR score ranks (terciles 6.9 / 12.8 / 14.8%).
  - Season power is the strongest single input.
  - Season-long, the locked TOP pick is 20.0% (1,593).
- **The weak ones:**
  - The HIT pick doesn't beat its base (64.5% vs 64.0%). At the price it went 56.9% vs 68.2%
    implied (ROI −15.7% ±10.3, n=51).
  - The CONTACT pick is *below* its base (32.4% vs 39.0%).
  - Neither score ranks by tercile.
- **Odds:** no proven HR edge. TOP/HR picks +20% ±22 (n=112) fall apart without 2 nights, and
  where prices are clean the book ranks homers better than our score (AUC 0.67 vs 0.57).
- **Done:**
  - three HR challenger picks logged nightly (6d75dfdf);
  - Power-3 and board rank logged pregame (eabbda80);
  - the price-band claims are off the site (2a615e6).
- **Open:**
  - the bot's dated odds archive is built from the unfrozen board (`odds_fetch.py`);
  - no calibrated probability is published (`probability` is null);
  - runs, RBI, SB and pitcher K have prices but no model.

## NFL (TUDDY)
- **Week 1's record graded the week-2 card.** It was built with week-1 results, so selected with
  hindsight; the per-market lines differ from the true pregame card. The guard is fixed going
  forward (148eaf68). **The published w01 record is not regraded yet: decision.**
- **Duplicate rungs were graded twice**, e.g. Javonte Williams TD #2 and #3. Fixed going forward
  (a4e76b90, tested), before the week-4 lock. Past weeks are not rewritten: decision.
- **On 3 weeks, against a single-stat ranking:**
  - only TD separates (top 5 14/15 vs 8/15);
  - REC, RUSH_YDS, RUSH_ATT, PASS_YDS and KICK_PTS don't beat their own single form stat;
  - KICK top-15 is below its base.
- **The bars are far below the book lines** (REC_YDS bar 40 vs lines 57–92). The ~86% hit rates
  aren't bettable; at the book line the w3 card went 2/5 and 1/5.
- **TD model:** 53% of its weight is one red-zone signal counted three ways; six derived terms are
  dead.
- **The score is a league rank pushed through a fixed curve:** #1 always reads ~79.5, so "A+" just
  means #1.
- **The report card's "2024 out of sample" isn't true** for TD and RUSH_ATT.

## NHL (LAMP)
- **No leak.** Locked before puck drop, never re-scored.
- **Regular season is 2 nights:**
  - CALLED goal 23% vs 14.8% base (17/74 incl. preseason);
  - CALLED SOG 3+ 41.7% vs 20.5% (10/24).
  - Nothing significant yet.
- **Bug fixed (9ccc146):** the odds join was rate-limited by the league, so whole teams went
  unpriced.
- **Open:**
  - "LOCKED" shows from the first write while rows keep changing until about 10 min out;
  - the TOI leg pulls in defencemen (7.1% vs 19.4% for forwards);
  - points and assists have prices and grading data but no model.

## Decisions for Donovan
1. **NFL week 1:** regrade it against the true pregame card, or label it "unlocked"?
2. **NFL duplicate rungs in w02/w03:** count each player once (correcting the published totals), or
   leave them as published with a note?
3. **Claims cleanup:** branch `claims-off`, 25 files, 536 lines of unverified percentages out
   (summary in its commit). Merge and push?
4. **MLB HIT and CONTACT picks don't beat their bases.** Shadow-test challengers (as for HR) before
   changing anything?
5. **NFL:** shadow `nfl_td_v3`, with the red-zone terms merged, and grade against the book line
   where a price exists?
6. **New markets** (MLB runs/RBI/SB/K; NHL points/assists): build them as hidden shadow models
   first, or wait until the existing markets show lift?
