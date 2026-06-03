import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const sourcePath = new URL("../assets/bindle-logo-source.png", import.meta.url);
const publicDirectory = new URL("../public/", import.meta.url);
const iconDirectory = new URL("../public/icons/", import.meta.url);
const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

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
    throw new Error("Logo source is not a PNG file.");
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
    throw new Error("Logo source must be an 8-bit non-interlaced RGB/RGBA PNG.");
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
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
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

const resizeSquare = (source, size, scale = 1) => {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel;
  const pixels = Buffer.alloc((stride + 1) * size);
  const cropSize = Math.min(source.width, source.height);
  const cropX = (source.width - cropSize) / 2;
  const cropY = (source.height - cropSize) / 2;
  const inset = (size - size * scale) / 2;
  const sampleCount = size <= 32 ? 9 : size <= 192 ? 5 : 3;
  const background = [0, 0, 0, 255];

  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (stride + 1);
    pixels[rowStart] = 0;

    for (let x = 0; x < size; x += 1) {
      const color = [0, 0, 0, 0];

      for (let sy = 0; sy < sampleCount; sy += 1) {
        for (let sx = 0; sx < sampleCount; sx += 1) {
          const localX = x + (sx + 0.5) / sampleCount;
          const localY = y + (sy + 0.5) / sampleCount;
          let sampled = background;

          if (
            localX >= inset &&
            localY >= inset &&
            localX <= size - inset &&
            localY <= size - inset
          ) {
            const normalizedX = (localX - inset) / (size * scale);
            const normalizedY = (localY - inset) / (size * scale);
            sampled = sample(
              source,
              cropX + normalizedX * (cropSize - 1),
              cropY + normalizedY * (cropSize - 1)
            );
          }

          for (let channel = 0; channel < color.length; channel += 1) {
            color[channel] += sampled[channel];
          }
        }
      }

      const divisor = sampleCount * sampleCount;
      const offset = rowStart + 1 + x * bytesPerPixel;
      pixels[offset] = Math.round(color[0] / divisor);
      pixels[offset + 1] = Math.round(color[1] / divisor);
      pixels[offset + 2] = Math.round(color[2] / divisor);
      pixels[offset + 3] = Math.round(color[3] / divisor);
    }
  }

  return pixels;
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

const makePng = (source, size, scale = 1) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    pngSignature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(resizeSquare(source, size, scale), { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
};

const source = readPng(readFileSync(sourcePath));
mkdirSync(publicDirectory, { recursive: true });
mkdirSync(iconDirectory, { recursive: true });

writeFileSync(new URL("logo.png", publicDirectory), makePng(source, 512));
writeFileSync(new URL("favicon-16.png", publicDirectory), makePng(source, 16));
writeFileSync(new URL("favicon-32.png", publicDirectory), makePng(source, 32));

for (const size of [192, 512]) {
  writeFileSync(new URL(`icon-${size}.png`, iconDirectory), makePng(source, size));
  writeFileSync(
    new URL(`maskable-${size}.png`, iconDirectory),
    makePng(source, size, 0.82)
  );
}
