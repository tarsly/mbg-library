# How to Cross-Link Plugins

This repo's plugins are designed to compose. `person-brief` reads CRM context from `bizops-lead-tracker`. `tax-deduction-finder` pulls from `qbo-bookkeeper`'s QBO MCP. `mkt-landing-page` uses `brand-toolkit`'s brand kit. The whole marketplace gets more valuable as users install more plugins.

**Every plugin must remain shippable standalone.** If a user installs `prospecting` without `business-operations`, every skill in `prospecting` must still produce useful output — just with reduced capability. This doc defines how to write cross-links that light up when the companion is present and fall back gracefully when it isn't.

---

## The Six Cross-Link Types

Pick the lightest type that meets the need. Heavier types (4, 5) require more careful fallback handling.

### Type 1 — `see-also`

Suggest a companion skill. No runtime dependency. Lowest stakes.

**Where:** end of a `SKILL.md`, in a `## See Also` section.

**Format:**

```markdown
## See Also

- `/bizops-lead-tracker` — track these prospects through your pipeline (from `business-operations`)
- `/comm-meeting-prep` — pre-meeting briefing (from `communications`)
```

Always name the parent plugin in parens. If the user doesn't have it, they know what to install.

### Type 2 — `data-sharing`

Read another plugin's Cloud Brain data. The companion plugin doesn't need to be installed *now* — its data persists in Cloud Brain even if uninstalled.

**Detection:**

```text
1. mcp__cloud-brain__search_notes for the marker note
2. If found → use it
3. If empty → use defaults / ask the user / skip the enhancement
```

**Reference implementation:** `plugins/marketing-engineering/skills/mkt-landing-page/SKILL.md`, Pre-Flight step 2. Searches Cloud Brain for `"brand kit"` in `brain/brand`. Present → applies brand voice; empty → neutral defaults.

### Type 3 — `workflow-handoff`

Write Cloud Brain notes in a schema that a downstream skill also understands. If downstream is installed, its dashboard reflects the write; if not, the notes are still there and the user can read them directly.

**Detection:**

```text
1. Always write the data to the shared schema
2. To update a downstream dashboard, search_notes for the dashboard note
3. If found → update the dashboard
4. If empty → skip dashboard update; warn user "install <plugin> for the dashboard view"
```

**Reference implementation:** `plugins/prospecting/skills/prospect-handoff/SKILL.md`, Step 4 writes leads using the `bizops-lead-tracker` template. Step 5 updates the Lead Pipeline dashboard only if it exists.

### Type 4 — `mcp-cascade`

Prefer a specific MCP from another plugin; fall back through alternatives.

**Detection:**

```text
1. Check whether the preferred mcp__<name>__* tool appears in the available tool list
2. If yes → use it
3. If no → try the next alternative
4. If no MCP available → web fallback or graceful refusal with install suggestion
```

**Reference implementation:** `plugins/prospecting/skills/prospect-find/SKILL.md`, Step 2. Cascades through `mcp__apollo__*` → `mcp__hunter__*` → `mcp__lusha__*` → `mcp__zoominfo__*` → `mcp__vibe_prospecting__*` → web fallback.

### Type 5 — `skill-handoff`

Invoke a sibling skill inline. Most fragile. Avoid unless the alternative would be massive duplication.

**Detection:**

```text
1. Check whether the slash command exists in the available skill list
2. If yes → invoke it
3. If no → run an inline version of the work (often a shrunk version)
```

**Reference implementation:** `plugins/person-brief/skills/brief-pre-meeting/SKILL.md`, Step 3: "invoke the **brief-person-30days** skill OR run the same source sweep inline." Explicit inline fallback.

### Type 6 — `license-gated-mcp`

Call a hosted MCP server that requires a valid customer license to return business logic. Used for premium/paid plugins where proprietary algorithms live on MBG servers (not in the markdown).

**Detection:**

