# Changelog

All notable changes to `astro-crawler-labyrinth` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-11-24

### Fixed
- **O(1) Hot-Path Short-Circuit & Bounded UTC Midnight Rollover (`QuarantineStore`, `edge.ts`):** Added `hasActiveQuarantines()` so normal human traffic executes `0` WebCrypto calls when no bans are active or expired (and in `observe` mode). Added bounded `1..7`-day UTC lookback (`ceil(blockTtlMs / 86_400_000)`) so bans survive `00:00 UTC` cleanly.
- **SSR Shared `QuarantineStore` & Lazy Config Resolution (`edge.ts`, `endpoint.ts`, `types.ts`):** Shares a default `QuarantineStore` and lazily resolves integration config across module-level `middleware.ts` and `endpoint.ts`, exports `ALL = GET`, and adds optional `store` injection on `EdgeLabyrinthOptions`.
- **`observe` Dry-Run Parity (`edge.ts`):** Prevents `HTTP 429 burst-shed` responses in `mode === 'observe'`.
- **Extended Trap Probe Matching (`edge.ts`):** Captures multi-segment paths, `.html` suffixes, newline tails (`[\s\S]*`), and `>96`-char probes under `/<routePrefix>/...` as `robots_probe` while preserving sibling-prefix exclusions.
- **RFC 9309 `robots.txt` Continuity (`robots.ts`):** Maintains active `User-agent:` group state across blank lines and mid-group `Sitemap:` lines without duplicating `Disallow: /<prefix>/`, while flushing empty `User-agent:` blocks cleanly.
- **Strict IP Validation & Single-Header Proxy Pinning (`crypto.ts`, `config.ts`, `edge.ts`, `integration.ts`):** Rejects non-IP strings in `normalizeClientIp()` (`""`) and adds `trustedProxyHeader` to restrict proxy extraction to one vetted header against multi-CDN spoofing.
- **SSR Telemetry Warning (`integration.ts`, docs):** Logs an explicit warning when `enableSsrEndpoint: true` is paired with non-serializable `onViolation`.

### Added
- Expanded Vitest regression suite (`20 passed (20)`) and mutation suite (`40/40 killed`).

## [1.1.0] - 2026-11-23

### Added
- **Dry-Run `observe` Mode:** Accepts `mode: 'observe'` to serve deterministic decoys and emit `'observed'` `TrapViolationEvent` notifications (`X-Crawler-Labyrinth: observed`) without triggering `429`/`403` quarantines.
- **Global Burst Circuit Breaker (`burstLimitPerMinute`):** Protects SSR/Edge instances and bounds `QuarantineStore` growth during multi-IP floods by shedding excess trap requests per 60-second bucket with HTTP `429` (`Retry-After: 60`, `X-Crawler-Labyrinth: burst-shed`, `actionTaken: 'burst_shed'`). Default: `300`/min (`0` disables).
- **Entry Vector Telemetry (`entryVector`):** Tags `TrapViolationEvent` notifications as `'signed_bait'`, `'robots_probe'`, or `'ua_guard'`.
- **`X-Crawler-Labyrinth` Response Header & `renderCrawlerBaitHtml` Helper:** Emits `decoy`, `quarantined`, `observed`, or `burst-shed` headers for upstream reverse-proxy observability, and exports `renderCrawlerBaitHtml()` for generating the matching `hidden inert` bait container as an HTML string.
- **Package Discovery & Optional Peer Metadata:** Added `"peerDependenciesMeta"` (`astro` optional for standalone edge users) and expanded npm `keywords`.

## [1.0.3] - 2026-11-23

### Changed
- `README.md` no longer claims without a source that AI scrapers routinely ignore `robots.txt`; it quotes RFC 9309 ("These rules are not a form of access authorization") and notes the agentic workflow. `SUPPORT.md` section 4 adds that decoy pages, `robots.txt` patches and telemetry hooks are not legal, security or compliance advice.
- Corrected a comment in `src/robots.ts`: RFC 9309 section 2.1 ends a group at the next `user-agent` line or end of file, not at a blank line. Behaviour is unchanged.

