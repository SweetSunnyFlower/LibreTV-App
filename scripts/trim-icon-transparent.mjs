#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const defaultInput = resolve(rootDir, 'assets/images/icon.png');

const args = process.argv.slice(2);
const thresholdIndex = args.indexOf('--threshold');
const alphaThreshold = thresholdIndex >= 0 ? Number(args[thresholdIndex + 1]) : 1;
if (thresholdIndex >= 0) args.splice(thresholdIndex, 2);

const squareIndex = args.indexOf('--square');
const outputSquare = squareIndex >= 0;
if (squareIndex >= 0) args.splice(squareIndex, 1);

if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
  throw new Error('--threshold must be an integer between 0 and 255.');
}

const inputPath = resolve(rootDir, args[0] ?? defaultInput);
const outputPath = resolve(rootDir, args[1] ?? args[0] ?? defaultInput);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_TYPE_RGBA = 6;
const BIT_DEPTH_8 = 8;
const BYTES_PER_PIXEL = 4;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Input is not a PNG file.');
  }

  const chunks = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function writeChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterScanline(filter, line, previousLine) {
  const output = Buffer.alloc(line.length);
  for (let index = 0; index < line.length; index += 1) {
    const left = index >= BYTES_PER_PIXEL ? output[index - BYTES_PER_PIXEL] : 0;
    const up = previousLine ? previousLine[index] : 0;
    const upLeft = previousLine && index >= BYTES_PER_PIXEL ? previousLine[index - BYTES_PER_PIXEL] : 0;

    switch (filter) {
      case 0:
        output[index] = line[index];
        break;
      case 1:
        output[index] = (line[index] + left) & 0xff;
        break;
      case 2:
        output[index] = (line[index] + up) & 0xff;
        break;
      case 3:
        output[index] = (line[index] + Math.floor((left + up) / 2)) & 0xff;
        break;
      case 4:
        output[index] = (line[index] + paethPredictor(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`Unsupported PNG filter type: ${filter}`);
    }
  }
  return output;
}

function decodeRgba(chunks, width, height) {
  const idat = Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
  const inflated = inflateSync(idat);
  const stride = width * BYTES_PER_PIXEL;
  const pixels = Buffer.alloc(width * height * BYTES_PER_PIXEL);
  let inputOffset = 0;
  let previousLine = null;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    const line = inflated.subarray(inputOffset + 1, inputOffset + 1 + stride);
    const unfiltered = unfilterScanline(filter, line, previousLine);
    unfiltered.copy(pixels, y * stride);
    previousLine = unfiltered;
    inputOffset += 1 + stride;
  }

  return pixels;
}

function encodeRgba(pixels, width, height) {
  const stride = width * BYTES_PER_PIXEL;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (stride + 1);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * stride, y * stride + stride);
  }
  return deflateSync(raw, { level: 9 });
}

function findOpaqueBounds(pixels, width, height, threshold) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * BYTES_PER_PIXEL + 3];
      if (alpha <= threshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function cropPixels(pixels, imageWidth, bounds) {
  const cropped = Buffer.alloc(bounds.width * bounds.height * BYTES_PER_PIXEL);
  for (let y = 0; y < bounds.height; y += 1) {
    const sourceStart = ((bounds.minY + y) * imageWidth + bounds.minX) * BYTES_PER_PIXEL;
    const sourceEnd = sourceStart + bounds.width * BYTES_PER_PIXEL;
    pixels.copy(cropped, y * bounds.width * BYTES_PER_PIXEL, sourceStart, sourceEnd);
  }
  return cropped;
}

function centerOnSquareCanvas(pixels, width, height) {
  const size = Math.max(width, height);
  const canvas = Buffer.alloc(size * size * BYTES_PER_PIXEL);
  const offsetX = Math.floor((size - width) / 2);
  const offsetY = Math.floor((size - height) / 2);

  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * width * BYTES_PER_PIXEL;
    const sourceEnd = sourceStart + width * BYTES_PER_PIXEL;
    const targetStart = ((offsetY + y) * size + offsetX) * BYTES_PER_PIXEL;
    pixels.copy(canvas, targetStart, sourceStart, sourceEnd);
  }

  return { pixels: canvas, width: size, height: size };
}

function createPng(pixels, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = BIT_DEPTH_8;
  ihdr[9] = COLOR_TYPE_RGBA;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    writeChunk('IHDR', ihdr),
    writeChunk('IDAT', encodeRgba(pixels, width, height)),
    writeChunk('IEND'),
  ]);
}

async function main() {
  if (!existsSync(inputPath)) {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  const source = await readFile(inputPath);
  const chunks = readChunks(source);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr) throw new Error('PNG is missing IHDR chunk.');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];

  if (bitDepth !== BIT_DEPTH_8 || colorType !== COLOR_TYPE_RGBA || interlace !== 0) {
    throw new Error(`Only non-interlaced 8-bit RGBA PNG files are supported. Got bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}.`);
  }

  const pixels = decodeRgba(chunks, width, height);
  const bounds = findOpaqueBounds(pixels, width, height, alphaThreshold);
  if (!bounds) {
    throw new Error(`No pixels found with alpha greater than ${alphaThreshold}.`);
  }

  if (bounds.width === width && bounds.height === height) {
    console.log(`No transparent border found in ${inputPath}; image remains ${width}x${height}. threshold=${alphaThreshold}`);
    return;
  }

  const croppedPixels = cropPixels(pixels, width, bounds);
  const output = outputSquare ? centerOnSquareCanvas(croppedPixels, bounds.width, bounds.height) : { pixels: croppedPixels, width: bounds.width, height: bounds.height };
  await writeFile(outputPath, createPng(output.pixels, output.width, output.height));
  console.log(`Trimmed ${inputPath} from ${width}x${height} to ${bounds.width}x${bounds.height}. threshold=${alphaThreshold}`);
  if (outputSquare) {
    console.log(`Centered on ${output.width}x${output.height} square canvas.`);
  }
  console.log(`Wrote ${outputPath}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
