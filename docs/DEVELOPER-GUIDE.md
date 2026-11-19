# Developer Guide

This guide covers building, extending, testing, and releasing `astro-crawler-labyrinth`.

---

## Prerequisites

- **Node.js:** `>= 20.0.0` (tested on Node `22.x` in CI) with built-in WebCrypto (`globalThis.crypto.subtle`).
- **npm:** `>= 10.x`
- **Peer dependency (for integration/E2E testing):** Astro `^5.0.0 || ^6.0.0 || ^7.x` (devDependency pinned to `astro@^7.4.13` in `package.json`).

---

## Local Development Workflow

```bash
git clone https://github.com/arnoldwender/astro-crawler-labyrinth.git
cd astro-crawler-labyrinth
npm install
```

### Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run typecheck` | Run strict TypeScript checking (`tsc --noEmit`). |
| `npm run build` | Compile `src/*.ts` to ES modules + `.d.ts` declarations in `dist/`. |
| `npm test` | Run the full Vitest suite (`test/labyrinth.test.ts`), including an end-to-end Astro CLI build. |
| `npm run test:mutations` | Run source-level mutation checks (`scripts/run-mutations.mjs`) and confirm every mutant fails tests or typecheck. |
| `npm pack --dry-run` | Verify exact files included in the distributable npm tarball (`files` allowlist). |

> **Important:** Because `components/CrawlerTrap.astro` imports from `../dist/bait.js` and `../dist/types.js`, always run `npm run build` before `npm test` after modifying files in `src/`.

---

## TypeScript Standards

`tsconfig.json` enforces:

- `"strict": true`
- `"noUncheckedIndexedAccess": true`
- `"noUnusedLocals": true`
- `"noImplicitReturns": true`
- `"verbatimModuleSyntax": true`

Follow these conventions when contributing:

- Use explicit `.js` extensions on relative ESM imports inside `src/` (required by `"module": "ES2022"` + `"moduleResolution": "bundler"`).
- Keep all external network calls out of the codebase—`src/` relies exclusively on standard Web APIs (`Request`, `Response`, `Headers`, `URL`, `TextEncoder`, `crypto.subtle`) plus `node:fs/promises` / `node:path` / `node:url` solely inside `src/integration.ts`.
- Keep all options and event objects `readonly` at the type level (`src/types.ts`).

---

## Exported Entry Points (`package.json`)

| Import Path | Target | Environment |
| :--- | :--- | :--- |
| `astro-crawler-labyrinth` | `./dist/index.js` | Node / Astro integration / shared helpers |
| `astro-crawler-labyrinth/components/CrawlerTrap.astro` | `./components/CrawlerTrap.astro` | Astro templates (`.astro`) |
| `astro-crawler-labyrinth/edge` | `./dist/edge.js` | Edge Workers / Deno / Fetch runtimes (no `node:fs` import) |
| `astro-crawler-labyrinth/middleware` | `./dist/middleware.js` | Astro SSR `src/middleware.ts` or injected `pre` middleware |
| `astro-crawler-labyrinth/endpoint` | `./dist/endpoint.js` | Astro SSR dynamic endpoint `[...slug]` |

When writing Edge Workers (Cloudflare Workers, Netlify Edge Functions, Deno Deploy), import from `astro-crawler-labyrinth/edge` so `node:fs/promises` from `src/integration.ts` is never pulled into your edge bundle.

---

## Test Suite Breakdown (`test/labyrinth.test.ts`)

1. **Config & User-Agent Separation:** Verifies reserved route prefix rejection and confirms `ALLOWED_SEARCH_UA_TOKENS` take precedence over `TRAINING_ONLY_UA_TOKENS`.
2. **WebCrypto Signing & Privacy Hashing:** Tests HMAC roundtrip verification, single-character tampering rejection, and daily UTC rotation on `hashClientIp`.
3. **Deterministic Decoy Generator:** Asserts identical output across repeated invocations, `noindex, nofollow, noarchive, nosnippet, noai, noimageai`, absence of `<script>`, and ring wrap-around at `maxDepth`.
4. **RFC 9309 `robots.txt` & Sitemap XML Sanitization:** Verifies idempotent multi-group `Disallow:` injection (`OAI-SearchBot`, `GPTBot`, `*`), optional `Content-Signal`, and `<url>` stripping from sitemap XML.
5. **Edge Handler, Quarantine Store, SSR Endpoint & Middleware:** Verifies bounded LRU eviction at capacity (`64`), excluded path passthrough, search bot passthrough, strike `1..strikeThreshold` -> `200` -> `429` + `Retry-After`, IP digest masking in `onViolation`, middleware `next()` delegation, and endpoint `404` `noindex` fallback.
6. **End-to-End Astro SSG Build:** Creates a disposable temporary Astro project in `os.tmpdir()`, invokes `astro build`, and asserts rendered `<CrawlerTrap />` accessibility attributes, matching generated `dist/crawler-trap/<token>/index.html` targets, patched `dist/robots.txt`, and sanitized `dist/sitemap-0.xml`.

---

## Release Checklist

1. Ensure `npm run typecheck`, `npm run build`, `npm test`, and `npm run test:mutations` pass cleanly on Linux/macOS Node 20/22.
2. Inspect `npm pack --dry-run` to confirm only `dist/`, `components/`, `README.md`, `CHANGELOG.md`, and `LICENSE` ship in the tarball.
3. Update `CHANGELOG.md` and `package.json` `"version"` following SemVer.
4. Open a pull request targeting `main` and confirm GitHub Actions CI (`CI / Typecheck, Build, Test & Pack`) passes cleanly.
