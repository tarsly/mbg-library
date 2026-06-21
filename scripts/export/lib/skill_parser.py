"""Parse SKILL.md files into structured data.

Source-of-truth format: YAML frontmatter + markdown body.

Frontmatter keys (Claude Code conventions):
  name             — slug (kebab-case)
  description      — one-line summary
  argument-hint    — Claude Code argument completion hint
  allowed-tools    — list of tool names the skill is permitted to call
  portable         — optional: 'claude' | 'all' | 'prose-only' (default 'all')
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError as exc:
    raise SystemExit(
        "PyYAML is required. Install via:  pip install pyyaml  or  brew install pyyaml"
    ) from exc


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


@dataclass
class Skill:
    """A parsed SKILL.md."""

    plugin: str  # the plugin directory name (e.g. "business-operations")
    slug: str  # the skill slug (e.g. "bizops-lead-tracker")
    path: Path  # absolute path to the SKILL.md file
    frontmatter: dict[str, Any] = field(default_factory=dict)
    body: str = ""

    @property
    def name(self) -> str:
        return self.frontmatter.get("name", self.slug)

    @property
    def description(self) -> str:
        return self.frontmatter.get("description", "")

    @property
    def portable(self) -> str:
        """Returns 'claude', 'all', or 'prose-only'. Defaults to 'all'."""
        return self.frontmatter.get("portable", "all")

    @property
    def allowed_tools(self) -> list[str]:
        return self.frontmatter.get("allowed-tools", []) or []

    @property
    def uses_cloud_brain(self) -> bool:
        return any("cloud-brain" in t for t in self.allowed_tools) or "mcp__cloud-brain__" in self.body

    @property
    def uses_mcp(self) -> bool:
        return any("mcp__" in t for t in self.allowed_tools) or "mcp__" in self.body


def parse_skill(path: Path, plugin: str) -> Skill:
    text = path.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(text)
    if not m:
        # No frontmatter — return empty FM + entire body
        return Skill(
            plugin=plugin,
            slug=path.parent.name,
            path=path,
            frontmatter={},
            body=text.strip(),
        )
    fm_text, body = m.group(1), m.group(2)
    fm = yaml.safe_load(fm_text) or {}
    return Skill(
        plugin=plugin,
        slug=path.parent.name,
        path=path,
        frontmatter=fm,
        body=body.strip(),
    )


def find_all_skills(repo_root: Path) -> list[Skill]:
    """Walk plugins/*/skills/*/SKILL.md and return every parsed skill."""
    plugins_dir = repo_root / "plugins"
    if not plugins_dir.is_dir():
        raise SystemExit(f"plugins/ not found under {repo_root}")
    skills: list[Skill] = []
    for plugin_dir in sorted(plugins_dir.iterdir()):
        if not plugin_dir.is_dir():
            continue
        skills_dir = plugin_dir / "skills"
        if not skills_dir.is_dir():
            continue
        for skill_dir in sorted(skills_dir.iterdir()):
            skill_md = skill_dir / "SKILL.md"
            if skill_md.is_file():
                skills.append(parse_skill(skill_md, plugin=plugin_dir.name))
    return skills


def filter_skills(skills: list[Skill], target: str) -> list[Skill]:
    """Filter by `portable` value relative to the export target.

    target: 'cursor' | 'codex' | 'anthropic-api' | 'manus'

    Rules:
      - portable: claude     → exclude from non-Claude targets
      - portable: prose-only → include for all targets (the body alone is useful)
      - portable: all        → include for all targets (default)
    """
    if target == "claude":
        return list(skills)
    return [s for s in skills if s.portable != "claude"]
