# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.x` | Yes |

---

## Security & Privacy Model

- **Timing-safe HMAC verification:** Trap tokens use WebCrypto HMAC-SHA256 (`verifyTrapToken`) compared through constant-time XOR accumulation (`timingSafeEqualHex`).
- **Secret configuration requirement:** `resolveConfig` falls back to `DEFAULT_SECRET` if `secret` is omitted or shorter than 16 characters. Always configure a unique cryptographic secret via environment variables in production so third parties cannot precompute valid depth-1..16 tokens.
- **No raw IP persistence:** Client IPs are immediately transformed into a daily UTC salted HMAC digest (`hashClientIp`) before hitting `QuarantineStore` keys or `onViolation` callbacks.
- **Zero `<script>` execution in decoys:** Generated decoy HTML contains semantic markup, meta robot directives (`noindex, nofollow, noarchive, nosnippet, noai, noimageai`), escaped text, and archival links—no scripts, forms, or cookies.
- **Trusted proxy headers notice:** `extractClientIp` inspects `cf-connecting-ip`, `x-nf-client-connection-ip`, and the first `x-forwarded-for` entry when `clientIp` is not passed explicitly. Ensure your hosting layer strips or overwrites spoofed client headers at the edge before forwarding requests.

---

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities, and **do not** send private vulnerability inquiries via email, `arnoldwender.com`, or direct messages (private channels are unmonitored for support).

Instead, submit a private report **exclusively** via [GitHub Security Advisories](https://github.com/arnoldwender/astro-crawler-labyrinth/security/advisories/new).

Include:

- Affected module/version and runtime (`Static SSG`, `Astro SSR`, or `Edge`).
- Minimal steps or request payload to reproduce the issue.
- Potential impact (such as token forgery, cache poisoning, quarantine bypass, or PII exposure).

This project carries **zero technical or user support** and zero SLA. Reports submitted via GitHub Security Advisories are reviewed strictly on a best-effort basis without warranty, response obligation, or author liability ("AS IS" under [LICENSE](LICENSE)).
