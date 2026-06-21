# Exporting MBG Skills to Other AI Frameworks

The MBG marketplace's source-of-truth format is Claude Code's plugin layout (`.claude-plugin/marketplace.json` + per-plugin `.claude-plugin/plugin.json` + `SKILL.md` files). This doc explains how to use the export scripts in `scripts/export/` to ship the same skills to other AI frameworks.

**Design principle:** skills as portable prompts. The exporters translate the markdown body of each SKILL.md into the target framework's native file format. The persistence layer (Cloud Brain MCP) is wired into the target framework separately — see the per-framework notes below.

---

## Quick Start

```bash
# Install Python deps once
pip install pyyaml

# Run any exporter from the repo root
python scripts/export/cursor.py          # → dist/cursor/.cursor/rules/*.mdc
python scripts/export/codex.py           # → dist/codex/AGENTS.md
python scripts/export/anthropic-api.py   # → dist/anthropic-api/<plugin>/<skill>.json
python scripts/export/manus.py           # → dist/manus/MBG-SKILLS-REFERENCE.md
```

All output goes under `dist/`, which is gitignored. Re-run any exporter at any time to regenerate from the latest SKILL.md sources.

---

## The `portable` Frontmatter Field

Each `SKILL.md` may include an optional `portable` field in its YAML frontmatter:

```yaml
---
name: bizops-lead-tracker
description: "Track leads through pipeline stages..."
portable: all
---
```

Values:

| Value | Meaning |
|-------|---------|
| `all` (default) | Skill exports to every target framework. |
| `claude` | Skill is Claude Code-specific (e.g., relies on `TodoWrite` or other Claude-only behavior). Excluded from non-Claude targets. |
| `prose-only` | The markdown body is useful as reference prose but doesn't fully function without Claude Code. Still exported, but flagged. |

If a skill omits the field, it defaults to `all`.

---

## Per-Framework Setup

### Cursor

**Install path:** copy `dist/cursor/.cursor/rules/` into the `.cursor/rules/` directory of any Cursor project. The `.mdc` files are picked up automatically.

**Wire up Cloud Brain (MCP) in Cursor:** open Cursor Settings → MCP → add the same `cloud-brain` MCP entry your Claude Code config uses (`https://brain.mybusinessgenie.ai/functions/v1/brain-api`). Once wired, any skill that calls Cloud Brain works inside Cursor too.

**Caveats:**
- Cursor rules have no slash-command equivalent — invocation is by chat reference ("apply the bizops-lead-tracker rule").
- `argument-hint` and `allowed-tools` fields are dropped; Cursor handles tool allowlisting globally per MCP config, not per skill.

---

### OpenAI Codex CLI

**Install path:** copy `dist/codex/AGENTS.md` to the root of any project where you invoke `codex`. Codex automatically reads `AGENTS.md` as project context.

**Cloud Brain support:** none. Codex CLI does not currently have MCP support. Skills that depend on Cloud Brain for persistence won't have working storage in Codex — they'll work as one-shot prompts only. Skills marked `portable: claude` are excluded from this export.

**Caveats:**
- All skills are flattened into one `AGENTS.md` — Codex sees them as a single context document, not as discrete invokable commands.
- Slash-command cross-references are translated to prose ("the bizops-lead-tracker skill").

---

### Anthropic API (standalone, non-Claude-Code)

**Install path:** the export emits one JSON file per skill under `dist/anthropic-api/<plugin>/<skill>.json`. Each file has:

```json
{
  "name": "bizops-lead-tracker",
  "description": "Track leads through pipeline stages...",
  "system_prompt": "<full SKILL.md body>",
  "suggested_mcp_servers": ["cloud-brain"]
}
```

**Usage example:**

```python
import anthropic, json
client = anthropic.Anthropic()
skill = json.load(open("dist/anthropic-api/business-operations/bizops-lead-tracker.json"))

resp = client.messages.create(
    model="claude-opus-4-8",
    system=skill["system_prompt"],
    messages=[{"role": "user", "content": "Add John Smith to my pipeline"}],
    # If your client has MCP support configured, the skill can call Cloud Brain directly.
)
```

**Wire up Cloud Brain (MCP):** the standalone API supports MCP via the `mcp_servers` parameter in the Messages API (see the Anthropic docs). Point it at the same Cloud Brain endpoint your Claude Code session uses.

