// EARLY-ACCESS INVITE CODES, PURE PART (2026-10-12). No I/O except node:crypto.
//
//   newCode()          32 characters of RFC 4648 base32 (A-Z, 2-7) from 20 random bytes = 160 bits. Never guessable; URL-safe; no ambiguous
//                      punctuation. (Floor required: >= 16 characters / 80 bits.)
//   normalizeCode(s)   upper-cased, or null when it is not the 32-character shape. A wrong shape never reaches the database.
//   hashCode(code)     sha256 hex of the NORMALIZED code. The table stores THIS and the last 4 characters; the plain code exists once, in the link
//                      shown to the admin at creation, and is never stored, logged or returned again.
//   expiryAt(opt, now) '24h' | '7d' | '30d' | 'never' -> ISO string or null (undefined for an unknown option)
//   maskEmail(email)   j***@gmail.com
import { randomBytes, createHash } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
export const CODE_BYTES = 20
export const CODE_LEN = 32
export const CODE_BITS = CODE_BYTES * 8

function base32(buf) {
  let bits = 0; let value = 0; let out = ''
  for (const b of buf) {
    value = ((value << 8) | b) & 0xffff; bits += 8
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5 }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export const newCode = (rng = randomBytes) => base32(rng(CODE_BYTES))

export function normalizeCode(s) {
  const c = String(s || '').trim().toUpperCase()
  return new RegExp(`^[A-Z2-7]{${CODE_LEN}}$`).test(c) ? c : null
}

export const hashCode = (code) => createHash('sha256').update(String(code)).digest('hex')
export const codeTail = (code) => String(code).slice(-4)

export const USES_OPTIONS = Object.freeze([1, 5, 25])
export const EXPIRY_OPTIONS = Object.freeze({ '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3, never: null })
export function expiryAt(opt, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(EXPIRY_OPTIONS, opt)) return undefined
  const ms = EXPIRY_OPTIONS[opt]
  return ms == null ? null : new Date(now + ms).toISOString()
}

/** "j***@gmail.com". Never the whole local part; a missing email is "unknown". */
export function maskEmail(email) {
  const e = String(email || '')
  const at = e.indexOf('@')
  if (at < 1) return 'unknown'
  return `${e[0]}***${e.slice(at)}`
}

/** A note: one short private line, control characters removed. */
export const cleanNote = (s) => String(s || '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 120) || null

/** A small in-memory limiter: at most `max` hits per `windowMs` per key. Per server instance: it slows a guesser; the 160-bit code is the real defence. */
export function makeLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map()
  return {
    /** true = allowed (and counted); false = over the limit. */
    hit(key) {
      const t = now()
      if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k)
      const arr = (hits.get(key) || []).filter((x) => t - x < windowMs)
      if (arr.length >= max) { hits.set(key, arr); return false }
      arr.push(t); hits.set(key, arr); return true
    },
    _reset() { hits.clear() },
  }
}
