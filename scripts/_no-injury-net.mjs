// TEST HELPER (2026-10-10). The posting paths now prime the injury layer (lib/injuries/read.js primeInjuries) through global fetch. The
// tests that COUNT fetch calls (Discord webhooks, X) replace global fetch with a recorder; the layer's read of ESPN's injuries feed must
// not land in that count. This answers ESPN's injuries URLs with a labelled TEST "503" (the layer then reads as unavailable, which adds
// nothing to the naming checks) and passes every other URL to whatever fake the test installed, now or later.
let current = globalThis.fetch
const INJURIES = /site\.api\.espn\.com\/apis\/site\/v2\/sports\/[a-z]+\/[a-z]+\/injuries/
const wrap = (f) => (url, ...rest) => (INJURIES.test(String(url)) ? Promise.resolve({ ok: false, status: 503, statusText: 'TEST: injury feed not available', headers: { get: () => null }, json: async () => ({}) }) : f(url, ...rest))
Object.defineProperty(globalThis, 'fetch', { configurable: true, get: () => wrap(current), set: (f) => { current = f } })
