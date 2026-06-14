#!/usr/bin/env node
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const root = path.resolve(__dirname, '..');
const artifactDir = path.resolve(process.env.ARTIFACT_DIR || path.join(root, 'playwright-artifacts'));

function copyFile(srcRel, destRoot, destRel = srcRel) {
  const src = path.join(root, srcRel);
  const dest = path.join(destRoot, destRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function buildChromeExtensionDir() {
  const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-search-interaction-ext-'));
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest-chrome.json'), 'utf8'));
  copyFile('manifest-chrome.json', extDir, 'manifest.json');
  const files = new Set(['browser-polyfill.js', 'background-mv3.js', 'content.js', 'popup.html', 'popup.js']);
  for (const iconPath of Object.values(manifest.icons || {})) files.add(iconPath);
  for (const script of manifest.content_scripts || []) {
    for (const js of script.js || []) files.add(js);
  }
  for (const file of files) copyFile(file, extDir);
  return extDir;
}

function chromeBinary() {
  const candidates = [process.env.CHROMIUM, process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome'].filter(Boolean);
  for (const name of candidates) {
    if (fs.existsSync(name)) return name;
    const res = spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout.trim()) return res.stdout.trim();
  }
  return '';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const body = req.url.includes('alpha')
      ? '<h1>Alpha Test Page</h1><p>The magicword appears here. Another magicword is lower.</p><p style="margin-top:600px">magicword final hit</p>'
      : '<h1>Beta Test Page</h1><p>No matching content on this page.</p>';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html><head><title>${req.url}</title></head><body>${body}</body></html>`);
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function extensionId(context) {
  let workers = context.serviceWorkers();
  if (!workers.length) {
    const worker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    workers = [worker];
  }
  const workerUrl = workers[0].url();
  const match = workerUrl.match(/^chrome-extension:\/\/([^/]+)\//);
  if (!match) throw new Error(`cannot parse extension id from ${workerUrl}`);
  return match[1];
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const executablePath = chromeBinary();
  if (!executablePath) throw new Error('Chromium/Chrome binary not found');

  const extDir = buildChromeExtensionDir();
  const server = await startServer();
  const port = server.address().port;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-search-interaction-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    viewport: { width: 900, height: 700 },
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
    ],
  });

  try {
    const p1 = await context.newPage();
    await p1.goto(`http://127.0.0.1:${port}/alpha`);
    const p2 = await context.newPage();
    await p2.goto(`http://127.0.0.1:${port}/beta`);
    await p1.waitForTimeout(500);

    const id = await extensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.fill('#searchInput', 'magicword');
    await popup.waitForSelector('.tab-card', { timeout: 10000 });
    await popup.waitForSelector('mark', { timeout: 10000 });

    const status = await popup.locator('#statusText').innerText();
    if (!/找到/.test(status)) throw new Error(`expected search results, got status: ${status}`);
    const cards = await popup.locator('.tab-card').count();
    if (cards < 1) throw new Error('expected at least one result card');

    await popup.screenshot({ path: path.join(artifactDir, 'tab-search-popup-results.png'), fullPage: true });

    await popup.locator('.focus-btn').first().click();
    await popup.waitForTimeout(500);
    await popup.screenshot({ path: path.join(artifactDir, 'tab-search-popup-after-focus.png'), fullPage: true });

    console.log('interaction smoke passed: popup search returned results and focus action executed');
  } finally {
    await context.close().catch(() => {});
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
