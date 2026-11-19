# Changelog

All notable changes to `astro-crawler-labyrinth` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
