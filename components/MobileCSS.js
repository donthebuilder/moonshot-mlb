'use client'
import { C } from '../lib/theme'

export default function MobileCSS() {
  return (
    <style jsx global>{`
      /* ── THE STICKY HEADER BUG (2026-08-16) ─────────────────────────────
         This line used to read "overflow-x: hidden" and it silently broke
         EVERY sticky element on the site, including the main header.

         overflow-x: hidden on <body> makes the body a scroll container. The
         page still scrolls the viewport, so a position:sticky child resolves
         against a box that never scrolls — it pins to nothing and rides the
         document out of view. Measured: scroll the Games tab 1400px and the
         header's getBoundingClientRect().top is -987, i.e. gone. The Games
         lineup jump-strip (sticky, top:0) went with it, which is why that
         strip has never actually stuck.

         overflow-x: clip does the same visual job — it stops the horizontal
         bleed a wide table causes — WITHOUT establishing a scroll container,
         so sticky keeps working. Only <html> keeps a hidden fallback for the
         handful of engines that do not know clip; html is the viewport's own
         scroller, so it is harmless there.

         Verified by screenshot after the change, not by reasoning about it. */
      /* Announced to a screen reader, invisible to everyone else. Carries the
         <caption> that says WHICH team's box you have landed in -- the team
         name is rendered above the table as a plain div, which is a heading to
         the eye and nothing at all to a screen reader. */
      .sr-only {
        position: absolute; width: 1px; height: 1px;
        padding: 0; margin: -1px; overflow: hidden;
        clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0;
      }
      /* A scrollable region has to be reachable by keyboard (WCAG 2.1.1), and
         a focus ring it cannot show is the same as no focus ring. */
      .box-scroll:focus-visible { outline: 2px solid rgba(249,115,22,.7); outline-offset: 2px; }

      html { max-width: 100%; overflow-x: hidden; }
      body { max-width: 100%; overflow-x: clip; }
      * { box-sizing: border-box; }

      /* ── BUTTONS INHERIT THEIR TEXT COLOUR ──────────────────────────────
         2026-08-15, Donovan's Near Misses screenshot: every player name on
         that board rendered in a dim grey while the numbers beside them were
         bright. Not a colour choice — a <button> does NOT inherit colour from
         its parent, it falls back to the UA's own ButtonText, and a row built
         as a button with no explicit colour renders in that instead of the
         site's text colour. A sweep found 34 buttons in this codebase with no
         colour of their own; any of them that renders bare text has the same
         invisible-name bug waiting.
         One rule fixes all of them, and cannot break the ones that are
         already correct: an inline style always beats a stylesheet, so every
         button that sets its own colour keeps it. */
      button { color: inherit; }

      @media (max-width: 860px) {
        .dash-header-inner { padding: 8px 10px 8px !important; }
        .dash-title { font-size: 17px !important; }
        .dash-subtitle { font-size: 9px !important; max-width: 185px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .dash-logo-mark { width: 28px !important; height: 28px !important; border-radius: 9px !important; font-size: 10px !important; }
        .dash-mode-buttons { gap: 5px !important; }
        .dash-mode-buttons button { padding: 6px 9px !important; font-size: 10px !important; }
        .dash-tabs { flex-wrap: nowrap !important; overflow-x: auto !important; padding-bottom: 3px !important; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .dash-tabs::-webkit-scrollbar { display: none; }
        .dash-tabs button { flex: 0 0 auto !important; padding: 6px 8px !important; font-size: 10px !important; }
        .dashboard-main { padding-left: 10px !important; padding-right: 10px !important; padding-bottom: 18px !important; }
        /* three cells since the ✨ spotlight got its own column (2026-08-15) —
           this was still forcing two, which wrapped the button to a new row */
        .dash-controls { grid-template-columns: 1fr 108px auto !important; gap: 7px !important; }
        .modal-box { width: calc(100vw - 16px) !important; max-width: calc(100vw - 16px) !important; border-radius: 16px !important; }
        .modal-content { padding: 16px 14px 18px !important; }
        .stat-grid-two { grid-template-columns: 1fr !important; gap: 0 !important; }
        table { font-size: 10px !important; }
        th, td { padding: 6px !important; }
        .scoreboard-wrap { margin-left: -2px !important; margin-right: -2px !important; }
        .scoreboard-table { min-width: 1100px !important; }
        .scoreboard-player-col { position: sticky !important; left: 0 !important; z-index: 3 !important; background: ${C.bg2} !important; box-shadow: 8px 0 12px ${C.shadow}; }
        .scoreboard-player-cell { max-width: 138px !important; overflow: hidden !important; text-overflow: ellipsis !important; }
      }

      @media (max-width: 700px) {
        .dash-grid { grid-template-columns: 1fr !important; gap: 9px !important; }
        .leaders-controls { grid-template-columns: 1fr !important; }
        h2 { font-size: 20px !important; }
        button { min-height: 32px; }
        input, select { font-size: 12px !important; }

        /* ── ★ YOUR PLAYERS, ON A PHONE (2026-09-03) ──────────────────────
           Shipped this morning as one flex line: dot, name, role, matchup,
           then the line and the game state pushed right with margin-left
           auto. That fits a monitor. On a 390px screen the right-hand group
           had nowhere to go, so "HR · HRR" broke onto its own line under the
           middle of the row and "top 5th" ran off the edge under the × —
           exactly the screenshot.
           Two lines here instead of one squeezed one: who, then what he did.
           The × pins to the first line so the hit area is never under the
           numbers, and nothing is dropped — the same facts, stacked. */
        .yp-row { flex-wrap: wrap !important; row-gap: 2px !important; }
        .yp-line { margin-left: 0 !important; width: 100% !important; padding-left: 14px !important; }
        .yp-x { position: absolute !important; right: 6px !important; top: 4px !important; }
        .yp-row { position: relative !important; padding-right: 30px !important; }
      }

      @media (max-width: 520px) {
        /* ── COLUMNS THAT EARN THEIR PLACE ON A DESK, NOT IN A HAND ────────
           The three season panels added on 2026-09-03 (October odds, the
           comeback board, the moneyline log) each carry seven or eight
           columns. Each table is wrapped in its own overflow-x:auto — it has
           to be, because body{overflow-x:clip} above turns a too-wide table
           into a SILENTLY TRUNCATED one rather than a scrolling one — but a
           panel you have to drag sideways to read is a panel nobody reads.

           So the supporting columns come out at phone width and the question
           each panel answers stays: who wins the World Series, who comes
           back, where the model disagrees. The full table is still one
           rotation or one desktop away, and nothing is removed from the DOM
           on a wide screen, so this costs a reader nothing.

           Donovan, on the standing mobile item: "a lot of the optimizing in
           general is just fitting everything in the screen without it being
           overbearing." */
        .sm-hide { display: none !important; }

        /* ── THE HIGHLIGHT PILL STOPS TAKING A WHOLE ROW (2026-09-03) ──────
           Donovan: "the highlight button being on its own row pisses me off,
           it can sit right next to All teams if sized right."
           It was 1fr — one column — so search, the team dropdown and the ✨
           pill each got a line of their own, three rows deep before any
           content. Search keeps a full-width line because a search box that
           cannot show what you typed is useless; the other two share the
           second line, which is what they were always narrow enough to do. */
        .dash-controls { grid-template-columns: 1fr auto !important; }
        .dash-controls > :first-child { grid-column: 1 / -1 !important; }
        .modal-backdrop { padding: 8px !important; align-items: flex-start !important; }
        .modal-box { max-height: 94vh !important; }
        .modal-content { padding: 14px 12px 16px !important; }
      }

      @media (max-width: 390px) {
        .dash-title { font-size: 16px !important; }
        .dash-subtitle { display: none !important; }
        .dashboard-main { padding-left: 8px !important; padding-right: 8px !important; }
      }

      /* ── Phone pass for everything added since the original mobile rules ──
         Desktop is the primary surface, but the site gets checked on a phone
         during games, so the rule is: nothing overflows, nothing is unreadable,
         and the dense tables stay usable by scrolling sideways with the batter
         name pinned. No card-view rewrite — a stat table read as cards loses
         the comparison that makes it a table. */
      @media (max-width: 860px) {
        /* Header slate strip: let it wrap instead of squeezing, and shrink the
           pills so two fit per row rather than one and a half. */
        .dash-header-inner > div { min-width: 0 !important; }

        /* Every DenseTable scrolls sideways with momentum, and the sticky
           first column keeps the name visible while you do. */
        .dense-scroll {
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .dense-scroll::-webkit-scrollbar { display: none; }
        .dense-scroll table { font-size: 10px !important; }
        .dense-scroll th, .dense-scroll td { padding: 5px 5px !important; }

        /* -- THE BOX SCORE, ON A PHONE (2026-09-01) ------------------------
           Measured at 375px once it was visible again: the batting table wants
           342px inside a 331px card. Eleven pixels. AVG is the widest column
           at 38 and the only one that is not about tonight -- it is the season
           average a man brought INTO the game, which a newspaper box does not
           print either. Dropping it on a phone takes the table to 304 and the
           sideways scroll goes away entirely.

           The row height is 24px, exactly the WCAG 2.5.8 target minimum, so
           nothing here shrinks it. */
        .box-avg { display: none !important; }

        /* Modals go effectively full-screen. A centred card with margins wastes
           a third of a phone screen on backdrop. */
        .modal-backdrop { padding: 0 !important; align-items: flex-start !important; }
        .modal-box {
          width: 100vw !important; max-width: 100vw !important;
          max-height: 100vh !important; border-radius: 0 !important;
          border-left: none !important; border-right: none !important;
        }
        .modal-content { padding: 14px 12px 24px !important; }

        /* Player-card tab row scrolls rather than wrapping to three lines. */
        .modal-content > div[style*="flex-wrap"] { }

        /* Spray chart takes the full width and drops its side panel below. */
        .spray-wrap { flex-direction: column !important; }
        .spray-wrap svg { max-width: 100% !important; height: auto !important; }

        /* Bot picks: one card per row, which is the readable form on a phone. */
        .bot-picks-grid { grid-template-columns: 1fr !important; }

        /* Filter bars stack instead of cramming five controls onto one line. */
        .board-filters > div:first-child { flex-direction: column !important; align-items: stretch !important; gap: 9px !important; }
      }

      /* ── 2026-08-05 pass: everything added since the last mobile sweep.
         The viewport export in app/layout.js is the real fix (the queries
         below never fired without it); these rules cover the new surfaces. */
      @media (max-width: 860px) {
        /* SVG charts (P/L curve, rolling form, spray, pitcher field) never
           exceed the screen. */
        svg { max-width: 100%; height: auto; }
        /* Start Here: step cards stack full-width, legend wraps freely. */
        .dash-grid, .bot-picks-grid { grid-template-columns: 1fr !important; }
        /* ── NO PARENTHESIS INSIDE AN ATTRIBUTE VALUE (2026-09-02) ──────
           This selector read  div[style*="minmax(132px"]  and it was quietly
           destroying most of this stylesheet in production.

           Next's CSS minifier UNQUOTES an attribute value with no spaces in
           it, so the shipped bytes are  div[style*=minmax(132px] . An
           unquoted attribute value must be a valid identifier, and that one
           is not -- so Chrome fails the selector AND, because the open paren
           starts a block it then tries to balance, swallows everything up to
           the next close paren anywhere in the sheet. Measured on the built
           page: 11 of 88 top-level rules parsed. Everything after this line
           -- the slate tiles, the ticker, the sticky scoreboard column, the
           whole later half of this file -- has never applied to a production
           build. It works in dev, which is why it lasted this long: dev is
           not minified.

           The visible symptom was the header. .slate-tiles-set never got its
           display:flex, so the tiles stacked as blocks at height:100% and the
           strip rendered as two 220px-tall boxes showing GAMES and nothing
           else.

           The fix is to keep brackets out of attribute values. Two paren-free
           substrings select the same inline styles, and the minifier can
           unquote those all it likes. Same fix on linear-gradient further
           down. And no backticks in this comment: the whole file is one
           template literal. */
        /* Game selector cards: two per row is the readable phone density. */
        .dashboard-main div[style*="minmax"][style*="132px"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        /* Toolbar chip rows (Boards categories, sheet section nav, market
           buttons) scroll sideways instead of wrapping to four lines. */
        .chip-row {
          flex-wrap: nowrap !important; overflow-x: auto !important;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .chip-row::-webkit-scrollbar { display: none; }
        /* THE BUILDER'S NAME PICKER (2026-08-23). The collapsed height is a
           whole number of rows on both sizes already (68px — three desktop
           rows, two phone rows), so only the EXPANDED height needs a phone
           value: 188px is eight desktop rows but five and a fifth phone ones.
           212 is six whole ones. */
        .anchor-chips.tall { max-height: 212px !important; }
        .anchor-chips::-webkit-scrollbar { display: none; }
      }

      /* ── THE GAME SWITCHER (2026-08-23) ───────────────────────────────────
         It was welded to the bottom edge, so .dashboard-main carried 74px of
         bottom padding to let the last card clear it and PairTray lifted 66px
         to avoid sitting underneath. Both were compensation for a FIXED
         element — and the whole rail moved to a sticky position under the
         header the day Donovan reported it fighting the phone's own close
         gesture, so both compensations came out with it. A sticky element in
         flow needs no room made for it anywhere.
         All that survives is hiding the rail's own scrollbar. */
      @media (max-width: 760px) {
        .game-switcher-rail::-webkit-scrollbar { display: none; }
      }

      /* ── EVEN ROWS: THE HEADER STRIP AND THE WELCOME CHIPS (2026-08-24) ───
         Donovan: "the top needs to be even, so does the part on the welcome."

         Both rows were content-width pills in a flex-wrap container, which
         means the break point is wherever the text happens to run out. On the
         header strip that stranded LINEUPS ✓ alone on a second line; on the
         welcome it stranded GRADED. Neither is a wrapping bug — it is what
         flex-wrap does with ragged children — so the fix is to stop the
         children being ragged.

         One basis for every cell, and flex-grow on, so a row fills its width
         edge to edge and a short last row closes itself out instead of
         leaving a gap. Best game gets a wider basis because it carries a
         matchup rather than a number; it still shares the grow factor, so it
         is proportionally larger rather than a different shape. The bases are
         MEASURED, not guessed: the header's vitals column is about 620px on a
         1280 desktop, so five tiles have to start at ~104px to share one row,
         and on a phone Best game takes a row of its own because a matchup and
         a score will not read at 116px.

         WHY A CHILD SELECTOR and not a wrapper div: two tiles in the header
         strip are elements passed down from Header.js that render null on
         most slates (nothing projected yet, no homer landed yet). A wrapper
         exists whether or not its child does, so wrapping would hold open an
         empty cell — exactly the gap this is removing. A child selector matches only
         what actually rendered. */
      .slate-tiles-set {
        display: flex; align-items: stretch; gap: 6px; padding-right: 6px;
        flex: none; min-width: max-content;
      }
      .slate-tiles-set > * { flex: 0 0 104px; min-width: 0; }
      .slate-tiles-set > .slate-tile-wide { flex: 0 0 146px; }
      .hero-stats > * { flex: 1 1 132px; min-width: 0; }
      @media (max-width: 520px) {
        /* NOWRAP NOW (2026-08-24, "fix the header mix it one line not
           two") — the strip scrolls instead of wrapping, so a tile never
           needs to claim a whole row of its own any more. Basis only
           grows slightly here for touch legibility; flex-grow/shrink stay
           at 0 so tiles hold their real width and the row scrolls under a
           thumb instead of squeezing shut. */
        .slate-tiles-set > * { flex-basis: 116px; }
        .slate-tiles-set > .slate-tile-wide { flex-basis: 158px; }

        /* ── THE HERO CHIPS STOP CUTTING THEIR OWN VALUES OFF (2026-09-03) ──
           Donovan: "for the home page please make sure everything is
           readable."
           At 124px basis, two to a line, every chip was an ellipsis: PROJ HR
           read "2…", FIRST PITCH WAS "4:15…", BEST AIR "UNIQLO Fiel…". A tile
           whose whole job is one number, printing a truncated number, is
           worse than no tile — you cannot even tell whether it is 2 or 24.
           Full width and two lines here: the label keeps its own line and the
           value gets the whole screen, so nothing truncates and nothing is
           dropped. Five short rows on a phone, one even strip on a monitor. */
        .hero-stats { flex-direction: column !important; gap: 5px !important; }
        .hero-stats > * {
          flex: 0 0 auto !important;
          width: 100% !important;
          align-items: baseline !important;
          flex-wrap: wrap !important;
        }
        .hero-stats > * > b,
        .hero-stats > * > span:last-child {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }
      }

      /* ── THE TICKER (2026-08-24, later still) ─────────────────────────────
         Donovan: "make it moving like espn or like stock tickers ... give
         data on the slate, home runs, projected, lineups, games, all that."
         SlateTiles.js renders its tile set twice into one track and this is
         what moves it: 0 to -50% is exactly one copy's width, so the instant
         the first copy scrolls out of the clipped viewport the second is
         sitting where the first started, and the loop is invisible. See that
         file for why the duplicate is safe to animate (nothing in the strip
         is clickable) and aria-hidden (it's a visual echo, not new content).

         26s is a read-it-without-straining pace for a real slate's tile
         count; it isn't derived from measured width the way the flex bases
         above are; a wildly longer or shorter strip would need retuning.

         Hover pauses for a mouse; SlateTiles.js also renders a persistent
         pause/resume control for touch and keyboard users. A manual pause
         hides the duplicate and restores sideways scrolling. Reduced-motion
         does the same automatically and hides a control that has nothing left
         to pause. */
      @keyframes slate-ticker {
        from { transform: translateX(0); }
        to { transform: translateX(-50%); }
      }
      .slate-tiles-viewport { overflow: hidden; }
      .slate-tiles { animation: slate-ticker 26s linear infinite; }
      .slate-tiles-viewport:hover .slate-tiles { animation-play-state: paused; }
      .ticker-paused .slate-tiles-viewport {
        overflow-x: auto !important; scrollbar-width: none; -webkit-overflow-scrolling: touch;
      }
      .ticker-paused .slate-tiles { animation: none; }
      .ticker-paused .slate-tiles-echo { display: none !important; }
      .ticker-paused .slate-tiles-viewport::-webkit-scrollbar { display: none; }
      @media (prefers-reduced-motion: reduce) {
        .slate-tiles { animation: none; }
        .slate-tiles-echo { display: none; }
        .slate-ticker-toggle { display: none !important; }
        .slate-tiles-viewport {
          overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch;
          padding-right: 0 !important;
        }
      }

      /* ══ QUIET MODE (2026-08-23) ═══════════════════════════════════════════
         Donovan: "we need a notifications setting somewhere to minimze the
         notis on screen for user" — the ❓ banners, the pills and toasts, and
         the live at-the-plate markers, all behind one switch (lib/quiet.js
         holds the state; QuietButton in the header flips it; the class lands
         on <html>).

         Every rule below hides PROSE ABOUT the page, never a number on it.
         Legends that state a threshold, refusals that say why something is
         blank, and sample sizes all stay: hiding those would let a figure be
         read as claiming more than it does, which is the one thing this site
         is not allowed to do. It is not a display: none on the hard parts.

         Anything can opt in by wearing .quiet-note. */
      html.quiet .quiet-note,
      html.quiet .tab-explainer,
      html.quiet .quiet-toast { display: none !important; }
      /* The live at-the-plate / on-deck markers (🎤 ⏳) are a running
         notification on a board you are trying to read. The rows they sit on
         stay; only the marker goes. */
      html.quiet .live-marker { display: none !important; }

      /* ── THE HEADER, ON A PHONE (2026-08-23) ──────────────────────────────
         Donovan: "the header and the things at the top of the screen are too
         big on mobile."
         Measured, not guessed: at 390px the sticky header was 232px tall on
         an 844px viewport — 27% of the screen gone before a single number of
         the actual slate. The breakdown was 38px of brand, 85px of the slate
         vitals strip, 34px of clock/theme/date and 32px of tabs.

         The 85px is the whole story: the vitals row is flex-wrap: wrap, so
         six tiles built for a 1300px header wrapped onto THREE lines. Making
         it one horizontally-scrollable line is the entire fix — every tile
         survives, in the same fixed left-to-right order (Games · Projected ·
         HR tracking · Best game · Weak · Lineups), and you swipe the row
         instead of the row eating a third of the page. Nothing is hidden and
         nothing is dropped; the strip just stops wrapping.

         Everything else here is trim: tighter header padding, and the meta
         row's controls allowed to shrink rather than force a new line. The
         header still condenses on scroll exactly as it did — this is about
         the height it starts at. */
      @media (max-width: 760px) {
        header > div:first-child { padding: 6px 10px 5px !important; gap: 8px !important; }
        .hdr-vitals {
          flex-wrap: nowrap !important;
          overflow-x: auto;
          justify-content: flex-start !important;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          flex: 1 1 100% !important;
          padding-bottom: 1px;
        }
        .hdr-vitals::-webkit-scrollbar { display: none; }
        .hdr-vitals > * { flex-shrink: 0 !important; }
        .hdr-meta {
          width: 100%; gap: 6px !important; justify-content: flex-end;
          min-width: 0;
        }
        .hdr-meta > * { flex-shrink: 0; }
        /* ── THE SPORT PILLS ARE GONE ON A PHONE (2026-08-29) ─────────
           Donovan: "do you see the bubbles at the top nfl and mlb, do we
           even need those any more, plus look at them, theyre off."

           Both halves of that are right. They were off: the thumb-target
           rule that used to live on this line forced min-height 32px (44px
           on a coarse pointer) onto pills the header draws at 22px, so a
           10px label sat inside a 39x44 box — the ellipses in the
           screenshots, not pills, and the reason MOONSHOT's 2026-08-23
           geometry fix never held on an actual phone.

           And they are no longer needed here: the bottom bar's More sheet
           now carries the whole network switch (MOONSHOT / TUDDY /
           FRANCHISE, marked with where you are), which is a better switcher
           than two unlabelled circles wedged beside the wordmark. Hidden
           under 760px only — the desktop header keeps its pills, where
           they render correctly and there is no bottom bar. */
        .sport-switch { display: none !important; }
      }

      @media (max-width: 390px) {
        .hdr-meta { justify-content: space-between; gap: 4px !important; }
        .date-badge > div > span:first-child { display: none; }
        .date-mode-switch button { padding-left: 9px !important; padding-right: 9px !important; }
        .palette-key-button { padding-left: 6px !important; padding-right: 6px !important; }
        .rail { padding-left: 8px !important; padding-right: 8px !important; scroll-snap-type: x proximity; }
        .rail button { scroll-snap-align: center; }
      }

      @media (max-width: 520px) {
        /* Vitals/verdict tiles: two per row keeps the numbers legible. */
        /* Paren-free, for the reason spelled out at the minmax rule above. */
        .dashboard-main div[style*="flex-wrap"] > div[style*="linear-gradient"][style*="135deg"] {
          flex: 1 1 42% !important; min-width: 42% !important;
        }
      }

      /* Coarse pointers get bigger hit targets regardless of width — the
         watchlist stars and swap buttons are 30px cells on desktop, which is
         under the 44px a thumb needs. */
      @media (pointer: coarse) {
        .dense-scroll td button { min-height: 44px !important; }
        .slate-tiles-viewport { padding-right: 50px !important; }
        .slate-ticker-toggle {
          width: 44px !important; min-width: 44px !important;
          height: 44px !important; min-height: 44px !important;
        }
        button { touch-action: manipulation; }
        details > summary { min-height: 44px; display: flex; align-items: center; }
        /* The boards pill row pinned itself mid-screen on phones — the
           condensed header animates its height, so its computed stickTop is
           wrong for part of every scroll and the row floats over content
           ("the page like breaks or follows when you scroll down",
           2026-08-17, with a screenshot of it sitting across the Power
           lead). Phones just don't pin it. */
        .board-pill-row { position: static !important; top: auto !important; }
      }

      /* 2026-08-06 live-layer surfaces. The lineup pick strip is one row of
         five on desktop; phones can't fit five readable chips, so they get
         the wrapping grid back. Slot-by-slot rows squeeze their L5 column
         out on narrow screens rather than truncating names. */
      @media (max-width: 560px) {
        .pickstrip { grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)) !important; }
        .board-filters input[type="range"] { min-height: 28px; }
      }

      /* Player tab (2026-08-06): the list+detail grid became a sliver war on
         phones. Stack them — search + a SHORT scrollable list on top, the
         full detail below it, nothing sticky (sticky sidebars fight thumb
         scrolling). */
      /* The palette panel is a viewport sheet on a phone and an anchored
         popover on a desktop — see components/PaletteButton.js. The component
         ships the phone geometry inline (so it is right during streaming) and
         this rule restores the desktop one, which is the only place the
         anchored version actually fits. */
      @media (min-width: 561px) {
        .palette-pop {
          position: absolute !important;
          top: calc(100% + 8px) !important;
          left: auto !important; right: 0 !important;
          width: min(92vw, 320px) !important;
        }
      }

      @media (max-width: 360px) {
        .site-colour-key-grid { grid-template-columns: 1fr !important; }
      }

      .archive-night-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr));
        gap: 6px; max-height: 236px; overflow-y: auto; scrollbar-width: thin;
      }
      .archive-night-grid button { min-width: 0; min-height: 40px; }
      @media (max-width: 560px) {
        .archive-night-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .archive-night-grid button { min-height: 44px; }
      }

      @media (max-width: 700px) {
        .playerboard { grid-template-columns: 1fr !important; }
        .playerboard-side { position: static !important; }
        /* min-width: 0 IS NOT DECORATION (2026-08-10). One-fr is shorthand
           for minmax(auto, 1fr), and auto there is the item's MIN-CONTENT — so
           a single child that refuses to shrink stretches the track past the
           viewport and takes the whole page with it, which is what a phone
           shows as everything clipped at the same right edge. The player card
           holds the widest things on the site (a seven-column props matrix, a
           six-box stat strip, a row of tab pills), so this column is the one
           most likely to be dragged wide by one of them. Pinning both items to
           zero min-width means the tracks obey the screen and the wide child
           scrolls inside its own box, which is what its overflow-x is for. */
        .playerboard > * { min-width: 0 !important; }
        /* The list now owns the whole screen when it's showing (the detail
              pane is hidden entirely — see tabs/PlayerBoard.js), so it gets
              real height instead of a 34vh sliver you had to scroll inside
              while the page scrolled underneath it. */
        .playerboard-list { max-height: none !important; }
      }

      /* Lineups (2026-08-06): two batting orders side-by-side means 9-char
         columns on a phone. Stack the teams; the away/home divider rotates
         from a left border to a top border. Slot-by-slot rows drop the L5
         column so names and edge numbers keep their room. */
      @media (max-width: 640px) {
        .lineup-cols { flex-direction: column !important; }
        .lineup-cols .lineup-col { border-left: none !important; border-top: 1px solid #26262b; }
        .lineup-cols .lineup-col:first-child { border-top: none; }
        .l5col { display: none !important; }
      }

      /* ══════════════════════════════════════════════════════════════════
         PHONE PASS (2026-08-09) — "a lot of the I-don't-know-what-I'm-
         looking-at comes from mobile."

         Audited against the real components at a 390px viewport (≈374px of
         content after .dashboard-main's 8px gutters), not against a guess.
         Four findings, four fixes, all of them here rather than scattered
         through fifty components:
         ══════════════════════════════════════════════════════════════════ */

      /* ── 1. THE DENSE TABLES SCROLL, BUT NOTHING SAID SO ──
         Every board on this site is a DenseTable: 15-25 columns, sticky name
         column, horizontal scroll. On a phone you see the name and about
         three columns, with no scrollbar (we hide them), no shadow, and no
         hint. The honest reading of that screen is "the table is cut off and
         broken" — which is most of the confusion, on the most-visited views.
         Three things fix it: a fade at the right edge so the content visibly
         continues, a hard shadow on the sticky column so it reads as pinned
         rather than as a rendering artefact, and one line of text. */
      .dense-swipe { display: none; }
      @media (max-width: 860px) {
        .dense-wrap { position: relative; }
        .dense-wrap::after {
          content: ''; position: absolute; top: 1px; right: 1px; bottom: 1px; width: 30px;
          pointer-events: none; border-radius: 0 12px 12px 0;
          background: linear-gradient(90deg, rgba(17,17,19,0), rgba(17,17,19,.9));
        }
        /* the pinned column reads as pinned */
        .dense-sticky { box-shadow: 7px 0 11px rgba(0,0,0,.34); }
        /* ...and stops eating 45% of the screen. The inline width/min-width
           on these headers is 148-240px, set for a desktop table; min-width:0
           lets the column shrink to its content and max-width caps it, so a
           long name ellipsises (the cell already has overflow:hidden) instead
           of leaving four columns of room for the numbers. Narrow sticky
           columns (Spot, Split, Date) are unaffected — they're already under
           the cap. */
        .dense-sticky { width: auto !important; min-width: 0 !important; max-width: 124px !important; }
        .dense-swipe {
          display: block; margin-top: 5px;
          font-size: 10px; color: #f97316; line-height: 1.5;
        }
        .dense-swipe span { color: #6b6b74; }
      }

      /* ── 2. ANYTHING UNDER 9px IS NOT READABLE ON A PHONE ──
         The design language leans on 8-9.5px for labels, units and captions.
         That's legible on a 27" monitor at arm's length and genuinely not
         legible on a phone, and it is disproportionately the text that says
         WHAT a number is — exactly the "what am I looking at" text.

         Matching on the inline style is ugly but it is the only handle:
         every size on this site is an inline style, so no class selector can
         reach them. Verified safe: grepped for fontSize 80-99 across
         components/ and there are none, so a font-size:8 / font-size:9
         prefix can only ever match 8-9.5px. SVG charts set font-size as an
         ATTRIBUTE, not a style, so no chart label is touched by this.

         BOTH SPACINGS ARE MATCHED ON PURPOSE. React's server render emits the
         style attribute as a raw string with no space after the colon
         (font-size:8.5px), but when the client sets or updates a style it
         goes through the CSSOM, and the browser re-serializes the attribute
         with a space (font-size: 8.5px). Matching only one form would make
         this rule work until the component re-rendered — the worst kind of
         bug to chase. */
      /* ── MOVED TO app/globals.css (2026-09-02) ──────────────────────────
         The reasoning above is right and this file could not deliver it.

         Next's CSS minifier unquotes an attribute value with no spaces, so
         [style*="font-size:8"] shipped from HERE as [style*=font-size:8] --
         an unquoted attribute value has to be a valid identifier, one with a
         colon in it is not, Chrome drops the selector, and because CSS
         discards an ENTIRE selector list when any one selector in it is
         invalid, it took the perfectly good spaced variants down with it.
         Measured on the built page: zero rules inside this media block, so
         every inline 7-9.5px size on the site has been rendering at its
         authored size on phones for as long as this rule has existed.

         The same declaration in app/globals.css comes out as
         [style*=font-size\:8] -- unquoted with the colon ESCAPED, which is
         valid and matches. Different pipeline, correct output. So the rule
         lives there now and this is the signpost, because the next person to
         wonder why the font floor is not in the mobile stylesheet will look
         here first. */

      /* ── 2a. 7.5px SLIPPED THROUGH (2026-08-10 portrait audit) ──
         The rule above was written against 8-9.5px and there are TWELVE inline
         7.5px sizes on the site that it never matched — the zone map's usage
         percentage under each cell, DenseTable's sort-order superscript, the
         header's slate line, ParkBoard, BvP, EV Log, the game cockpit, the
         lineup slot rows, At the Plate's ON DECK / IN THE HOLE labels and the
         deep-dive. 7.5px is not small text on a phone, it is decoration.
         Same substring trick, same verified-safe reasoning: grepped
         components/ for inline font sizes in the 70-79 range and there are
         none, so "font-size:7" can only ever match 7-7.9px. SVG charts set
         font-size as an ATTRIBUTE, so no chart label is touched. */
      /* The 7px floor moved to app/globals.css with the 8/9 one — same
         pipeline problem, same fix, and they belong together. */

      /* ── 3. TAP TARGETS ──
         Buttons already get min-height 32px under 700px. Coarse pointers get
         the full 44px target on dense rows, chips and navigation, where the
         compact desktop geometry would otherwise put adjacent actions too
         close together for a thumb. */
      @media (pointer: coarse) {
        .tap-row { min-height: 44px; padding-top: 8px !important; padding-bottom: 8px !important; }
        .dense-scroll td button { min-height: 44px !important; }
        .chip-row button, .dash-tabs button { min-height: 44px; }
      }

      /* ── 4. STRIPS THAT SQUEEZE ──
         Audited every flex strip in the high-traffic views rather than
         assuming: the bases are 200-340px almost everywhere, which already
         collapses to one card per row at 374px. The only ones that don't are
         the four-up number tiles — Home's "tonight at a glance", the Results
         takeaway tiles and the Backtest headline tiles, all flex 1 1 130-140px
         — which land 2+2 or, at some widths, an ugly 3+1 with the third tile
         clipping a 19px number. Pinned to an even two per row, then stacked
         outright below 380px where half of 374px can't hold "28.2%" plus its
         caption. Matched on the basis so all three strips are covered from
         one place; .home-stats is the same rule with a name on it. */
      @media (max-width: 560px) {
        .home-stats > div,
        [style*="flex:1 1 130px"], [style*="flex: 1 1 130px"],
        [style*="flex:1 1 140px"], [style*="flex: 1 1 140px"] {
          flex: 1 1 calc(50% - 5px) !important; min-width: calc(50% - 5px) !important;
        }
      }
      @media (max-width: 380px) {
        .home-stats > div,
        [style*="flex:1 1 130px"], [style*="flex: 1 1 130px"],
        [style*="flex:1 1 140px"], [style*="flex: 1 1 140px"] {
          flex: 1 1 100% !important; min-width: 100% !important;
        }
      }

      /* Tab headers: the "right" slot is three or four mode buttons that wrap
         into extra rows of pills under the h2, pushing the content down. One
         sideways-scrolling row instead. Only when there IS a right slot —
         :not(:first-child) keeps a bare title untouched. */
      @media (max-width: 700px) {
        .panel-title { align-items: stretch !important; }
        .panel-title > :last-child:not(:first-child) {
          width: 100%; overflow-x: auto; flex-wrap: nowrap !important;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .panel-title > :last-child:not(:first-child)::-webkit-scrollbar { display: none; }
        .panel-title h2 { font-size: 21px !important; }
      }

      /* The player modal already goes full-bleed at 860px. What it didn't do
         was leave room to breathe at the bottom — a full-height sheet on iOS
         hides its last rows behind the browser chrome — or keep its six tab
         pills on one line (that's the .chip-row it now wears). */
      @media (max-width: 860px) {
        .modal-content { padding-bottom: 40px !important; }
      }

      /* ══════════════════════════════════════════════════════════════════
         PORTRAIT CHARTS (2026-08-09) — "the charts are too big for portrait
         on the phone — on desktop everything is good."

         Every big visual on this site was sized for a desktop card and then
         left to fend for itself on a phone. Three distinct failures, not one,
         and they need three different fixes:

           TOO TALL FOR ITS WIDTH — the zone map (250px wide, 290px tall) and
             the spray field (a 440×312 picture pinned to a 340px height while
             its width collapses to ~340). Both end up as a narrow column of
             chart with dead space beside or under it.
           NO CEILING AT ALL — the heatmap grows with its row count, so a
             15-game slate is a 400px+ block that pushes the page it explains
             below the fold.
           TOO SHORT — rolling form is a 720×190 wide-format chart; scaled to
             a phone it is 92px tall with five lanes in it.

         The cap for anything that isn't a table: nothing over 48vh. A chart
         taller than half the screen means you can never see it and the number
         it belongs to at the same time, which is the whole point of a chart.
         ══════════════════════════════════════════════════════════════════ */
      @media (max-width: 560px) {
        /* Strike-zone map: take the card's full width (it was capped at 250px
           for a two-up desktop layout) and become a square instead of a tall
           box. min() keeps it under the 48vh ceiling on a short screen and
           under the desktop height on a big phone. The live pitch dots follow
           this automatically — their positions are calc(% - px), not px. */
        .zone-wrap { max-width: 100% !important; }
        /* 2026-08-29, Donovan: the zone map is "too small / cramped" on a
           phone. The 46vh cap was the binding one on a tall screen — it made
           the map smaller than the card it sits in for no reason, since
           nothing needs to stay above the fold with it. Raised to 62vh and
           the width cap to 92vw, which on a 390px phone takes the map from
           about 180px to about 330px: the 3x3 cells go from roughly 30px to
           55px, which is a real touch target rather than a pixel hunt. */
        .zone-grid { height: min(92vw, 340px, 62vh) !important; }

        /* Spray field: drop the fixed pixel height so the SVG takes its own
           aspect ratio from the viewBox, then cap it. */
        .spray-svg { height: auto !important; max-height: 46vh !important; }

        /* Heatmap: give it the ceiling it never had. It is already a scroll
           container, so nothing is hidden — it just stops being the page. */
        .heat-scroll { max-height: 52vh !important; }

        /* Rolling form: a floor, not a cap. preserveAspectRatio letterboxes
           rather than distorting, so the lanes stay honest. */
        .rf-chart { min-height: 148px; }

        /* Report-card sparklines: 260×64 each, one per category. Small enough
           already — this only stops a wide phone stretching them. */
        .rc-spark { max-height: 84px; }

        /* Two charts side by side (At the Plate) stack outright. */
        .chart-cols { flex-direction: column !important; }
        .chart-cols > div { flex: 1 1 auto !important; width: 100% !important; }
      }

      /* ══════════════════════════════════════════════════════════════════
         PORTRAIT PASS (2026-08-10) — a second audit at 390×844 specifically,
         after the 2026-08-09 pass. Five things the first pass didn't reach.
         Every one of them was found by measuring the real inline styles
         against 374px of content (390 minus .dashboard-main's 8px gutters),
         not by eyeballing a screenshot.
         ══════════════════════════════════════════════════════════════════ */

      @media (max-width: 560px) {
        /* 1. POOL MEMBERS — a pool IS its names, and they were in two columns
              of ~165px each with ellipsis on. "Vladimir Guerrero Jr." does not
              survive that, and a truncated pool tells you nothing. One column,
              full names. (Pools tab, both the graded and the pre-game view.) */
        .pool-names { grid-template-columns: 1fr !important; }

        /* LIVE WIRE PICKS. Two 300px columns don't fit 346px, so the grid was
              already collapsing — but to a row height built for a mouse. One
              column, a real tap target, and the name gets the width back. */
        .wire-picks { grid-template-columns: 1fr !important; gap: 1px !important; }
        .wire-picks > div { min-height: 30px; }

        /* STAT STRIP (2026-08-09, corrected the same day).
              Four boxes across a 346px card is ~82px each — enough for
              "Barrel / 24.3%" and not much else.

              THE FIRST VERSION OF THIS RULE FOUGHT THIS FILE AND WOULD HAVE
              WON. It bought width by shrinking the labels to 7px, which is
              precisely what rule 2a above exists to stop — and at equal
              !important a three-part class selector outranks an
              attribute-substring one, so the labels would have gone 8 → 10 →
              7 and reintroduced a fixed audit finding inside its own fix.

              Two columns instead. Each box gets ~160px, the labels keep the
              10px the rest of the site guarantees them, and the strip becomes
              two rows — which costs nothing in a card that scrolls anyway.

              THREE, NOT TWO (2026-08-10). Two was right when the strip was
              four boxes. The player card runs it at SIX, so two columns meant
              three tall rows — a third of a phone screen spent on six numbers,
              before the card had said anything. And HitRateBoxes wears the
              same class with exactly three boxes, so two columns split L5/L10
              from SEASON and made the odd one out look like a different kind
              of thing.

              Three columns is 113px a box on a 358px card. Measured against
              the widest label the strip publishes — EXIT VELO, 9 characters
              at 8px in the mono face, about 47px — that is twice the room it
              needs, so nothing shrinks and no label ellipsises. Six boxes
              become two rows, three become one. */
        .stat-strip { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 4px !important; }

        /* AT THE PLATE — the pitch sequence (2026-08-09). Six 54px pills plus
              gaps is 354px, which is four pixels past a 350px card. Rather
              than let the sixth pitch wrap alone onto its own line, the strip
              scrolls sideways: a sequence reads as a SEQUENCE, and breaking
              it across rows loses the one thing it's for. Momentum scrolling
              so it feels like the dense tables. */
        /* AT THE PLATE — the hero (2026-08-09). The name and the count tile
              sit side by side from ~700px up; on a phone the tile drops under
              the name and goes full width, because a scoreboard reads better
              wide than squeezed into a 118px column beside a 22px name. */
        .atplate-hero { flex-direction: column !important; gap: 10px !important; }
        .atplate-hero > div:last-child { width: 100%; }

        .atplate-seq {
          flex-wrap: nowrap !important;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 3px;
          scrollbar-width: none;
        }
        .atplate-seq::-webkit-scrollbar { display: none; }
        .atplate-seq > div { flex: 0 0 auto; }

        /* 2. AT THE PLATE — the ON DECK / IN THE HOLE cards are minWidth 168
              each, so two of them plus the 9px gap is 345px inside 346px of
              card. They "fit" by one pixel and their contents don't. A row
              each on a phone. */
        .atplate-deck > button { flex: 1 1 100% !important; min-width: 0 !important; }

        /* 3. THE HEATMAP'S NAME COLUMN — 150px of a 374px screen, 40%, and it
              is sticky, so it took 40% of every horizontal scroll position
              with it. DenseTable's sticky column was capped at 124px by the
              last pass; the heatmap doesn't use DenseTable and was missed.
              Same cap, plus the shadow that makes it read as pinned rather
              than as a rendering artefact. */
        .heat-scroll th:first-child, .heat-scroll td:first-child {
          width: auto !important; min-width: 0 !important; max-width: 112px !important;
        }
        .heat-scroll td:first-child { box-shadow: 7px 0 11px rgba(0,0,0,.34); }
      }

      /* 4. POOL NAMES ARE TAP TARGETS. Each one opens that hitter's card, at
            10.5px with a 1.5 line-height — a 16px target, half of what a thumb
            needs, stacked directly on the next one. */
      @media (pointer: coarse) {
        .pool-names > span { min-height: 32px; display: flex; align-items: center; }
      }

      /* 5. Nothing here changes a single pixel above 560px. */

      /* ── GLOSSARY DOTS ──
         The ⓘ next to a stat label is the only route to an explanation on a
         touch device (title= tooltips do not exist there), so it has to be
         hittable. It sits inside a table header whose own click sorts the
         column, which means an over-large target is a bug and an under-large
         one is unusable — 26px of padded box around a 10px glyph is the
         compromise, measured against the 9px gap between header cells. */
      .explain-dot { padding: 3px 5px; margin: -3px -1px -3px 2px; display: inline-block; }
      @media (pointer: coarse) {
        .explain-dot { padding: 6px 8px; margin: -6px -4px -6px 0; font-size: 11px !important; }
      }

      /* ══ COSMETICS PASS (2026-08-06) — small touches, compounding ══ */

      /* Tabular numerals everywhere: every score column, every record, every
         countdown lines up digit-for-digit. The single cheapest thing that
         makes a stats site feel engineered instead of typed. */
      * { font-variant-numeric: tabular-nums; }

      /* Text selection + focus in the brand ember, not browser blue. */
      /* search + team filter focus states (Controls.js wears classes because
         inline styles can't express :focus) — ember ring, slight lift */
      .moon-search:focus {
        border-color: rgba(249,115,22,.65) !important;
        box-shadow: 0 0 0 3px rgba(249,115,22,.13), 0 0 20px rgba(249,115,22,.10);
      }
      .moon-select:focus {
        border-color: rgba(249,115,22,.65) !important;
        box-shadow: 0 0 0 3px rgba(249,115,22,.13);
      }
      .moon-select option { background: #131315; color: #fafafa; font-weight: 500; }
      input.moon-search::-webkit-search-cancel-button { display: none; }
      ::selection { background: rgba(249,115,22,.35); color: #fff; }

      /* ── THE HIGHLIGHTS SHOWING UP EVERYWHERE (2026-08-16) ───────────────
         Donovan, from an iPhone: "my highlights are showing up thru the
         site." Two separate artifacts, both of which this file had left to
         the operating system, and both of which land on nearly every element
         because this site is built almost entirely out of <button>.

         1. NO -webkit-tap-highlight-color WAS EVER SET, so iOS paints its own
            translucent grey box over the whole tappable area on every single
            tap. On a board where each ROW is a button, that is a grey slab
            flashing across a row of names each time you touch one.
         2. A slightly-long press, or a drag that starts on text, SELECTS it —
            and the ::selection rule directly above paints that orange at 35%.
            Correct for prose, wrong for a button's own label: the highlight
            sticks around until you tap elsewhere, which is exactly "showing
            up thru the site."

         The fix removes the OS box and stops buttons being selectable, but
         DELIBERATELY KEEPS both behaviours where they belong: real text —
         prose, tables, the box scores, player names inside the modal — stays
         selectable and still highlights orange, because copying a name is a
         thing you actually do here.

         Removing the tap highlight without replacing it would leave taps with
         no feedback at all, so :active gets a real one. It is subtle on
         purpose: this is confirmation, not decoration. */
      /* ── ROUND TWO (2026-08-16). THE FIRST FIX ENUMERATED SELECTORS AND
         THAT WAS THE BUG. ────────────────────────────────────────────────
         Donovan, still: "the highlights are showing on the columns, things
         in the game or the boards."

         He was right and the reason is embarrassing in a useful way. The
         list below used to read: button, [role=button], a, summary, .pill
         — so every tappable thing that ISN'T one of those kept the OS box.
         On this site that is a lot: every DenseTable column header is a
         th with an onClick sort handler, every board row is a tr with an
         onClick, and the game cards are plain divs with onClick. Measured
         in a mobile context on the Boards tab, before this change:

             th   tap = rgba(51,181,229,0.4)     <- the OS box
             td   tap = rgba(51,181,229,0.4)
             tr   tap = rgba(51,181,229,0.4)
             button tap = rgba(0,0,0,0)          <- the only one fixed

         -webkit-tap-highlight-color IS AN INHERITED PROPERTY. Setting it
         once on the root element covers everything on the site, including every
         one written after today, and cannot fall out of sync with a list
         of selectors. That is the whole fix, and enumerating was never the
         right shape for it. */
      html { -webkit-tap-highlight-color: transparent; }

      button, [role="button"], summary {
        -webkit-user-select: none;
        user-select: none;
      }
      button:active, [role="button"]:active { opacity: .72; }

      /* Text you might genuinely want to copy keeps selection. A th is NOT
         on this list any more: on this site every column header is a sort
         button, so making it selectable meant a drag on a header painted
         the orange ::selection and left it sitting there — the other half
         of what he was seeing. Nobody has ever wanted to copy the word
         "FACING" out of a table head. */
      p, td, pre, code, .prose, .selectable {
        -webkit-user-select: text;
        user-select: text;
      }
      th { -webkit-user-select: none; user-select: none; }

      /* A row that is itself a button behaves like one: no text selection
         on a drag, and a real press state to replace the OS box we just
         removed. DenseTable tags clickable rows with .dense-row. */
      /* .dense-click, not .dense-row — EVERY row carries .dense-row whether
         or not it does anything, and giving a dead row a press state is its
         own small lie. DenseTable adds .dense-click only when onRowClick is
         actually wired. Cursor is already set inline and correctly. */
      .dense-click:active td { background: rgba(255,255,255,.05); }
      /* Killing selection inside a clickable row is a TOUCH fix, so it is
         scoped to touch. With a mouse you can always click away to clear a
         selection, and being able to drag a number out of a board is worth
         keeping; with a finger the drag is usually a scroll that missed and
         the leftover orange wash is the complaint. */
      @media (pointer: coarse) {
        .dense-click td { -webkit-user-select: none; user-select: none; }
      }
      th:active { background: rgba(249,115,22,.10) !important; }
      :focus-visible { outline: 2px solid rgba(249,115,22,.6); outline-offset: 2px; border-radius: 4px; }

      /* Thin dark scrollbars — the stock chrome bars were the last stock
         thing on the page. */
      * { scrollbar-width: thin; scrollbar-color: #3a3a40 transparent; }
      *::-webkit-scrollbar { width: 8px; height: 8px; }
      *::-webkit-scrollbar-thumb { background: #3a3a40; border-radius: 4px; }
      *::-webkit-scrollbar-thumb:hover { background: #f97316; }
      *::-webkit-scrollbar-track { background: transparent; }

      /* Tab switches breathe: content fades up 4px instead of teleporting. */
      .tab-fade { animation: tabFade .16s ease-out; }
      @keyframes tabFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

      /* Cards lift a hair on hover — grids that respond feel alive.
         GATED (2026-08-16): on touch there is no pointer to leave, so an
         unqualified :hover stays asserted on the last card you tapped and it
         sits there raised. Same class of bug as .dense-row:hover. */
      @media (hover: hover) {
        .bot-picks-grid > *:hover, .pickstrip > button:hover {
          transform: translateY(-1px);
          transition: transform .1s ease-out;
        }
      }

      /* The live dot actually pulses. */
      .live-pulse { animation: livePulse 2s ease-in-out infinite; display: inline-block; }
      @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }

      /* ══ THE QUIET LAYER (2026-08-16) ══════════════════════════════════════
         Donovan, with Apple Sports and ESPN on screen: "just the style feed and
         then the hover all simplicist look of it. i know we are more in the
         realm of research and stats but some aspects need to be like this."

         Scoped to the LIVE/SCORES layer — the score rail and the game cards.
         The research tables are not touched, because a dense table is dense on
         purpose. Two of the four principles behind that pass need CSS rather
         than inline styles, so they live here:

           TYPE DOES THE HIERARCHY, NOT BOXES. A tile at rest has a transparent
           border, not a visible one. It still occupies the same pixels — the
           layout does not shift when the border appears — but the grouping is
           done by whitespace, which is what Apple's list does and what our
           bordered cards did not.

           NO CHROME UNTIL YOU POINT AT IT. The box shows up on hover and only
           on hover, and only on devices that HAVE a hover (a phone would paint
           it on every tap and never take it off, which is the sticky-highlight
           bug from the block above wearing a different hat).

         Any tile that sets its own inline background (the game cards, which
         need a resting surface inside a grid) keeps it — an inline style beats
         a class — and still gets the border half of the treatment. Tiles with
         no inline background (the score rail) get both. */
      .quiet-tile {
        border: 1px solid transparent;
        border-radius: 12px;
        transition: background-color .13s ease-out, border-color .13s ease-out;
      }
      @media (hover: hover) {
        .quiet-tile:hover {
          background-color: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.10);
        }
      }
      /* A rail tile is a tap target on a phone even though it isn't a button. */
      @media (pointer: coarse) {
        .quiet-tile { min-height: 34px; }
      }

      /* ══ THE RAIL ══ (2026-08-09, "make it easier to scroll right to left on
         the desktop for the columns things, and tell me what to call it")

         A Rail is any horizontal track of columns wider than the screen. The
         behaviour — wheel-to-scroll, ‹ › nubs, drag, arrow keys — lives in
         components/Rail.js. This is the part that has to reach every wide
         surface at once, including the ones that are still plain divs: a
         VISIBLE scrollbar.

         WebKit hides overlay scrollbars until you are already scrolling, which
         is a circular problem — the affordance that tells you the strip moves
         only appears once you have discovered that it moves. On a phone that
         is fine, because a thumb tries the swipe anyway. On a desktop it means
         a lot of people simply never learn there are more columns.

         So Rails get a permanent, quiet scrollbar. 8px is thick enough to
         grab with a mouse and thin enough not to shout. */
      .rail::-webkit-scrollbar { height: 8px; }
      .rail::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); border-radius: 99px; }
      .rail::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.16); border-radius: 99px;
      }
      .rail::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.30); }
      .rail { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.16) transparent; }

      /* Dragging a Rail should not paint a text selection across every card
         it passes over. */
      .rail:active { user-select: none; -webkit-user-select: none; }

      /* Focus ring only for keyboard users — a Rail is focusable so arrow keys
         work, and a mouse click should not leave a box around the whole strip. */
      .rail:focus { outline: none; }
      .rail:focus-visible { outline: 1px solid rgba(255,255,255,0.25); outline-offset: 2px; }

      /* The nubs are a desktop fix for a desktop problem. A touch device
         already scrolls this perfectly with a thumb, and native momentum beats
         anything reimplemented in JS, so they get out of the way. */
      @media (max-width: 700px), (hover: none) {
        .rail-nubs { display: none !important; }
      }
    `}</style>
  )
}
