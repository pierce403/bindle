import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const outputDirectory = new URL("../public/icons/", import.meta.url);

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[index] = crc >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
};

const makePng = (size) => {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel;
  const pixels = Buffer.alloc((stride + 1) * size);
  const center = size / 2;
  const red = [224, 20, 39, 255];
  const offWhite = [252, 245, 240, 255];
  const black = [6, 3, 3, 255];

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    pixels[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = rowStart + 1 + x * bytesPerPixel;
      pixels[offset] = black[0];
      pixels[offset + 1] = black[1];
      pixels[offset + 2] = black[2];
      pixels[offset + 3] = black[3];
    }
  }

  const setPixel = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) {
      return;
    }
    const offset = y * (stride + 1) + 1 + x * bytesPerPixel;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = color[3];
  };

  const drawEllipse = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          setPixel(x, y, color);
        }
      }
    }
  };

  const drawRing = (cx, cy, rx, ry, thickness, color) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const distance = dx * dx + dy * dy;
        if (distance <= 1 && distance >= 1 - thickness) {
          setPixel(x, y, color);
        }
      }
    }
  };

  drawEllipse(center, center, size * 0.36, size * 0.43, red);
  drawEllipse(center + size * 0.1, center - size * 0.18, size * 0.18, size * 0.16, black);
  drawEllipse(center - size * 0.07, center + size * 0.06, size * 0.12, size * 0.18, black);
  drawRing(center, center, size * 0.26, size * 0.33, 0.14, offWhite);
  drawEllipse(center + size * 0.09, center - size * 0.11, size * 0.035, size * 0.035, offWhite);
  drawEllipse(center - size * 0.08, center + size * 0.16, size * 0.03, size * 0.03, offWhite);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

mkdirSync(outputDirectory, { recursive: true });

for (const size of [192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, outputDirectory), makePng(size));
  writeFileSync(new URL(`maskable-${size}.png`, outputDirectory), makePng(size));
}
