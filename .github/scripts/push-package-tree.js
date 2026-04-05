#!/usr/bin/env node
'use strict';

/**
 * Assembles the package file tree on the shim fork via the GitHub Git Data API.
 *
 * Reads files from packages/{packageName}/, respects the `exclude` globs in
 * typst.toml, creates blobs on the fork, creates a tree + commit, and advances
 * the branch ref.  No local git operations — pure REST API via `gh` CLI.
 *
 * Usage:
 *   node push-package-tree.js --package-name <name> --version <ver> \
 *                             --branch <branch> --fork <owner/repo>
 */

const { spawnSync } = require('node:child_process');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ghApi(method, apiPath, payload) {
  const args = ['api', apiPath, '-X', method];
  const opts = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  if (payload != null) {
    args.push('--input', '-');
    opts.input = JSON.stringify(payload);
  }
  const result = spawnSync('gh', args, opts);
  if (result.status !== 0) {
    console.error(`::error::API error (${method} ${apiPath}):\n${result.stderr}`);
    process.exit(1);
  }
  return JSON.parse(result.stdout);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = args[i + 1];
  }
  return out;
}

function getExcludePatterns(packageDir) {
  const toml = readFileSync(path.join(packageDir, 'typst.toml'), 'utf8');
  // Handles both single-line and multiline arrays
  const match = toml.match(/exclude\s*=\s*\[([^\]]*)\]/s);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\x00')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\x00/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isExcluded(rel, patterns) {
  const relPosix = rel.split(path.sep).join('/');
  const parts = relPosix.split('/');
  for (const pattern of patterns) {
    const re = globToRegex(pattern);
    if (re.test(relPosix)) return true;
    if (re.test(parts[parts.length - 1])) return true;
    for (const part of parts) {
      if (re.test(part)) return true;
    }
  }
  return false;
}

function* walkDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(full);
    else if (entry.isFile()) yield full;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const { packageName, version, branch, fork } = parseArgs();
  const packageDir = path.join('packages', packageName);
  const destPrefix = `packages/preview/${packageName}/${version}`;

  // Resolve the branch's current commit and tree SHA
  const refData = ghApi('GET', `repos/${fork}/git/ref/heads/${branch}`);
  const commitSha = refData.object.sha;
  const commitData = ghApi('GET', `repos/${fork}/git/commits/${commitSha}`);
  const baseTreeSha = commitData.tree.sha;

  console.log(`Base commit : ${commitSha}`);
  console.log(`Base tree   : ${baseTreeSha}`);

  const excludePatterns = getExcludePatterns(packageDir);

  // Collect files, applying exclude patterns
  const files = [];
  for (const absPath of walkDir(packageDir)) {
    const rel = path.relative(packageDir, absPath);
    if (isExcluded(rel, excludePatterns)) {
      console.log(`  (excluded) ${rel}`);
      continue;
    }
    files.push({ absPath, rel });
  }
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  console.log(`\nAssembling ${files.length} file(s) → ${destPrefix}/`);

  // Create a blob for every file
  const treeEntries = [];
  for (const { absPath, rel } of files) {
    const contentB64 = readFileSync(absPath).toString('base64');
    const blob = ghApi('POST', `repos/${fork}/git/blobs`, {
      content: contentB64,
      encoding: 'base64',
    });
    const destPath = `${destPrefix}/${rel.split(path.sep).join('/')}`;
    treeEntries.push({ path: destPath, mode: '100644', type: 'blob', sha: blob.sha });
    console.log(`  + ${destPath}`);
  }

  // Create tree on top of fork's current HEAD tree
  const tree = ghApi('POST', `repos/${fork}/git/trees`, {
    base_tree: baseTreeSha,
    tree: treeEntries,
  });
  console.log(`\nCreated tree   : ${tree.sha}`);

  // Create the commit
  const commit = ghApi('POST', `repos/${fork}/git/commits`, {
    message: `packages/preview/${packageName}/${version}`,
    tree: tree.sha,
    parents: [commitSha],
  });
  console.log(`Created commit : ${commit.sha}`);

  // Advance the branch ref (fast-forward only)
  ghApi('PATCH', `repos/${fork}/git/refs/heads/${branch}`, {
    sha: commit.sha,
    force: false,
  });
  console.log(`Branch ${branch} → ${commit.sha}`);
}

main();
