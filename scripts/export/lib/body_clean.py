"""Clean and translate SKILL.md body content for non-Claude-Code targets.

What this does:
  1. Strip Claude-Code-only frontmatter (already done upstream by skill_parser).
  2. Translate slash-command cross-references to prose so they don't read as live invocations.
  3. Optionally rewrite `mcp__cloud-brain__*` tool name references to be more readable.

This is a pure prose transform — it does NOT generate framework-specific tool-call
syntax. Per the "Skills as Portable Prompts" decision, the body says "use Cloud
Brain to do X" and the host framework's MCP client handles the actual call.
"""
from __future__ import annotations

import re


SLASH_CMD_RE = re.compile(r"`/([a-z][a-z0-9-]+)`")
MCP_TOOL_RE = re.compile(r"`mcp__([a-z0-9-]+)__([a-z0-9_]+)`")


def translate_slash_commands(body: str, *, mode: str = "prose") -> str:
    """Translate `/skill-name` references.

    mode='prose'     → `/foo-bar` becomes `the foo-bar skill`
    mode='keep'      → unchanged (Claude Code target)
    mode='at-prefix' → `/foo-bar` becomes `@foo-bar` (some frameworks use @)
    """
    if mode == "keep":
        return body
    if mode == "prose":
        return SLASH_CMD_RE.sub(lambda m: f"the `{m.group(1)}` skill", body)
    if mode == "at-prefix":
        return SLASH_CMD_RE.sub(lambda m: f"`@{m.group(1)}`", body)
    raise ValueError(f"unknown slash-command mode: {mode}")


def translate_mcp_tools(body: str, *, mode: str = "readable") -> str:
    """Translate `mcp__server__tool` references.

    mode='keep'     → unchanged (Claude Code target)
    mode='readable' → `mcp__cloud-brain__search_notes` becomes `cloud-brain.search_notes`
    mode='strip'    → drop the mcp__ prefix entirely → `cloud-brain` / `search_notes`
    """
    if mode == "keep":
        return body
    if mode == "readable":
        return MCP_TOOL_RE.sub(lambda m: f"`{m.group(1)}.{m.group(2)}`", body)
    if mode == "strip":
        return MCP_TOOL_RE.sub(lambda m: f"`{m.group(2)}` (via {m.group(1)} MCP)", body)
    raise ValueError(f"unknown mcp tool mode: {mode}")


def add_portability_header(body: str, skill_name: str, target: str, cloud_brain_used: bool) -> str:
    """Prepend a small header explaining the cross-framework provenance."""
    target_label = {
        "cursor": "Cursor",
        "codex": "Codex CLI",
        "anthropic-api": "Anthropic API",
        "manus": "Manus.im",
    }.get(target, target)
    cb_line = (
        "\n> This skill calls **Cloud Brain** (an MCP server). Wire it into your "
        f"{target_label} session per EXPORTING-TO-OTHER-FRAMEWORKS.md to enable persistence."
        if cloud_brain_used
        else ""
    )
    return (
        f"<!-- Exported from the MyBusinessGenie marketplace for {target_label}. "
        "Source of truth lives at github.com/tarsly/mbg-library. -->\n"
        f"{cb_line}\n\n"
        f"{body}"
    )


def clean_for_target(body: str, target: str) -> str:
    """One-shot transform: apply the right slash/mcp modes per target."""
    if target == "cursor":
        body = translate_slash_commands(body, mode="prose")
        body = translate_mcp_tools(body, mode="readable")
    elif target == "codex":
        body = translate_slash_commands(body, mode="prose")
        body = translate_mcp_tools(body, mode="strip")
    elif target == "anthropic-api":
        # API consumers see the body as a system prompt — keep MCP names intact
        # since the API client may be wired up to the same MCP servers.
        body = translate_slash_commands(body, mode="prose")
        # leave MCP tool names alone
    elif target == "manus":
        body = translate_slash_commands(body, mode="prose")
        body = translate_mcp_tools(body, mode="strip")
    else:
        raise ValueError(f"unknown target: {target}")
    return body
