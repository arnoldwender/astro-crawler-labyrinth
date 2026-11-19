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
  patchRobotsTxt,
  QuarantineStore,
  resolveConfig,
  sanitizeRoutePrefix,
  signTrapToken,
  stripTrapFromSitemapXml,
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
  it('sanitizes reserved prefixes back to default crawler-trap', () => {
    expect(sanitizeRoutePrefix('_astro')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('_assets')).toBe('crawler-trap');
    expect(sanitizeRoutePrefix('robots.txt')).toBe('crawler-trap');
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
});

describe('WebCrypto Token Signing & Privacy-Safe IP Hashing', () => {
  const secret = 'unit-fixture-hmac-key-not-secret';

  it('signs and verifies trap tokens in constant time and rejects tampering', async () => {
    const token = await signTrapToken(3, 'archfolio99', secret);
    const parsed = await verifyTrapToken(token, secret);
    expect(parsed).toEqual({ depth: 3, seed: 'archfolio99' });

    const flipped = token.slice(0, -1) + (token.endsWith('0') ? '1' : '0');
    expect(await verifyTrapToken(flipped, secret)).toBeNull();
    expect(await verifyTrapToken('2-seed-notvalid', secret)).toBeNull();
  });

  it('hashes client IPs with daily rotation and never leaks raw IP characters', async () => {
    const d1 = await hashClientIp('198.51.100.77', secret, '2026-11-19');
    const d2 = await hashClientIp('198.51.100.77', secret, '2026-11-20');
    expect(d1).toHaveLength(64);
    expect(d1).not.toBe(d2);
    expect(d1).not.toContain('198.51.100');
  });
});

