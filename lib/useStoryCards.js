'use client'
import { useEffect, useMemo, useState } from 'react'
import { sharedJSON } from './sharedRead'
import { TYPE_WORD } from '../components/StoryTape'

// THE STORYLINES AS HEADLINE CARDS, EVERY PRODUCT (2026-10-22, Donovan: "the tape or the stories ... should be in the headlines too ...
// shown kind of like how the headlines is rotating"). A sport's /api/stories, one per player, rarest first (the order the engine
// sends), turned into the HeadlineStrip card shape: { k, tag, icon, name, why, stat, col, p, playerId, team }. The long 'model'
// rows stay on the Storylines page. `findPlayer(id)` -> the product's own player row (TUDDY opens his card from it); `color` the accent.
export function useStoryCards(sport, { findPlayer = null, color, limit = 8 } = {}) {
  const [tape, setTape] = useState(null)
  useEffect(() => {
    let alive = true
    sharedJSON(`/api/stories?sport=${sport}`).then((j) => { if (alive) setTape(j || null) }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  return useMemo(() => {
    const rec = new Map((tape?.summary || []).map((x) => [x.type, x]))
    const seen = new Set(), out = []
    for (const st of tape?.stories || []) {
      if (st.type === 'model' || seen.has(st.player_id || st.text)) continue
      seen.add(st.player_id || st.text)
      const r = rec.get(st.type)
      // the line without the leading name (the card's name line says it)
      const why = (st.parts || []).filter((x, i) => !(i === 0 && x.t === 'name')).map((x) => x.v).join('').trim().replace(/^[—,-]\s*/, '')
      out.push({ k: `st-${st.type}-${st.player_id || out.length}`, tag: TYPE_WORD[st.type] || String(st.type || '').toUpperCase(), icon: st.icon, name: st.name, why: why || st.text,
        stat: r?.n ? `${r.hit}/${r.n} hit` : st.board?.score != null ? `${st.board.score}` : '', col: color, p: findPlayer ? findPlayer(st.player_id) : null,
        playerId: st.player_id ? String(st.player_id) : null, team: st.team || null })
      if (out.length >= limit) break
    }
    return out
  }, [tape, findPlayer, color, limit])
}

/** Two card lists woven together: a, b, a, b ... (the headlines and the stories in one strip). */
export function interleave(a = [], b = []) {
  const out = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (a[i]) out.push(a[i]); if (b[i]) out.push(b[i]) }
  return out
}
