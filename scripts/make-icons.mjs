// Generates the placeholder toolbar icons (16 / 48 / 128 px) as PNGs.
//
// This is a one-off asset generator, kept in the repo so the icons can be
// regenerated from scratch with `node scripts/make-icons.mjs`. It uses only
// Node built-ins (no image libraries), writing valid RGBA PNGs by hand so the
// build stays dependency-light.
//
// The design is a rounded indigo square with a white dot — a neutral
// placeholder until bouncer gets a real logo.

import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "icons");
const SIZES = [16, 48, 128];

const BG = [79, 70, 229, 255]; // indigo (#4f46e5)
const FG = [255, 255, 255, 255]; // white dot

// --- PNG encoding helpers -------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), out.length - 4);
  return out;
}

function encodePng(size, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines, each prefixed with a filter-type byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixels[y * size + x];
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing --------------------------------------------------------------

function renderIcon(size) {
  const pixels = new Array(size * size);
  const center = (size - 1) / 2;
  const cornerR = size * 0.22; // rounded-corner radius
  const dotR = size * 0.3; // centre dot radius
  const transparent = [0, 0, 0, 0];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded-rectangle mask: clip the four corners to transparency.
      const dxEdge = Math.max(cornerR - x, x - (size - 1 - cornerR), 0);
      const dyEdge = Math.max(cornerR - y, y - (size - 1 - cornerR), 0);
      const outsideCorner = Math.hypot(dxEdge, dyEdge) > cornerR;

      let color;
      if (outsideCorner) {
        color = transparent;
      } else {
        const inDot = Math.hypot(x - center, y - center) <= dotR;
        color = inDot ? FG : BG;
      }
      pixels[y * size + x] = color;
    }
  }
  return pixels;
}

// --- Main -----------------------------------------------------------------

await mkdir(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, renderIcon(size));
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  await writeFile(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
