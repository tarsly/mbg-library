# Premium Plugin Pattern — License-Gated MCP Authorization

This document is the reference for converting an MBG plugin into a paid/gated product. The architecture protects proprietary business logic (it stays on MBG's server), validates customer licenses on every request, and works across Claude Code, Claude Cowork, Cursor, and any other MCP-aware host.

**Status:** documentation only. No plugin in this repo currently uses this pattern. The server side will be implemented in the separate `genie-ai-web` repo using Firebase Cloud Functions. Once that's live, plugins can be converted one at a time.

---

## Architecture

```
┌─────────────────────────────────┐
│  Customer's Claude Code/Cowork  │
│  Instance (their machine)       │
│                                 │
│  Thin plugin (.claude-plugin)   │
│  - SKILL.md prompts             │
│  - mcpServers → Cloud Brain     │
└──────────────┬──────────────────┘
               │ (1) Tool call + Bearer license key
               ▼
┌─────────────────────────────────┐                ┌──────────────────────┐
│  Cloud Brain                    │  ←─(invalidate)│  Stripe webhook      │
│  brain.mybusinessgenie.ai       │                │  → updates Firestore │
│                                 │                │    + invalidates     │
│  - License cache (24h–7d TTL)   │                │    cached license    │
│  - Validates Bearer token       │                └──────────────────────┘
│  - Checks tier + entitlements   │
│  - Routes to business logic     │
│  - Semantic result cache (mins) │
└──────────────┬──────────────────┘
               │ (2) Validated request +
               │     customer context
               ▼
┌─────────────────────────────────┐
│  Business Logic MCP             │
│  (Firebase Cloud Functions in   │
│   genie-ai-web)                 │
│                                 │
│  - Runs proprietary algorithms  │
│  - Hits paid APIs               │
│  - Returns result               │
└─────────────────────────────────┘
```

**Three layers, three concerns:**

- **Thin plugin** — UX only. Workflow prompts, tool-call orchestration. No business logic.
- **Cloud Brain** — gatekeeper. License validation, caching, entitlement checks, request routing.
- **Business Logic MCP** — execution. Where the proprietary work happens.

**Why three layers, not two:**

1. **IP protection** — algorithms never sit on the customer's machine.
2. **Centralized authorization** — Cloud Brain knows the customer's identity; downstream services don't reimplement auth.
3. **Instant license rotation** — revoking in Cloud Brain immediately denies further requests.
4. **Frictionless server updates** — fix a bug in business logic, deploy, every customer gets it. No "reinstall plugin" cycle.
5. **License cache survives cold starts** — Cloud Brain backs the cache (Supabase), so Cloud Functions don't burn a fresh Firestore read on every invocation.

---

## What This Protects vs. What Stays Public

**Protected — server-side IP:**

- Business algorithms (tax math, scoring models, query construction)
- Proprietary data (curated lookups, customer-only datasets)
- Heavy compute (LLM calls, paid API calls, billable downstream services)
- License tier features (Starter vs Pro vs Enterprise gating)
- Code itself — never on customer hard drives

**Still public — SKILL.md workflow:**

- SKILL.md files remain readable in the GitHub repo
- The WORKFLOW (questions, steps, fallback patterns) is visible
- A determined competitor could read the SKILL.md and reimplement against their own server

**The authoring rule for premium plugins:** SKILL.md is a thin orchestration layer. Anything proprietary lives in the MCP server as a tool. The markdown says "call `mbg.compute_X` with these inputs"; the server runs the actual computation.

---

## Authentication: Pick One

### Option A — Static Bearer Token (recommended for v1)

Customer signs up at `mybusinessgenie.ai`, gets a license key from `/settings/api-keys`, pastes it into Claude once at plugin install.

**Trade-offs:**
- ✓ Ship in 1–2 days of server work
- ✓ Works in Claude Code via `userConfig` natively
- ✓ Works in any MCP host that accepts a Bearer header (Cursor, Anthropic API)
- ✗ Customer pastes a key once (small friction)
- ✗ If Cowork doesn't honor `userConfig`, customer adds the MCP config manually (same outcome, more steps)

### Option B — OAuth 2.1 Flow (recommended for v2)

Plugin's `mcpServers` entry points to Cloud Brain. First request returns `401` + OAuth metadata. Claude opens a browser to `mybusinessgenie.ai/oauth/authorize`. Customer logs in, grants consent. Claude stores the OAuth token; refresh tokens handle expiry.

**Trade-offs:**
- ✓ Zero customer-facing key paste
- ✓ Ties cleanly to mybusinessgenie.ai web identity
- ✓ Auto-refresh
- ✓ Matches what Notion / Asana / HubSpot ship
- ✗ Build out an OAuth 2.1 authorization server (or use Auth0 / Supabase Auth / Firebase Auth)
- ✗ Higher initial server work

**Recommendation:** ship Option A first. Migrate to Option B once subscriber volume justifies the OAuth investment. Both share the same downstream Cloud Brain + MCP architecture; only the auth wiring differs.

---

## Plugin-Side Reference (Option A — Bearer)

### `plugin.json` template

```json
{
  "name": "premium-plugin-name",
  "displayName": "Premium Plugin",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "MyBusinessGenie" },

  "userConfig": {
    "license_key": {
      "type": "string",
      "title": "MBG License Key",
      "description": "Get your key at https://mybusinessgenie.ai/settings/api-keys",
      "sensitive": true,
      "required": true
    }
  },

  "mcpServers": {
    "mbg": {
      "type": "http",
      "url": "https://us-central1-<project>.cloudfunctions.net/mcp",
      "headers": {
        "Authorization": "Bearer ${user_config.license_key}"
      }
    }
  },

  "requires_license": true
}
```

Notes:
- `sensitive: true` → Claude Code stores the key in the macOS keychain, never in `settings.json`.
- `required: true` → plugin won't enable until the key is provided.
- `${user_config.license_key}` → Claude Code substitutes this into the `Authorization` header on every MCP request.
- `requires_license: true` → MBG-custom metadata (like `integrates_with`). Lets the marketplace UI badge premium plugins; Claude Code/Cowork ignore it.

Once a custom domain is wired up at `license.mybusinessgenie.ai`, replace the `cloudfunctions.net` URL with that.

### `marketplace.json` entry

Add `requires_license: true` at the entry level (next to `version`, `category`). Browseable signal that the plugin needs a key.

### SKILL.md graceful-fallback section (Type 6: License-Gated MCP)

Every premium SKILL.md must include this block in its Error Handling section. Same shape as the cross-link types in `HOW-TO-CROSS-LINK.md`.

```markdown
## Error Handling

- **If the `mbg` MCP returns 401 Unauthorized:** the customer's license key is
  missing, invalid, or expired. Respond with:

  > Your MBG license doesn't cover this skill. Get or renew your key at
  > https://mybusinessgenie.ai/settings/api-keys, then run
  > `/plugin config <plugin-name> license_key=<new-key>` to update it.

  Do NOT attempt the computation locally — the proprietary logic lives in the
  MCP server.

- **If the `mbg` MCP returns 403 Forbidden:** license is valid, but the
  customer's tier doesn't include this specific tool. Respond with:

  > Your current MBG plan covers the basic features but not [specific tool].
  > Upgrade at https://mybusinessgenie.ai/settings/billing.

- **If the `mbg` MCP returns 429 Too Many Requests:** tier rate limit hit.
  Respond with retry-after time and tier upgrade suggestion.

- **If the `mbg` MCP returns 5xx or is unreachable:** transient. Suggest retry
  in a few minutes; do NOT recompute locally.
```

---

## Server-Side Reference — `genie-ai-web`

Concrete TypeScript for `genie-ai-web/functions/src/mcp/`. Uses Firebase Functions v2, Firestore for license storage, the official `@modelcontextprotocol/sdk` Node package for the MCP wire format, and Cloud Brain (Supabase) as the cache layer.

### File layout

```
genie-ai-web/functions/src/
├── mcp/
│   ├── index.ts             # HTTP entry — wires MCP server to Cloud Function
│   ├── auth.ts              # Bearer token validation + license lookup
│   ├── entitlements.ts      # Per-tool entitlement check
│   ├── cache.ts             # Cloud-Brain-backed license cache (24h-7d)
│   ├── rate_limit.ts        # Per-license rate limiting
│   ├── stripe_webhook.ts    # Stripe subscription events → license issuance/invalidation
│   └── tools/
│       ├── tax_quarterly_estimate.ts
│       ├── tax_cost_segregation.ts
│       └── ...               # one file per gated tool
├── cloud_brain.ts           # Thin HTTP wrapper around brain.mybusinessgenie.ai
└── index.ts                 # Re-exports the mcp + stripeWebhook Functions
```

### License key format

Opaque, prefixed, URL-safe. Pattern: `mbg_live_<32-byte-base62>` (production) / `mbg_test_<...>` (sandbox). Generate with `crypto.randomBytes(32).toString('base64url')`. Stripe-style prefix convention — visually distinguishes test vs production.

### Firestore schema

Collection: `licenses`, doc ID = **SHA-256 hash of the license key** (not the plaintext — limits blast radius if Firestore is ever leaked):

```json
{
  "customer_id": "cust_abc123",
  "tier": "pro",
  "entitlements": ["tax_quarterly_estimate", "tax_cost_segregation", "prospect_find"],
  "issued_at": "2026-06-21T00:00:00Z",
  "expires_at": "2027-06-21T00:00:00Z",
  "revoked": false,
  "stripe_subscription_id": "sub_xxx",
  "rate_limit": { "per_minute": 100, "per_day": 10000 }
}
```

### `auth.ts` — Bearer validation + license lookup

```typescript
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "crypto";
import { getCachedLicense, setCachedLicense } from "./cache";

export interface License {
  customer_id: string;
  tier: "starter" | "pro" | "enterprise";
  entitlements: string[];
  expires_at: string;
  revoked: boolean;
  rate_limit?: { per_minute: number; per_day: number };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function validateLicenseKey(authHeader: string | undefined): Promise<License> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or malformed Authorization header");
  }
  const key = authHeader.slice("Bearer ".length).trim();
  if (!key.startsWith("mbg_live_") && !key.startsWith("mbg_test_")) {
    throw new HttpError(401, "Invalid license key format");
  }
  const keyHash = createHash("sha256").update(key).digest("hex");

  // Try the Cloud Brain cache first
  const cached = await getCachedLicense(keyHash);
  if (cached) return cached;

  // Fall back to Firestore on cache miss
  const doc = await getFirestore().collection("licenses").doc(keyHash).get();
  if (!doc.exists) throw new HttpError(401, "License key not recognized");
  const license = doc.data() as License;
  if (license.revoked) throw new HttpError(401, "License revoked");
  if (new Date(license.expires_at) < new Date()) throw new HttpError(401, "License expired");

  // Cache for next time
  await setCachedLicense(keyHash, license);
  return license;
}
```

### `entitlements.ts` — per-tool entitlement check

```typescript
import { License, HttpError } from "./auth";

export function requireEntitlement(license: License, toolName: string): void {
  if (!license.entitlements.includes(toolName)) {
    throw new HttpError(
      403,
      `Your ${license.tier} plan does not include ${toolName}. ` +
      `Upgrade at https://mybusinessgenie.ai/settings/billing.`,
    );
  }
}
```

### `cache.ts` — Cloud Brain-backed cache (long TTL, webhook invalidation)

**Insight: licenses don't change frequently.** Once issued, a license is stable for the life of the subscription. So validation can be cached aggressively — **24 hours to 7 days** — backed by Cloud Brain so the cache survives Cloud Function cold starts.

Cache invalidation is event-driven: when Stripe fires `customer.subscription.deleted` or `customer.subscription.updated`, the webhook handler proactively invalidates the cached entry. So the only time we re-validate against Firestore is on first use after issuance or after invalidation — not on every request.

```typescript
import { License } from "./auth";
import { cloudBrain } from "../cloud_brain";

