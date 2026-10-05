// NFL period word: 1-4 are quarters, 5 is overtime (ESPN counts OT as period 5;
// a playoff second overtime is 6 -> 2OT). Printed as "Q5" this read as a fifth
// quarter. One place so the posts, cards and rails say it the same way.
export const periodWord = (n) => {
  const q = Number(n)
  if (!Number.isFinite(q) || q < 1) return ''
  if (q <= 4) return `Q${q}`
  return q === 5 ? 'OT' : `${q - 4}OT`
}
