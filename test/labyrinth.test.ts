import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
import {
  buildBaitLinks,
  createEdgeLabyrinthHandler,
  createLabyrinthEndpoint,
  createLabyrinthMiddleware,
  emitStaticLabyrinth,
  generateDecoyDocument,
  hashClientIp,
  isTrainingOnlyUserAgent,
  normalizeClientIp,
  patchRobotsTxt,
  QuarantineStore,
  resolveConfig,
  sanitizeRoutePrefix,
  signTrapToken,
  stripTrapFromSitemapXml,
  timingSafeEqualHex,
  verifyTrapToken,
} from '../src/index.js';
import type { TrapViolationEvent } from '../src/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('Config & User-Agent Separation', () => {
  it('sanitizes reserved, punctuation, and underscore-only prefixes cleanly while preserving valid stems', () => {
    expect(sanitizeRoutePrefix('_astro')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('_assets')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('robots.txt')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('___')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('api-v2')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('apis')).toBe('apis');
    expect(sanitizeRoutePrefix('apiv2')).toBe('apiv2');
    expect(sanitizeRoutePrefix('/Decoy_Vault-01/')).toBe('decoy_vault-01');
    expect(sanitizeRoutePrefix('a')).toBe('crawler-trap');
  });

  it('matches training-only scrapers while explicitly sparing search, citation, and preview bots', () => {
    expect(isTrainingOnlyUserAgent('Mozilla/5.0 AppleWebKit/537.36 (compatible; GPTBot/1.2)')).toBe(true);
    expect(isTrainingOnlyUserAgent('CCBot/2.0 (https://commoncrawl.org/faq/)')).toBe(true);
    expect(isTrainingOnlyUserAgent('ClaudeBot/1.0')).toBe(true);
    expect(isTrainingOnlyUserAgent('Bytespider')).toBe(true);

    expect(isTrainingOnlyUserAgent('OAI-SearchBot/1.0')).toBe(false);
    expect(isTrainingOnlyUserAgent('OAI-SearchBot/1.0 (compatible; GPTBot-bridge)')).toBe(false);
    expect(isTrainingOnlyUserAgent('Claude-SearchBot/1.0')).toBe(false);
    expect(isTrainingOnlyUserAgent('PerplexityBot/1.0')).toBe(false);
    expect(isTrainingOnlyUserAgent('Googlebot/2.1')).toBe(false);
    expect(isTrainingOnlyUserAgent('Applebot/0.1')).toBe(false);
    expect(isTrainingOnlyUserAgent('Slackbot-LinkExpanding 1.0')).toBe(false);
  });

  it('clamps non-finite bait counts and formats basePath + trailingSlash deterministically', async () => {
    const links = await buildBaitLinks({
      secret: 'unit-fixture-bait-key-not-secret',
      routePrefix: 'my-trap',
      basePath: '/docs/',
      trailingSlash: 'never',
      count: Number.NaN,
    });
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toMatch(/^\/docs\/my-trap\/1-[a-z0-9]{4,24}-[a-f0-9]{16}$/);
  });
});

