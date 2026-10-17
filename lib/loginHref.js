// THE SIGN-UP LINK CARRIES THE WHOLE ADDRESS (2026-10-17, check-clicks).
// The pill in the header and the row in the More drawer built `/login?next=<path+search>` and then appended the page's own #hash AFTER it, so the
// hash became the login page's fragment and `next` lost it: signing up from #sport=nfl&tab=picks&player=123 came back to bare /app. `next` is the
// path, the query AND the hash (lib/safeNext keeps all three); the login page's own fragment is only ever #create-account.
export const signUpHref = ({ pathname = '/app', search = '', hash = '' } = {}) => `/login?next=${encodeURIComponent(`${pathname}${search}${hash}`)}#create-account`
