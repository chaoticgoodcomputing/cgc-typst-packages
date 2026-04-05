#!/usr/bin/env node
'use strict';

/**
 * Builds the JSON payload for the typst/packages pull request.
 *
 * Reads the relevant CHANGELOG.md section (if present) and writes
 * /tmp/pr_payload.json for use with `gh api repos/typst/packages/pulls`.
 *
 * Required environment variables:
 *   PACKAGE_NAME  e.g. cgc-resume-starter
 *   VERSION       e.g. 2.0.0
 *   BRANCH        e.g. add/cgc-resume-starter-2.0.0
 */

'use strict';

const { readFileSync, writeFileSync, existsSync } = require('node:fs');

function extractChangelogEntry(packageName, version) {
  const changelogPath = `packages/${packageName}/CHANGELOG.md`;
  if (!existsSync(changelogPath)) return '';

  const content = readFileSync(changelogPath, 'utf8');
  const escapedVersion = version.replace(/\./g, '\\.');
  const headingRe = new RegExp(`^## .*${escapedVersion}.*$`, 'm');
  const headingMatch = headingRe.exec(content);
  if (!headingMatch) return '';

  const start = headingMatch.index + headingMatch[0].length;
  const nextHeading = /^## /m.exec(content.slice(start));
  const end = nextHeading ? start + nextHeading.index : content.length;
  return content.slice(start, end).trim();
}

function main() {
  const packageName = process.env.PACKAGE_NAME ?? '';
  const version = process.env.VERSION ?? '';
  const branch = process.env.BRANCH ?? '';

  if (!packageName || !version || !branch) {
    console.error('::error::PACKAGE_NAME, VERSION, and BRANCH must be set');
    process.exit(1);
  }

  const body = extractChangelogEntry(packageName, version);
  const payload = {
    title: `packages/preview/${packageName}/${version}`,
    head: `chaoticgoodcomputing:${branch}`,
    base: 'main',
    body,
  };

  writeFileSync('/tmp/pr_payload.json', JSON.stringify(payload));
  console.log('PR payload written to /tmp/pr_payload.json');
  console.log(`  title : ${payload.title}`);
  console.log(`  head  : ${payload.head}`);
  console.log(`  body  : ${body.length} chars`);
}

main();
