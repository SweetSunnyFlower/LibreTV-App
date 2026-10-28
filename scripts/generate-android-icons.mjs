#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const sourcePath = resolve(rootDir, process.argv[2] ?? 'assets/images/icon.png');
const targets = [
  resolve(rootDir, 'assets/images/android-icon-foreground.png'),
  resolve(rootDir, 'assets/images/android-icon-monochrome.png'),
];

async function getDimensions(filePath) {
  const { stdout } = await execFile('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
  const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);

  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error(`Unable to read image dimensions: ${filePath}`);
  }

  return { width, height };
}

function getCenteredCrop(source, target) {
  const sourceRatio = source.width / source.height;
  const targetRatio = target.width / target.height;

  if (sourceRatio > targetRatio) {
    const width = Math.round(source.height * targetRatio);
    return {
      width,
      height: source.height,
      offsetX: Math.floor((source.width - width) / 2),
      offsetY: 0,
    };
  }

  const height = Math.round(source.width / targetRatio);
  return {
    width: source.width,
    height,
    offsetX: 0,
    offsetY: Math.floor((source.height - height) / 2),
  };
}

async function createCenteredIcon(source, target, tempDir) {
  const sourceSize = await getDimensions(source);
  const targetSize = await getDimensions(target);
  const crop = getCenteredCrop(sourceSize, targetSize);
  const croppedPath = resolve(tempDir, `${Date.now()}-${targetSize.width}x${targetSize.height}-crop.png`);

  await execFile('sips', [
    '--cropOffset', String(crop.offsetY), String(crop.offsetX),
    '--cropToHeightWidth', String(crop.height), String(crop.width),
    source,
    '--out', croppedPath,
  ]);

  await execFile('sips', [
    '--resampleHeightWidth', String(targetSize.height), String(targetSize.width),
    croppedPath,
    '--out', target,
  ]);

  console.log(`Generated ${target.replace(`${rootDir}/`, '')}`);
  console.log(`  source: ${sourceSize.width}x${sourceSize.height}`);
  console.log(`  center crop: ${crop.width}x${crop.height} @ x=${crop.offsetX}, y=${crop.offsetY}`);
  console.log(`  output: ${targetSize.width}x${targetSize.height}`);
}

async function main() {
  const tempDir = await mkdtemp(resolve(tmpdir(), 'movie-android-icons-'));

  try {
    for (const target of targets) {
      await createCenteredIcon(sourcePath, target, tempDir);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
