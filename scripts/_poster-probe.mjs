// PROBE: draws strings with the REAL poster fonts through the real renderer (next/og) and reads back how wide the ink came out, so
// lib/cards/fit.js's measure can be compared with pixels. Load through the proto loader (it imports lib/cards/cardKit.js).
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { assets } from '../lib/cards/cardKit.js'

/** items: [{ text, size, family = 'Inter', weight = 800, ls = 0, upper = false }] -> [inkWidthPx] (same order). */
export async function probe(items, { width = 2600 } = {}) {
  const { fonts } = await assets()
  const rows = items.map((it) => ({ ...it, h: Math.ceil(it.size * 1.5) + 10 }))
  const H = rows.reduce((a, r) => a + r.h, 0)
  const el = {
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', width, height: H, background: '#000' },
      children: rows.map((r, i) => ({
        type: 'div',
        props: {
          key: i,
          style: { display: 'flex', alignItems: 'center', height: r.h, paddingLeft: 20 },
          children: {
            type: 'span',
            props: {
              style: { display: 'flex', whiteSpace: 'nowrap', color: '#fff', fontFamily: r.family || 'Inter', fontWeight: r.weight || 800, fontSize: r.size, letterSpacing: r.ls || 0, textTransform: r.upper ? 'uppercase' : 'none' },
              children: r.text,
            },
          },
        },
      })),
    },
  }
  const res = new ImageResponse(el, { width, height: H, fonts })
  const png = Buffer.from(await res.arrayBuffer())
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const out = []
  let y0 = 0
  for (const r of rows) {
    let maxX = -1
    for (let y = y0; y < y0 + r.h; y += 1) {
      for (let x = info.width - 1; x > Math.max(maxX, 19); x -= 1) {
        if (data[(y * info.width + x) * info.channels] > 70) { maxX = x; break }
      }
    }
    out.push(maxX < 0 ? 0 : maxX - 20 + 1)
    y0 += r.h
  }
  return out
}
