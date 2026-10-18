// THE TWO ROUND-NUMBER RULES every sport's ledger uses (2026-10-18; they were written out by hand in NHL, NFL and MOONSHOT). Pure, no UI.
//   roundMark(before, got, step) -> the multiple of `step` he passed with `got` more events, or null   (RoundLine: "passed his 10th goal")
//   oneShort(count, step)        -> true when `count` is exactly one short of a multiple of `step`      (Who needs what)
// Steps: MLB homers 10, NHL goals 10, NFL touchdowns 5. A count of 0 is never "one short" (nobody needs his first to be a round number).
export function roundMark(before, got, step) {
  const b = Number(before), g = Number(got)
  if (!Number.isFinite(b) || !Number.isFinite(g) || !(step > 0)) return null
  const after = b + g
  return Math.floor(after / step) > Math.floor(b / step) ? Math.floor(after / step) * step : null
}

export function oneShort(count, step) {
  const n = Number(count)
  return Number.isFinite(n) && n > 0 && (n + 1) % step === 0
}
