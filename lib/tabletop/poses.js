// 🎨 THE DRAWN POSES (2026-10-23) for the die-cut pieces (lib/tabletop/diecut.js). Each is a side-on athlete facing right
// (+x), drawn from a skeleton: far limbs first and shaded, the body, the near limbs, the kit's details on top. A piece
// turned round (its back face) faces left. Colours come from the kit the caller passes (the club's own and the theme's
// tokens); nothing here is a hex.
//
// FOOTBALL (TUDDY's electric board): stance3 (a lineman, a hand down), ready (backers, receivers), run (the ball
// carrier, ball tucked), qb (cocked to throw), backpedal (a corner, low), kick. Helmet with a stripe and a real facemask,
// shoulder pads under the jersey, the number on the side, pants with a stripe, socks, cleats, gloves.
// HOCKEY (LAMP's dome): stride (a skater, stick on the ice) and goalie (pads, blocker, glove, cage, paddle).

// how each sport's kit differs (a lookup, not a ternary per part)
const STYLE = {
  nfl: { pantsStripe: true, sockStripes: false, shin: 21, bootH: 9, skate: false, forearm: 16, bareForearm: true, gloveTrim: false },
  nhl: { pantsStripe: false, sockStripes: true, shin: 24, bootH: 12, skate: true, forearm: 19, bareForearm: false, gloveTrim: true },
}
const shade = (pen, fn) => pen.detail((g) => { g.globalAlpha = 0.28; g.globalCompositeOperation = 'source-atop'; fn(g) })

/** the torso from hip H to shoulders S: a tapered body, shoulder pads as a hump over the top (football) */
function torso(pen, H, S, w1, w2, color, ink, pads = 0) {
  const ax = S[0] - H[0], ay = S[1] - H[1], L = Math.hypot(ax, ay) || 1, nx = -ay / L, ny = ax / L
  const pts = [[H[0] + nx * w1, H[1] + ny * w1], [S[0] + nx * w2, S[1] + ny * w2], [S[0] - nx * w2, S[1] - ny * w2], [H[0] - nx * w1, H[1] - ny * w1]]
  pen.shape(pts, color, true); pen.key(ink, 1.6)
  if (pads) { pen.oval(S[0] + (ax / L) * 2, S[1] + (ay / L) * 2, w2 * 1.08 + pads, w2 * 0.62, color, Math.atan2(ny, nx)); pen.key(ink, 1.4) }
  return { nx, ny, ax: ax / L, ay: ay / L, L }
}

/** a leg: thigh in the pants, the shin in the sock, the boot; far legs shaded */
function leg(pen, hip, kn, an, toe, kit, T, { far = false, sport = 'nfl' } = {}) {
  const st = STYLE[sport]
  pen.limb([hip, kn], 30, kit.pants)
  if (st.pantsStripe) pen.detail((g) => { g.strokeStyle = kit.trim; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(hip[0], hip[1] - 4); g.lineTo(kn[0], kn[1] - 4); g.stroke() })
  pen.limb([kn, an], st.shin, kit.sock)
  if (st.sockStripes) pen.detail((g) => { for (const f of [0.35, 0.55]) { const x = kn[0] + (an[0] - kn[0]) * f, y = kn[1] + (an[1] - kn[1]) * f; g.strokeStyle = kit.trim; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x + 11, y); g.stroke() } })
  // the boot (a cleat, or a skate with its blade)
  const bx = (an[0] + toe[0]) / 2, by = (an[1] + toe[1]) / 2, rot = Math.atan2(toe[1] - an[1], toe[0] - an[0])
  pen.oval(bx, by - 3, Math.hypot(toe[0] - an[0], toe[1] - an[1]) / 2 + 9, st.bootH, kit.dark, rot)
  if (st.skate) { pen.limb([[an[0] - 8, an[1] + 13], [toe[0] + 8, toe[1] + 13]], 4, T.steel); pen.limb([[an[0] - 4, an[1] + 6], [an[0] - 4, an[1] + 12]], 3, T.steel); pen.limb([[toe[0] + 2, toe[1] + 6], [toe[0] + 2, toe[1] + 12]], 3, T.steel) }
  else pen.detail((g) => { g.strokeStyle = T.cream; g.lineWidth = 2.5; g.beginPath(); g.moveTo(bx - 8, by - 6); g.lineTo(bx + 8, by - 3); g.stroke() })
  if (far) shade(pen, (g) => { g.strokeStyle = T.ink; g.lineWidth = 32; g.lineCap = 'round'; g.beginPath(); g.moveTo(hip[0], hip[1]); g.lineTo(kn[0], kn[1]); g.lineTo(an[0], an[1]); g.stroke() })
}

