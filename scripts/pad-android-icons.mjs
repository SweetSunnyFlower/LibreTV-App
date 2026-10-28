#!/usr/bin/env node
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// 调这里：以 icon1.png 为基准，给输出图标四周增加多少像素透明留白。
// 最终输出尺寸默认保持和 icon1.png 一样；例如 icon1.png 是 492x492，PADDING_PX=64，
// 则图标内容会缩小到 364x364，再居中放回 492x492。
const PADDING_PX = 80;

// 调这里：输出尺寸。null 表示沿用 icon1.png 的尺寸；如果想固定 512x512，可改成 512。
const OUTPUT_SIZE_PX = null;

const sourceIconPath = resolve(rootDir, 'assets/images/icon-base.png');
const outputIconPaths = [
  resolve(rootDir, 'assets/images/android-icon-foreground.png'),
  resolve(rootDir, 'assets/images/android-icon-monochrome.png'),
];

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;

  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer. Example: node scripts/pad-android-icons.mjs ${name} 32`);
  }

  return value;
}

async function getDimensions(filePath) {
  const { stdout } = await execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Unable to read image dimensions: ${filePath}`);
  }

  return { width, height };
}

async function createPaddedIcon({ sourcePath, outputPath, outputSize, padding, tempDir }) {
  const innerSize = outputSize - padding * 2;

  if (innerSize <= 0) {
    throw new Error(`Padding ${padding}px is too large for ${outputSize}x${outputSize}.`);
  }

  const resizedPath = resolve(tempDir, `${outputPath.split('/').pop()}-${innerSize}.png`);

  await execFile('sips', [
    '--resampleHeightWidth', String(innerSize), String(innerSize),
    sourcePath,
    '--out', resizedPath,
  ]);

  await execFile('sips', [
    '--padToHeightWidth', String(outputSize), String(outputSize),
    resizedPath,
    '--out', outputPath,
  ]);

  console.log(`Generated ${outputPath.replace(`${rootDir}/`, '')}`);
  console.log(`  source: ${sourcePath.replace(`${rootDir}/`, '')}`);
  console.log(`  output: ${outputSize}x${outputSize}`);
  console.log(`  padding: ${padding}px each side`);
  console.log(`  content: ${innerSize}x${innerSize}`);
}

async function main() {
  const padding = readNumberArg('--padding', PADDING_PX);
  const sourceSize = await getDimensions(sourceIconPath);
  const fallbackSize = OUTPUT_SIZE_PX ?? sourceSize.width;
  const outputSize = readNumberArg('--size', fallbackSize);

  if (sourceSize.width !== sourceSize.height) {
    throw new Error(`Source icon must be square: ${sourceIconPath} is ${sourceSize.width}x${sourceSize.height}.`);
  }

  const tempDir = await mkdtemp(resolve(tmpdir(), 'movie-android-icon-padding-'));

  try {
    for (const outputPath of outputIconPaths) {
      await createPaddedIcon({
        sourcePath: sourceIconPath,
        outputPath,
        outputSize,
        padding,
        tempDir,
      });
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
