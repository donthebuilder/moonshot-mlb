// X VIDEO UPLOAD checks (2026-10-22). TEST DATA ONLY: fake keys, a fake 9 MB "video", and a stand-in for X (fetch is
// replaced; nothing leaves the machine). Proves uploadVideoToX speaks X's chunked v2 protocol:
//   1. INIT is a JSON POST to /2/media/upload/initialize with media_type, total_bytes and media_category tweet_video
//   2. APPEND sends every byte, in order, in chunks of at most 5 MB, segment_index 0, 1, 2 ...
//   3. FINALIZE, then STATUS polled (a signed GET with command=STATUS) until succeeded; the media id comes back
//   4. a failed processing state or a refused step returns null (never throws, never posts)
//   node --import ./scripts/_esm-resolve.mjs scripts/check-x-video.mjs
process.env.X_API_KEY = 'TEST'; process.env.X_API_SECRET = 'TEST'; process.env.X_ACCESS_TOKEN = 'TEST'; process.env.X_ACCESS_SECRET = 'TEST'
const { uploadVideoToX } = await import('../lib/dash/xPost.js')

let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`ok   ${msg}`); else { fails += 1; console.log(`FAIL ${msg}`) } }
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function standIn({ states = ['in_progress', 'succeeded'], refuse = null } = {}) {
  const seen = { init: null, segs: [], bytes: 0, finalize: 0, status: 0, auth: true }
  let poll = 0
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url))
    if (!String(opts.headers?.Authorization || '').startsWith('OAuth ')) seen.auth = false
    if (u.pathname === '/2/media/upload/initialize') {
      if (refuse === 'init') return json(403, { title: 'Forbidden', detail: 'TEST refusal' })
      seen.init = JSON.parse(opts.body); return json(200, { data: { id: '777', media_key: '7_777', expires_after_secs: 86400 } })
    }
    if (u.pathname === '/2/media/upload/777/append') {
      const seg = Number(opts.body.get('segment_index')); const blob = opts.body.get('media')
      seen.segs.push(seg); seen.bytes += blob.size; seen.max = Math.max(seen.max || 0, blob.size)
      return new Response(null, { status: 204 })
    }
    if (u.pathname === '/2/media/upload/777/finalize') { seen.finalize += 1; return json(200, { data: { id: '777', processing_info: { state: 'pending', check_after_secs: 0 } } }) }
    if (u.pathname === '/2/media/upload' && u.searchParams.get('command') === 'STATUS' && u.searchParams.get('media_id') === '777' && (opts.method || 'GET') === 'GET') {
      seen.status += 1; const st = states[Math.min(poll++, states.length - 1)]
      return json(200, { data: { id: '777', processing_info: st === 'failed' ? { state: 'failed', error: { message: 'TEST bad video' } } : { state: st, check_after_secs: 0, progress_percent: st === 'succeeded' ? 100 : 50 } } })
    }
    return json(404, { title: 'Not Found' })
  }
  return seen
}

const video = new Uint8Array(9 * 1024 * 1024 + 123)   // TEST bytes
const s1 = standIn()
const id = await uploadVideoToX(video, { waitS: 5 })
ok(id === '777', 'the media id comes back once X says succeeded')
ok(s1.init?.media_type === 'video/mp4' && s1.init?.total_bytes === video.length && s1.init?.media_category === 'tweet_video', 'INIT: JSON with media_type, total_bytes, media_category tweet_video')
ok(s1.bytes === video.length && s1.segs.join(',') === '0,1,2' && s1.max <= 5 * 1024 * 1024, `APPEND: every byte, segments ${s1.segs.join(',')}, largest ${(s1.max / 1048576).toFixed(1)} MB`)
ok(s1.finalize === 1 && s1.status === 2, `FINALIZE once, STATUS polled until succeeded (${s1.status} polls)`)
ok(s1.auth, 'every request is signed (OAuth 1.0a)')

standIn({ states: ['in_progress', 'failed'] })
ok(await uploadVideoToX(video, { waitS: 5 }) === null, 'processing failed: null, nothing to post')
standIn({ refuse: 'init' })
ok(await uploadVideoToX(video, { waitS: 5 }) === null, 'a refused INIT: null, no throw')

console.log(fails ? `\n${fails} FAILED` : '\nall X video checks pass')
process.exit(fails ? 1 : 0)