describe('WebCrypto Token Signing & Privacy-Safe IP Hashing', () => {
  const secret = 'unit-fixture-hmac-key-not-secret';

  it('signs and verifies trap tokens using constant-time comparison and rejects tampering', async () => {
    const token = await signTrapToken(3, 'archfolio99', secret);
    const parsed = await verifyTrapToken(token, secret);
    expect(parsed).toEqual({ depth: 3, seed: 'archfolio99' });

    const flipped = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    expect(await verifyTrapToken(flipped, secret)).toBeNull();
    expect(await verifyTrapToken('2-seed-notvalid', secret)).toBeNull();

    expect(timingSafeEqualHex('a1b2c3d4e5f60708', 'a1b2c3d4e5f60708')).toBe(true);
    expect(timingSafeEqualHex('a1b2c3d4e5f60708', 'a1b2c3d4e5f60709')).toBe(false);
    expect(timingSafeEqualHex('', '')).toBe(false);

    // Pin constant-time bitwise accumulation in source so strict equality mutations cannot survive.
    const cryptoSource = await readFile(resolve(process.cwd(), 'src/crypto.ts'), 'utf8');
    expect(cryptoSource).toMatch(/charCodeAt\(/);
    expect(cryptoSource).toMatch(/diff\s*\|=\s*a\.charCodeAt/);
  });

  it('hashes normalized client IPs with secret keying and daily rotation without leaking raw IPs', async () => {
    const d1 = await hashClientIp('198.51.100.77', secret, '2026-11-19');
    const d2 = await hashClientIp('198.51.100.77', secret, '2026-11-20');
    const otherSecret = await hashClientIp('198.51.100.77', 'different-unit-fixture-secret-val', '2026-11-19');
    expect(d1).toHaveLength(64);
    expect(d1).not.toBe(d2);
    expect(d1).not.toBe(otherSecret);
    expect(d1).not.toContain('198.51.100');

    // IPv6 brackets, ports, case, and IPv4-mapped IPv6 normalize identically.
    expect(normalizeClientIp('[::1]:1234')).toBe('::1');
    expect(await hashClientIp('::1', secret, '2026-11-19')).toBe(
      await hashClientIp('[::1]:8443', secret, '2026-11-19'),
    );
    expect(await hashClientIp('2001:DB8::1', secret, '2026-11-19')).toBe(
      await hashClientIp('2001:db8::1', secret, '2026-11-19'),
    );
    expect(await hashClientIp('::ffff:192.0.2.9', secret, '2026-11-19')).toBe(
      await hashClientIp('192.0.2.9:443', secret, '2026-11-19'),
    );
  });
});

describe('Deterministic Decoy Generator', () => {
  const secret = 'unit-fixture-decoy-key-not-secret';

  it('generates identical archival HTML with noindex/noai, nofollow links, and basePath + trailingSlash support', async () => {
    const a = await generateDecoyDocument({
      depth: 4,
      seed: 'folio0001',
      secret,
      maxDepth: 4,
      linksPerPage: 2,
      basePath: '/docs',
      trailingSlash: 'never',
    });
    const b = await generateDecoyDocument({
      depth: 4,
      seed: 'folio0001',
      secret,
      maxDepth: 4,
      linksPerPage: 2,
      basePath: '/docs',
      trailingSlash: 'never',
    });

    expect(a.body).toBe(b.body);
    expect(a.body).toContain('noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    expect(a.body).toContain('rel="nofollow noopener"');
    expect(a.body).not.toContain('<script');
    expect(a.body).toContain(`href="/docs/crawler-trap/${a.childTokens[0]}`);
    expect(a.body).not.toContain(`href="/docs/crawler-trap/${a.childTokens[0]}/"`);
    expect(a.childTokens[0]?.startsWith('1-')).toBe(true);
    expect(await verifyTrapToken(a.childTokens[0] ?? '', secret)).not.toBeNull();
  });
});

describe('RFC 9309 robots.txt & Sitemap XML Sanitization', () => {
  it('injects Disallow into stacked, commented, blank-terminated, and CRLF groups idempotently', () => {
    const input = [
      'User-agent: OAI-SearchBot # search agent',
      'User-agent: Bingbot',
      'Allow: /',
      '',
      'User-agent: EmptyBot',
      '',
      'User-agent: GPTBot',
      'Disallow: /my-trap/ # already trapped',
      '',
      'User-agent: *',
      'Allow: /',
      'Sitemap: https://example.test/sitemap-index.xml',
      '',
    ].join('\r\n');

    const once = patchRobotsTxt(input, 'my-trap', { contentSignal: true, basePath: '/docs' });
    expect(once).toContain('\r\n');
    expect(once).toContain('Disallow: /docs/my-trap/');
    // Stacked OAI-SearchBot + Bingbot remains one group without Disallow splitting User-agent lines.
    expect(once).toContain('User-agent: OAI-SearchBot # search agent\r\nUser-agent: Bingbot\r\nAllow: /\r\nDisallow: /docs/my-trap/');
    // Empty group gets Disallow before blank line, and Disallow sits before Sitemap.
    expect(once).toContain('User-agent: EmptyBot\r\nDisallow: /docs/my-trap/');
    expect(once.indexOf('Content-Signal: search=yes, ai-train=no')).toBeLessThan(
      once.indexOf('Sitemap: https://example.test/sitemap-index.xml'),
    );

    const inlineCommentSameRule = [
      'User-agent: * # global',
      'Disallow: /docs/my-trap/ # existing',
      'Allow: /',
      '',
    ].join('\n');
    const commented = patchRobotsTxt(inlineCommentSameRule, 'my-trap', { contentSignal: true, basePath: '/docs' });
    expect(commented.match(/Disallow: \/docs\/my-trap\//g)).toHaveLength(1);
    expect(commented).toContain('Content-Signal: search=yes, ai-train=no');
    expect(patchRobotsTxt(commented, 'my-trap', { contentSignal: true, basePath: '/docs' })).toBe(commented);
  });

  it('removes trap URLs regardless of element order while preserving sibling path stems', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset>',
      '  <url><loc>https://example.test/about/</loc></url>',
      '  <url><loc>https://example.test/blog/my-trap/</loc></url>',
      '  <url><loc>https://example.test/docs/my-trap-guide/</loc></url>',
      '  <url><lastmod>2026-11-19</lastmod><loc>https://example.test/docs/my-trap/1-abc-123/</loc></url>',
      '</urlset>',
    ].join('\n');

    const cleaned = stripTrapFromSitemapXml(xml, 'my-trap', '/docs');
    expect(cleaned).toContain('https://example.test/about/');
    expect(cleaned).toContain('https://example.test/blog/my-trap/');
    expect(cleaned).toContain('https://example.test/docs/my-trap-guide/');
    expect(cleaned).not.toContain('1-abc-123');

    // When trap lives at root `/my-trap/`, paths under `/docs/my-trap/...` stay untouched.
    const rootCleaned = stripTrapFromSitemapXml(xml, 'my-trap');
    expect(rootCleaned).toContain('https://example.test/docs/my-trap/1-abc-123/');
  });
});

describe('Edge Handler, Quarantine Store, SSR Endpoint & Astro Middleware', () => {
  it('expires TTL entries, protects active quarantines from low-strike floods, and enforces all trap modes', () => {
    const store = new QuarantineStore(64);
    const ban = store.recordHit('banned-attacker', 'block', 5, 60_000, 1_000);
    expect(ban.quarantined).toBe(true);

    // Flood with 120 unquarantined low-strike entries
    for (let i = 0; i < 120; i++) {
      store.recordHit(`flood-${i}`, 'hybrid', 5, 60_000, 2_000 + i);
    }
    expect(store.size()).toBe(64);
    expect(store.isQuarantined('banned-attacker', 5_000).quarantined).toBe(true);
    // Once TTL expires, quarantine lifts cleanly
    expect(store.isQuarantined('banned-attacker', 70_000).quarantined).toBe(false);

    // Verify labyrinth mode never quarantines past strikeThreshold
    const labStore = new QuarantineStore(64);
    for (let s = 1; s <= 10; s++) {
      expect(labStore.recordHit('bot-lab', 'labyrinth', 2, 60_000, 1_000 + s).quarantined).toBe(false);
    }
  });

  it('enforces quarantine, 403 mode, segment exclusions, encoded paths, HEAD empty bodies, and safe error handling', async () => {
    const events: TrapViolationEvent[] = [];
    const handler = createEdgeLabyrinthHandler({
      routePrefix: 'apis',
      basePath: '/docs',
      trailingSlash: 'never',
      mode: 'hybrid',
      maxDepth: 4,
      strikeThreshold: 2,
      blockStatus: 429,
      blockTtlMs: 120_000,
      secret: 'unit-fixture-edge-key-not-secret',
      interceptTrainingBots: true,
      trustProxyHeaders: false,
      onViolation: (ev) => {
        events.push(ev);
      },
    });

    // Safe paths pass through as null
    expect(await handler(new Request('https://example.test/_astro/main.js'), '192.0.2.50')).toBeNull();
    expect(await handler(new Request('https://example.test/api/health'), '192.0.2.50')).toBeNull();
    expect(await handler(new Request('https://example.test/docs/robots.txt'), '192.0.2.50')).toBeNull();
    expect(
      await handler(
        new Request('https://example.test/docs/blog/', { headers: { 'user-agent': 'OAI-SearchBot/1.0' } }),
        '192.0.2.50',
      ),
    ).toBeNull();

    // Valid prefix `apis` is NOT shadowed by `/api`, and percent-encoded segments decode cleanly
    const r1 = await handler(new Request('https://example.test/docs/%61pis/1-seed0001-0000'), '192.0.2.88');
    expect(r1?.status).toBe(200);
    expect(r1?.headers.get('X-Robots-Tag')).toContain('noindex');

    // HEAD returns empty body with headers intact
    const headRes = await handler(new Request('https://example.test/docs/apis/2-seed0002-0000', { method: 'HEAD' }), '192.0.2.88');
    expect(headRes?.status).toBe(200);
    expect(await headRes?.text()).toBe('');

    // Strike 3 triggers quarantine 429 + Retry-After, and blocks subsequent ordinary routes
    const r3 = await handler(new Request('https://example.test/docs/apis/3-seed0003-0000'), '192.0.2.88');
    expect(r3?.status).toBe(429);
    expect(r3?.headers.get('Retry-After')).toBe('120');

    const r4 = await handler(new Request('https://example.test/docs/pricing/'), '192.0.2.88');
    expect(r4?.status).toBe(429);

    // Training scraper on normal page is intercepted while GPTBot is trapped
    const botRes = await handler(
      new Request('https://example.test/docs/pricing/', { headers: { 'user-agent': 'GPTBot/1.2' } }),
      '198.51.100.10',
    );
    expect(botRes?.status).toBe(200);
    expect(botRes?.headers.get('X-Robots-Tag')).toContain('noai');

    // Raw IP never leaks in either decoy_served or quarantined violation events
    expect(events).toHaveLength(4);
    expect(events[2]?.actionTaken).toBe('quarantined');
    for (const ev of events) {
      expect(ev.ipDigest).toHaveLength(64);
      expect(ev.ipDigest).not.toContain('192.0.2');
      expect(ev.ipDigest).not.toContain('198.51.100');
    }

    // Spoofed headers are ignored by default and IP-less trap hits never block unrelated IP-less requests
    const untrustedSpoof = await handler(
      new Request('https://example.test/docs/pricing/', { headers: { 'cf-connecting-ip': '192.0.2.88' } }),
    );
    expect(untrustedSpoof).toBeNull();

    const blockMode = createEdgeLabyrinthHandler({
      mode: 'block',
      blockStatus: 403,
      secret: 'unit-fixture-block-key-not-secret',
      onViolation: () => {
        throw new Error('sink failure should not bubble');
      },
    });
    const immediate403 = await blockMode(new Request('https://example.test/crawler-trap/1-seed-0000/'));
    expect(immediate403?.status).toBe(403);
    expect(immediate403?.headers.get('Retry-After')).toBeNull();
    // Next IP-less ordinary page stays unaffected
    expect(await blockMode(new Request('https://example.test/pricing/'))).toBeNull();

    // Middleware skips prerendered contexts cleanly without reading headers/clientAddress
    const mw = createLabyrinthMiddleware({ secret: 'unit-fixture-edge-key-not-secret', interceptTrainingBots: true });
    const prerenderedRes = await mw(
      {
        isPrerendered: true,
        get request() {
          throw new Error('must not touch prerendered request');
        },
        get clientAddress() {
          throw new Error('must not read prerendered clientAddress');
        },
      } as never,
      async () => new Response('prerender-ok', { status: 200 }),
    );
    expect(await prerenderedRes.text()).toBe('prerender-ok');

    // Non-quarantined excluded paths on root stay pass-through
    const apiExcluded = createEdgeLabyrinthHandler({ secret: 'unit-fixture-ex-key-not-secret' });
    expect(await apiExcluded(new Request('https://example.test/media/logo.png'), '192.0.2.40')).toBeNull();
    expect(await apiExcluded(new Request('https://example.test/favicon.ico'), '192.0.2.40')).toBeNull();
    expect(await apiExcluded(new Request('https://example.test/sitemap-0.xml'), '192.0.2.40')).toBeNull();
  });

  it('serves decoy pages on trap routes and returns 404 noindex for unrelated endpoint calls', async () => {
    const endpoint = createLabyrinthEndpoint({ secret: 'unit-fixture-route-key-not-secret' });
    const trapRes = await endpoint({
      request: new Request('https://example.test/crawler-trap/1-seed0001-0000/'),
      clientAddress: '192.0.2.77',
    } as never);
    expect(trapRes.status).toBe(200);
    expect(trapRes.headers.get('X-Robots-Tag')).toContain('noai');

    const missRes = await endpoint({
      request: new Request('https://example.test/ordinary-page/'),
      clientAddress: '192.0.2.78',
    } as never);
    expect(missRes.status).toBe(404);
    expect(missRes.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });
});

describe('End-to-End Astro SSG Build & Component Integration', () => {
  it('emits static decoy ring linked from <CrawlerTrap />, patches robots.txt, and cleans nested sitemaps cleanly', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'astro-crawler-labyrinth-e2e-'));
    tempDirs.push(projectDir);

    await mkdir(join(projectDir, 'public', 'sitemaps'), { recursive: true });
    await mkdir(join(projectDir, 'src', 'pages'), { recursive: true });

    await writeFile(
      join(projectDir, 'public', 'robots.txt'),
      ['User-agent: OAI-SearchBot', 'Allow: /', '', 'User-agent: GPTBot', 'Disallow: /', '', 'User-agent: *', 'Allow: /', ''].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectDir, 'public', 'sitemaps', 'sitemap-0.xml'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset>',
        '  <url><loc>https://example.test/docs/</loc></url>',
        '  <url><lastmod>2026-11-19</lastmod><loc>https://example.test/docs/crawler-trap/stale-node/</loc></url>',
        '</urlset>',
      ].join('\n'),
      'utf8',
    );

    const componentAbs = resolve(process.cwd(), 'components/CrawlerTrap.astro');
    await writeFile(
      join(projectDir, 'src', 'pages', 'index.astro'),
      [
        '---',
        `import CrawlerTrap from ${JSON.stringify(componentAbs)};`,
        '---',
        '<html lang="en"><body><main><h1>Home</h1></main><footer><CrawlerTrap /></footer></body></html>',
      ].join('\n'),
      'utf8',
    );

    const trapSecret = 'unit-fixture-ssg-build-key-not-secret';
    await symlink(resolve(process.cwd(), 'node_modules'), join(projectDir, 'node_modules'));
    const entryMod = resolve(process.cwd(), 'dist/index.js');
    await writeFile(
      join(projectDir, 'astro.config.mjs'),
      [
        "import { defineConfig } from 'astro/config';",
        `import crawlerLabyrinth from ${JSON.stringify(entryMod)};`,
        'export default defineConfig({',
        "  base: '/docs',",
        "  trailingSlash: 'always',",
        '  integrations: [',
        '    crawlerLabyrinth({',
        "      routePrefix: 'crawler-trap',",
        '      staticPages: 12,',
        '      maxDepth: 6,',
        '      linkCount: 2,',
        `      secret: ${JSON.stringify(trapSecret)},`,
        '      patchRobots: true,',
        '      stripFromSitemap: true,',
        '    }),',
        '  ],',
        '});',
      ].join('\n'),
      'utf8',
    );
    const astroBin = resolve(process.cwd(), 'node_modules/.bin/astro');
    await execFileAsync(astroBin, ['build', '--root', projectDir], { cwd: process.cwd() });

    const outDir = join(projectDir, 'dist');
    const homeHtml = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(homeHtml).toContain('data-crawler-labyrinth="1"');
    expect(homeHtml).toMatch(/<div[^>]*\bhidden(?=\s|>)[^>]*\binert(?=\s|>)[^>]*aria-hidden="true"/);
    expect(homeHtml).toContain('tabindex="-1"');
    expect(homeHtml).toContain('rel="nofollow noopener"');

    // Every rendered href in <CrawlerTrap /> resolves to a built static decoy page under /docs/crawler-trap/
    const hrefMatches = [...homeHtml.matchAll(/href="\/docs\/crawler-trap\/([^/"]+)\/"/g)];
    expect(hrefMatches).toHaveLength(2);
    for (const match of hrefMatches) {
      const token = match[1] ?? '';
      const decoyHtml = await readFile(join(outDir, 'crawler-trap', token, 'index.html'), 'utf8');
      expect(decoyHtml).toContain('noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    }

    const trapDirs = await readdir(join(outDir, 'crawler-trap'));
    expect(trapDirs).toHaveLength(12);

    const robotsOut = await readFile(join(outDir, 'robots.txt'), 'utf8');
    expect(robotsOut.match(/Disallow: \/docs\/crawler-trap\//g)).toHaveLength(3);

    const sitemapOut = await readFile(join(outDir, 'sitemaps', 'sitemap-0.xml'), 'utf8');
    expect(sitemapOut).toContain('https://example.test/docs/</loc>');
    expect(sitemapOut).not.toContain('stale-node');

    // Repeated emitStaticLabyrinth with a new entrySeed prunes stale token dirs
    const resolvedChanged = resolveConfig({
      routePrefix: 'crawler-trap',
      basePath: '/docs',
      linkCount: 2,
      staticPages: 4,
      entrySeed: 'seednext2',
      secret: trapSecret,
    });
    const summary2 = await emitStaticLabyrinth(outDir, resolvedChanged);
    expect(summary2.pagesWritten).toBe(4);
    expect(await readdir(join(outDir, 'crawler-trap'))).toHaveLength(4);
  }, 30_000);
});
