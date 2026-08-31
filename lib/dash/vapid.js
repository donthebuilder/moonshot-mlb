// The four environment variables Web Push needs, in one place.
//
// VAPID is how a push service knows the sender is who it claims to be: a key
// pair, the public half handed to the browser at subscribe time, the private
// half used to sign each send. Generate them ONCE with
//
//     npx web-push generate-vapid-keys
//
// and set, on Vercel:
//
//     NEXT_PUBLIC_VAPID_PUBLIC_KEY   the public key (the browser needs it, so
//                                    it is deliberately public)
//     VAPID_PRIVATE_KEY              the private key — server only, never
//                                    prefixed NEXT_PUBLIC_
//     VAPID_SUBJECT                  a mailto: or https: URL identifying the
//                                    sender to the push service
//
// CHANGING THE KEY PAIR INVALIDATES EVERY EXISTING SUBSCRIPTION. Every device
// has to re-subscribe, silently and without being told, so treat these as
// permanent once anyone is subscribed.
//
// With none of them set, every push path answers "not configured" and the site
// behaves exactly as it did before push existed.

// ── "CONFIGURED" USED TO MEAN "NOT EMPTY" (2026-08-31) ─────────────────────
//
// Which is not the same thing, and the difference cost a day. Everything
// downstream reported success: the browser subscribed, the row was stored, the
// cron ran every minute and answered 200. Nothing was ever delivered, and
// nothing anywhere said why -- because web-push's setVapidDetails() THROWS on a
// malformed key or subject, before it opens a socket, and both places that call
// it swallowed the throw. A caught exception with no outgoing request looks
// exactly like "nothing was happening tonight".
//
// The likeliest cause is the one that already bit CRON_SECRET on this project:
// a value pasted with a trailing newline. `openssl rand ... | pbcopy` and
// `npx web-push generate-vapid-keys` both hand you one.
//
// So this checks the SHAPE, and returns a sentence naming the variable rather
// than a boolean. It never returns any part of a key.
const b64len = (s) => {
  try { return Buffer.from(String(s), 'base64url').length } catch { return -1 }
}

export function vapidProblem() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
  const priv = process.env.VAPID_PRIVATE_KEY || ''
  const subject = process.env.VAPID_SUBJECT || 'mailto:alerts@dashnetwork.app'

  if (!pub) return 'NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set'
  if (!priv) return 'VAPID_PRIVATE_KEY is not set'
  if (/\s/.test(pub)) return 'NEXT_PUBLIC_VAPID_PUBLIC_KEY contains whitespace — almost certainly a trailing newline from the paste'
  if (/\s/.test(priv)) return 'VAPID_PRIVATE_KEY contains whitespace — almost certainly a trailing newline from the paste'
  if (/\s/.test(subject)) return 'VAPID_SUBJECT contains whitespace — almost certainly a trailing newline from the paste'
  if (!/^(mailto:|https:)/.test(subject)) return 'VAPID_SUBJECT must begin with mailto: or https: — a bare email address is rejected'
  if (b64len(pub) !== 65) return `NEXT_PUBLIC_VAPID_PUBLIC_KEY decodes to ${b64len(pub)} bytes, expected 65`
  if (b64len(priv) !== 32) return `VAPID_PRIVATE_KEY decodes to ${b64len(priv)} bytes, expected 32`
  return null
}

/**
 * Configured AND usable. A key that cannot be used is not configuration, it is
 * a trap: it lets a device subscribe to a channel that can never deliver, and
 * the person finds out by waiting all evening.
 */
export const hasVapid = () => vapidProblem() === null

export const vapidDetails = () => ({
  subject: process.env.VAPID_SUBJECT || 'mailto:alerts@dashnetwork.app',
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
})