```text
1. Make the tool call to the gated MCP
2. If response is 200 → use the result
3. If response is 401 Unauthorized → license is missing/invalid/expired (graceful upsell)
4. If response is 403 Forbidden → license is valid but tier doesn't include this tool
5. If response is 429 Too Many Requests → rate limit hit on customer's tier
6. If response is 5xx or unreachable → transient — suggest retry, do NOT recompute locally
```

**Fallback:** show a tier-specific upsell message (linking to `https://mybusinessgenie.ai/settings/api-keys` for 401, `/settings/billing` for 403). NEVER attempt the computation locally — the proprietary logic lives on the server by design.

**Reference implementation:** `PREMIUM-PLUGIN-PATTERN.md` (repo root). Full architecture (thin plugin → Cloud Brain gatekeeper → MCP execution layer) plus the SKILL.md graceful-fallback block. Plugins with `requires_license: true` in their `plugin.json` use this pattern.

---

## Standardization Rules

These are non-negotiable. Future plugin authors (AI or human) follow them without thinking.

### 1. Use "if installed" — never "if available"

"Available" is ambiguous between MCP-present and plugin-installed. "If installed" is unambiguous. Replace every existing "if available" hit when you touch a SKILL.md.

### 2. Always pair "if installed" with an explicit fallback

Don't say "if X is installed, do Y" without also saying "if X is NOT installed, do Z." The reader (or the model executing the skill) shouldn't have to guess.

**Bad:**

```markdown
> If `bizops-lead-tracker` is installed, push the prospect into the pipeline.
```

**Good:**

```markdown
> If `bizops-lead-tracker` is installed (detected via Cloud Brain dashboard note `Lead Pipeline`), push the prospect into the pipeline.
> Otherwise: write the lead to `pipeline/` as a plain note without updating the dashboard, and tell the user "install business-operations for the pipeline dashboard view."
```

### 3. Never emit a literal slash command in output text without a guard

If a skill's chat output includes `/bizops-lead-tracker pipeline`, that command will be a broken suggestion for any user who hasn't installed `business-operations`. Wrap it.

**Bad:**

```markdown
NEXT
- See pipeline: /bizops-lead-tracker pipeline
```

**Good (Type 3 hand-off — gated by detection):**

```markdown
NEXT
{if Lead Pipeline dashboard exists in Cloud Brain}
- See pipeline: /bizops-lead-tracker pipeline
{else}
- Install `business-operations` to track these prospects through your pipeline
```

**Good (Type 1 see-also — clearly a suggestion):**

```markdown
## See Also

- `/bizops-lead-tracker` — pipeline tracking (from `business-operations`)
```

The `See Also` block frames the slash command as a suggestion, not an invocation.

### 4. "Cross-link" is not a verb the model knows how to execute

Replace bare "cross-link" instructions with explicit output instructions.

**Bad:**

```markdown
> If `mkt-ai-seo` is installed, cross-link.
```

**Good:**

```markdown
> If `mkt-ai-seo` is installed, append a `See Also` line at the bottom of the audit: "Run /mkt-ai-seo --audit for the AI-search counterpart."
```

### 5. Match the manifest

Every cross-reference in a SKILL.md must have a corresponding entry in the parent plugin's `integrates_with` field (see below). The manifest is the machine-readable plugin graph; SKILL.md prose is the human-readable description. They must agree.

---

## The `integrates_with` Manifest Field

Add this field to every `plugins/<name>/.claude-plugin/plugin.json`. It's metadata-only — no behavior change — but it documents the plugin graph in a machine-readable place and powers future discoverability features ("you have X installed, install Y for full integration").

**Schema:**

```json
{
  "name": "person-brief",
  ...
  "integrates_with": [
    { "plugin": "business-operations", "type": "data-sharing" },
    { "plugin": "communications", "type": "see-also" },
    { "plugin": "zoom-meetings", "type": "mcp-cascade" },
    { "plugin": "market-intelligence", "type": "see-also" }
  ]
}
```

