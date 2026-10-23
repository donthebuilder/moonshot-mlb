#!/usr/bin/env node
// POST A PREPLAY VIDEO TO X (2026-10-22, Donovan: "get the X system ready too so it posts the videos"). The site's own poster
// (lib/dash/xPost.js: uploadVideoToX, then postToX), run from a machine that has the X keys in .env.local (Donovan's Mac):
//
//   node scripts/post-x-video.mjs --video <file.mp4> --text <post.txt> --before <first pitch, ISO> [--sport mlb] [--dry]
//
//   --video    the MP4 (scripts/record-replay.mjs makes it)
//   --text     the post, exactly as approved, in a plain text file
//   --before   first pitch / puck drop (UTC ISO, e.g. 2026-10-24T00:00:00Z): a pregame post never goes out at or after it
//   --dry      print what would post (the text as X will get it, the file and its size) and send nothing
//
// The post goes through postToX like every other post: no links, one spacing pass, the long-post fallback, the breaker on
// an account-level refusal. Kind 'preplay' (no receipt line: a simulation is not a call). Prints the post's id.
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const DRY = process.argv.includes('--dry')
const video = arg('video'), textFile = arg('text'), before = arg('before'), sport = arg('sport', 'mlb')
if (!video || !textFile || !before) { console.error('usage: post-x-video.mjs --video <file.mp4> --text <post.txt> --before <ISO first pitch> [--sport mlb] [--dry]'); process.exit(2) }
const lock = Date.parse(before)
if (!Number.isFinite(lock)) { console.error(`--before is not a time: ${before}`); process.exit(2) }
if (Date.now() >= lock) { console.error(`it is past ${before}: a pregame post never goes out at or after first pitch`); process.exit(1) }
const text = readFileSync(textFile, 'utf8').trim()
if (!text) { console.error('the text file is empty'); process.exit(2) }
const size = statSync(video).size
if (!(size > 0)) { console.error('the video is empty'); process.exit(2) }

const req = createRequire(`${process.cwd()}/package.json`)
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const { uploadVideoToX, postToX, xProblem, fitToLimit, textLimit } = await import('../lib/dash/xPost.js')
const { normalizeTweet } = await import('../lib/dash/tweetFormat.js')
const { stripLinks } = await import('../lib/dash/xPolicy.js')

const asSent = fitToLimit(normalizeTweet(stripLinks(text)), textLimit())
console.log(`video  ${video} (${(size / 1048576).toFixed(1)} MB)`)
console.log(`lock   ${new Date(lock).toISOString()} (${Math.round((lock - Date.now()) / 60000)} min from now)`)
console.log(`post   (${Array.from(asSent).length} chars)\n-----\n${asSent}\n-----`)
if (DRY) { console.log('dry run: nothing sent'); process.exit(0) }
const problem = xProblem()
if (problem) { console.error(`X is not configured here: ${problem} (run this where .env.local has the X keys)`); process.exit(1) }

const mediaId = await uploadVideoToX(readFileSync(video), { log: (m) => console.log(`[x] ${m}`) })
if (!mediaId) { console.error('the video did not upload (see the [x] lines above): nothing posted'); process.exit(1) }
if (Date.now() >= lock) { console.error('first pitch passed while the video uploaded: nothing posted'); process.exit(1) }
const r = await postToX(text, { mediaId, kind: 'preplay', sport })
if (!r?.ok) { console.error(`X refused the post: ${r?.status || ''} ${r?.error || ''}`); process.exit(1) }
console.log(`posted: ${r.id || r.data?.id || JSON.stringify(r).slice(0, 200)}`)
