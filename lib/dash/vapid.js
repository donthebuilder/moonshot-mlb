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

export const hasVapid = () => Boolean(
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
)

export const vapidDetails = () => ({
  subject: process.env.VAPID_SUBJECT || 'mailto:alerts@dashnetwork.app',
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
})
