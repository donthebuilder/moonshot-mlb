// SMALL FORMATTERS, ONCE (R4, 2026-10-02). Started with ordinal(): eleven
// copies across lib / components / a tick route, five spellings, one rule --
// they agreed on every k from 1 to 5000. Callers that guard their input (round
// it, blank under 1, a dash for null) keep that guard and call this.

/** 1 -> '1st', 2 -> '2nd', 11 -> '11th', 23 -> '23rd'. */
export const ordinal = (k) => `${k}${[11, 12, 13].includes(k % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] || 'th')}`