/** an arm: the sleeve to the elbow, the forearm, the glove; far arms shaded */
function arm(pen, sh, el, ha, kit, T, { far = false, sport = 'nfl', big = false } = {}) {
  const st = STYLE[sport]
  pen.limb([sh, el], 21, kit.jersey)
  // a band round the sleeve in the club's trim
  pen.detail((g) => { const L = Math.hypot(el[0] - sh[0], el[1] - sh[1]) || 1, ux = (el[0] - sh[0]) / L, uy = (el[1] - sh[1]) / L, x = sh[0] + ux * L * 0.68, y = sh[1] + uy * L * 0.68; g.strokeStyle = kit.trim; g.lineWidth = 5; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x - uy * 10.5, y + ux * 10.5); g.lineTo(x + uy * 10.5, y - ux * 10.5); g.stroke() })
  pen.limb([el, ha], st.forearm, st.bareForearm ? T.skin : kit.jersey)
  pen.oval(ha[0], ha[1], big ? 14 : 10, big ? 12 : 9, st.gloveTrim ? kit.trim : kit.dark)
  if (far) shade(pen, (g) => { g.strokeStyle = T.ink; g.lineWidth = 22; g.lineCap = 'round'; g.beginPath(); g.moveTo(sh[0], sh[1]); g.lineTo(el[0], el[1]); g.lineTo(ha[0], ha[1]); g.stroke() })
}

/** the football helmet facing right: shell, the club stripe, the ear hole, the jaw, a two-bar facemask */
function helmet(pen, [x, y], kit, T, tilt = 0) {
  pen.oval(x, y, 31, 29, kit.helmet, tilt)
  pen.detail((g) => {
    g.translate(x, y); g.rotate(tilt)
    g.strokeStyle = kit.trim; g.lineWidth = 6; g.beginPath(); g.arc(0, 2, 27, Math.PI * 1.08, Math.PI * 1.92); g.stroke()
    g.fillStyle = T.ink; g.beginPath(); g.arc(-4, 6, 4.5, 0, Math.PI * 2); g.fill()
    g.fillStyle = T.skin; g.beginPath(); g.ellipse(19, 13, 10, 11, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = T.ink; g.fillRect(21, 4, 6, 3)
    g.strokeStyle = kit.mask; g.lineWidth = 3.6; g.lineCap = 'round'
    g.beginPath(); g.moveTo(14, 2); g.quadraticCurveTo(36, 2, 38, 10); g.stroke()
    g.beginPath(); g.moveTo(14, 18); g.quadraticCurveTo(36, 22, 37, 22); g.stroke()
    g.beginPath(); g.moveTo(36, 6); g.lineTo(35, 27); g.stroke()
    g.strokeStyle = T.ink; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, 31, 29, 0, 0, Math.PI * 2); g.stroke()
    g.fillStyle = T.cream; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(-8, -14, 9, 4, -0.4, 0, Math.PI * 2); g.fill()   // the shine
  })
  pen.limb([[x + 14, y + 2], [x + 38, y + 9]], 4, kit.mask); pen.limb([[x + 35, y + 6], [x + 35, y + 26]], 4, kit.mask)
}

