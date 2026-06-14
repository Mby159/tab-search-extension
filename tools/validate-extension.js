#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const jsFiles = [
  'browser-polyfill.js',
  'background.js',
  'background-mv3.js',
  'content.js',
  'popup.js',
  'tools/chromium-smoke.js',
];
const manifestFiles = ['manifest.json', 'manifest-chrome.json'];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    fail(`${file}: invalid JSON: ${error.message}`);
    return null;
  }
}

for (const file of jsFiles) {
  const fullPath = path.join(root, file);
  const result = spawnSync(process.execPath, ['--check', fullPath], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`${file}: JavaScript syntax check failed\n${result.stderr || result.stdout}`);
  }
}

const firefoxManifest = readJson('manifest.json');
const chromeManifest = readJson('manifest-chrome.json');

for (const file of manifestFiles) {
  const manifest = readJson(file);
  if (!manifest) continue;
  for (const [size, iconPath] of Object.entries(manifest.icons || {})) {
    if (!fs.existsSync(path.join(root, iconPath))) {
      fail(`${file}: missing icon ${size}: ${iconPath}`);
    }
  }
  for (const script of manifest.content_scripts || []) {
    for (const js of script.js || []) {
      if (!fs.existsSync(path.join(root, js))) {
        fail(`${file}: missing content script ${js}`);
      }
    }
  }
}

if (firefoxManifest && firefoxManifest.manifest_version !== 2) {
  fail('manifest.json should be Firefox Manifest V2');
}
if (chromeManifest && chromeManifest.manifest_version !== 3) {
  fail('manifest-chrome.json should be Chrome Manifest V3');
}
if (firefoxManifest && chromeManifest && firefoxManifest.version !== chromeManifest.version) {
  fail(`manifest versions differ: Firefox=${firefoxManifest.version}, Chrome=${chromeManifest.version}`);
}

const firefoxBackground = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const chromeBackground = fs.readFileSync(path.join(root, 'background-mv3.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup.js'), 'utf8');
const actions = [...popup.matchAll(/action:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
for (const action of new Set(actions)) {
  if (!firefoxBackground.includes(`message.action === '${action}'`)) {
    fail(`background.js does not handle popup action: ${action}`);
  }
  if (!chromeBackground.includes(`message.action === '${action}'`)) {
    fail(`background-mv3.js does not handle popup action: ${action}`);
  }
}

if (!process.exitCode) {
  console.log('extension static validation passed');
}
