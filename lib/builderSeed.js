// THE HAND-OFF FROM NUMEROLOGY TO THE PAIR BUILDER (2026-10-07). The Numerology page (MLB) lets you check
// hitters and "build around" them; the builder lives on Parlays (Combos), a different tab, so the checked
// rows ride here, in memory, for the one navigation: the page that queues them opens Parlays, and Combos,
// mounting, takes them (once) and opens its Builder view with them pinned. Nothing is stored.
let pending = null
export function queueBuilderSeed(rows) { pending = Array.isArray(rows) && rows.length ? rows : null }
export const takeBuilderSeed = () => { const v = pending; pending = null; return v }