/** the hockey helmet facing right: shell, a visor, the ear guard, the chin strap */
function hockeyHelmet(pen, [x, y], kit, T, cage = false) {
  pen.oval(x, y, 25, 24, kit.helmet)
  pen.detail((g) => {
    g.translate(x, y)
    g.fillStyle = T.skin; g.beginPath(); g.ellipse(14, 12, 12, 13, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = T.ink; g.fillRect(16, 6, 6, 3)
    if (cage) { g.strokeStyle = T.steel; g.lineWidth = 2; for (let k = 0; k < 4; k += 1) { g.beginPath(); g.moveTo(6 + k * 6, -4); g.lineTo(8 + k * 6, 26); g.stroke() } for (let k = 0; k < 4; k += 1) { g.beginPath(); g.moveTo(4, k * 8); g.lineTo(30, k * 8 + 2); g.stroke() } }
    else { g.fillStyle = T.cream; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(10, -4); g.lineTo(31, -2); g.lineTo(30, 10); g.lineTo(12, 9); g.closePath(); g.fill(); g.globalAlpha = 1 }
    g.fillStyle = T.ink; g.beginPath(); g.arc(-5, 4, 4, 0, Math.PI * 2); g.fill()
    g.strokeStyle = kit.trim; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 21, Math.PI * 1.1, Math.PI * 1.75); g.stroke()
    g.strokeStyle = T.ink; g.lineWidth = 1.6; g.beginPath(); g.ellipse(0, 0, 25, 24, 0, 0, Math.PI * 2); g.stroke()
  })
}

