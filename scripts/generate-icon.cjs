/**
 * Generates build/icon.png (1024x1024) — a rounded gradient tile with a white
 * graduation-cap glyph. Pure Node (zlib only), no external dependencies.
 * electron-builder derives the platform .ico/.icns from this PNG.
 *
 *   node scripts/generate-icon.cjs
 */
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const N = 1024
const R = 210 // corner radius

/* ---- geometry helpers ---- */
function pointInPoly(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0]
    const yi = poly[i][1]
    const xj = poly[j][0]
    const yj = poly[j][1]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}
function distToSeg(px, py, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a[0] + t * dx
  const cy = a[1] + t * dy
  return Math.hypot(px - cx, py - cy)
}
function lerp(a, b, t) {
  return a + (b - a) * t
}

const cx = N / 2
const cy = N / 2 - 20

// Mortarboard (diamond) + cap base + tassel.
const board = [
  [cx, cy - 170],
  [cx + 300, cy - 20],
  [cx, cy + 130],
  [cx - 300, cy - 20]
]
const capBase = [
  [cx - 150, cy + 30],
  [cx + 150, cy + 30],
  [cx + 120, cy + 215],
  [cx - 120, cy + 215]
]
const tasselA = [cx + 210, cy - 12]
const tasselB = [cx + 210, cy + 170]

/** Coverage (0..1) of the white glyph at a pixel, with light supersampling. */
function glyphCoverage(x, y) {
  let hits = 0
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const px = x + (sx + 0.5) / 2
      const py = y + (sy + 0.5) / 2
      const inBoard = pointInPoly(px, py, board)
      const inCap = pointInPoly(px, py, capBase)
      const onTassel = distToSeg(px, py, tasselA, tasselB) < 9
      const tasselKnot = Math.hypot(px - tasselB[0], py - tasselB[1]) < 26
      const button = Math.hypot(px - cx, py - (cy - 20)) < 24
      if ((inBoard || inCap || onTassel || tasselKnot) && !button) hits++
    }
  }
  return hits / 4
}

/** Rounded-rect alpha (0..1) for the tile mask. */
function tileAlpha(x, y) {
  const dx = Math.max(R - x, x - (N - R), 0)
  const dy = Math.max(R - y, y - (N - R), 0)
  const d = Math.hypot(dx, dy)
  return Math.max(0, Math.min(1, R - d + 0.5))
}

const raw = Buffer.alloc(N * (N * 4 + 1))
let p = 0
for (let y = 0; y < N; y++) {
  raw[p++] = 0 // filter: none
  for (let x = 0; x < N; x++) {
    const t = (x + y) / (2 * N)
    // gradient: emerald -> teal
    let r = lerp(52, 13, t)
    let g = lerp(211, 148, t)
    let b = lerp(153, 136, t)
    const cov = glyphCoverage(x, y)
    if (cov > 0) {
      r = lerp(r, 255, cov)
      g = lerp(g, 255, cov)
      b = lerp(b, 255, cov)
    }
    const a = tileAlpha(x, y)
    raw[p++] = Math.round(r)
    raw[p++] = Math.round(g)
    raw[p++] = Math.round(b)
    raw[p++] = Math.round(a * 255)
  }
}

/* ---- PNG encoding ---- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
// Also expose to resources for in-app/window use.
const resDir = path.join(__dirname, '..', 'resources')
fs.mkdirSync(resDir, { recursive: true })
fs.writeFileSync(path.join(resDir, 'icon.png'), png)
console.log(`Wrote build/icon.png and resources/icon.png (${N}x${N}, ${png.length} bytes)`)
