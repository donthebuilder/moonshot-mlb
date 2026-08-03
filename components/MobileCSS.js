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
    `}</style>
  )
}
