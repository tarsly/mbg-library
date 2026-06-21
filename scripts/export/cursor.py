#!/usr/bin/env python3
"""Cursor exporter.

Reads plugins/*/skills/*/SKILL.md and emits one .mdc file per skill under
dist/cursor/.cursor/rules/.

Cursor .mdc format:
    ---
    description: "Human-readable description"
    globs: []
    alwaysApply: false
    ---
    <body>

Usage:
    python scripts/export/cursor.py
    python scripts/export/cursor.py --output-dir custom/path
    python scripts/export/cursor.py --skill prospect-handoff   # one skill only
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "export"))

import yaml  # noqa: E402

from lib.body_clean import add_portability_header, clean_for_target  # noqa: E402
from lib.skill_parser import filter_skills, find_all_skills  # noqa: E402


TARGET = "cursor"


def render_mdc(skill, body: str) -> str:
    """Render the Cursor .mdc file from frontmatter + cleaned body."""
    fm = {
        "description": skill.description,
        "globs": [],
        "alwaysApply": False,
    }
    fm_text = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True).strip()
    return f"---\n{fm_text}\n---\n\n# {skill.name}\n\n{body}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(REPO_ROOT / "dist" / "cursor"))
    parser.add_argument("--skill", help="Export only one skill by slug (for smoke testing)")
    args = parser.parse_args()

    out_root = Path(args.output_dir) / ".cursor" / "rules"
    out_root.mkdir(parents=True, exist_ok=True)

    skills = find_all_skills(REPO_ROOT)
    skills = filter_skills(skills, target=TARGET)
    if args.skill:
        skills = [s for s in skills if s.slug == args.skill]
        if not skills:
            print(f"No skill matched slug: {args.skill}", file=sys.stderr)
            return 1

    written = 0
    for skill in skills:
        body = clean_for_target(skill.body, target=TARGET)
        body = add_portability_header(body, skill.name, TARGET, skill.uses_cloud_brain)
        mdc = render_mdc(skill, body)
        out_path = out_root / f"{skill.slug}.mdc"
        out_path.write_text(mdc, encoding="utf-8")
        written += 1

    print(f"✓ Cursor exporter: wrote {written} .mdc files to {out_root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
