"""Scan tracked files for credential-shaped text.

This is a local, content-based check. It does not call a secret-scanning
service and it does not prove that a merge is blocked.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PATTERNS = (
    re.compile(r"sk-ant-(?:api03-)?[A-Za-z0-9]{20,}"),
    re.compile(r"\bxai-[A-Za-z0-9]{20,}"),
    re.compile(r"\bghp_[A-Za-z0-9]{20,}"),
    re.compile(r"\bghu_[A-Za-z0-9]{20,}"),
    re.compile(r"\bghs_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----"),
)


def find_in_text(text: str) -> list[str]:
    """Return pattern names that match. Do not return the matched secret."""
    return [pattern.pattern for pattern in PATTERNS if pattern.search(text)]


def tracked_files(root: Path) -> list[Path]:
    output = subprocess.check_output(["git", "ls-files", "-z"], cwd=root)
    return [root / name.decode() for name in output.split(b"\0") if name]


def scan(root: Path) -> list[str]:
    findings: list[str] = []
    for path in tracked_files(root):
        if not path.is_file():
            continue
        data = path.read_bytes()
        if b"\0" in data:
            continue
        if find_in_text(data.decode("utf-8", errors="replace")):
            findings.append(str(path.relative_to(root)))
    return findings


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    findings = scan(root)
    if findings:
        print("Credential-shaped content in tracked files:")
        print("\n".join(findings))
        return 1
    print(f"No credential-shaped content in {len(tracked_files(root))} tracked files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
