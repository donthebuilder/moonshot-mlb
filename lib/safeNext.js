// ONE `next` VALIDATOR (2026-09-24 audit, SEC-2).
//
// Three copies of `startsWith('/') && !startsWith('//')` lived in
// app/login/page.js, app/(front)/actions.js and app/auth/callback/route.js.
// All three let `/\evil.com` through: the WHATWG URL parser treats a
// backslash as a slash for http(s), so `new URL('/\\evil.com', origin)`
// resolves to https://evil.com/ -- and the auth callback handed exactly that
// to NextResponse.redirect after a successful sign-in. A phishing link that
// signs you in for real and then walks you off the site.
//
// Rule: the value must parse, relative to our own origin, to a URL whose
// origin IS our origin -- not a string test, the parser's own verdict. Then
// only the path + query + hash come back, so a scheme or host can never
// survive. Anything else is the fallback.
export function safeNext(value, fallback = '/') {
  const raw = String(value || '')
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  if (/[\x00-\x1f\s\\]/.test(raw)) return fallback
  try {
    const base = 'https://dash.invalid'
    const u = new URL(raw, base)
    if (u.origin !== base) return fallback
    const out = `${u.pathname}${u.search}${u.hash}`
    return out.startsWith('/') && !out.startsWith('//') ? out : fallback
  } catch {
    return fallback
  }
}
