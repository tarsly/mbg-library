# mbg-library — Repo Guide

This is a Claude Code plugin marketplace. The top-level layout:

- `.claude-plugin/marketplace.json` — the marketplace manifest. Every plugin must be listed here.
- `plugins/<plugin-name>/` — one directory per plugin.
- `plugins/<plugin-name>/.claude-plugin/plugin.json` — that plugin's own manifest.
- `plugins/<plugin-name>/skills/<skill-name>/SKILL.md` — one directory per skill, frontmatter + markdown body.

---

## Version Bumps — Required

**Whenever you modify an existing plugin's files (adding a skill, fixing a bug, updating a description), you MUST bump that plugin's version in two places:**

1. `plugins/<plugin-name>/.claude-plugin/plugin.json` → `"version"`
2. `.claude-plugin/marketplace.json` → the matching plugin entry → `"version"`

The two must stay in sync. Drift is invisible until someone installs the plugin and gets confused about which version they have.

**Semver rules:**
- **Patch** (`1.0.0` → `1.0.1`) — bug fixes, typo fixes, doc clarifications, error-handling improvements
- **Minor** (`1.0.0` → `1.1.0`) — new skill added, new capability on an existing skill, new optional argument
- **Major** (`1.0.0` → `2.0.0`) — breaking change: renamed/removed skill, changed argument semantics, removed Cloud Brain data shape

**New plugins start at `1.0.0`.** No bump needed on the initial commit that creates them.

---

## Plugin Naming

- Plugin directory name, `plugin.json` `name` field, and `marketplace.json` `name` field must all match.
- Use kebab-case identifiers that align with the `displayName` (see commit `4f78562 Rename plugins to displayName-aligned kebab-case identifiers`).

---

## Skill Naming

- Skills are prefixed with a per-plugin slug (e.g., `bizops-*` for `business-operations`, `eos-*` for `eos-operator`, `comm-*` for `communications`).
- Use the same prefix across every skill in a plugin so they cluster in `/`-autocomplete.

---

## SKILL.md Structure (canonical)

Every `SKILL.md` follows this 9-section structure (see `plugins/business-operations/skills/bizops-lead-tracker/SKILL.md` for the reference):

1. YAML frontmatter — `name`, `description`, `argument-hint`, `allowed-tools`
2. Overview
3. When This Skill Applies
4. Pre-Flight — Preferences (search Cloud Brain for prefs; ask in ONE message if missing; render banner)
5. How It Works
6. Data Structure (markdown templates for any notes the skill writes)
7. Output Format
8. Example Usage
9. Error Handling

---

## Cloud Brain Storage

- Plugin data goes in Cloud Brain via the `mcp__cloud-brain__*` tools.
- The `folder` parameter on `write_note` must NEVER include a `brain/` prefix. Use `pipeline`, `eos`, `people`, etc. (Cloud Brain writes `<folder>/<title>.md` directly.)
- Tags are YAML lists, not JSON-array strings: `tags=["a","b"]`, not `tags='["a","b"]'`.
- Preferences go under `brain/preferences/` (legacy convention preserved from the basic-memory migration).

---

## Pre-Commit Checks

Before committing changes to a plugin:

1. `jq . plugins/<plugin>/.claude-plugin/plugin.json` — must succeed.
2. `jq . .claude-plugin/marketplace.json` — must succeed.
3. Confirm the plugin's `version` matches in both manifests.
4. Confirm every new/modified `SKILL.md` has a frontmatter block with `name`, `description`, and `allowed-tools`.

---

## Trademark-Sensitive Plugins

For plugins that build on a licensed framework (e.g., `eos-operator` uses EOS Worldwide's trademarked terminology), include a disclaimer in `README.md` and avoid bundling logos or claiming certification.

---

## Cross-Framework Exports (Optional `portable` Field)

The marketplace's source-of-truth is Claude Code's format. Exporters under `scripts/export/` ship the same skills to Cursor, Codex CLI, Anthropic API, and Manus.im. See `EXPORTING-TO-OTHER-FRAMEWORKS.md` for the full pattern.

When authoring a new skill, you MAY add an optional `portable` field to the YAML frontmatter:

```yaml
---
name: my-skill
description: "..."
portable: all   # or 'claude' (Claude Code only) or 'prose-only'
---
```

- `all` (default) — exports to every target framework
- `claude` — Claude-Code-specific (relies on `TodoWrite`, complex slash-command flows, etc.) — excluded from non-Claude exports
- `prose-only` — body is useful as reference but the skill doesn't fully function outside Claude Code

If you omit the field, it defaults to `all`. Claude Code ignores the field — it's read only by the export scripts.
