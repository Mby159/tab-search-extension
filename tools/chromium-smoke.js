#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');

function copyFile(srcRel, destRoot, destRel = srcRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(destRoot, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function chromeBinary() {
  if (process.env.CHROMIUM && fs.existsSync(process.env.CHROMIUM)) return process.env.CHROMIUM;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const res = spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
  }
  return '';
}

const browser = chromeBinary();
if (!browser) {
  console.error('No Chromium/Chrome binary found. Set CHROMIUM=/path/to/browser.');
  process.exit(2);
}

const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-search-chrome-ext-'));
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-search-chrome-profile-'));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest-chrome.json'), 'utf8'));
copyFile('manifest-chrome.json', extDir, 'manifest.json');

const files = new Set([
  'browser-polyfill.js',
  'background-mv3.js',
  'content.js',
  'popup.html',
  'popup.js',
]);
for (const iconPath of Object.values(manifest.icons || {})) files.add(iconPath);
for (const script of manifest.content_scripts || []) {
  for (const js of script.js || []) files.add(js);
}
for (const file of files) copyFile(file, extDir);

const smokeHtml = path.join(profileDir, 'smoke.html');
fs.writeFileSync(smokeHtml, '<!doctype html><title>tab search smoke</title><h1>tab search smoke</h1>');

const args = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  `--user-data-dir=${profileDir}`,
  `--disable-extensions-except=${extDir}`,
  `--load-extension=${extDir}`,
  '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=5000',
  '--dump-dom',
  `file://${smokeHtml}`,
];

const res = spawnSync(browser, args, { encoding: 'utf8', timeout: 30000 });
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');

if (res.error) {
  console.error(`Chromium smoke failed to run: ${res.error.message}`);
  process.exit(1);
}
if (res.status !== 0) {
  console.error(`Chromium smoke failed with exit code ${res.status}`);
  process.exit(res.status || 1);
}
if (!String(res.stdout || '').includes('tab search smoke')) {
  console.error('Chromium smoke did not render smoke page.');
  process.exit(1);
}
console.log('chromium extension load smoke passed');
