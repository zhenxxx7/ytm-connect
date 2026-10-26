/**
 * Generates crisp RGBA PNG icons for Desktop Extension (16, 48, 128)
 * and Mobile PWA (192, 512) using built-in Node.js zlib (zero external image dependencies).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Precompute CRC32 table for PNG chunks
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createIconPng(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const center = (size - 1) / 2;
  const outerR = size * 0.44;
  const innerRingR = size * 0.31;

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // Filter type 0 (None)

    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.hypot(dx, dy);

      // Rounded dark background square
      const normX = Math.abs(dx) / (size * 0.48);
      const normY = Math.abs(dy) / (size * 0.48);
      const superEllipse = Math.pow(normX, 5) + Math.pow(normY, 5);

      if (superEllipse > 1.0) {
        raw[px] = 0;
        raw[px + 1] = 0;
        raw[px + 2] = 0;
        raw[px + 3] = 0;
        continue;
      }

      // Base dark obsidian studio background
      let r = 14;
      let g = 17;
      let b = 23;

      // Red YTM outer circle
      if (dist <= outerR) {
        r = 235;
        g = 0;
        b = 48;
      }

      // Inner dark disc
      if (dist <= innerRingR) {
        r = 16;
        g = 20;
        b = 27;
      }

      // Spotify-Connect emerald ring accent on top-right arc
      if (
        dist > innerRingR * 1.02 &&
        dist < outerR * 0.92 &&
        dx > 0 &&
        dy < 0
      ) {
        r = 30;
        g = 215;
        b = 96;
      }

      // Center play triangle
      const triScale = size * 0.14;
      const tx = dx / triScale;
      const ty = dy / triScale;
      if (tx >= -0.45 && tx <= 0.75 && Math.abs(ty) <= (0.75 - tx) * 0.58) {
        r = 255;
        g = 255;
        b = 255;
      }

      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
      raw[px + 3] = 255;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', iend)
  ]);
}

function generateAllIcons() {
  const extIconsDir = path.join(__dirname, '..', 'packages', 'desktop-extension', 'icons');
  const pwaIconsDir = path.join(__dirname, '..', 'packages', 'mobile-pwa', 'public', 'icons');

  fs.mkdirSync(extIconsDir, { recursive: true });
  fs.mkdirSync(pwaIconsDir, { recursive: true });

  for (const s of [16, 48, 128]) {
    fs.writeFileSync(path.join(extIconsDir, `icon-${s}.png`), createIconPng(s));
  }
  for (const s of [192, 512]) {
    fs.writeFileSync(path.join(pwaIconsDir, `icon-${s}.png`), createIconPng(s));
  }
}

if (require.main === module) {
  generateAllIcons();
  console.log('[Icons] Generated extension and PWA icons successfully.');
}

module.exports = { generateAllIcons };