/** his number on the side of the jersey (cream edged) */
function number(pen, num, [x, y], kit, T, size = 40) {
  if (num == null) return
  pen.detail((g) => {
    g.translate(x, y); if (pen.mirror) g.scale(-1, 1)   // a left-facing piece: the number still reads the right way round
    g.font = `900 ${String(num).length > 1 ? size * 0.82 : size}px Impact, "Arial Narrow", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineWidth = 5; g.strokeStyle = T.cream; g.strokeText(String(num), 0, 0); g.fillStyle = kit.numInk || kit.trim; g.fillText(String(num), 0, 0)
  })
}

/** a football */
function football(pen, [x, y], rot, T) {
  pen.oval(x, y, 15, 9, T.leather, rot)
  pen.detail((g) => { g.translate(x, y); g.rotate(rot); g.strokeStyle = T.cream; g.lineWidth = 2; g.beginPath(); g.moveTo(-5, -1); g.lineTo(6, -1); g.stroke(); for (let k = -3; k <= 4; k += 2.4) { g.beginPath(); g.moveTo(k, -3); g.lineTo(k, 1); g.stroke() } g.strokeStyle = T.ink; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2); g.stroke() })
}

// ── FOOTBALL ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// joints in a 360 x 450 frame, feet at y 440
const NFL_J = {
  stance3: { H: [140, 250], S: [238, 240], head: [285, 236], tilt: 0.1, near: { sh: [244, 252], el: [262, 340], ha: [266, 428] }, far: { sh: [230, 248], el: [212, 300], ha: [196, 290] },
    legN: { kn: [205, 332], an: [196, 422], toe: [226, 436] }, legF: { kn: [118, 346], an: [96, 426], toe: [126, 438] }, num: [190, 246] },
  ready: { H: [175, 262], S: [204, 150], head: [222, 104], tilt: 0.05, near: { sh: [210, 160], el: [246, 214], ha: [264, 196] }, far: { sh: [198, 158], el: [226, 222], ha: [246, 206] },
    legN: { kn: [216, 344], an: [206, 424], toe: [238, 436] }, legF: { kn: [150, 348], an: [140, 424], toe: [172, 438] }, num: [190, 206] },
  run: { H: [168, 254], S: [228, 152], head: [258, 110], tilt: 0.12, near: { sh: [232, 163], el: [206, 216], ha: [240, 214] }, far: { sh: [222, 158], el: [264, 190], ha: [288, 165] },
    legN: { kn: [238, 300], an: [222, 372], toe: [254, 380] }, legF: { kn: [138, 332], an: [92, 398], toe: [76, 430] }, num: [176, 224], ball: [[234, 200], -0.4] },
  qb: { H: [186, 270], S: [190, 152], head: [205, 106], tilt: 0, near: { sh: [186, 160], el: [142, 132], ha: [140, 84] }, far: { sh: [198, 158], el: [240, 176], ha: [274, 168] },
    legN: { kn: [234, 354], an: [254, 426], toe: [286, 436] }, legF: { kn: [160, 356], an: [136, 428], toe: [166, 440] }, num: [190, 212], ball: [[140, 70], -1.0] },
  backpedal: { H: [190, 284], S: [184, 176], head: [192, 130], tilt: -0.05, near: { sh: [192, 184], el: [226, 230], ha: [250, 214] }, far: { sh: [180, 182], el: [210, 238], ha: [232, 222] },
    legN: { kn: [226, 360], an: [216, 428], toe: [246, 440] }, legF: { kn: [150, 360], an: [130, 428], toe: [160, 440] }, num: [186, 230] },
  kick: { H: [176, 266], S: [166, 150], head: [172, 104], tilt: -0.08, near: { sh: [172, 160], el: [132, 190], ha: [96, 200] }, far: { sh: [164, 158], el: [206, 190], ha: [240, 188] },
    legN: { kn: [236, 236], an: [292, 192], toe: [318, 174] }, legF: { kn: [180, 350], an: [178, 428], toe: [210, 440] }, num: [172, 210] },
}
function drawFootball(J) {
  return (pen, { kit = {}, num = null, T = {} } = {}) => {
    leg(pen, J.H, J.legF.kn, J.legF.an, J.legF.toe, kit, T, { far: true })
    arm(pen, J.far.sh, J.far.el, J.far.ha, kit, T, { far: true })
    // the hips in the pants, then the jersey over the pads
    pen.oval(J.H[0], J.H[1] - 4, 33, 26, kit.pants)
    torso(pen, J.H, J.S, 30, 38, kit.jersey, T.ink, 6)
    pen.detail((g) => { g.fillStyle = kit.dark; g.save(); g.translate(J.H[0], J.H[1] - 18); g.rotate(Math.atan2(J.S[1] - J.H[1], J.S[0] - J.H[0]) + Math.PI / 2); g.fillRect(-32, -3, 64, 6); g.restore() })   // the belt
    number(pen, num, J.num, kit, T, 40)
    leg(pen, J.H, J.legN.kn, J.legN.an, J.legN.toe, kit, T)
    pen.limb([J.S, J.head], 20, T.skin)   // the neck
    helmet(pen, J.head, kit, T, J.tilt)
    if (J.ball) football(pen, J.ball[0], J.ball[1], T)
    arm(pen, J.near.sh, J.near.el, J.near.ha, kit, T)
  }
}
export const FOOTBALL_POSES = Object.fromEntries(Object.entries(NFL_J).map(([k, J]) => [k, { key: `nfl-${k}`, CW: 360, CH: 450, PX: 52, footX: 180, footY: 440, lightX: 230, draw: drawFootball(J) }]))

// ── HOCKEY ────────────────────────────────────────────────────────────────────────────────────────────────────────────
// joints in a 400 x 450 frame, blades at y 440
const NHL_J = {
  stride: { H: [178, 262], S: [226, 182], head: [250, 140], near: { sh: [230, 192], el: [214, 236], ha: [222, 262] }, far: { sh: [220, 188], el: [252, 240], ha: [266, 286] },
    legN: { kn: [236, 336], an: [226, 410], toe: [262, 416] }, legF: { kn: [134, 330], an: [90, 396], toe: [62, 406] }, stick: [[204, 236], [342, 424]], blade: [[334, 428], [384, 432]], num: [190, 214] },
  goalie: { H: [176, 300], S: [186, 196], head: [200, 152], near: { sh: [194, 206], el: [222, 254], ha: [236, 282] }, far: { sh: [180, 204], el: [150, 236], ha: [140, 252] },
    legN: { kn: [216, 336], an: [206, 412], toe: [240, 418] }, legF: { kn: [150, 340], an: [140, 412], toe: [174, 420] }, stick: [[236, 284], [264, 420]], blade: [[258, 428], [306, 432]], num: [182, 250], goalie: true },
}
function drawHockey(J) {
  return (pen, { kit = {}, num = null, T = {} } = {}) => {
    const G = Boolean(J.goalie)
    if (G) {
      // the goalie's pads: tall blocks from the thigh to the boot, both legs
      for (const [l, far] of [[J.legF, true], [J.legN, false]]) {
        pen.limb([[l.kn[0], l.kn[1] - 30], l.an], 40, kit.pad)
        pen.detail((g) => { g.strokeStyle = kit.trim; g.lineWidth = 3; for (const f of [0.3, 0.6]) { const x = l.kn[0] + (l.an[0] - l.kn[0]) * f, y = l.kn[1] - 30 + (l.an[1] - l.kn[1] + 30) * f; g.beginPath(); g.moveTo(x - 17, y); g.lineTo(x + 17, y); g.stroke() } })
        pen.oval((l.an[0] + l.toe[0]) / 2, l.an[1] + 6, 24, 12, kit.dark)
        pen.limb([[l.an[0] - 10, l.an[1] + 19], [l.toe[0] + 10, l.toe[1] + 13]], 4, T.steel)
        if (far) shade(pen, (g) => { g.strokeStyle = T.ink; g.lineWidth = 42; g.lineCap = 'round'; g.beginPath(); g.moveTo(l.kn[0], l.kn[1] - 30); g.lineTo(l.an[0], l.an[1]); g.stroke() })
      }
    } else leg(pen, J.H, J.legF.kn, J.legF.an, J.legF.toe, kit, T, { far: true, sport: 'nhl' })
    // the stick behind the near arm: a taped blade on the ice
    pen.limb(J.stick, G ? 9 : 7, T.wood); pen.limb([J.stick[1], J.blade[0]], G ? 9 : 7, T.wood); pen.limb(J.blade, 9, T.ink)
    if (G) pen.limb([J.stick[0], [J.stick[0][0] + (J.stick[1][0] - J.stick[0][0]) * 0.6, J.stick[0][1] + (J.stick[1][1] - J.stick[0][1]) * 0.6]], 16, T.wood)   // the paddle
    arm(pen, J.far.sh, J.far.el, J.far.ha, kit, T, { far: true, sport: 'nhl', big: G })
    if (G) { pen.oval(J.far.ha[0] - 8, J.far.ha[1] + 2, 26, 22, kit.pad); pen.detail((g) => { g.strokeStyle = kit.trim; g.lineWidth = 4; g.beginPath(); g.arc(J.far.ha[0] - 8, J.far.ha[1] + 2, 16, 0.4, 2.8); g.stroke(); g.strokeStyle = T.ink; g.lineWidth = 1.6; g.beginPath(); g.ellipse(J.far.ha[0] - 8, J.far.ha[1] + 2, 26, 22, 0, 0, Math.PI * 2); g.stroke() }) }   // the catching glove
    // the breezers, then the jersey (a goalie's is bulky over the chest protector)
    pen.oval(J.H[0], J.H[1] - 2, 32, 28, kit.pants)
    pen.detail((g) => { g.strokeStyle = kit.trim; g.lineWidth = 5; g.beginPath(); g.moveTo(J.H[0] - 8, J.H[1] - 26); g.lineTo(J.H[0] - 2, J.H[1] + 22); g.stroke() })
    const w1 = G ? 38 : 35, tb = torso(pen, J.H, J.S, w1, G ? 44 : 40, kit.jersey, T.ink, G ? 8 : 4)
    pen.detail((g) => { const hx = J.H[0] + tb.ax * 20, hy = J.H[1] + tb.ay * 20, w = w1 * 0.92; g.strokeStyle = kit.trim; g.lineWidth = 7; g.beginPath(); g.moveTo(hx + tb.nx * w, hy + tb.ny * w); g.lineTo(hx - tb.nx * w, hy - tb.ny * w); g.stroke() })   // the hem stripe
    number(pen, num, J.num, kit, T, 36)
    if (!G) leg(pen, J.H, J.legN.kn, J.legN.an, J.legN.toe, kit, T, { sport: 'nhl' })
    pen.limb([J.S, J.head], 18, T.skin)
    hockeyHelmet(pen, J.head, kit, T, G)
    arm(pen, J.near.sh, J.near.el, J.near.ha, kit, T, { sport: 'nhl', big: G })
    if (G) { pen.shape([[J.near.ha[0] - 4, J.near.ha[1] - 26], [J.near.ha[0] + 20, J.near.ha[1] - 26], [J.near.ha[0] + 20, J.near.ha[1] + 14], [J.near.ha[0] - 4, J.near.ha[1] + 14]], kit.pad); pen.key(T.ink, 1.4) }   // the blocker
  }
}
export const HOCKEY_POSES = Object.fromEntries(Object.entries(NHL_J).map(([k, J]) => [k, { key: `nhl-${k}`, CW: 400, CH: 450, PX: 64, footX: 190, footY: 440, lightX: 250, draw: drawHockey(J) }]))
