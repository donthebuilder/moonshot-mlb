// THE METADATA AUDIT (server only, pure): a downloaded picture is refused when its embedded metadata carries a copyright, credit or agency string (Donovan 2026-10-14:
// "no image that carries a copyright / credit tag"). It reads only the places metadata lives, never the pixels:
//   PNG   tEXt / zTXt / iTXt / eXIf chunks (zTXt and compressed iTXt are inflated)
//   JPEG  every APPn segment (EXIF, XMP, IPTC / Photoshop IRB, ICC) and COM, up to the start of the scan
//   WebP  EXIF and XMP chunks
// A file in any other container, or one that cannot be parsed, is NOT clean (we cannot show it is). An empty tag NAME alone (an XMP template that says "Credit" with no value) also
// counts: this is deliberately over-strict, because a false refusal costs a placeholder and a false pass costs a rights problem.
// TAG-FREE DOES NOT MEAN LICENSED: a clean file can still be someone's photograph. This audit is one gate, not a licence.
import { inflateSync } from 'node:zlib'

export const BAD = /getty|copyright|©|\(c\)\s?\d|\bcredit\b|reuters|associated press|\bap photo\b|shutterstock|imagn|usa today|photo by|photographer|all rights reserved|\blicen[sc]e|\bimages? via\b|\bbyline\b|\bsource\s*[:=]/i

const latin = (b) => Buffer.from(b).toString('latin1')
const utf16 = (b) => Buffer.from(b).toString('utf16le')

function pngParts(buf) {
  const parts = []
  let i = 8
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8), data = buf.subarray(i + 8, i + 8 + len)
    if (type === 'tEXt') parts.push({ where: 'png tEXt', text: latin(data).replace(/\0/g, ' ') })
    else if (type === 'zTXt') { const k = data.indexOf(0); try { parts.push({ where: 'png zTXt', text: `${latin(data.subarray(0, k))} ${latin(inflateSync(data.subarray(k + 2)))}` }) } catch { parts.push({ where: 'png zTXt', text: 'UNREADABLE' }) } }
    else if (type === 'iTXt') {
      const k = data.indexOf(0), flag = data[k + 1]
      let p = k + 3
      p = data.indexOf(0, p) + 1; p = data.indexOf(0, p) + 1
      try { parts.push({ where: 'png iTXt', text: `${latin(data.subarray(0, k))} ${flag ? inflateSync(data.subarray(p)).toString('utf8') : data.subarray(p).toString('utf8')}` }) } catch { parts.push({ where: 'png iTXt', text: 'UNREADABLE' }) }
    } else if (type === 'eXIf') parts.push({ where: 'png eXIf', text: latin(data) })
    else if (type === 'IDAT' || type === 'IEND') { if (type === 'IEND') break }
    i += 12 + len
  }
  return parts
}
function jpegParts(buf) {
  const parts = []
  let i = 2
  while (i + 4 <= buf.length && buf[i] === 0xff) {
    const m = buf[i + 1]
    if (m === 0xda || m === 0xd9) break
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue }
    const len = buf.readUInt16BE(i + 2), data = buf.subarray(i + 4, i + 2 + len)
    if ((m >= 0xe0 && m <= 0xef) || m === 0xfe) parts.push({ where: `jpeg ${m === 0xfe ? 'COM' : `APP${m - 0xe0}`}`, text: `${latin(data)} ${data.toString('utf8')} ${utf16(data)}` })
    i += 2 + len
  }
  return parts
}
function webpParts(buf) {
  const parts = []
  let i = 12
  while (i + 8 <= buf.length) {
    const type = buf.toString('latin1', i, i + 4), len = buf.readUInt32LE(i + 4)
    if (type === 'EXIF' || type === 'XMP ') parts.push({ where: `webp ${type.trim()}`, text: latin(buf.subarray(i + 8, i + 8 + len)) })
    i += 8 + len + (len % 2)
  }
  return parts
}

/** { clean, format, findings:[{ where, match }], chunks } for the bytes of a downloaded picture. */
export function auditMetadata(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  let format = null, parts = []
  try {
    if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) { format = 'png'; parts = pngParts(buf) }
    else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) { format = 'jpeg'; parts = jpegParts(buf) }
    else if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') { format = 'webp'; parts = webpParts(buf) }
  } catch { return { clean: false, format, findings: [{ where: 'parse', match: 'metadata could not be parsed' }], chunks: 0 } }
  if (!format) return { clean: false, format: null, findings: [{ where: 'format', match: 'not a PNG, JPEG or WebP: metadata cannot be audited' }], chunks: 0 }
  const findings = []
  for (const p of parts) {
    if (p.text === 'UNREADABLE') { findings.push({ where: p.where, match: 'unreadable metadata chunk' }); continue }
    const hit = BAD.exec(p.text)
    if (hit) findings.push({ where: p.where, match: hit[0] })
  }
  return { clean: findings.length === 0, format, findings, chunks: parts.length }
}
