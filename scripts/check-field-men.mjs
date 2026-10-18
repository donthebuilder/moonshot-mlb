// The men on the field (lib/nfl/fieldMen.js): every placed man gets a spot inside the field, and no two faces cover each other.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-field-men.mjs
// A fixture lineup, labelled TEST DATA: three receivers (two on the left, one in the slot), a tight end right, a QB and a back, three corners.
const F = await import('../lib/nfl/fieldMen.js')
let bad = 0
const eq = (n, g, w) => { if (JSON.stringify(g) !== JSON.stringify(w)) { console.log(`FAIL ${n}: got ${JSON.stringify(g)}, want ${JSON.stringify(w)}`); bad += 1 } }

const men = [
  { id: 'a', side: 'left', slot: 0, back: false, role: 'WR1' },
  { id: 'b', side: 'left', slot: 1, back: false, role: 'WR2' },
  { id: 'c', side: 'middle', slot: 0, back: false, role: 'WR3' },
  { id: 'd', side: 'right', slot: 0, back: false, role: 'TE1' },
  { id: 'q', side: 'middle', slot: 0, back: true, role: 'QB', row_i: 0 },
  { id: 'r', side: 'middle', slot: 1, back: true, role: 'RB1', row_i: 1 },
]
const defMen = [{ id: 'x', side: 'left', role: 'LCB' }, { id: 'y', side: 'right', role: 'RCB' }, { id: 'z', side: 'middle', role: 'NB' }]

for (const pass of [true, false]) {
  const spots = F.fieldSpots({ men, defMen: pass ? defMen : [], pass })
  eq(`${pass ? 'pass' : 'run'}: every man has a spot (a run places backs only)`, spots.length, (pass ? men.length + defMen.length : men.filter((m) => m.back).length))
  eq(`${pass ? 'pass' : 'run'}: no two faces overlap`, F.overlapping(spots), [])
  const los = pass ? F.FM.LOS : F.FM.R_LOS
  eq(`${pass ? 'pass' : 'run'}: backs stand behind the line`, spots.filter((s) => s.back).every((s) => s.y > los + 30), true)
  eq(`${pass ? 'pass' : 'run'}: inside the field`, spots.every((s) => s.x - F.FM.R >= 0 && s.x + F.FM.R <= F.FM.W), true)
}
eq('corners stand above the line', F.fieldSpots({ men: [], defMen, pass: true }).every((s) => s.y < F.FM.LOS), true)
eq('a lone man sits at the lane centre', F.fieldSpots({ men: [men[3]], pass: true })[0].x, 250)
eq('two in one lane: outermost first', F.fieldSpots({ men: men.slice(0, 2), pass: true }).map((s) => s.x), [22, 78])
eq('overlap is caught', F.overlapping([{ id: 1, x: 10, y: 10 }, { id: 2, x: 20, y: 10 }]).length, 1)

if (bad) { console.log(`\n${bad} FAILED`); process.exit(1) }
console.log('check-field-men: all ok')
