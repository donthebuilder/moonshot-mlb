// The shots route's packed rows ([x, y, made, three, gameId?]) as the shot
// chart's objects. event_id is the row's place in the list: unique per read.
export const unpackShots = (packed = []) => packed.map((s, i) => ({ event_id: i, x: s[0], y: s[1], made: Boolean(s[2]), three: Boolean(s[3]), game_id: s[4] || null }))
