'use strict'
/**
 * make-icon.js — generates assets/tray-icon.png and assets/icon.ico
 *
 * No external dependencies — uses only built-in Node.js modules.
 * The ICO contains two BMP images: 16x16 and 32x32.
 */
const fs   = require('fs')
const zlib = require('zlib')
const path = require('path')
const cp = require('child_process')

const ASSETS = path.join(__dirname, '..', 'assets')
const ICONSET = path.join(ASSETS, 'icon.iconset')
fs.mkdirSync(ASSETS, { recursive: true })

// ── PNG helpers ───────────────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xffffffff
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0)
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([l, t, data, c])
}

function makePNG(pixels, w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6  // 8-bit RGBA

  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0
    for (let x = 0; x < w; x++) {
      const pi = (y * w + x) * 4
      const ri = y * (1 + w * 4) + 1 + x * 4
      raw[ri]   = pixels[pi]
      raw[ri+1] = pixels[pi+1]
      raw[ri+2] = pixels[pi+2]
      raw[ri+3] = pixels[pi+3]
    }
  }
  const compressed = zlib.deflateSync(raw)
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))])
}

// ── Icon drawing ──────────────────────────────────────────────────────────────

function drawAddomIcon(size) {
  const pixels = new Uint8Array(size * size * 4)

  // Background #0b0c0c fully opaque
  for (let i = 0; i < size * size; i++) {
    pixels[i*4] = 0x0b; pixels[i*4+1] = 0x0c; pixels[i*4+2] = 0x0c; pixels[i*4+3] = 0xff
  }

  function sp(x, y) {
    if (x < 0 || x >= size || y < 0 || y >= size) return
    const i = (y * size + x) * 4
    pixels[i] = 0xd5; pixels[i+1] = 0xd0; pixels[i+2] = 0xc1; pixels[i+3] = 0xff
  }

  // Scale the 16x16 design proportionally
  const s = size / 16
  const round = (v) => Math.round(v)

  // Left leg
  for (let y = round(3*s); y <= round(13*s); y++) {
    for (let dx = 0; dx < Math.max(1, round(2*s)); dx++) sp(round(3*s) + dx, y)
  }
  // Right leg
  for (let y = round(3*s); y <= round(13*s); y++) {
    for (let dx = 0; dx < Math.max(1, round(2*s)); dx++) sp(round(11*s) + dx, y)
  }
  // Top cap
  for (let x = round(4*s); x <= round(11*s); x++) {
    for (let dy = 0; dy < Math.max(1, round(2*s)); dy++) sp(x, round(3*s) + dy)
  }
  // Crossbar
  for (let x = round(4*s); x <= round(11*s); x++) {
    for (let dy = 0; dy < Math.max(1, round(2*s)); dy++) sp(x, round(8*s) + dy)
  }

  return pixels
}

// ── ICO helpers ───────────────────────────────────────────────────────────────

/**
 * Build a BMP-format image data block suitable for embedding in an ICO file.
 * ICO BMPs use BITMAPINFOHEADER (40 bytes) + RGBA pixels (BGRA order),
 * with rows in bottom-to-top order, and a 1-bit XOR mask appended.
 */
function makeBMPForICO(pixels, w, h) {
  // BITMAPINFOHEADER
  const bih = Buffer.alloc(40)
  bih.writeInt32LE(40, 0)          // biSize
  bih.writeInt32LE(w, 4)           // biWidth
  bih.writeInt32LE(h * 2, 8)       // biHeight — doubled (ICO convention: includes AND mask)
  bih.writeInt16LE(1, 12)          // biPlanes
  bih.writeInt16LE(32, 14)         // biBitCount (32-bit BGRA)
  bih.writeInt32LE(0, 16)          // biCompression (BI_RGB)
  bih.writeInt32LE(w * h * 4, 20) // biSizeImage
  // Remaining fields stay 0

  // Pixel data — bottom-to-top, BGRA
  const pixelData = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    const srcRow = h - 1 - y  // flip
    for (let x = 0; x < w; x++) {
      const src = (srcRow * w + x) * 4
      const dst = (y * w + x) * 4
      pixelData[dst]   = pixels[src+2]  // B
      pixelData[dst+1] = pixels[src+1]  // G
      pixelData[dst+2] = pixels[src]    // R
      pixelData[dst+3] = pixels[src+3]  // A
    }
  }

  // AND mask — 1 bit per pixel, rows padded to 4-byte boundary, bottom-to-top
  // All zeros = fully opaque (we have RGBA in the pixel data)
  const maskRowBytes = Math.ceil(w / 32) * 4
  const mask = Buffer.alloc(maskRowBytes * h, 0)

  return Buffer.concat([bih, pixelData, mask])
}