---

### Manus.im

**Install path:** open `dist/manus/MBG-SKILLS-REFERENCE.md` and upload it to Manus as a project reference document. Manus reads it as ambient context for the session.

**Cloud Brain support:** none directly. Manus is a cloud-hosted autonomous agent without a public MCP client. The skill prose still works as instructions ("follow the lead-tracker procedure"), but persistent state goes wherever Manus writes (its own scratchpad, not Cloud Brain).

**Caveats:**
- Manus has no public extension API as of this writing. This export is a prompt-upload pattern, not a true plugin install.
- Revisit this section if Manus publishes a formal extension API.

---

## Regenerating After Source Changes

The exporters always read the latest `plugins/*/skills/*/SKILL.md` files. To pick up source changes:

```bash
rm -rf dist/
python scripts/export/cursor.py
python scripts/export/codex.py
python scripts/export/anthropic-api.py
python scripts/export/manus.py
```

There's no caching layer. Exports are pure functions of the source tree.

---

## What's Cross-Vendor and What's Not

| Layer | Cross-vendor? | Notes |
|-------|---------------|-------|
| **Cloud Brain MCP server** | ✓ Yes | Standard MCP server. Works in any MCP-aware host. |
| **Skill prose / procedures** | ✓ Yes | Exporters translate slash-command refs and MCP tool naming as needed. |
| **`allowed-tools` allowlist** | ✗ No | Claude Code-specific. Other frameworks handle tool allowlisting globally per MCP config. |
| **Slash commands** | ✗ No | Claude Code-specific. Translated to prose in exports. |
| **`TodoWrite` tool** | ✗ No | Claude Code-specific. Skills that rely on it should be tagged `portable: claude`. |
| **`integrates_with` manifest field** | Partial | MBG-custom metadata. Other frameworks don't read it but it doesn't break anything. |

---

## License-Gated MCP (Premium Plugins)

If a plugin is marked `requires_license: true` (per `PREMIUM-PLUGIN-PATTERN.md`), it calls a hosted MCP server that requires a customer license. The server is the same regardless of which framework the customer is running — only the client-side wiring differs.

**Cursor.** Open Cursor Settings → MCP. Add a server entry:

```json
{
  "mbg": {
    "type": "http",
    "url": "https://us-central1-<project>.cloudfunctions.net/mcp",
    "headers": { "Authorization": "Bearer mbg_live_<your-key>" }
  }
}
```

The exported `.mdc` rules (under `dist/cursor/.cursor/rules/`) can now invoke premium MBG tools through Cursor's chat.

**Codex CLI.** Codex has no native MCP support today, so the premium tools can't be invoked from Codex. The `dist/codex/AGENTS.md` includes the workflow text for context, but Cloud Brain calls fail under Codex. Premium plugins should be marketed for Claude Code / Cowork / Cursor / Anthropic API only.

**Anthropic API (standalone).** Pass `mcp_servers` directly in the Messages API call:

```python
import anthropic, json
client = anthropic.Anthropic()
skill = json.load(open("dist/anthropic-api/tax-and-audit/tax-quarterly-estimate.json"))

resp = client.messages.create(
    model="claude-opus-4-8",
    system=skill["system_prompt"],
    messages=[{"role": "user", "content": "Compute Q3 estimate, MFJ in UT, $285K YTD"}],
    mcp_servers=[{
        "type": "url",
        "url": "https://us-central1-<project>.cloudfunctions.net/mcp",
        "authorization_token": "mbg_live_<your-key>",
    }],
)
```

**Manus.im.** No MCP client yet — premium plugins should NOT be promoted to Manus customers. The exported `MBG-SKILLS-REFERENCE.md` still contains the workflow text for reference, but the tools that require server-side execution can't be invoked. Revisit once Manus publishes an extension API.

See `PREMIUM-PLUGIN-PATTERN.md` for the full architecture, license issuance flow, and Firebase server-side implementation.

---

## Roll-back

If you want to remove all cross-framework export work:

```bash
rm -rf scripts/export/ dist/ EXPORTING-TO-OTHER-FRAMEWORKS.md
# Optionally strip `portable:` lines from SKILL.md files
```

The Claude Code marketplace continues to function unchanged.
