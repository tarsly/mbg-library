#!/usr/bin/env python3
"""Manus.im exporter.

Manus has no public extension API, but it accepts uploaded reference
documents. This exporter emits a single consolidated markdown bundle that
users upload to a Manus session as project context.

Output: dist/manus/MBG-SKILLS-REFERENCE.md

Skills tagged `portable: claude` are excluded.

Usage:
    python scripts/export/manus.py
    python scripts/export/manus.py --output-dir custom/path
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "export"))

from lib.body_clean import clean_for_target  # noqa: E402
from lib.skill_parser import filter_skills, find_all_skills  # noqa: E402


TARGET = "manus"


HEADER = """# MyBusinessGenie Skill Reference — Manus.im

This document is exported from the MyBusinessGenie marketplace
(github.com/tarsly/mbg-library). Upload it to a Manus session as a project
reference document. Each section below is one skill — a named workflow Manus
can follow when the user requests it by name or topic.

## How to use this reference

When the user asks for help on a topic that matches one of these skills,
follow the named procedure. Skills are grouped by plugin.

## Limitation: no Cloud Brain persistence

These skills were originally authored for Claude Code, which has a Model
Context Protocol (MCP) integration with **Cloud Brain** — MBG's persistent
memory layer. Manus does not currently have MCP support, so any skill that
calls Cloud Brain (`search_notes`, `write_note`, etc.) won't have a real
persistence layer in Manus. Treat those calls as **one-shot prompts only**.
For persistent state across Manus sessions, write outputs to wherever Manus
allows — its own scratchpad, an attached doc, or your designated workspace.

## Table of contents

"""


def build_toc(by_plugin: dict[str, list]) -> str:
    parts: list[str] = []
    for plugin in sorted(by_plugin):
        anchor = plugin.lower().replace("/", "-").replace(" ", "-")
        parts.append(f"- [{plugin}](#plugin-{anchor})")
        for skill in by_plugin[plugin]:
            skill_anchor = skill.slug.lower()
            parts.append(f"  - [{skill.name}](#skill-{skill_anchor})")
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(REPO_ROOT / "dist" / "manus"))
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    skills = find_all_skills(REPO_ROOT)
    skills = filter_skills(skills, target=TARGET)

    by_plugin: dict[str, list] = {}
    for s in skills:
        by_plugin.setdefault(s.plugin, []).append(s)

    parts = [HEADER, build_toc(by_plugin), "\n---\n"]
    for plugin in sorted(by_plugin):
        anchor = plugin.lower().replace("/", "-").replace(" ", "-")
        parts.append(f"\n## Plugin: {plugin} {{#plugin-{anchor}}}\n")
        for skill in by_plugin[plugin]:
            body = clean_for_target(skill.body, target=TARGET)
            skill_anchor = skill.slug.lower()
            parts.append(f"\n### Skill: {skill.name} {{#skill-{skill_anchor}}}\n")
            parts.append(f"_{skill.description}_\n")
            if skill.uses_cloud_brain:
                parts.append("> ⚠ This skill calls Cloud Brain. No MCP support in Manus — persistence layer unavailable.\n")
            parts.append(body)
            parts.append("\n---\n")

    out_file = out_dir / "MBG-SKILLS-REFERENCE.md"
    out_file.write_text("\n".join(parts), encoding="utf-8")

    print(f"✓ Manus exporter: wrote {len(skills)} skills to {out_file} ({out_file.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
