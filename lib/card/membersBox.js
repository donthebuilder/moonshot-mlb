// THE #MEMBERS BOX SWITCH (2026-10-30, Donovan: "a whole bunch of messages ... it's a lot of noise ... we're focused on the members").
// With MEMBERS_BOX_ON the day's plays live in ONE box per sport (lib/card/membersList.js, edited in place as games go) and the #members posts that only
// repeat what the box already shows stop being SENT: the per-leg live checks and the graded recap. 'Off' is no delivery, never no record: the rows
// are still claimed and stored (lib/dash/routing.js). The wins (the short "hit" line) stay: that is the one ping a result makes.
// Pure. OFF unless MEMBERS_BOX_ON is on, so deploying this changes nothing by itself.
const truthy = (v) => /^(on|1|true|yes)$/i.test(String(v == null ? '' : v).trim())
export const membersBoxOn = () => truthy(process.env.MEMBERS_BOX_ON)
/** The members kinds the box makes redundant. */
export const BOX_CUT = /^(card_members_leg_|card_members_graded)/
