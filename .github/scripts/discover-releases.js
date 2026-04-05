#!/usr/bin/env node
'use strict';

/**
 * Discovers release tags from the past N days that have not yet been published
 * to typst/packages. Writes a JSON matrix to GITHUB_OUTPUT for the publish job.
 *
 * Usage:
 *   node discover-releases.js [--since-days <n>]
 *
 * Requires:
 *   - git history with tags (fetch-depth: 0 + git fetch --tags)
 *   - GH_TOKEN env var with read access to repos/typst/packages
 */

const { spawnSync, execFileSync } = require('node:child_process');
const { appendFileSync } = require('node:fs');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function ghApiCheck(apiPath) {
  const result = spawnSync('gh', ['api', apiPath, '--jq', '.type'], { encoding: 'utf8' });
  return { ok: result.status === 0, value: result.stdout.trim() };
}

function main() {
  const args = process.argv.slice(2);
  const sinceDaysIdx = args.indexOf('--since-days');
  const sinceDays = sinceDaysIdx >= 0 ? parseInt(args[sinceDaysIdx + 1], 10) : 8;

  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
  console.log(`Scanning tags newer than ${cutoff.toISOString().slice(0, 10)} (${sinceDays} days)...`);

  const raw = git(
    'for-each-ref',
    '--format=%(refname:short)\t%(creatordate:iso-strict)',
    '--sort=-creatordate',
    'refs/tags',
  );

  const releases = [];
  for (const line of raw.split('\n')) {
    if (!line.includes('\t')) continue;
    const tabIdx = line.indexOf('\t');
    const tagName = line.slice(0, tabIdx);
    const tagDateStr = line.slice(tabIdx + 1).trim();

    if (!tagName.includes('@')) continue;

    const tagDate = new Date(tagDateStr);
    if (isNaN(tagDate.getTime())) continue;

    // Tags are sorted newest-first; once we pass the cutoff we're done
    if (tagDate < cutoff) break;

    const atIdx = tagName.lastIndexOf('@');
    const packageName = tagName.slice(0, atIdx);
    const version = tagName.slice(atIdx + 1);
    if (!packageName || !version) continue;

    const upstreamPath =
      `repos/typst/packages/contents/packages/preview/${packageName}/${version}`;
    const { ok, value } = ghApiCheck(upstreamPath);

    if (!ok || value === '') {
      releases.push({ package_name: packageName, version });
      console.log(`  + ${tagName}  (not yet upstream)`);
    } else {
      console.log(`  - ${tagName}  (already upstream: ${value})`);
    }
  }

  const matrixJson = JSON.stringify(releases);
  const count = releases.length;
  console.log(`\nResult: ${count} release(s) to publish`);
  console.log(`Matrix: ${matrixJson}`);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(githubOutput, `matrix=${matrixJson}\n`);
    appendFileSync(githubOutput, `count=${count}\n`);
  } else {
    console.log('(GITHUB_OUTPUT not set — dry run, output not written)');
  }
}

main();
