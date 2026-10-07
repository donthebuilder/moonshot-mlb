// A copy-and-paste post for the Splits tab (2026-10-07). Pure: the platoon and RISP rows the tab already
// holds in, a short text out. Real numbers only; a split with no sample is left out, never zero-filled.
// The post says what the sample is (PA), because a split with 20 PA is colour, not a finding.
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3).replace(/^0\./, '.') : null)

export function splitsPostText({ name, windowTag = 'season', tonightArm = '', rows = [], link = '' } = {}) {
  if (!name) return ''
  const by = (code) => rows.find((r) => r.code === code && r.pa > 0)
  const picks = [['vl', 'vs LHP'], ['vr', 'vs RHP'], ['risp', 'RISP']]
  const lines = picks.map(([code, label]) => {
    const r = by(code)
    if (!r) return null
    const side = (code === 'vl' && tonightArm === 'L') || (code === 'vr' && tonightArm === 'R') ? ' (tonight’s arm)' : ''
    return `${label}${side}: ${f3(r.avg)} AVG, ${f3(r.ops)} OPS, ${r.hr} HR in ${r.pa} PA`
  }).filter(Boolean)
  if (!lines.length) return ''
  return [`${name} splits (${windowTag})`, '', ...lines, ...(link ? ['', link] : [])].join('\n')
}