const LICENSE_CACHE_TTL_SECONDS = 24 * 60 * 60;  // 24 hours
                                                 // Bump to 7 days once the Stripe webhook is wired

export async function getCachedLicense(keyHash: string): Promise<License | null> {
  const cached = await cloudBrain.getLicense(keyHash);
  if (!cached) return null;
  if (cached.cached_at + LICENSE_CACHE_TTL_SECONDS * 1000 < Date.now()) {
    return null;  // stale — re-validate
  }
  return cached.license;
}

export async function setCachedLicense(keyHash: string, license: License): Promise<void> {
  await cloudBrain.setLicense(keyHash, {
    license,
    cached_at: Date.now(),
  });
}

export async function invalidateLicense(keyHash: string): Promise<void> {
  // Called by the Stripe webhook on subscription change.
  await cloudBrain.deleteLicense(keyHash);
}

// Optional: result cache for idempotent tool calls. Key = hash(toolName + args).
// Shorter TTL since tool results can be time-sensitive.
export async function getCachedResult(cacheKey: string): Promise<any | null> {
  return cloudBrain.getResult(cacheKey);
}

export async function setCachedResult(cacheKey: string, value: any, ttlSeconds = 600): Promise<void> {
  await cloudBrain.setResult(cacheKey, value, ttlSeconds);
}
```

The `cloudBrain` import is a thin HTTP wrapper around `brain.mybusinessgenie.ai` — add a `licenses` namespace to Cloud Brain's existing API surface, with `GET /licenses/:keyHash`, `PUT /licenses/:keyHash`, `DELETE /licenses/:keyHash` endpoints.

### `rate_limit.ts` — per-license token bucket

```typescript
import { License, HttpError } from "./auth";

