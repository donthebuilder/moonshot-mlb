// ABOVE THE DOCK, ONE NUMBER (2026-09-29, queue batch 2: "notices sit above the
// dock from one shared offset"). The bottom dock (components/MobileTabBar.js)
// is, on a phone, 62px tall at max(9px, safe-area) from the bottom -- its top
// edge ~71px + the home bar -- and on a desktop a 46px slim dock at 10px, top
// edge 56px. Every notice that sits at the bottom of the screen clears it from
// here, so the two can't drift apart again. (ExplainToast and AccountNudge used
// their own copies, and on a desktop both sat at 16px, on top of the dock.)
export const DOCK_CLEAR_DESKTOP = '66px'
export const DOCK_CLEAR_PHONE = 'calc(82px + env(safe-area-inset-bottom))'

/** A <style> body placing `.cls` just above the dock at every width. */
export const dockClearCss = (cls) =>
  `.${cls}{bottom:${DOCK_CLEAR_DESKTOP}}@media(max-width:760px){.${cls}{bottom:${DOCK_CLEAR_PHONE}}}`