**Field rules:**

- `plugin` — the kebab-case name of the companion plugin (matches `name` in that plugin's manifest)
- `type` — one of `see-also`, `data-sharing`, `workflow-handoff`, `mcp-cascade`, `skill-handoff`, `license-gated-mcp` (mirrors the six cross-link types)
- Multiple entries with the same `plugin` are allowed (a plugin can have multiple kinds of integration with the same companion). Keep them ordered alphabetically by plugin name for cleanliness.
- A plugin with zero cross-links still includes the field: `"integrates_with": []`

---

## When You Add a New Skill

Walk this checklist:

1. **Does this skill reference any other plugin?** If yes, identify the type (1-5).
2. **Apply the detection mechanism** for that type.
3. **Write an explicit fallback.** Test mentally: what does the output look like for a user who doesn't have the companion installed?
4. **Add a `See Also` footer** if the skill suggests companion workflows.
5. **Update the parent plugin's `integrates_with`** to include the new cross-references.
6. **Bump the plugin's version** in both `plugin.json` and `marketplace.json` (patch bump for cross-link adjustments).

---

## When You Add a New Plugin

In addition to the above:

1. **Audit which existing plugins this new one can light up.** Look at the existing 21 plugins' surface area — Cloud Brain folders, MCP tools, slash commands. List candidate integrations.
2. **Add `integrates_with` to the new manifest** before shipping.
3. **Add inbound `See Also` entries** to existing plugins where the new plugin extends their workflow. Bump those plugins' versions in the same PR.

---

## When You Edit an Existing Skill

If the edit changes any cross-link:

1. Update the SKILL.md text per the rules above.
2. Update the parent plugin's `integrates_with`.
3. Bump the version.
4. If your edit changes a Cloud Brain folder name or schema, find all skills that read that data and update them too (do NOT silently break consumers).

---

## Verification Commands

Run these before any cross-link PR merges:

```bash
# 1. JSON validity across all manifests
jq . .claude-plugin/marketplace.json > /dev/null && \
  for p in plugins/*/.claude-plugin/plugin.json; do jq . "$p" > /dev/null || echo "BROKEN: $p"; done

# 2. Version sync between plugin.json and marketplace.json
for p in plugins/*; do
  name=$(basename "$p")
  pv=$(jq -r .version "$p/.claude-plugin/plugin.json")
  mv=$(jq -r ".plugins[] | select(.name == \"$name\") | .version" .claude-plugin/marketplace.json)
  [ "$pv" = "$mv" ] || echo "MISMATCH: $name plugin.json=$pv marketplace=$mv"
done

# 3. No unguarded slash commands in output blocks
grep -rE '^- /[a-z]+-[a-z]+' plugins/*/skills/*/SKILL.md | grep -v 'See Also' || echo "All slash commands look guarded."

# 4. Consistent language — "if available" should be empty
grep -rn 'if available' plugins/*/skills/*/SKILL.md && echo "FOUND 'if available' hits — convert to 'if installed'"
```

---

## Why This Matters

Plugin-marketplace economics reward composition. A user who installs three integrated plugins gets more value than the sum of three siloed plugins — and is more likely to come back for the fourth. But that only works if each install is a clear upgrade, never a regression.

The six-type pattern + explicit fallbacks + `integrates_with` metadata is the lowest-overhead way to keep that contract. Follow it.

---

## Cross-Framework Note

Cross-link slash commands like `/bizops-lead-tracker` are a Claude Code convention. When the marketplace is exported to other frameworks (Cursor, Codex CLI, Anthropic API, Manus) via `scripts/export/`, the exporters translate these references to prose (`the bizops-lead-tracker skill`) since other frameworks don't have a 1:1 slash-command equivalent.

You don't need to do anything special — write your cross-links as Claude Code slash commands. The exporters handle the translation. See `EXPORTING-TO-OTHER-FRAMEWORKS.md` for the full cross-framework story.
