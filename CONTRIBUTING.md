# Contributing to Astro Crawler Labyrinth

Contributions that improve correctness, runtime compatibility, accessibility, or test coverage are welcome.

---

## Development Setup

1. Fork the repository and create a branch from `main` (for example `fix/robots-group-edge-case` or `feat/custom-header-hook`).
2. Install dependencies with Node.js `>= 20.0.0`:
   ```bash
   npm install
   npm run typecheck
   npm run build
   npm test
   ```
3. Add or update unit/integration tests in `test/labyrinth.test.ts` covering your change.

---

## Pull Request Guidelines

- Keep PRs focused on a single bug fix or enhancement.
- Ensure `npm run typecheck`, `npm run build`, `npm test`, and `npm pack --dry-run` succeed without warnings or skipped tests.
- Preserve Web-standard runtime compatibility inside `src/edge.ts`, `src/crypto.ts`, `src/generator.ts`, `src/quarantine.ts`, `src/robots.ts`, `src/bait.ts`, and `src/config.ts` (avoid adding Node-only APIs outside `src/integration.ts`).
- Do **not** store raw client IP addresses, commit secrets/API keys, or block search/citation crawlers in default configurations.
- Update `README.md`, `docs/`, or `CHANGELOG.md` whenever behavior, options, or exported types change.

---

## Licensing of Contributions

By submitting a pull request or patch to this repository, you agree that your contributions will be licensed under the [MIT License](LICENSE).
