#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scanTargets = ['src', 'public', 'scripts', 'package.json'];
const blockedPatterns = [
  {
    name: 'browser network API outside guards',
    pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/,
  },
  {
    name: 'process execution API',
    pattern: /\b(?:child_process|spawn|execFile|exec|fork)\b/,
  },
  {
    name: 'remote preview service URL',
    pattern: /(?:kroki|cdn|unpkg|jsdelivr)\.[a-z]/i,
  },
  {
    name: 'unsafe Asciidoctor mode',
    pattern: /\bsafe\s*:\s*['"]unsafe['"]/,
  },
  {
    name: 'Asciidoctor remote URI reads enabled',
    pattern: /['"]allow-uri-read['"]\s*:\s*(?:true|['"]true['"])/,
  },
];

const requiredText = [
  { file: 'src/viewer.ts', text: "'allow-uri-read': false" },
  { file: 'src/viewer.ts', text: "safe: 'safe'" },
  { file: 'public/manifest.json', text: "default-src 'none'" },
  { file: 'public/manifest.json', text: 'connect-src https://api.github.com https://raw.githubusercontent.com https://gitlab.com' },
  { file: 'public/network-guards.js', text: "setBlockedGlobal('fetch'," },
  { file: 'public/network-guards.js', text: "setBlockedGlobal('XMLHttpRequest'," },
  { file: 'public/network-guards.js', text: 'assertLocalRequest' },
  { file: 'src/background.ts', text: 'https://api.github.com' },
  { file: 'src/background.ts', text: 'https://raw.githubusercontent.com' },
  { file: 'src/background.ts', text: 'https://gitlab.com/api/v4' },
  { file: 'src/background.ts', text: 'store-github-pr-full-diff' },
  { file: 'src/background.ts', text: 'store-gitlab-mr-full-diff' },
];

const failures = [];

for (const file of listFiles(scanTargets)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (isAllowedLine(rel, line)) {
      continue;
    }

    for (const blocked of blockedPatterns) {
      if (blocked.pattern.test(line)) {
        failures.push(`${rel}:${index + 1}: ${blocked.name}: ${line.trim()}`);
      }
    }
  }
}

for (const expected of requiredText) {
  const text = fs.readFileSync(path.join(root, expected.file), 'utf8');
  if (!text.includes(expected.text)) {
    failures.push(`${expected.file}: missing required text: ${expected.text}`);
  }
}

if (failures.length > 0) {
  console.error('No-network verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('No-network verification passed.');
}

function listFiles(targets) {
  const files = [];
  for (const target of targets) {
    const absolute = path.join(root, target);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      files.push(absolute);
      continue;
    }
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      files.push(...listFiles([path.join(target, entry.name)]));
    }
  }
  return files.filter((file) => /\.(js|mjs|ts|json|html)$/i.test(file));
}

function isAllowedLine(rel, line) {
  if (rel === 'scripts/verify-no-network.js') {
    return true;
  }
  if (rel === 'public/network-guards.js') {
    return true;
  }
  if (rel === 'public/manifest.json' && /https?:|file:/.test(line)) {
    return true;
  }
  if (rel === 'src/types.ts' && /https?/.test(line)) {
    return true;
  }
  if (rel === 'src/viewer.ts' && /^(.*https?:|.*http:|.*Remote images|.*url\.protocol|.*\['https', 'http'\])/.test(line.trim())) {
    return true;
  }
  if (rel === 'src/content-script.ts' && /http:\/\/\*|https:\/\/\*/.test(line)) {
    return true;
  }
  if (rel === 'src/background.ts' && isAllowedGitHubFullDiffLine(line)) {
    return true;
  }
  if (rel === 'package.json' && /github\.com/.test(line)) {
    return true;
  }
  return false;
}

function isAllowedGitHubFullDiffLine(line) {
  const trimmed = line.trim();
  return trimmed === 'const response = await fetch(url, {'
    || trimmed === 'const response = await fetch(url);'
    || /https:\/\/api\.github\.com|https:\/\/raw\.githubusercontent\.com|https:\/\/gitlab\.com\/api\/v4|GitHub request failed|GitHub raw file request failed|GitLab request failed|GitLab raw file request failed/.test(trimmed);
}
