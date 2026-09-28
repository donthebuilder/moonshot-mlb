// WHICH EVENTS GET THEIR OWN X POST (2026-09-28, X-POSTSEASON-POSTING-PLAN
// step 1, Donovan approved the direction). The audit behind it: a pregame list
// draws 400-1,000 views, a non-called event alert ~100, and there were ~30 of
// those a day. So a standalone homer / touchdown / goal post on X is for a
// CALLED one only; every other event still goes to push, Discord and the
// site's own rows. LAMP has posted CALLED goals only since it started
// (lib/nhl/goalFeed.js); this brings MOONSHOT and TUDDY to the same rule.
//
//   X_EVENTS=called   (default) CALLED only
//   X_EVENTS=all      every event, the old behaviour (MOONSHOT's X_POST_MODE
//                     still narrows it the way it always did)
export const X_EVENTS = /^all$/i.test(String(process.env.X_EVENTS || '').trim()) ? 'all' : 'called'
export const xEventsCalledOnly = () => X_EVENTS === 'called'
