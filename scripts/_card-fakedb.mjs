// A FAKE card_calls TABLE THAT HOLDS THE MIGRATIONS' RULES (supabase/migrations/202610101000_card_calls.sql + 202610101100_card_map.sql). TEST harness
// for scripts/check-two-man.mjs and scripts/check-card-map.mjs: an in-memory table with the guard trigger's rules (insert only before the start; a locked row is
// never rewritten, regraded or deleted; Donovan's row changes only before ITS lock), `clock.now` standing for the database's now().
import assert from 'node:assert/strict'

export function fakeDb(clock) {
  const rows = []
  let id = 0
  const guard = (op, old, nw) => {
    const now = clock.now
    if (op === 'insert') {
      if (now >= Date.parse(nw.start_at)) throw new Error('card_calls: nothing is locked at or after the start')
      if (nw.lane === 'donovan' && now >= Date.parse(nw.locks_at)) throw new Error("card_calls: Donovan's entry is closed")
      if (nw.result != null || nw.leg_results != null || nw.graded_at != null) throw new Error('card_calls: a card row is inserted ungraded')
      return { ...nw, locked_at: new Date(now).toISOString() }
    }
    if (op === 'delete') {
      if (old.lane === 'donovan' && old.result == null && now < Date.parse(old.locks_at) && now < Date.parse(old.start_at)) return old
      throw new Error('card_calls: a locked card row is never deleted')
    }
    const open = old.lane === 'donovan' && old.result == null && now < Date.parse(old.locks_at) && now < Date.parse(old.start_at)
    if (open) {
      for (const k of ['sport', 'card_date', 'lane', 'product', 'slot', 'model_version', 'stake']) if (String(nw[k]) !== String(old[k])) throw new Error('card_calls: the key of a card row is never rewritten')
      if (now >= Date.parse(nw.start_at)) throw new Error('card_calls: nothing is saved at or after the start')
      if (nw.result != null) throw new Error('card_calls: a card row is not graded before its lock')
      return { ...nw, locked_at: new Date(now).toISOString() }
    }
    for (const k of ['sport', 'card_date', 'slate_key', 'lane', 'product', 'slot', 'model_version', 'rule', 'stake', 'legs', 'leg_count', 'note', 'start_at', 'locks_at', 'locked_at', 'market', 'window_games']) {
      if (JSON.stringify(nw[k]) !== JSON.stringify(old[k])) throw new Error('card_calls: a locked card is never rewritten')
    }
    if (old.result != null) throw new Error('card_calls: a graded card row is never regraded')
    if (nw.result != null && now < Date.parse(old.start_at)) throw new Error('card_calls: nothing is graded before the start')
    return nw
  }
  const KEYS = ['sport', 'card_date', 'lane', 'product', 'slot', 'model_version']
  const sameKey = (a, b) => KEYS.every((k) => String(a[k]) === String(b[k]))
  const builder = (action, payload, opts) => {
    const f = []
    const q = {
      eq: (c, v) => (f.push((r) => String(r[c]) === String(v)), q),
      is: (c, v) => (f.push((r) => (v === null ? r[c] == null : r[c] === v)), q),
      gte: (c, v) => (f.push((r) => r[c] >= v), q), lt: (c, v) => (f.push((r) => r[c] < v), q), lte: (c, v) => (f.push((r) => r[c] <= v), q),
      in: (c, vs) => (f.push((r) => vs.map(String).includes(String(r[c]))), q),
      match: (o) => (Object.entries(o).forEach(([c, v]) => f.push((r) => String(r[c]) === String(v))), q),
      order: () => q, limit: () => q, select: () => { q._sel = true; return q }, maybeSingle: () => { q._single = true; return q },
      then: (res, rej) => {
        try {
          const hit = () => rows.filter((r) => f.every((p) => p(r)))
          let data = null
          if (action === 'select') data = hit()
          else if (action === 'upsert') {
            data = []
            for (const nw of payload) {
              const old = rows.find((r) => sameKey(r, nw))
              if (old && opts?.ignoreDuplicates) continue
              if (old) { Object.assign(old, guard('update', old, { ...old, ...nw })); data.push(old) } else { const r = { id: ++id, ...guard('insert', null, nw) }; rows.push(r); data.push(r) }
            }
          } else if (action === 'update') { data = hit(); for (const r of data) Object.assign(r, guard('update', r, { ...r, ...payload })) } else if (action === 'delete') { data = hit(); for (const r of data) { guard('delete', r); rows.splice(rows.indexOf(r), 1) } }
          return Promise.resolve({ data: q._single ? (data?.[0] ?? null) : data, error: null }).then(res, rej)
        } catch (e) { return Promise.resolve({ data: null, error: { message: e.message } }).then(res, rej) }
      },
    }
    return q
  }
  const table = {
    select: () => builder('select'), upsert: (p, o) => builder('upsert', p, o), update: (p) => builder('update', p), delete: () => builder('delete'),
  }
  return { rows, from: (name) => { assert.equal(name, 'card_calls', 'only the card table is touched'); return table } }
}

