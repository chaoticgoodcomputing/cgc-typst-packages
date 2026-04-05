#!/usr/bin/env python3
"""
Builds the JSON payload for the typst/packages pull request.

Reads the relevant CHANGELOG.md section (if present) and writes a JSON file
to /tmp/pr_payload.json suitable for `gh api repos/typst/packages/pulls
--input /tmp/pr_payload.json`.

Environment variables (required):
  PACKAGE_NAME  e.g. cgc-resume-starter
  VERSION       e.g. 2.0.0
  BRANCH        e.g. add/cgc-resume-starter-2.0.0
"""

import json
import os
import re
import sys


def extract_changelog_entry(package_name: str, version: str) -> str:
    changelog_path = f"packages/{package_name}/CHANGELOG.md"
    if not os.path.exists(changelog_path):
        return ""
    with open(changelog_path) as f:
        content = f.read()
    # Match the heading for this version, then capture everything up to the
    # next same-level heading (or end of file)
    m = re.search(rf"^## .*{re.escape(version)}.*$", content, re.MULTILINE)
    if not m:
        return ""
    start = m.end()
    next_m = re.search(r"^## ", content[start:], re.MULTILINE)
    end = start + next_m.start() if next_m else len(content)
    return content[start:end].strip()


def main() -> None:
    package_name = os.environ.get("PACKAGE_NAME", "")
    version = os.environ.get("VERSION", "")
    branch = os.environ.get("BRANCH", "")

    if not all([package_name, version, branch]):
        print("::error::PACKAGE_NAME, VERSION, and BRANCH must be set", file=sys.stderr)
        sys.exit(1)

    body = extract_changelog_entry(package_name, version)

    payload = {
        "title": f"packages/preview/{package_name}/{version}",
        "head": f"chaoticgoodcomputing:{branch}",
        "base": "main",
        "body": body,
    }

    with open("/tmp/pr_payload.json", "w") as f:
        json.dump(payload, f)

    print(f"PR payload written to /tmp/pr_payload.json")
    print(f"  title : {payload['title']}")
    print(f"  head  : {payload['head']}")
    print(f"  body  : {len(body)} chars")


if __name__ == "__main__":
    main()
