// ONE STORY SHAPE FOR ALL THREE PRODUCTS (BATCH-STORYLINES-PAGE step 1).
// Plain data, server-safe (no hooks, no JSX). Every engine
// (lib/stories/{mlb,nfl,nhl}.js) returns an array of these; the Storylines
// page, the home sections and the freeze/grade record all read the same rows.
//
//   { sport, day, game_id, player_id, name, team, opp, pos, type, icon,
//     parts: [{ t: 'name'|'num'|'text', v }],   <- how the row draws it
//     text,                                      <- the same sentence, plain
//     numbers: {...},                            <- the counted numbers behind it
//     rarity,                                    <- 0-1, how unusual (per type, see each engine)
//     source,                                    <- the fields / file it came from
//     proof? }                                   <- optional tap list
// A game-level story (a rivalry) has player_id '_game'.

export const name = (v) => ({ t: 'name', v: String(v ?? '') })
export const num = (v) => ({ t: 'num', v: String(v ?? '') })

/** Parts from a mixed list: strings become text, {t,v} pass through. */
export function parts(...bits) {
  return bits.flat().filter((b) => b !== null && b !== undefined && b !== false && b !== '')
    .map((b) => (typeof b === 'object' ? b : { t: 'text', v: String(b) }))
}
export const plain = (ps) => ps.map((p) => p.v).join('')

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)

export function story({ sport, day, game_id, player_id, name: nm, team = null, opp = null, pos = null, type, icon, parts: ps, numbers = {}, rarity, source, proof = null }) {
  return {
    sport, day, game_id: game_id == null ? null : String(game_id), player_id: player_id == null ? '_game' : String(player_id),
    name: nm ?? null, team, opp, pos, type, icon, parts: ps, text: plain(ps), numbers,
    rarity: Math.round(clamp01(rarity) * 1000) / 1000, source, ...(proof ? { proof } : {}),
  }
}

/** Rarest first, then by type and name, so the order is stable. */
export const byRarity = (a, b) => b.rarity - a.rarity || String(a.type).localeCompare(String(b.type)) || String(a.name).localeCompare(String(b.name))
