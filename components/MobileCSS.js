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
    `}</style>
  )
}
