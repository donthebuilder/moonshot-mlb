// THE PITCHER'S AT-A-GLANCE TILES, ONCE (2026-10-12). components/PitcherModal.js built this array inline; the pitcher share card is now drawn on the
// server (lib/cards/shareData.js, the baseball-card look), so both read ONE definition and the card can never print a tile the modal does not.
// Moved verbatim from the modal. Thresholds mirror the starter table's own documented slate means (FB% ~38, HH% ~38, Brl% ~7; HR/9: lib/hr9.js).
// 'hot' = good for the BATS facing him (his leak), 'cold' = his strength. Pure: numbers in, tiles out.
import { hr9Tone, hr9Title } from './hr9'

const fmt2 = (v) => (v == null ? '—' : v.toFixed(2))
const fmtPct = (v) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`)

/** @param {{era,whip,hr9,k9,fbAllowed,hhAllowed,brlAllowed,l3hr9,l3n}} v  numbers or null */
export function pitcherTiles({ era = null, whip = null, hr9 = null, k9 = null, fbAllowed = null, hhAllowed = null, brlAllowed = null, l3hr9 = null, l3n = 0 } = {}) {
  return [
    { label: 'ERA', value: fmt2(era), tone: era == null ? null : era >= 5 ? 'hot' : era <= 3.2 ? 'cold' : null,
      tip: 'Season earned-run average.' },
    { label: 'WHIP', value: fmt2(whip), tone: whip == null ? null : whip >= 1.4 ? 'hot' : whip <= 1.1 ? 'cold' : null,
      tip: 'Walks + hits per inning — traffic. High traffic means more RBI chances for the bats.' },
    // The tip used to name 1.30 and 0.85 while the tone used the same pair;
    // both now come from lib/hr9.js, so the sentence cannot drift from the
    // colour the way it did on four other surfaces.
    { label: 'HR/9', value: fmt2(hr9), tone: hr9Tone(hr9), tip: hr9Title(hr9) },
    { label: 'K/9', value: k9 == null ? '—' : k9.toFixed(1), tone: k9 == null ? null : k9 <= 7 ? 'hot' : k9 >= 9.5 ? 'cold' : null,
      tip: 'Strikeouts per nine. LOW is good for the bats — more balls in play. High is his strength.' },
    { label: 'FB%', value: fmtPct(fbAllowed), tone: fbAllowed == null ? null : fbAllowed >= 0.42 ? 'hot' : fbAllowed <= 0.32 ? 'cold' : null,
      tip: 'Fly-ball rate allowed, season — the only batted ball that leaves the yard. Slate mean ~38%.' },
    { label: 'HH%', value: fmtPct(hhAllowed), tone: hhAllowed == null ? null : hhAllowed >= 0.42 ? 'hot' : hhAllowed <= 0.33 ? 'cold' : null,
      tip: 'Hard-hit rate allowed (95+ mph). Slate mean ~38%.' },
    { label: 'BRL%', value: fmtPct(brlAllowed), tone: brlAllowed == null ? null : brlAllowed >= 0.09 ? 'hot' : brlAllowed <= 0.05 ? 'cold' : null,
      tip: 'Barrel rate allowed — the single best contact-quality signal for homers. Slate mean ~7%.' },
    ...(l3n > 0 ? [{ label: 'L3 HR/9', value: fmt2(l3hr9), tone: l3hr9 == null ? null : hr9Tone(l3hr9) === 'hot' ? 'hot' : l3hr9 <= 0.85 ? 'cold' : null,
      tip: `Last ${l3n} start${l3n === 1 ? '' : 's'} — a direction, not a rate. Three outings is a handful of innings.` }] : []),
  ]
}
