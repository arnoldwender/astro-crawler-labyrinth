# Changelog

All notable changes to `astro-crawler-labyrinth` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
