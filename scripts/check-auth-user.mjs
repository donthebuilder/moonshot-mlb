// signedInUser() (lib/supabase/authUser.js): local JWT check first, Auth
// server only as a fallback. TEST DATA: stub clients, no network.
import { signedInUser } from '../lib/supabase/authUser.js'

let failed = 0
const ok = (label, cond) => { console.log(`   ${cond ? 'ok  ' : 'FAIL'}  ${label}`); if (!cond) failed += 1 }
const client = ({ claims, claimsError, throws, user }) => {
  const calls = { getUser: 0 }
  return {
    calls,
    auth: {
      async getClaims() { if (throws) throw new Error('boom'); return { data: claims ? { claims } : null, error: claimsError || null } },
      async getUser() { calls.getUser += 1; return { data: { user: user || null } } },
    },
  }
}

{
  const c = client({ claims: { sub: 'u1', email: 'a@b.c', user_metadata: { display_name: 'D' } } })
  const u = await signedInUser(c)
  ok('signed in: id from sub, no Auth round trip', u?.id === 'u1' && u.email === 'a@b.c' && u.user_metadata.display_name === 'D' && c.calls.getUser === 0)
}
{
  const c = client({})
  ok('signed out: null, no Auth round trip', (await signedInUser(c)) === null && c.calls.getUser === 0)
}
{
  const c = client({ claimsError: new Error('bad jwt'), user: { id: 'u2' } })
  ok('claims error: falls back to getUser', (await signedInUser(c))?.id === 'u2' && c.calls.getUser === 1)
}
{
  const c = client({ throws: true, user: null })
  ok('getClaims throws: falls back, still null when signed out', (await signedInUser(c)) === null && c.calls.getUser === 1)
}
ok('no client: null', (await signedInUser(null)) === null)

if (failed) { console.error(`\n${failed} auth-user check(s) failed`); process.exit(1) }
console.log('\nall auth-user checks passed')
