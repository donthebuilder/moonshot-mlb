// DRY RUN ONLY -- prints the correction texts for the wrong-miss audit (2026-10-11). It sends NOTHING: no X call, no Discord call, no
// database write (it does not even read the database; the facts are the ones the audit verified against the league boxscore).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/wrong-miss-corrections-dryrun.mjs
//
// How each would actually go out (Donovan's rule: no deletes on X or Discord, only replies and updates):
//   1. CALLED goal we posted that the league then took away (Caufield): the existing correction step of the goals tick
//      (app/api/lamp/goals/tick/route.js poster.correct -> lib/nhl/goalFeed.js step 6). It claims the row (correction_post_id: null ->
//      'posting'), replies under the original tweet and posts one channel card. It skips a goal overturned more than LATE_ALERT_MS ago,
//      which is why this one (overturned 10-10 23:24Z, before the correction columns existed) was never sent. A one-off send needs the
//      row's correction_post_id left null and the expiry waived for that row: a code/route change Donovan has not asked for, so it is
//      not made here.
//   2. The Card result that read "✗ Sebastian Aho" with no market (Discord only, X never got it): one plain update in the same
//      channel through lib/dash/postToDiscord (kind 'card_result_nhl'), a new message, the original untouched.
import { correctionText, correctionEmbed } from '../lib/nhl/goalFeed.js'

const caufield = { game_id: 2026020075, player_id: 8481540, name: 'Cole Caufield', team: 'MTL', period: 1, time_in_period: '01:16', score_after: 'DET 0 · MTL 1', overturned_at: '2026-10-10T23:24:30Z', x_post_id: '2109062330264760478' }
console.log('--- 1. reply under tweet 2109062330264760478 (Cole Caufield, MTL @ DET, 10-10; box: 0 goals, 6 shots)')
console.log(correctionText(caufield))
console.log('channel card title:', correctionEmbed(caufield, null, Date.UTC(2026, 9, 12)).title)

const aho = 'Update to the Oct 11 NHL Card results: Sebastian Aho\'s straight was shots on goal over 2.5, not an anytime goal. He took 2 shots, so that straight missed. He did score once in CAR 4, PHI 1; that goal was not the call.'
console.log('\n--- 2. update in the NHL channel (discord_sends 2026-10-12 01:50Z card_result_nhl; box: Aho 1 G, 1 A, 2 SOG)')
console.log(aho)
console.log(`(${[...aho].length} characters)`)