describe('Deterministic Decoy Generator', () => {
  const secret = 'unit-fixture-decoy-key-not-secret';

  it('generates identical archival HTML with noindex/noai and ring-bounded child depth', async () => {
    const a = await generateDecoyDocument({ depth: 4, seed: 'folio0001', secret, maxDepth: 4, linksPerPage: 2 });
    const b = await generateDecoyDocument({ depth: 4, seed: 'folio0001', secret, maxDepth: 4, linksPerPage: 2 });

    expect(a.body).toBe(b.body);
    expect(a.body).toContain('noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    expect(a.body).not.toContain('<script');
    expect(a.childTokens[0]?.startsWith('1-')).toBe(true);
    expect(await verifyTrapToken(a.childTokens[0] ?? '', secret)).not.toBeNull();
  });
});

describe('RFC 9309 robots.txt & Sitemap XML Sanitization', () => {
  it('injects Disallow into every User-agent group (no shadowed star disallows) and stays idempotent', () => {
    const input = [
      'User-agent: OAI-SearchBot',
      'Allow: /',
      'User-agent: GPTBot',
      'Disallow: /',
      '',
      'User-agent: *',
      'Allow: /',
      '',
    ].join('\n');

    const once = patchRobotsTxt(input, 'crawler-trap', { contentSignal: true });
    expect(once.match(/Disallow: \/crawler-trap\//g)).toHaveLength(3);
    expect(once).toContain('User-agent: OAI-SearchBot\nAllow: /\nDisallow: /crawler-trap/');
    expect(once).toContain('Content-Signal: search=yes, ai-train=no');

    const twice = patchRobotsTxt(once, 'crawler-trap', { contentSignal: true });
    expect(twice).toBe(once);
  });

  it('removes trap URLs from sitemap XML while preserving real routes', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset>',
      '  <url><loc>https://example.test/about/</loc></url>',
      '  <url><loc>https://example.test/crawler-trap/1-abc-123/</loc></url>',
      '</urlset>',
    ].join('\n');

    const cleaned = stripTrapFromSitemapXml(xml, 'crawler-trap');
    expect(cleaned).toContain('https://example.test/about/');
    expect(cleaned).not.toContain('crawler-trap');
  });
});

describe('Edge Handler, Quarantine Store, SSR Endpoint & Astro Middleware', () => {
  it('evicts oldest/expired entries cleanly when bounded capacity is reached', () => {
    const store = new QuarantineStore(64);
    for (let i = 0; i < 80; i++) {
      store.recordHit(`digest-${i}`, 'hybrid', 5, 60_000, 1_000 + i);
    }
    expect(store.size()).toBe(64);
  });

  it('escalates strikes from 200 decoys to 429 quarantine, spares safe paths, and masks IP in telemetry', async () => {
    const events: TrapViolationEvent[] = [];
    const handler = createEdgeLabyrinthHandler({
      routePrefix: 'crawler-trap',
      mode: 'hybrid',
      strikeThreshold: 2,
      blockStatus: 429,
      blockTtlMs: 120_000,
      secret: 'unit-fixture-edge-key-not-secret',
      interceptTrainingBots: true,
      onViolation: (ev) => {
        events.push(ev);
      },
    });

    // Safe paths pass through as null
    expect(await handler(new Request('https://example.test/_astro/main.js'), '192.0.2.50')).toBeNull();
    expect(await handler(new Request('https://example.test/robots.txt'), '192.0.2.50')).toBeNull();
    expect(
      await handler(
        new Request('https://example.test/blog/', { headers: { 'user-agent': 'OAI-SearchBot/1.0' } }),
        '192.0.2.50',
      ),
    ).toBeNull();

    // Strikes 1 and 2 serve 200 decoy
    const r1 = await handler(new Request('https://example.test/crawler-trap/1-seed0001-0000/'), '192.0.2.88');
    const r2 = await handler(new Request('https://example.test/crawler-trap/2-seed0002-0000/'), '192.0.2.88');
    expect(r1?.status).toBe(200);
    expect(r1?.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(r2?.status).toBe(200);

    // Strike 3 triggers quarantine 429 + Retry-After, and subsequent normal route is blocked
    const r3 = await handler(new Request('https://example.test/crawler-trap/3-seed0003-0000/'), '192.0.2.88');
    expect(r3?.status).toBe(429);
    expect(r3?.headers.get('Retry-After')).toBe('120');

    const r4 = await handler(new Request('https://example.test/pricing/'), '192.0.2.88');
    expect(r4?.status).toBe(429);

    // Raw IP never leaks in violation events
    expect(events).toHaveLength(3);
    expect(events[2]?.actionTaken).toBe('quarantined');
    expect(events[0]?.ipDigest).toHaveLength(64);
    expect(events[0]?.ipDigest).not.toContain('192.0.2');

    // Middleware delegates pass-throughs to next()
    const mw = createLabyrinthMiddleware({ secret: 'unit-fixture-edge-key-not-secret' });
    const nextRes = await mw(
      { request: new Request('https://example.test/contact/'), clientAddress: '192.0.2.99' } as never,
      async () => new Response('ok', { status: 200 }),
    );
    expect(nextRes.status).toBe(200);
    expect(await nextRes.text()).toBe('ok');
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
  it('emits static decoy ring directly linked from <CrawlerTrap />, patches robots.txt, and cleans sitemap', async () => {
    const projectDir = await mkdtemp(join(tmpdir(), 'astro-crawler-labyrinth-e2e-'));
    tempDirs.push(projectDir);

    await mkdir(join(projectDir, 'public'), { recursive: true });
    await mkdir(join(projectDir, 'src', 'pages'), { recursive: true });

    await writeFile(
      join(projectDir, 'public', 'robots.txt'),
      ['User-agent: OAI-SearchBot', 'Allow: /', '', 'User-agent: GPTBot', 'Disallow: /', '', 'User-agent: *', 'Allow: /', ''].join('\n'),
      'utf8',
    );
    await writeFile(
      join(projectDir, 'public', 'sitemap-0.xml'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset>',
        '  <url><loc>https://example.test/</loc></url>',
        '  <url><loc>https://example.test/crawler-trap/stale-node/</loc></url>',
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
    expect(homeHtml).toContain('hidden');
    expect(homeHtml).toContain('aria-hidden="true"');
    expect(homeHtml).toContain('tabindex="-1"');
    expect(homeHtml).toContain('rel="nofollow noopener"');

    // Every rendered href in <CrawlerTrap /> resolves to a built static decoy page
    const hrefMatches = [...homeHtml.matchAll(/href="\/crawler-trap\/([^/"]+)\/"/g)];
    expect(hrefMatches).toHaveLength(2);
    for (const match of hrefMatches) {
      const token = match[1] ?? '';
      const decoyHtml = await readFile(join(outDir, 'crawler-trap', token, 'index.html'), 'utf8');
      expect(decoyHtml).toContain('noindex, nofollow, noarchive, nosnippet, noai, noimageai');
    }

    const trapDirs = await readdir(join(outDir, 'crawler-trap'));
    expect(trapDirs).toHaveLength(12);

    const robotsOut = await readFile(join(outDir, 'robots.txt'), 'utf8');
    expect(robotsOut.match(/Disallow: \/crawler-trap\//g)).toHaveLength(3);

    const sitemapOut = await readFile(join(outDir, 'sitemap-0.xml'), 'utf8');
    expect(sitemapOut).toContain('https://example.test/</loc>');
    expect(sitemapOut).not.toContain('crawler-trap');

    // Verify emitStaticLabyrinth and buildBaitLinks agree directly
    const resolved = resolveConfig({ routePrefix: 'crawler-trap', linkCount: 2, staticPages: 12, secret: trapSecret });
    const summary = await emitStaticLabyrinth(outDir, resolved);
    expect(summary.pagesWritten).toBe(12);
    const directBait = await buildBaitLinks({ routePrefix: 'crawler-trap', count: 2, secret: trapSecret });
    expect(directBait.map((b) => b.token)).toEqual(hrefMatches.map((m) => m[1]));
  }, 30_000);
});
