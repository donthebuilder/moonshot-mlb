// THE OUTCOME WORDS (pure, no I/O): what a graded call is called on a card, said once. A card row's result is 'hit' | 'miss' | 'void'
// (lib/card/core.js productResult), a leg's is the same (legWord), the night receipt's is 'cashed' | 'missed' | 'void' (lib/posts/receipt.js
// OUTCOMES). On a card a leg that cashed is CASHED, one that did not is MISSED, a leg whose man did not play is DID NOT PLAY, and a PRODUCT
// (a Two-Man) with a void leg is VOID. A miss and a hit are the same size and weight everywhere: only the small mark beside the word differs.
export const OUTCOME = Object.freeze({ cashed: 'CASHED', missed: 'MISSED', void: 'VOID', dnp: 'DID NOT PLAY' })
const LEG = { hit: 'cashed', cashed: 'cashed', miss: 'missed', missed: 'missed', void: 'dnp', dnp: 'dnp' }
const PRODUCT = { hit: 'cashed', cashed: 'cashed', miss: 'missed', missed: 'missed', void: 'void' }

/** The key of a leg's outcome ('cashed' | 'missed' | 'dnp'), or null when it has none yet (never guessed). */
export const legOutcome = (word) => LEG[String(word || '')] || null
/** The key of a product's outcome ('cashed' | 'missed' | 'void'), or null when it is not graded. */
export const productOutcome = (word) => PRODUCT[String(word || '')] || null
/** The words for a key; '' for none. */
export const outcomeWord = (key) => OUTCOME[key] || ''
