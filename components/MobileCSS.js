'use client'
export default function MobileCSS() {
  return (
    <style jsx global>{`
      html, body { max-width: 100%; overflow-x: hidden; }
      * { box-sizing: border-box; }

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
        .dash-controls { grid-template-columns: 1fr 120px !important; gap: 7px !important; }
        .modal-box { width: calc(100vw - 16px) !important; max-width: calc(100vw - 16px) !important; border-radius: 16px !important; }
        .modal-content { padding: 16px 14px 18px !important; }
        .stat-grid-two { grid-template-columns: 1fr !important; gap: 0 !important; }
        table { font-size: 10px !important; }
        th, td { padding: 6px !important; }
        .scoreboard-wrap { margin-left: -2px !important; margin-right: -2px !important; }
        .scoreboard-table { min-width: 1100px !important; }
        .scoreboard-player-col { position: sticky !important; left: 0 !important; z-index: 3 !important; background: #111113 !important; box-shadow: 8px 0 12px rgba(0,0,0,.22); }
        .scoreboard-player-cell { max-width: 138px !important; overflow: hidden !important; text-overflow: ellipsis !important; }
        /* PlayerModal's combined Pitch+Spray view: stack to one column once
           the modal itself is forced to near-full-width above -- two full
           tables side by side at this width would squeeze each to illegible. */
        .pitch-spray-grid { grid-template-columns: 1fr !important; gap: 14px !important; }
      }

      @media (max-width: 700px) {
        .dash-grid { grid-template-columns: 1fr !important; gap: 9px !important; }
        .leaders-controls { grid-template-columns: 1fr !important; }
        h2 { font-size: 20px !important; }
        button { min-height: 32px; }
        input, select { font-size: 12px !important; }
      }

      @media (max-width: 520px) {
        .dash-controls { grid-template-columns: 1fr !important; }
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
        /* Game selector cards: two per row is the readable phone density. */
        .dashboard-main div[style*="minmax(132px"] {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        /* Toolbar chip rows (Boards categories, sheet section nav, market
           buttons) scroll sideways instead of wrapping to four lines. */
        .chip-row {
          flex-wrap: nowrap !important; overflow-x: auto !important;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        .chip-row::-webkit-scrollbar { display: none; }
      }

      @media (max-width: 520px) {
        /* Vitals/verdict tiles: two per row keeps the numbers legible. */
        .dashboard-main div[style*="flex-wrap"] > div[style*="linear-gradient(135deg"] {
          flex: 1 1 42% !important; min-width: 42% !important;
        }
      }

      /* Coarse pointers get bigger hit targets regardless of width — the
         watchlist stars and swap buttons are 30px cells on desktop, which is
         under the 44px a thumb needs. */
      @media (pointer: coarse) {
        .dense-scroll td button { min-height: 34px !important; }
        button { touch-action: manipulation; }
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
      @media (max-width: 700px) {
        .playerboard { grid-template-columns: 1fr !important; }
        .playerboard-side { position: static !important; }
        .playerboard-list { max-height: 34vh !important; }
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
      @media (max-width: 560px) {
        [style*="font-size:8"], [style*="font-size: 8"],
        [style*="font-size:9"], [style*="font-size: 9"] { font-size: 10px !important; }
      }

      /* ── 3. TAP TARGETS ──
         Buttons already get min-height 32px under 700px. The gap was the
         clickable DIVS — the Home top-10 rows and the weakest-arms rows are
         2px/5px padding around 11px text, about 20px tall, sitting 2px
         apart. On a phone that's a coin toss between two players. */
      @media (pointer: coarse) {
        .tap-row { min-height: 34px; padding-top: 6px !important; padding-bottom: 6px !important; }
        .dense-scroll td button { min-height: 36px !important; }
        .chip-row button, .dash-tabs button { min-height: 34px; }
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
        .zone-grid { height: min(84vw, 290px, 46vh) !important; }

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

      /* Cards lift a hair on hover — grids that respond feel alive. */
      .bot-picks-grid > *:hover, .pickstrip > button:hover {
        transform: translateY(-1px);
        transition: transform .1s ease-out;
      }

      /* The live dot actually pulses. */
      .live-pulse { animation: livePulse 2s ease-in-out infinite; display: inline-block; }
      @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
    `}</style>
  )
}
