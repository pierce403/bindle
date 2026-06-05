import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../public/paisley-rose-monochrome.png", import.meta.url);
const outputPath = new URL("../assets/bindle-logo-source.png", import.meta.url);
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

const paeth = (left, up, upLeft) => {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
};

const readPng = (buffer) => {
  if (!buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Source is not a PNG file.");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  for (let offset = pngSignature.length; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buffer.subarray(dataStart, dataStart + length);
    offset = dataStart + length + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error("Source must be an 8-bit non-interlaced RGB/RGBA PNG.");
  }

  const channels = colorType === 6 ? 4 : 3;
  const bytesPerPixel = channels;
  const rowLength = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;

    const row = new Uint8Array(rowLength);
    for (let index = 0; index < rowLength; index += 1) {
      const raw = inflated[sourceOffset + index];
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
      const up = previousRow[index] ?? 0;
      const upLeft =
        index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;

      if (filter === 0) {
        row[index] = raw;
      } else if (filter === 1) {
        row[index] = (raw + left) & 0xff;
      } else if (filter === 2) {
        row[index] = (raw + up) & 0xff;
      } else if (filter === 3) {
        row[index] = (raw + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        row[index] = (raw + paeth(left, up, upLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }

    for (let x = 0; x < width; x += 1) {
      const rowIndex = x * channels;
      const pixelIndex = (y * width + x) * 4;
      rgba[pixelIndex] = row[rowIndex];
      rgba[pixelIndex + 1] = row[rowIndex + 1];
      rgba[pixelIndex + 2] = row[rowIndex + 2];
      rgba[pixelIndex + 3] = channels === 4 ? row[rowIndex + 3] : 255;
    }

    sourceOffset += rowLength;
    previousRow = row;
  }

  return { width, height, rgba };
};

const sample = (image, x, y) => {
  const clampedX = clamp(x, 0, image.width - 1);
  const clampedY = clamp(y, 0, image.height - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const xAmount = clampedX - x0;
  const yAmount = clampedY - y0;
  const color = [0, 0, 0, 0];

  for (const [px, py, weight] of [
    [x0, y0, (1 - xAmount) * (1 - yAmount)],
    [x1, y0, xAmount * (1 - yAmount)],
    [x0, y1, (1 - xAmount) * yAmount],
    [x1, y1, xAmount * yAmount]
  ]) {
    const offset = (py * image.width + px) * 4;
    color[0] += image.rgba[offset] * weight;
    color[1] += image.rgba[offset + 1] * weight;
    color[2] += image.rgba[offset + 2] * weight;
    color[3] += image.rgba[offset + 3] * weight;
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

const writePng = ({ width, height, rgba }) => {
  const stride = width * 4;
  const pixels = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    pixels[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const outputOffset = rowStart + 1 + x * 4;
      const inputOffset = (y * width + x) * 4;
      pixels[outputOffset] = rgba[inputOffset];
      pixels[outputOffset + 1] = rgba[inputOffset + 1];
      pixels[outputOffset + 2] = rgba[inputOffset + 2];
      pixels[outputOffset + 3] = rgba[inputOffset + 3];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    pngSignature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const source = readPng(readFileSync(sourcePath));
const size = 1254;
const radius = 0.94;
const centerX = source.width * 0.35;
const centerY = source.height * 0.5;
const cropSize = source.width * 0.62;
const output = new Uint8Array(size * size * 4);

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const normalizedX = (x + 0.5 - size / 2) / (size / 2);
    const normalizedY = (y + 0.5 - size / 2) / (size / 2);
    const distance = Math.hypot(normalizedX, normalizedY);
    const offset = (y * size + x) * 4;
    const background = 2 + 4 * (1 - clamp(distance, 0, 1));

    if (distance > radius) {
      output[offset] = background;
      output[offset + 1] = Math.max(0, background - 1);
      output[offset + 2] = Math.max(0, background - 1);
      output[offset + 3] = 255;
      continue;
    }

    const sphereX = normalizedX / radius;
    const sphereY = normalizedY / radius;
    const sphereZ = Math.sqrt(Math.max(0, 1 - sphereX * sphereX - sphereY * sphereY));
    const edge = smoothstep(0.68, radius, distance);
    const clothBend = 1 + 0.12 * (1 - sphereZ);
    const diagonalFold =
      0.018 * Math.sin(sphereX * 8 + sphereY * 5) +
      0.01 * Math.sin(sphereX * 17 - sphereY * 3);
    const horizontalFold =
      0.012 * Math.sin(sphereY * 16 + sphereX * 4) +
      0.008 * Math.sin((sphereX + sphereY) * 13);
    const sourceX =
      centerX + (sphereX * clothBend + diagonalFold) * (cropSize / 2);
    const sourceY =
      centerY + (sphereY * clothBend + horizontalFold) * (cropSize / 2);
    const sampled = sample(source, sourceX, sourceY);
    const luminance =
      (0.2126 * sampled[0] + 0.7152 * sampled[1] + 0.0722 * sampled[2]) / 255;
    const ink = Math.pow(clamp(luminance, 0, 1), 1.08);
    const light =
      0.46 +
      0.52 * sphereZ +
      0.07 * clamp(-sphereX * 0.75 - sphereY * 0.35, -1, 1);
    const foldShadow =
      1 -
      0.055 * (0.5 + 0.5 * Math.sin(sphereX * 13 + sphereY * 4)) -
      0.035 * (0.5 + 0.5 * Math.sin(sphereY * 19));
    const weave =
      1 +
      0.018 * Math.sin(sourceX * 1.7) +
      0.014 * Math.sin(sourceY * 1.45);
    const shade = clamp(light * foldShadow * weave * lerp(1, 0.42, edge), 0.16, 1);
    const rim = smoothstep(0.88, 0.94, distance);
    const base = [5, 2, 2];
    const red = [244, 26, 39];
    const mutedRose = [128, 14, 19];
    const redMix = ink * 0.92 + rim * 0.14;

    output[offset] = Math.round(
      clamp((base[0] + lerp(mutedRose[0], red[0], ink) * redMix) * shade, 0, 255)
    );
    output[offset + 1] = Math.round(
      clamp((base[1] + lerp(mutedRose[1], red[1], ink) * redMix) * shade, 0, 255)
    );
    output[offset + 2] = Math.round(
      clamp((base[2] + lerp(mutedRose[2], red[2], ink) * redMix) * shade, 0, 255)
    );
    output[offset + 3] = 255;
  }
}

writeFileSync(outputPath, writePng({ width: size, height: size, rgba: output }));