const buckets = new Map<string, { tokens: number; lastRefill: number }>();

export function checkRateLimit(license: License): void {
  const limit = license.rate_limit?.per_minute ?? 60;
  const now = Date.now();
  const bucket = buckets.get(license.customer_id) ?? { tokens: limit, lastRefill: now };
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(limit, bucket.tokens + (elapsed * limit) / 60);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    throw new HttpError(429, `Rate limit: ${limit} req/min on ${license.tier} plan. Upgrade or retry shortly.`);
  }
  bucket.tokens -= 1;
  buckets.set(license.customer_id, bucket);
}
```

This is an in-memory bucket. For multi-instance scaling, move the bucket state to Memorystore (Redis) or use Cloud Tasks. For v1, in-memory per-function-instance is acceptable.

### `stripe_webhook.ts` — issuance + invalidation

```typescript
import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { createHash, randomBytes } from "crypto";
import Stripe from "stripe";
import { invalidateLicense } from "./mcp/cache";
import { emailLicenseKeyToCustomer } from "../email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2024-06-20" });

function generateLicenseKey(env: "live" | "test" = "live"): string {
  return `mbg_${env}_${randomBytes(24).toString("base64url")}`;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function tierFromPriceId(priceId: string): "starter" | "pro" | "enterprise" {
  // Map Stripe price IDs to MBG tiers
  const map: Record<string, "starter" | "pro" | "enterprise"> = {
    "price_starter_monthly": "starter",
    "price_pro_monthly":     "pro",
    "price_enterprise_monthly": "enterprise",
  };
  return map[priceId] ?? "starter";
}

function entitlementsForTier(tier: string): string[] {
  // Single source of truth for tier → entitlement mapping
  const map: Record<string, string[]> = {
    "starter":    ["tax_quarterly_estimate"],
    "pro":        ["tax_quarterly_estimate", "tax_cost_segregation", "tax_entity_structure", "prospect_find"],
    "enterprise": ["*"],  // wildcard — all tools
  };
  return map[tier] ?? [];
}

export const stripeWebhook = onRequest({ region: "us-central1" }, async (req, res) => {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers["stripe-signature"] as string,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    res.status(400).send("Invalid signature");
    return;
  }

  switch (event.type) {
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const key = generateLicenseKey();
      const keyHash = sha256(key);
      const tier = tierFromPriceId(sub.items.data[0].price.id);
      await getFirestore().collection("licenses").doc(keyHash).set({
        customer_id: sub.customer,
        tier,
        entitlements: entitlementsForTier(tier),
        issued_at: new Date().toISOString(),
        expires_at: new Date(sub.current_period_end * 1000).toISOString(),
        revoked: false,
        stripe_subscription_id: sub.id,
      });
      await emailLicenseKeyToCustomer(sub.customer as string, key);
      break;
    }
    case "customer.subscription.deleted":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const q = await getFirestore().collection("licenses")
        .where("stripe_subscription_id", "==", sub.id).get();
      for (const doc of q.docs) {
        if (event.type === "customer.subscription.deleted") {
          await doc.ref.update({ revoked: true });
        } else {
          const tier = tierFromPriceId(sub.items.data[0].price.id);
          await doc.ref.update({
            tier,
            entitlements: entitlementsForTier(tier),
            expires_at: new Date(sub.current_period_end * 1000).toISOString(),
          });
        }
        // CRITICAL: invalidate cache so the next request hits fresh state
        await invalidateLicense(doc.id);
      }
      break;
    }
  }
  res.status(200).send("ok");
});
```

### `index.ts` — the MCP Cloud Function

```typescript
import { onRequest } from "firebase-functions/v2/https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { validateLicenseKey, HttpError } from "./auth";
import { requireEntitlement } from "./entitlements";
import { checkRateLimit } from "./rate_limit";
import {
  taxQuarterlyEstimate,
  taxQuarterlyEstimateInputSchema,
} from "./tools/tax_quarterly_estimate";

