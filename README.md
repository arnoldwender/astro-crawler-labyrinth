# Astro Crawler Labyrinth

[![CI](https://github.com/arnoldwender/astro-crawler-labyrinth/actions/workflows/ci.yml/badge.svg)](https://github.com/arnoldwender/astro-crawler-labyrinth/actions/workflows/ci.yml)

**Local deterministic crawler honeypot integration, accessible-inert `<CrawlerTrap />` component, and Web-standard Edge/SSR quarantine handler for Astro.**

Built by [Arnold Wender](https://arnoldwender.com).

---

## Why This Exists

Aggressive AI training scrapers routinely ignore `robots.txt` and traverse every `<a href>` they extract from HTML. Blocking by static User-Agent lists alone misses spoofed scrapers, while third-party bot-mitigation SaaS proxies add latency and send visitor metadata off-site.

`astro-crawler-labyrinth` keeps the entire defense deterministic, local, and reversible inside your Astro build and Edge/SSR runtime:

1. **Disallowed Entry Bait (`<CrawlerTrap />`):** Renders a native `hidden` + `aria-hidden="true"` anchor pointing at `/${routePrefix}/<signed-token>/` with `tabindex="-1"` and `rel="nofollow noopener"`, keeping keyboard users, screen readers, and normal search indexing untouched.
2. **RFC 9309 Multi-Group `robots.txt` Patching:** Injects `Disallow: /${routePrefix}/` into **every** `User-agent:` group (not only `*`) so bots with dedicated `User-agent:` + `Allow: /` blocks (such as `OAI-SearchBot` or `PerplexityBot`) stay bound by the disallow rule.
3. **Static Ring & Dynamic Decoy Generation:** Emits a bounded ring of deterministic archival HTML decoy pages during `astro:build:done` (always marked `noindex, nofollow, noarchive, nosnippet, noai, noimageai`) and can additionally serve Web-standard Edge/SSR decoys or strike-based HTTP `429`/`403` quarantines with `Retry-After`.
4. **Zero-Network & Privacy-Safe:** No external SaaS APIs, no AI calls, and no raw client IP storage—strike tracking uses daily rotating keyed SHA-256 HMAC digests (`hashClientIp`).

---

## Quick Start

### 1. Install

```bash
npm install astro-crawler-labyrinth
```

Requires **Node.js `>= 20.0.0`** and **Astro `5.x`, `6.x`, or `7.x`**.

### 2. Add the Integration (`astro.config.mjs`)

Set a strong secret via environment variable (`>= 16` characters) for HMAC token signing and daily IP digests:

```js
import { defineConfig } from 'astro/config';
import crawlerLabyrinth from 'astro-crawler-labyrinth';

export default defineConfig({
  integrations: [
    crawlerLabyrinth({
      routePrefix: 'crawler-trap',
      mode: 'hybrid',
      staticPages: 24,
      maxDepth: 8,
      linkCount: 1,
      strikeThreshold: 5,
      blockTtlMs: 6 * 60 * 60 * 1000,
      blockStatus: 429,
      patchRobots: true,
      stripFromSitemap: true,
      secret: process.env.CRAWLER_LABYRINTH_SECRET,
    }),
  ],
});
```

> **Note:** Build `<CrawlerTrap />` with `npm run build` compiled in the package first (published packages include `dist/`). Avoid leaving the built-in fallback `DEFAULT_SECRET` active on public production deployments; provide a unique 16+ character `secret`.

### 3. Place `<CrawlerTrap />` in a Layout Footer

```astro
---
import CrawlerTrap from 'astro-crawler-labyrinth/components/CrawlerTrap.astro';
---

<footer>
  <!-- your visible footer markup -->
  <CrawlerTrap />
</footer>
```

At build time (`astro:build:done`), `astro-crawler-labyrinth`:

- emits deterministic depth-1..`maxDepth` decoy HTML pages under `dist/${routePrefix}/<token>/index.html` matching `<CrawlerTrap />`,
- patches `dist/robots.txt` with `Disallow: /${routePrefix}/` across every `User-agent:` group (creating a minimal `robots.txt` if none exists),
- strips any matching `/${routePrefix}/...` entries from top-level `dist/sitemap*.xml` files.

---

## Architecture & Usage Modes

### Static SSG Mode (Default)

Ideal for pure static sites (Netlify, Cloudflare Pages, Apache/Nginx, static buckets):

- `enableSsrEndpoint: false` (default) adds zero server dependencies.
- Non-compliant crawlers entering `/crawler-trap/<token>/` cycle through the bounded `staticPages` ring of interlinked `noindex, nofollow, noai` documents instead of hammering expensive content routes or origin functions.

### Astro SSR Endpoint & Middleware (`enableSsrEndpoint: true`)

For server-rendered or hybrid Astro apps, enabling `enableSsrEndpoint: true` injects:

- route `/${routePrefix}/[...slug]` (`astro-crawler-labyrinth/endpoint`), and
- pre-order middleware (`astro-crawler-labyrinth/middleware`) backed by `createEdgeLabyrinthHandler`.

In `hybrid` mode (default), requests to `/${routePrefix}/` (or optional training-only User-Agents when `interceptTrainingBots: true`) receive deterministic decoy documents for strikes `1..strikeThreshold`, then trigger HTTP `429` (with `Retry-After`) or `403` for the remainder of `blockTtlMs`.

### Standalone Web-Standard Edge Handler (`astro-crawler-labyrinth/edge`)

Use `createEdgeLabyrinthHandler` directly in Netlify Edge Functions, Cloudflare Workers, Deno, or custom Fetch servers:

```ts
import { createEdgeLabyrinthHandler } from 'astro-crawler-labyrinth/edge';

const labyrinth = createEdgeLabyrinthHandler({
  routePrefix: 'crawler-trap',
  mode: 'hybrid',
  strikeThreshold: 5,
  blockStatus: 429,
  secret: process.env.CRAWLER_LABYRINTH_SECRET,
  onViolation: (event) => {
    // `event.ipDigest` is a 64-char daily keyed HMAC-SHA256 hex digest (never raw IP).
    console.info(event.actionTaken, event.routeToken, event.status);
  },
});

export default async (request: Request, context: { next: () => Promise<Response>; ip?: string }) => {
  const blockedOrDecoy = await labyrinth(request, context.ip);
  if (blockedOrDecoy) {
    return blockedOrDecoy;
  }
  return context.next();
};
```

> **In-memory quarantine note:** `QuarantineStore` uses an in-memory bounded LRU map (`maxEntries = 4096` by default). Across multiple isolated serverless isolates or cold starts, each isolate tracks strikes independently; wire `onViolation` to an external KV store or edge firewall rule if you need global synchronization.

---

## Configuration Reference (`LabyrinthOptions`)

| Option | Type | Default | Constraints & Behavior |
| :--- | :--- | :--- | :--- |
| `routePrefix` | `string` | `'crawler-trap'` | 3–32 chars (`[a-z0-9_-]`); reserved paths (`_astro`, `_assets`, `api`, `media`, `well-known`, `robots`, `sitemap`, `favicon`, `admin`) fall back to `'crawler-trap'`. |
| `mode` | `'hybrid' \| 'labyrinth' \| 'block'` | `'hybrid'` | `hybrid`: serve decoys up to `strikeThreshold`, then block. `labyrinth`: always serve decoys. `block`: quarantine on strike 1. |
| `format` | `'html' \| 'plain'` | `'html'` | Response body format for Edge/SSR decoys (SSG always emits HTML documents). |
| `secret` | `string` | `DEFAULT_SECRET` | Minimum 16 characters required; shorter values fall back to default seed. |
| `staticPages` | `number` | `24` | Clamped to `4..256` decoy pages generated on `astro:build:done`. |
| `maxDepth` | `number` | `8` | Clamped to `1..16`; tokens wrap back to depth `1`. |
| `linkCount` | `number` | `1` | Clamped to `1..5`; number of default bait links emitted by `<CrawlerTrap />`. |
| `strikeThreshold` | `number` | `5` | Clamped to `1..100`; decoys served before quarantine in `hybrid` mode. |
| `blockTtlMs` | `number` | `21600000` (6h) | Clamped to `60_000..604_800_000` (1m to 7d). Sets `Retry-After` on HTTP `429`. |
| `blockStatus` | `429 \| 403` | `429` | HTTP status code sent during quarantine. |
| `patchRobots` | `boolean` | `true` | Injects `Disallow: /<routePrefix>/` across all `User-agent` groups in `dist/robots.txt`. |
| `contentSignal` | `boolean` | `false` | Appends `Content-Signal: search=yes, ai-train=no` to `User-agent: *` when patching `robots.txt`. |
| `interceptTrainingBots` | `boolean` | `false` | Opt-in UA check for Edge/SSR mode (`GPTBot`, `CCBot`, `ClaudeBot`, `Bytespider`, `Scrapy`, etc.), strictly sparing search/citation bots first. |
| `enableSsrEndpoint` | `boolean` | `false` | Injects `/${routePrefix}/[...slug]` endpoint + `pre` middleware during `astro:config:setup`. |
| `stripFromSitemap` | `boolean` | `true` | Removes matching `/<routePrefix>/` `<url>` blocks from top-level `dist/sitemap*.xml`. |
| `entrySeed` | `string` | `'archroot0001'` | Sanitized alphanumeric seed (`4..24` chars) for deterministic bait tokens. |
| `onViolation` | `(event: TrapViolationEvent) => void \| Promise<void>` | `undefined` | Optional telemetry hook invoked with masked `ipDigest` and violation metadata. |

---

## Search & Citation Crawler Safety

When `interceptTrainingBots` is enabled—or when checking `isTrainingOnlyUserAgent()` directly—search, citation, and preview crawlers are evaluated **before** training-scraper tokens (`ALLOWED_SEARCH_UA_TOKENS` takes strict precedence):

- **Spared search/citation/preview crawlers:** `Googlebot`, `Bingbot`, `Applebot`, `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `MistralAI-User`, `Slackbot`, `Storebot-Google`, `DuckDuckBot`.
- **Trapped opt-in training/scraper tokens:** `GPTBot`, `CCBot`, `ClaudeBot`, `anthropic-ai`, `Bytespider`, `PetalBot`, `Diffbot`, `Omgilibot`, `ImagesiftBot`, `DataForSeoBot`, `Scrapy`.

Any crawler—regardless of User-Agent—that intentionally ignores `Disallow: /<routePrefix>/` in `robots.txt` and follows the inert trap link enters the labyrinth.

---

## Development & Documentation

```bash
npm install
npm run typecheck
npm run build
npm test
```

- [Architecture Guide](docs/ARCHITECTURE.md) — module boundaries, HMAC token grammar, RFC 9309 state machine, and Edge/SSG data flow.
- [Developer Guide](docs/DEVELOPER-GUIDE.md) — exported API surface, testing strategy, build verification, and release workflow.
- [Contributing](CONTRIBUTING.md) — pull request requirements and coding standards.
- [Security Policy](SECURITY.md) — cryptographic design choices and private vulnerability reporting.
- [Code of Conduct](CODE_OF_CONDUCT.md) — community participation standards.
- [Changelog](CHANGELOG.md) — release history.

---

## Companion WordPress Implementation

Looking for the WordPress counterpart sharing the same RFC 9309, accessible-inert bait, and HMAC-signed token design? See [crawler-labyrinth](https://github.com/arnoldwender/crawler-labyrinth).

---

## License

Licensed under the [Arnold Wender Source License, Version 1.0](LICENSE) (`LicenseRef-Arnold-Wender-Source-1.0`). Commercial and non-commercial use, modification, and redistribution are permitted under the conditions in [LICENSE](LICENSE).
