// THE EXPECTED-NUMBER LINE OF A GAME CARD (BUCKETS' slate card is the template: "expected points · AWY 112, HOME 108").
// One formatter for every sport's slate card, so the clause reads the same everywhere: the TEAM model's projected count for each club, from the number the
// sport's own model already holds (lib/teamHr.js, lib/nfl/teamTdModel.js, lib/nhl/teamProj.js). Never computed here, never a pick, never a probability:
// a club whose number the model does not hold is simply not named, and with neither number the line is only the word.
const fin = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** `sides` = [[abbr, value], [abbr, value]] (away first). Returns the clause text: "expected goals · NYR 3.1, BOS 2.8". */
export function expectedClause(word, sides, dp = 1) {
  const named = (sides || []).map(([abbr, v]) => [abbr, fin(v)]).filter(([abbr, v]) => abbr && v != null)
  return named.length ? `${word} · ${named.map(([abbr, v]) => `${abbr} ${v.toFixed(dp)}`).join(', ')}` : word
}