## [1.0.2] - 2026-11-19

### Fixed
- **Fail-Closed Client-Bundle Guard:** Updated the Vite `transform` hook in `src/integration.ts` to fail closed unless the environment is explicitly SSR/prerender or `transformOptions?.ssr === true`, preventing runtime secret exposure in client bundles while suppressing static decoy HTML writes when `enableSsrEndpoint: true`.
- **Subpath (`basePath`) & `trailingSlash` Routing:** Updated `components/CrawlerTrap.astro`, `src/config.ts`, `src/bait.ts`, `src/generator.ts`, `src/edge.ts`, and `src/endpoint.ts` so `<CrawlerTrap />` respects integration `basePath` precedence over `BASE_URL` and preserves `trailingSlash` semantics across static decoys and SSR `GET`/`HEAD` responses.
- **Trusted Proxy Headers & Keyed IP Normalization:** Restricted `cf-connecting-ip`, `x-nf-client-connection-ip`, `x-real-ip`, and `x-forwarded-for` parsing behind opt-in `trustProxyHeaders` (default `false`), bypassed `QuarantineStore` for non-identifiable IPs, and added RFC 5952 IPv6 canonicalization plus IPv4-mapped IPv6 extraction.
- **Quarantine LRU Protection & Robots/Sitemap Parsing:** Guarded `QuarantineStore` against non-finite `maxEntries`, protected active bans from eviction by unquarantined entries, preserved RFC 9309 path case sensitivity in `patchRobotsTxt`, and extended `stripTrapFromSitemapXml` for `<loc xml:lang>`, `CDATA`, and percent-encoded paths.
- **Seed Canonicalization Parity:** Added an archival fallback (`archroot0001`) when sanitized seed inputs strip down to an empty string and aligned seed length normalization across generator and signer helpers.

### Changed
- Expanded `test/labyrinth.test.ts` to 13 tests and `scripts/run-mutations.mjs` to 24 mutation probes (24/24 killed), and aligned `README.md`, `SECURITY.md`, and `docs/ARCHITECTURE.md` with runtime defaults and endpoint behavior.

## [1.0.1] - 2026-11-19

### Changed
- Added explicit zero-support, GitHub-Issues-only bug reporting, no-private-support, and no-warranty / zero-liability ("AS IS") terms across `SUPPORT.md`, `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `.github/ISSUE_TEMPLATE/*` (removing author-website contact links from `SECURITY.md` and `config.yml`).

## [1.0.0] - 2026-11-19

### Added
- Astro integration (`crawlerLabyrinth`) emitting a deterministic bounded static decoy ring (`emitStaticLabyrinth`), patching all RFC 9309 `User-agent:` groups in `robots.txt` (`patchRobotsTxt`), and stripping matching trap URLs from top-level `sitemap*.xml` (`stripTrapFromSitemapXml`) during `astro:build:done`.
- Accessible-inert `<CrawlerTrap />` component (`components/CrawlerTrap.astro`) using `hidden`, `aria-hidden="true"`, `tabindex="-1"`, `rel="nofollow noopener"`, and `data-crawler-labyrinth="1"`.
- WebCrypto HMAC-SHA256 trap token signing/verification with constant-time comparison (`timingSafeEqualHex`) and daily keyed client-IP digesting (`hashClientIp`).
- Standalone Web-standard Edge handler (`createEdgeLabyrinthHandler`), bounded LRU `QuarantineStore`, Astro SSR `createLabyrinthMiddleware`, and `createLabyrinthEndpoint` for `enableSsrEndpoint: true`.
- Full TypeScript unit suite and end-to-end Astro SSG build test under Vitest (`test/labyrinth.test.ts`).
- GitHub Actions CI workflow, issue/PR templates, and complete public documentation (`README.md`, `docs/ARCHITECTURE.md`, `docs/DEVELOPER-GUIDE.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`).
- Released under the MIT License.
