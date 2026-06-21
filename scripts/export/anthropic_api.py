#!/usr/bin/env python3
"""Anthropic API exporter.

Emits per-skill JSON files under dist/anthropic-api/<plugin>/<skill>.json
for direct programmatic use via the standalone Anthropic Messages API
(non-Claude-Code).

Each JSON file:
    {
        "name": "<skill slug>",
        "description": "<one-line description>",
        "plugin": "<source plugin name>",
        "system_prompt": "<cleaned SKILL.md body>",
        "suggested_mcp_servers": ["cloud-brain", ...]
    }

Usage:
    python scripts/export/anthropic_api.py
    python scripts/export/anthropic_api.py --output-dir custom/path
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts" / "export"))

from lib.body_clean import clean_for_target  # noqa: E402
from lib.skill_parser import filter_skills, find_all_skills  # noqa: E402


TARGET = "anthropic-api"


def detect_mcp_servers(skill) -> list[str]:
    """Sniff which MCP servers the skill calls, based on allowed-tools and body."""
    servers: set[str] = set()
    for tool in skill.allowed_tools:
        if tool.startswith("mcp__"):
            parts = tool.split("__", 2)
            if len(parts) >= 2:
                servers.add(parts[1])
    # Also scan body for mcp__SERVER__ references
    import re
    for m in re.finditer(r"mcp__([a-z0-9-]+)__", skill.body):
        servers.add(m.group(1))
    return sorted(servers)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default=str(REPO_ROOT / "dist" / "anthropic-api"))
    args = parser.parse_args()

    out_root = Path(args.output_dir)
    out_root.mkdir(parents=True, exist_ok=True)

    skills = find_all_skills(REPO_ROOT)
    skills = filter_skills(skills, target=TARGET)

    written = 0
    for skill in skills:
        body = clean_for_target(skill.body, target=TARGET)
        record = {
            "name": skill.name,
            "description": skill.description,
            "plugin": skill.plugin,
            "system_prompt": body,
            "suggested_mcp_servers": detect_mcp_servers(skill),
        }
        plugin_dir = out_root / skill.plugin
        plugin_dir.mkdir(parents=True, exist_ok=True)
        out_path = plugin_dir / f"{skill.slug}.json"
        out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
        written += 1

    # Generate an index for programmatic discovery
    index = [
        {"name": s.name, "plugin": s.plugin, "description": s.description, "path": f"{s.plugin}/{s.slug}.json"}
        for s in skills
    ]
    (out_root / "index.json").write_text(json.dumps(index, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"✓ Anthropic API exporter: wrote {written} JSON files + index.json to {out_root}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