function makeICO(sizes) {
  // sizes: array of { size, pixels }
  const bmps = sizes.map(({ size, pixels }) => makeBMPForICO(pixels, size, size))

  const numImages = sizes.length
  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  const headerSize = 6 + numImages * 16
  let offset = headerSize

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)          // reserved
  header.writeUInt16LE(1, 2)          // type: 1 = ICO
  header.writeUInt16LE(numImages, 4)  // count

  const dirs = []
  for (let i = 0; i < numImages; i++) {
    const dir = Buffer.alloc(16)
    const sz = sizes[i].size
    dir[0] = sz === 256 ? 0 : sz  // width (0 = 256)
    dir[1] = sz === 256 ? 0 : sz  // height
    dir[2] = 0     // color count (0 = more than 256)
    dir[3] = 0     // reserved
    dir.writeUInt16LE(1, 4)         // planes
    dir.writeUInt16LE(32, 6)        // bit count
    dir.writeUInt32LE(bmps[i].length, 8)  // size of image data
    dir.writeUInt32LE(offset, 12)         // offset to image data
    offset += bmps[i].length
    dirs.push(dir)
  }

  return Buffer.concat([header, ...dirs, ...bmps])
}

// ── Generate ──────────────────────────────────────────────────────────────────

const sizes = [16, 32, 48, 256]
const icoEntries = sizes.map(s => ({ size: s, pixels: drawAddomIcon(s) }))
const pngSizes = [16, 32, 64, 128, 256, 512, 1024]

// PNG tray icon (16x16)
const trayPng = makePNG(icoEntries[0].pixels, 16, 16)
fs.writeFileSync(path.join(ASSETS, 'tray-icon.png'), trayPng)
console.log('Wrote assets/tray-icon.png (' + trayPng.length + ' bytes)')

// ICO for NSIS installer
const ico = makeICO(icoEntries)
fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico)
console.log('Wrote assets/icon.ico (' + ico.length + ' bytes)')

for (const size of pngSizes) {
  const png = makePNG(drawAddomIcon(size), size, size)
  fs.writeFileSync(path.join(ASSETS, `icon-${size}.png`), png)
  console.log(`Wrote assets/icon-${size}.png (${png.length} bytes)`)
}

const linuxPng = makePNG(drawAddomIcon(512), 512, 512)
fs.writeFileSync(path.join(ASSETS, 'icon.png'), linuxPng)
console.log('Wrote assets/icon.png (' + linuxPng.length + ' bytes)')

fs.rmSync(ICONSET, { recursive: true, force: true })
fs.mkdirSync(ICONSET, { recursive: true })

const macIconsetEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

for (const [filename, size] of macIconsetEntries) {
  const png = makePNG(drawAddomIcon(size), size, size)
  fs.writeFileSync(path.join(ICONSET, filename), png)
}
console.log('Wrote assets/icon.iconset')

if (process.platform === 'darwin') {
  const icnsPath = path.join(ASSETS, 'icon.icns')
  cp.execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', icnsPath])
  const stat = fs.statSync(icnsPath)
  console.log('Wrote assets/icon.icns (' + stat.size + ' bytes)')
} else {
  console.log('Skipped assets/icon.icns generation because iconutil is only available on macOS')
}
