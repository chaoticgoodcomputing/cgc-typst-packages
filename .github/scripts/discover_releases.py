#!/usr/bin/env python3
"""
Discovers release tags from the past N days that have not yet been published
to typst/packages. Writes a JSON matrix to GITHUB_OUTPUT for the publish job.

Requires:
  - git history with tags available (fetch-depth: 0 + git fetch --tags)
  - GH_TOKEN env var with read access to repos/typst/packages (public repo,
    but authenticated calls have higher rate limits)
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone


def git(*args: str) -> str:
    return subprocess.check_output(["git"] + list(args), text=True).strip()


def gh_api(path: str) -> tuple[int, str]:
    result = subprocess.run(
        ["gh", "api", path, "--jq", ".type"],
        capture_output=True,
        text=True,
    )
    return result.returncode, result.stdout.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--since-days", type=int, default=8)
    args = parser.parse_args()

    cutoff = datetime.now(timezone.utc) - timedelta(days=args.since_days)
    print(f"Scanning tags newer than {cutoff.date()} ({args.since_days} days)...")

    # List all *@* tags with creation timestamps, sorted newest-first
    raw = git(
        "for-each-ref",
        "--format=%(refname:short)\t%(creatordate:iso-strict)",
        "--sort=-creatordate",
        "refs/tags",
    )

    releases = []
    for line in raw.splitlines():
        if "\t" not in line:
            continue
        tag_name, tag_date_str = line.split("\t", 1)

        if "@" not in tag_name:
            continue

        try:
            tag_date = datetime.fromisoformat(tag_date_str.strip())
            if tag_date.tzinfo is None:
                tag_date = tag_date.replace(tzinfo=timezone.utc)
        except ValueError:
            continue

        # Tags are sorted newest-first; once we pass the cutoff we're done
        if tag_date < cutoff:
            break

        package_name, _, version = tag_name.rpartition("@")
        if not package_name or not version:
            continue

        upstream_path = f"repos/typst/packages/contents/packages/preview/{package_name}/{version}"
        rc, content_type = gh_api(upstream_path)

        if rc != 0 or content_type == "":
            releases.append({"package_name": package_name, "version": version})
            print(f"  + {tag_name}  (not yet upstream)")
        else:
            print(f"  - {tag_name}  (already upstream: {content_type})")

    matrix_json = json.dumps(releases)
    count = len(releases)
    print(f"\nResult: {count} release(s) to publish")
    print(f"Matrix: {matrix_json}")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"matrix={matrix_json}\n")
            f.write(f"count={count}\n")
    else:
        print("(GITHUB_OUTPUT not set — dry run, output not written)")
        sys.exit(0 if count == 0 else 0)


if __name__ == "__main__":
    main()
