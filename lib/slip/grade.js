// A SLIP LEG'S GRADE (2026-10-25, Add a leg). Pure. Each part is optional and silent when we cannot read it: nothing is guessed.
//   status  'called' when the product called this exact bet tonight (its published CALLED picks, components/props/slipCalls.js), else null.
//           The members gate holds: a pick outside the free four is only 'called' for a member (same rule as calledLegs in core.js), so a
//           non-member's slip can never reveal a call the boards hide. We only know the calls of the product whose Props board is open,
//           so for the other products the answer is null, never "not on the board".
/** @param pub  { cands: [{ key, free }] } the published calls of this leg's sport, or null */
export function callStatusOf(leg, pub, memberState) {
  const hit = pub?.cands?.find((c) => c.key === leg?.key || c.leg?.key === leg?.key)
  if (!hit) return null
  return memberState === 'member' || hit.free ? 'called' : null
}
