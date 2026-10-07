// THE HAND-OFF FROM NUMEROLOGY TO THE BET SLIP (2026-10-07; was the hand-off to the Parlay Builder, deleted). The
// Numerology page (MLB) lets you check hitters and "add to slip"; the slip lives on Props, a different tab, so the
// checked rows ride here, in memory, for the one navigation: the page that queues them opens Props, and the cards
// (components/props/PropCards.js), mounting with the slate, take them (once) and add each one that has a price.
// Nothing is stored here.
let pending = null
export function queueSlipSeed(rows) { pending = Array.isArray(rows) && rows.length ? rows : null }
export const takeSlipSeed = () => { const v = pending; pending = null; return v }