export const mcp = onRequest({ cors: false, region: "us-central1" }, async (req, res) => {
  try {
    const license = await validateLicenseKey(req.headers.authorization);
    checkRateLimit(license);

    const server = new Server(
      { name: "mbg", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler("tools/list", async () => ({
      // Hide tools the customer isn't entitled to — they'll never see them
      tools: [
        {
          name: "tax_quarterly_estimate",
          description: "Compute quarterly tax estimate (federal + state)",
          inputSchema: taxQuarterlyEstimateInputSchema._def,
        },
        // ... more tools
      ].filter(t => license.entitlements.includes(t.name) || license.entitlements.includes("*")),
    }));

    server.setRequestHandler("tools/call", async (req) => {
      const { name, arguments: args } = req.params;
      requireEntitlement(license, name);

      if (name === "tax_quarterly_estimate") {
        const parsed = taxQuarterlyEstimateInputSchema.parse(args);
        const result = await taxQuarterlyEstimate(parsed, license);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
      throw new HttpError(404, `Unknown tool: ${name}`);
    });

    const transport = new StreamableHTTPServerTransport({});
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
    } else {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});
```

### Example tool: `tools/tax_quarterly_estimate.ts`

```typescript
import { z } from "zod";
import { License } from "../auth";

export const taxQuarterlyEstimateInputSchema = z.object({
  ytd_income: z.number(),
  ytd_expenses: z.number(),
  filing_status: z.enum(["single", "mfj", "mfs", "hoh"]),
  state: z.string().length(2),
  prior_year_tax: z.number(),
  prior_year_agi: z.number(),
});

export async function taxQuarterlyEstimate(
  input: z.infer<typeof taxQuarterlyEstimateInputSchema>,
  license: License,
) {
  // ALL THE PROPRIETARY MATH GOES HERE. Implement the algorithms documented
  // in plugins/tax-and-audit/skills/tax-quarterly-estimate/SKILL.md.
  // The license parameter is available if the algorithm should behave
  // differently per tier (e.g., Pro gets state-specific accuracy, Starter
  // gets federal-only).
  return {
    federal_quarterly: 0,
    state_quarterly: 0,
    methodology: "annualized",
    /* ... */
  };
}
```

---

## Issuance Flow

1. Customer subscribes via Stripe (or GHL, or whatever MBG uses for billing).
2. Stripe fires `customer.subscription.created` → `stripeWebhook` Cloud Function:
   - generates a key (`mbg_live_<base62>`)
   - hashes it, stores license doc in Firestore with tier + entitlements
   - emails the customer the plaintext key (one-time display)
3. Customer pastes the key into Claude on `/plugin install` (Option A) OR clicks through OAuth on first use (Option B).
4. If a customer loses the key, they regenerate from `/settings/api-keys` — revoke the old, issue a new. Original can't be retrieved (hash-only storage).

---

## Caching Strategy (3 layers)

### Layer 1 — Cloud Brain (highest leverage)

- **License cache with long TTL.** Licenses don't change frequently. Cache for **24 hours** initially, bump to 7 days once the Stripe invalidation webhook is wired. After the first request, every subsequent request from the same customer skips the Firestore lookup entirely.
- **Event-driven invalidation.** The Stripe webhook handler proactively invalidates the cached entry on subscription change. Cancellations take effect on the very next request — not after TTL.
- **Semantic query cache.** For idempotent tool calls, hash arguments and cache results with a 5–15 minute TTL. Major cost saver for LLM-heavy tools.

### Layer 2 — MCP protocol (tool design)

- **Fat tools, not chatty.** Expose `get_customer_context` returning everything; avoid the `get_user_id` → `get_user_tier` → `get_user_usage` round-trip pattern.
- **MCP Resources for prefetched context.** Static or rarely-changing data → expose as MCP Resources. Claude reads from context without a tool call.

### Layer 3 — Plugin (early short-circuit)

- **Client-side debouncing hint in SKILL.md.** "Do NOT re-run the lookup tool unless the user explicitly asks for fresh data — re-use the previous turn's response."
- **Render results inline.** Once a tool returns data, the SKILL.md instructs Claude to display it inline, reducing the chance of follow-up calls re-fetching the same thing.

---

## Per-Framework Install Guide

The MCP server is identical across all clients. Each framework just needs its own one-time wiring.

### Claude Code

1. `/plugin install <plugin-name>` (or install from a marketplace).
2. Claude Code reads `userConfig.license_key.required = true`, prompts: "Enter your MBG license key."
3. Key stored in macOS keychain (because `sensitive: true`).
4. Subsequent invocations: Claude Code substitutes `${user_config.license_key}` into the `Authorization` header automatically.

### Claude Cowork

Cowork installs plugins from the same GitHub marketplace. `userConfig` support is currently unverified — two paths:

- **If Cowork honors `userConfig`** (preferred path): same as Claude Code. Customer prompted at install, key stored securely.
- **If Cowork doesn't:** customer manually adds the MCP server to Cowork's settings, including the `Authorization` header. Setup instructions (paste into Cowork's MCP config):
  ```json
  {
    "mbg": {
      "type": "http",
      "url": "https://us-central1-<project>.cloudfunctions.net/mcp",
      "headers": { "Authorization": "Bearer mbg_live_<your-key>" }
    }
  }
  ```

### Cursor

The cross-framework Cursor export (`dist/cursor/.cursor/rules/*.mdc`) gets the workflow into Cursor. To wire the license MCP:

1. Open Cursor Settings → MCP.
2. Add a new MCP server with type `http`, URL pointing to the MBG Cloud Function, and an `Authorization: Bearer mbg_live_<key>` header.
3. The exported `.mdc` rules can now invoke the MBG MCP tools through Cursor's chat.

### Generic / Anthropic API

Programmatic use via the standalone Anthropic Messages API. From the cross-framework `dist/anthropic-api/<plugin>/<skill>.json` bundle, load the system prompt and pass the MCP server to the Messages API call:

```python
import anthropic
client = anthropic.Anthropic()
resp = client.messages.create(
    model="claude-opus-4-8",
    system=skill["system_prompt"],
    messages=[...],
    mcp_servers=[{
        "type": "url",
        "url": "https://us-central1-<project>.cloudfunctions.net/mcp",
        "authorization_token": "mbg_live_<key>",
    }],
)
```

### Manus.im

Manus has no public MCP client yet — the workflow runs as reference text, but Cloud Brain calls fail. Skills tagged `requires_license: true` should not be promoted to Manus customers. Revisit once Manus publishes an extension API.

---

## Security Boundary

1. **Keys never enter the repo.** `sensitive: true` → keychain storage in Claude Code. Customers enter keys at install; they're never in plaintext settings files.
2. **Keys travel over HTTPS only.** MCP HTTP transport mandates TLS. Bearer tokens go in `Authorization` headers, never URLs (per spec).
3. **Hash-only Firestore storage.** Firestore stores the SHA-256 hash of the key, not the plaintext. A Firestore leak doesn't give attackers working keys.
4. **Server-side validation is the only enforcement boundary.** Clients forward the key; the server decides what's allowed.
5. **Instant revocation.** Mark `revoked: true` + call `invalidateLicense` → next request fails.
6. **Rate-limiting is server-side.** Per-customer token bucket; tiers configure their own limits.
7. **Public SKILL.md is by design.** The workflow is marketing. The moat is the server-side execution.
8. **Stripe webhook signatures.** All Stripe-triggered events must verify the signature before mutating state. Never trust webhook payloads blindly.

---

## Verification (Once Implemented)

End-to-end smoke test:

1. Clean Claude Code session, no MBG key configured.
2. `/plugin install premium-plugin` → Claude prompts for license key (because `required: true`).
3. With no key: confirm graceful fallback message (the 401 case in SKILL.md).
4. Set a valid key (`/plugin config premium-plugin license_key=mbg_live_<key>`).
5. Invoke the skill → confirm Firestore is read once, then cache is populated.
6. Invoke again within 24h → confirm Cloud Brain cache hit (no Firestore read).
7. Cancel the subscription via Stripe → confirm webhook fires → confirm next request returns 401 → confirm SKILL.md graceful fallback shows.
8. Inspect macOS keychain — confirm key is stored there, NOT in `~/.claude/settings.json`.

---

## What's NOT in This Doc

- **Pricing model.** Tier definitions, monthly vs annual, free trial — business decisions for Owen.
- **License-key management UI.** The customer-facing `/settings/api-keys` portal is a `genie-ai-web` workstream.
- **Pilot plugin conversion.** No plugin in `mbg-library` currently uses this pattern. Pick a pilot (recommended: `tax-and-audit`) when ready.
- **Migration of inline SKILL.md math into MCP tools.** For any plugin to become premium, its proprietary parts must move from markdown into server-side TypeScript. Real engineering work, deferred until pilot is picked.
- **OAuth 2.1 server build.** Option B requires standing up an OAuth authorization server. Use Auth0 / Supabase Auth / Firebase Auth, OR roll your own per MCP spec.
