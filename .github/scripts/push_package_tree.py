#!/usr/bin/env python3
"""
    Assembles the package file tree on the shim fork via the GitHub Git Data API.

Reads files from packages/{package_name}/, respects the `exclude` globs in
typst.toml, creates blobs on the fork, creates a tree + commit, and advances
the branch ref.  No local git operations — pure REST API.
"""

import argparse
import base64
import json
import subprocess
import sys
import tomllib
from fnmatch import fnmatch
from pathlib import Path


def api(method: str, path: str, payload: dict | None = None) -> dict:
    cmd = ["gh", "api", path, "-X", method]
    if payload is not None:
        result = subprocess.run(
            cmd + ["--input", "-"],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
        )
    else:
        result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"::error::API error ({method} {path}):\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    return json.loads(result.stdout)


def get_exclude_patterns(package_dir: Path) -> list[str]:
    with open(package_dir / "typst.toml", "rb") as f:
        config = tomllib.load(f)
    return config.get("package", {}).get("exclude", [])


def is_excluded(rel: Path, patterns: list[str]) -> bool:
    rel_str = str(rel)
    for pattern in patterns:
        if fnmatch(rel_str, pattern):
            return True
        if fnmatch(rel.name, pattern):
            return True
        # Also match any intermediate directory segment
        for part in rel.parts:
            if fnmatch(part, pattern):
                return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package-name", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--fork", required=True)
    args = parser.parse_args()

    package_dir = Path("packages") / args.package_name
    if not package_dir.is_dir():
        print(f"::error::Package directory not found: {package_dir}", file=sys.stderr)
        sys.exit(1)

    exclude_patterns = get_exclude_patterns(package_dir)
    dest_prefix = f"packages/preview/{args.package_name}/{args.version}"

    # Resolve the branch's current commit and tree SHA
    ref_data = api("GET", f"repos/{args.fork}/git/ref/heads/{args.branch}")
    commit_sha: str = ref_data["object"]["sha"]
    commit_data = api("GET", f"repos/{args.fork}/git/commits/{commit_sha}")
    base_tree_sha: str = commit_data["tree"]["sha"]

    print(f"Base commit : {commit_sha}")
    print(f"Base tree   : {base_tree_sha}")

    # Collect files, applying exclude patterns
    files: list[tuple[Path, Path]] = []
    for path in sorted(package_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(package_dir)
        if is_excluded(rel, exclude_patterns):
            print(f"  (excluded) {rel}")
            continue
        files.append((path, rel))

    print(f"\nAssembling {len(files)} file(s) → {dest_prefix}/")

    # Create a blob for every file
    tree_entries: list[dict] = []
    for abs_path, rel in files:
        content_b64 = base64.b64encode(abs_path.read_bytes()).decode()
        blob = api(
            "POST",
            f"repos/{args.fork}/git/blobs",
            {"content": content_b64, "encoding": "base64"},
        )
        dest_path = f"{dest_prefix}/{rel}"
        tree_entries.append(
            {"path": dest_path, "mode": "100644", "type": "blob", "sha": blob["sha"]}
        )
        print(f"  + {dest_path}")

    # Create the tree on top of the fork's current HEAD tree
    tree = api(
        "POST",
        f"repos/{args.fork}/git/trees",
        {"base_tree": base_tree_sha, "tree": tree_entries},
    )
    print(f"\nCreated tree   : {tree['sha']}")

    # Create the commit
    commit = api(
        "POST",
        f"repos/{args.fork}/git/commits",
        {
            "message": f"packages/preview/{args.package_name}/{args.version}",
            "tree": tree["sha"],
            "parents": [commit_sha],
        },
    )
    print(f"Created commit : {commit['sha']}")

    # Advance the branch ref (fast-forward only)
    api(
        "PATCH",
        f"repos/{args.fork}/git/refs/heads/{args.branch}",
        {"sha": commit["sha"], "force": False},
    )
    print(f"Branch {args.branch} → {commit['sha']}")


if __name__ == "__main__":
    main()
