import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function assertFile(file, tokens) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${file}: missing`);
    return;
  }
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const token of tokens) {
    if (!source.includes(token)) failures.push(`${file}: missing ${token}`);
  }
}

assertFile('src/hooks/use-reduced-motion.ts', ['export function useReducedMotion']);
assertFile('src/components/skeletons/skeleton.tsx', ['SkeletonGroup', 'SkeletonBlock', 'LinearGradient', 'useReducedMotion', 'borderRadius: 0']);
assertFile('src/components/skeletons/page-skeletons.tsx', ['ListSkeleton', 'SettingsSkeleton', 'SiteFormSkeleton']);
assertFile('src/components/movie/poster-grid-skeleton.tsx', ['SkeletonGroup', 'SkeletonBlock']);
assertFile('src/components/app-image.tsx', ['SkeletonGroup', 'SkeletonBlock']);
assertFile('src/app/detail.tsx', ['SkeletonGroup', 'SkeletonBlock']);
assertFile('src/app/player.tsx', ['SkeletonGroup', 'SkeletonBlock']);

for (const provider of ['site-context.tsx', 'user-data-context.tsx', 'download-context.tsx']) {
  assertFile(`src/context/${provider}`, ['isHydrating']);
}

const pageRequirements = {
  'src/app/(tabs)/downloads.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/(tabs)/my.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/(tabs)/search-entry.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/downloads.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/favorites.tsx': ['isHydrating', 'PosterGridSkeleton'],
  'src/app/mine/search-history.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/watch-history.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/watch-history-folder.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/download-folder.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/mine/settings.tsx': ['isHydrating', 'SettingsSkeleton'],
  'src/app/sites/index.tsx': ['isHydrating', 'ListSkeleton'],
  'src/app/sites/edit.tsx': ['isHydrating', 'SiteFormSkeleton'],
};

for (const [file, tokens] of Object.entries(pageRequirements)) assertFile(file, tokens);

const squareOnlyFiles = [
  'src/components/skeletons/skeleton.tsx',
  'src/components/skeletons/page-skeletons.tsx',
  'src/components/movie/poster-grid-skeleton.tsx',
];
for (const file of squareOnlyFiles) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
  const source = fs.readFileSync(fullPath, 'utf8');
  for (const match of source.matchAll(/borderRadius\s*:\s*([^,}\n]+)/g)) {
    if (match[1].trim() !== '0') {
      failures.push(`${file}: skeleton styling must use borderRadius: 0, found ${match[1].trim()}`);
    }
  }
}

const sourceFiles = [];
function collectSourceFiles(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(relativePath);
    else if (/\.(tsx|ts)$/.test(entry.name)) sourceFiles.push(relativePath);
  }
}
collectSourceFiles('src');

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  if (!source.includes('SkeletonBlock')) continue;
  for (const block of source.matchAll(/skeleton[A-Za-z0-9]*\s*:\s*\{([\s\S]*?)\n\s*\}/g)) {
    const radius = block[1].match(/borderRadius\s*:\s*([^,}\n]+)/);
    if (radius && radius[1].trim() !== '0') {
      failures.push(`${file}: ${block[0].split(':')[0].trim()} uses non-square ${radius[1].trim()}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Skeleton coverage check passed.');
