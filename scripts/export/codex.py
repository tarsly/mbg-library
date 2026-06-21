#!/usr/bin/env python3
"""Codex CLI exporter.

Flattens every SKILL.md into a single AGENTS.md at the root of the output
directory. Codex CLI reads AGENTS.md as ambient project context.

Skills tagged `portable: claude` are excluded (Codex has no MCP/Cloud-Brain).

Usage:
    python scripts/export/codex.py
    python scripts/export/codex.py --output-dir custom/path
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "export"))

from lib.body_clean import clean_for_target  # noqa: E402
from lib.skill_parser import filter_skills, find_all_skills  # noqa: E402


TARGET = "codex"


HEADER = """# MyBusinessGenie Skill Library — Codex CLI Reference

This `AGENTS.md` is exported from the MyBusinessGenie marketplace
(github.com/tarsly/mbg-library). Each section below is one skill — a named
workflow Codex can follow when the user requests it by name or topic.

## How to use

When the user asks for help with a topic that matches one of these skills (by
name like "lead-tracker" or by topic like "track a lead"), follow the
matching skill's procedure. Skills are grouped by plugin.

## Limitations under Codex CLI

These skills were originally authored for Claude Code, which has a Model Context
Protocol (MCP) integration with **Cloud Brain** — MBG's persistent memory layer
at `brain.mybusinessgenie.ai`. Codex CLI does not currently have MCP support,
so any skill that calls Cloud Brain (`cloud-brain.search_notes`, etc.)
will not have working persistence. Those calls should be treated as
**one-shot prompts only** — describe what the skill would do, but skip the
actual storage layer unless you have an alternative.

---

"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(REPO_ROOT / "dist" / "codex"))
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    skills = find_all_skills(REPO_ROOT)
    skills = filter_skills(skills, target=TARGET)

    # Group by plugin
    by_plugin: dict[str, list] = {}
    for s in skills:
        by_plugin.setdefault(s.plugin, []).append(s)

    parts = [HEADER]
    for plugin in sorted(by_plugin):
        parts.append(f"## Plugin: {plugin}\n")
        for skill in by_plugin[plugin]:
            body = clean_for_target(skill.body, target=TARGET)
            parts.append(f"### Skill: {skill.name}\n")
            parts.append(f"_{skill.description}_\n")
            if skill.uses_cloud_brain:
                parts.append("> ⚠ This skill calls Cloud Brain. No MCP support in Codex — persistence layer unavailable.\n")
            parts.append(body + "\n")
            parts.append("---\n")
        parts.append("")

    out_file = out_dir / "AGENTS.md"
    out_file.write_text("\n".join(parts), encoding="utf-8")

    print(f"✓ Codex exporter: wrote {len(skills)} skills to {out_file} ({out_file.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
