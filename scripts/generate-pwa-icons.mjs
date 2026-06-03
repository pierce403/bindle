import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const outputDirectory = new URL("../public/icons/", import.meta.url);
const sampleGridSize = 3;

const colors = {
  black: [5, 2, 2, 255],
  deepBlack: [1, 1, 1, 255],
  red: [226, 18, 42, 255],
  redShadow: [118, 7, 18, 255]
};

const mix = (from, to, amount) =>
  from.map((channel, index) =>
    Math.round(channel * (1 - amount) + to[index] * amount)
  );

const rotatePoint = (x, y, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
};

const ellipseRing = (x, y, cx, cy, rx, ry, angle, width) => {
  const rotated = rotatePoint(x - cx, y - cy, -angle);
  const normalized =
    (rotated.x * rotated.x) / (rx * rx) +
    (rotated.y * rotated.y) / (ry * ry);
  return Math.abs(Math.sqrt(normalized) - 1) <= width;
};

const circleRing = (x, y, cx, cy, radius, width) =>
  Math.abs(Math.hypot(x - cx, y - cy) - radius) <= width;

const circleDot = (x, y, cx, cy, radius) =>
  Math.hypot(x - cx, y - cy) <= radius;

const yinBoundary = (y, radius) => {
  const half = radius / 2;
  if (y < 0) {
    return Math.sqrt(Math.max(0, half * half - (y + half) ** 2));
  }
  return -Math.sqrt(Math.max(0, half * half - (y - half) ** 2));
};

const isRedHalf = (x, y, radius) => x >= yinBoundary(y, radius);

const hasPaisleyStroke = (x, y, redHalf) => {
  if (redHalf) {
    return (
      ellipseRing(x, y, 0.39, -0.12, 0.08, 0.18, -0.55, 0.055) ||
      ellipseRing(x, y, 0.32, 0.34, 0.12, 0.22, 0.72, 0.05) ||
      ellipseRing(x, y, 0.55, 0.22, 0.06, 0.14, -0.72, 0.06) ||
      circleRing(x, y, 0.34, 0.1, 0.045, 0.026) ||
      circleDot(x, y, 0.52, -0.22, 0.027) ||
      circleDot(x, y, 0.18, 0.58, 0.024)
    );
  }

  return (
    ellipseRing(x, y, -0.35, -0.35, 0.12, 0.22, 0.72, 0.05) ||
    ellipseRing(x, y, -0.52, 0.04, 0.08, 0.18, -0.55, 0.055) ||
    ellipseRing(x, y, -0.24, -0.04, 0.06, 0.14, 0.72, 0.06) ||
    circleRing(x, y, -0.34, 0.21, 0.045, 0.026) ||
    circleDot(x, y, -0.52, -0.2, 0.027) ||
    circleDot(x, y, -0.16, -0.6, 0.024)
  );
};

const sampleLogo = (x, y, maskable) => {
  const scale = maskable ? 0.82 : 0.96;
  const px = x / scale;
  const py = y / scale;
  const distance = Math.hypot(px, py);
  const symbolRadius = 0.78;

  if (distance > 0.98) {
    return colors.black;
  }

  if (distance > 0.9) {
    return mix(colors.redShadow, colors.red, 0.68);
  }

  if (distance > symbolRadius) {
    return colors.black;
  }

  const redHalf = isRedHalf(px, py, symbolRadius);
  let color = redHalf ? colors.red : colors.deepBlack;

  if (hasPaisleyStroke(px, py, redHalf)) {
    color = redHalf ? colors.deepBlack : colors.red;
  }

  if (circleDot(px, py, 0, -symbolRadius / 2, 0.108)) {
    color = colors.red;
  }

  if (circleDot(px, py, 0, symbolRadius / 2, 0.108)) {
    color = colors.deepBlack;
  }

  if (
    circleRing(px, py, 0, -symbolRadius / 2, 0.154, 0.026) ||
    circleRing(px, py, 0, symbolRadius / 2, 0.154, 0.026)
  ) {
    color = redHalf ? colors.deepBlack : colors.red;
  }

  return color;
};

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

const makePng = (size, maskable = false) => {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel;
  const pixels = Buffer.alloc((stride + 1) * size);

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    pixels[rowStart] = 0;
    for (let x = 0; x < size; x += 1) {
      const color = [0, 0, 0, 0];

      for (let sy = 0; sy < sampleGridSize; sy += 1) {
        for (let sx = 0; sx < sampleGridSize; sx += 1) {
          const normalizedX =
            ((x + (sx + 0.5) / sampleGridSize) / size) * 2 - 1;
          const normalizedY =
            ((y + (sy + 0.5) / sampleGridSize) / size) * 2 - 1;
          const sample = sampleLogo(normalizedX, normalizedY, maskable);
          for (let channel = 0; channel < color.length; channel += 1) {
            color[channel] += sample[channel];
          }
        }
      }

      const sampleCount = sampleGridSize * sampleGridSize;
      const offset = rowStart + 1 + x * bytesPerPixel;
      pixels[offset] = Math.round(color[0] / sampleCount);
      pixels[offset + 1] = Math.round(color[1] / sampleCount);
      pixels[offset + 2] = Math.round(color[2] / sampleCount);
      pixels[offset + 3] = Math.round(color[3] / sampleCount);
    }
  }

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
  writeFileSync(
    new URL(`maskable-${size}.png`, outputDirectory),
    makePng(size, true)
  );
}
