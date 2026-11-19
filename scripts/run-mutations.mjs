import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = process.cwd();
const MUTATIONS = [
  {
    name: 'timingSafeEqualHex falls back to non-constant-time ===',
    file: 'src/crypto.ts',
    find: '  let diff = 0;\n  for (let i = 0; i < a.length; i++) {\n    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);\n  }\n  return diff === 0;',
    replace: '  return a === b;',
  },
  {
    name: 'ALLOWED_SEARCH_UA_TOKENS stops taking precedence over training bots',
    file: 'src/config.ts',
    find: '  for (const allowed of ALLOWED_SEARCH_UA_TOKENS) {',
    replace: '  for (const allowed of ([] as readonly string[])) { void ALLOWED_SEARCH_UA_TOKENS;',
  },
  {
    name: 'sanitizeRoutePrefix skips RESERVED_PREFIXES guard',
    file: 'src/config.ts',
    find: '  for (const reserved of RESERVED_PREFIXES) {',
    replace: '  for (const reserved of ([] as readonly string[])) { void RESERVED_PREFIXES;',
  },
  {
    name: 'DecoyGenerator drops noindex/noai robots meta directive',
    file: 'src/generator.ts',
    find: "    '<meta name=\"robots\" content=\"noindex, nofollow, noarchive, nosnippet, noai, noimageai\" />',",
    replace: "    '<meta name=\"robots\" content=\"index, follow\" />',",
  },
  {
    name: 'DecoyGenerator removes rel="nofollow noopener" from cross-reference links',
    file: 'src/generator.ts',
    find: '    lines.push(`<li><a href="${escapeHtml(href)}" rel="nofollow noopener">${escapeHtml(label)}</a></li>`);',
    replace: '    lines.push(`<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`);',
  },
  {
    name: 'hashClientIp ignores secret parameter',
    file: 'src/crypto.ts',
    find: '  return hmacSha256Hex(`${ip}|${day}`, secret);',
    replace: "  return hmacSha256Hex(`${ip}|${day}`, 'static-unkeyed-digest');",
  },
  {
    name: 'QuarantineStore disables TTL expiration check',
    file: 'src/quarantine.ts',
    find: '    if (rec.expiresAt <= nowMs) {\n      this.entries.delete(ipDigest);\n      return { quarantined: false, retryAfterSeconds: 0, strikes: 0 };\n    }\n    // Refresh insertion order for bounded LRU behavior.\n    this.entries.delete(ipDigest);\n    this.entries.set(ipDigest, rec);\n\n    if (rec.quarantinedUntil > nowMs) {',
    replace: '    if (false) {\n      this.entries.delete(ipDigest);\n      return { quarantined: false, retryAfterSeconds: 0, strikes: 0 };\n    }\n    // Refresh insertion order for bounded LRU behavior.\n    this.entries.delete(ipDigest);\n    this.entries.set(ipDigest, rec);\n\n    if (rec.quarantinedUntil > 0) {',
  },
  {
    name: 'QuarantineStore stops protecting active bans during overflow eviction',
    file: 'src/quarantine.ts',
    find: '    if (this.entries.size >= this.maxEntries) {\n      for (const [key, value] of this.entries) {',
    replace: '    if (false) {\n      for (const [key, value] of this.entries) {',
  },
  {
    name: 'QuarantineStore ignores mode === block',
    file: 'src/quarantine.ts',
    find: "    const shouldQuarantine = mode === 'block' || (mode === 'hybrid' && strikes > strikeThreshold);",
    replace: "    const shouldQuarantine = mode === 'hybrid' && strikes > strikeThreshold;",
  },
  {
    name: 'QuarantineStore allows mode === labyrinth to quarantine past threshold',
    file: 'src/quarantine.ts',
    find: "    const shouldQuarantine = mode === 'block' || (mode === 'hybrid' && strikes > strikeThreshold);",
    replace: "    const shouldQuarantine = mode === 'block' || strikes > strikeThreshold;",
  },
  {
    name: 'Edge handler leaks raw IP in quarantined onViolation telemetry',
    file: 'src/edge.ts',
    find: '      await notify({\n        timestamp: new Date().toISOString(),\n        ipDigest,',
    replace: "      await notify({\n        timestamp: new Date().toISOString(),\n        ipDigest: extractedIp ?? '0.0.0.0',",
  },
  {
    name: 'Edge handler skips interceptTrainingBots check',
    file: 'src/edge.ts',
    find: '    const uaMatched = !trapMatch && base.interceptTrainingBots && isTrainingOnlyUserAgent(userAgent);',
    replace: '    const uaMatched = false;',
  },
  {
    name: 'Edge handler forces 429 instead of configured 403 blockStatus',
    file: 'src/edge.ts',
    find: '      return buildBlockResponse(base.blockStatus, outcome.retryAfterSeconds, isHead);',
    replace: '      return buildBlockResponse(429, outcome.retryAfterSeconds, isHead);',
  },
  {
    name: 'Edge handler strips excludedPrefixes protection',
    file: 'src/edge.ts',
    find: '      if (isExcludedPath(lowerPath, excludedPrefixes) || isExcludedPath(relLower, excludedPrefixes)) {',
    replace: '      void relLower; if (false) {',
  },
  {
    name: 'patchRobotsTxt breaks stacked User-agent group inheritance',
    file: 'src/robots.ts',
    find: '      if (inGroup && hasNonUaDirective) {',
    replace: '      if (inGroup) {',
  },
  {
    name: 'CrawlerTrap drops native hidden attribute',
    file: 'components/CrawlerTrap.astro',
    find: '<div hidden inert aria-hidden="true" data-crawler-labyrinth="1">',
    replace: '<div inert aria-hidden="true" data-crawler-labyrinth="1">',
  },
  {
    name: 'timingSafeEqualHex drops length-equality guard allowing prefix matches',
    file: 'src/crypto.ts',
    find: '  if (a.length !== b.length || a.length === 0) {',
    replace: '  if (a.length === 0 || b.length === 0) {',
  },
  {
    name: 'QuarantineStore skips Pass 1 expired cleanup inside evictOldest',
    file: 'src/quarantine.ts',
    find: '  private evictOldest(nowMs: number): void {\n    for (const [key, value] of this.entries) {\n      if (value.expiresAt <= nowMs) {\n        this.entries.delete(key);\n      }\n    }',
    replace: '  private evictOldest(nowMs: number): void {',
  },
  {
    name: 'QuarantineStore stops refreshing LRU order inside isQuarantined',
    file: 'src/quarantine.ts',
    find: '    // Refresh insertion order for bounded LRU behavior.\n    this.entries.delete(ipDigest);\n    this.entries.set(ipDigest, rec);',
    replace: '    // LRU refresh disabled.',
  },
  {
    name: 'Edge handler emits non-empty body on HEAD block response',
    file: 'src/edge.ts',
    find: '  return new Response(isHead ? null : `${message}\\n`, {',
    replace: '  return new Response(`${message}\\n`, {',
  },
  {
    name: 'Edge handler accepts tokens deeper than configured maxDepth',
    file: 'src/edge.ts',
    find: '    const parsed = verified && verified.depth <= base.maxDepth ? verified : null;',
    replace: '    const parsed = verified;',
  },
  {
    name: 'Endpoint emits Not Found body on HEAD 404 misses',
    file: 'src/endpoint.ts',
    find: "    return new Response(isHead ? null : 'Not Found', {",
    replace: "    return new Response('Not Found', {",
  },
  {
    name: 'Integration fails to warn when SSR uses DEFAULT_SECRET',
    file: 'src/integration.ts',
    find: '        if (activeConfig.enableSsrEndpoint && activeConfig.usesDefaultSecret) {',
    replace: '        if (false && activeConfig.enableSsrEndpoint && activeConfig.usesDefaultSecret) {',
  },
  {
    name: 'Integration Vite transform leaks serialized secret to client bundles',
    file: 'src/integration.ts',
    find: "            if (\n              transformOptions?.ssr === false ||\n              this.environment?.name === 'client' ||\n              (!this.environment && transformOptions?.ssr !== true)\n            ) {",
    replace: '            if (false) {',
  },
];

function createWorkspaceCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'astro-labyrinth-mut-'));
  for (const item of ['package.json', 'tsconfig.json', 'src', 'components', 'test']) {
    cpSync(join(repoRoot, item), join(dir, item), { recursive: true });
  }
  symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}

function runSuite(dir) {
  execFileSync(resolve(dir, 'node_modules/.bin/tsc'), [], { cwd: dir, stdio: 'pipe' });
  execFileSync(resolve(dir, 'node_modules/.bin/vitest'), ['run'], { cwd: dir, stdio: 'pipe' });
}

const work = createWorkspaceCopy();
let survived = 0;

try {
  runSuite(work);
  console.log(`CONTROL      unmutated copy green (${MUTATIONS.length} mutants armed)`);

  for (const mutation of MUTATIONS) {
    const absFile = join(work, mutation.file);
    const original = readFileSync(absFile, 'utf8');
    if (!original.includes(mutation.find)) {
      throw new Error(`Mutation anchor not found in ${mutation.file}: ${mutation.name}`);
    }
    writeFileSync(absFile, original.replace(mutation.find, mutation.replace), 'utf8');
    let killed = false;
    try {
      runSuite(work);
    } catch {
      killed = true;
    } finally {
      writeFileSync(absFile, original, 'utf8');
    }

    if (killed) {
      console.log(`RED          ${mutation.name}`);
    } else {
      survived++;
      console.log(`SURVIVED!    ${mutation.name}`);
    }
  }

  console.log(`Summary: ${MUTATIONS.length - survived}/${MUTATIONS.length} killed, ${survived} survived.`);
  if (survived > 0) {
    process.exitCode = 1;
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
