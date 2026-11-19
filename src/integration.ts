import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { buildBaitLinks } from './bait.js';
import { resolveConfig, sanitizeSeed, setActiveIntegrationConfig } from './config.js';
import { hmacSha256Hex, signTrapToken, verifyTrapToken } from './crypto.js';
import { generateDecoyDocument } from './generator.js';
import { patchRobotsTxt, stripTrapFromSitemapXml } from './robots.js';
import type { LabyrinthOptions, ResolvedLabyrinthConfig } from './types.js';

export interface StaticBuildSummary {
  readonly pagesWritten: number;
  readonly robotsPatched: boolean;
  readonly sitemapsCleaned: number;
}

/**
 * Generates a bounded ring of interlinked static archival decoy pages starting from
 * the exact depth-1 bait entry tokens, patches `robots.txt` across all User-agent groups,
 * and strips any matching trap URLs from `sitemap*.xml`.
 */
export async function emitStaticLabyrinth(
  outDir: URL | string,
  config: ResolvedLabyrinthConfig,
): Promise<StaticBuildSummary> {
  const dirPath = typeof outDir === 'string' ? outDir : fileURLToPath(outDir);
  const trapDir = join(dirPath, config.routePrefix);
  await mkdir(trapDir, { recursive: true });

  const baitLinks = await buildBaitLinks({
    routePrefix: config.routePrefix,
    count: config.linkCount,
    seed: config.entrySeed,
    secret: config.secret,
  });

  const ringTokens: string[] = baitLinks.map((b) => b.token);
  const totalPages = Math.max(ringTokens.length, config.staticPages);

  for (let idx = ringTokens.length; idx < totalPages; idx++) {
    const depth = (idx % config.maxDepth) + 1;
    const nodeHash = await hmacSha256Hex(`ring|${config.entrySeed}|${idx}`, config.secret);
    const token = await signTrapToken(depth, nodeHash.slice(0, 12), config.secret);
    ringTokens.push(token);
  }

  let pagesWritten = 0;
  for (let idx = 0; idx < ringTokens.length; idx++) {
    const token = ringTokens[idx]!;
    const parsed = await verifyTrapToken(token, config.secret);
    const depth = parsed?.depth ?? 1;
    const seed = parsed?.seed ?? sanitizeSeed(config.entrySeed);

    const childA = ringTokens[(idx + 1) % ringTokens.length]!;
    const childB = ringTokens[(idx + 3) % ringTokens.length]!;
    const childTokens = childA === childB ? [childA] : [childA, childB];

    const decoy = await generateDecoyDocument({
      depth,
      seed,
      secret: config.secret,
      routePrefix: config.routePrefix,
      format: 'html',
      maxDepth: config.maxDepth,
      overrideChildTokens: childTokens,
    });

    const pageDir = join(trapDir, token);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, 'index.html'), decoy.body, 'utf8');
    pagesWritten++;
  }

  let robotsPatched = false;
  if (config.patchRobots) {
    const robotsPath = join(dirPath, 'robots.txt');
    let existingRobots = '';
    try {
      existingRobots = await readFile(robotsPath, 'utf8');
    } catch {
      existingRobots = '';
    }
    const updatedRobots = patchRobotsTxt(existingRobots, config.routePrefix, {
      contentSignal: config.contentSignal,
    });
    await writeFile(robotsPath, updatedRobots, 'utf8');
    robotsPatched = true;
  }

  let sitemapsCleaned = 0;
  if (config.stripFromSitemap) {
    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/^sitemap.*\.xml$/i.test(entry.name)) {
        continue;
      }
      const smPath = join(dirPath, entry.name);
      const rawXml = await readFile(smPath, 'utf8');
      const cleanedXml = stripTrapFromSitemapXml(rawXml, config.routePrefix);
      if (cleanedXml !== rawXml) {
        await writeFile(smPath, cleanedXml, 'utf8');
        sitemapsCleaned++;
      }
    }
  }

  return { pagesWritten, robotsPatched, sitemapsCleaned };
}

export default function crawlerLabyrinth(options: LabyrinthOptions = {}): AstroIntegration {
  const resolved = resolveConfig(options);

  return {
    name: 'astro-crawler-labyrinth',
    hooks: {
      'astro:config:setup': ({ injectRoute, addMiddleware }) => {
        setActiveIntegrationConfig(resolved);

        if (resolved.enableSsrEndpoint) {
          injectRoute({
            pattern: `/${resolved.routePrefix}/[...slug]`,
            entrypoint: 'astro-crawler-labyrinth/endpoint',
          });
          addMiddleware({
            entrypoint: 'astro-crawler-labyrinth/middleware',
            order: 'pre',
          });
        }
      },
      'astro:build:done': async ({ dir, logger }) => {
        const summary = await emitStaticLabyrinth(dir, resolved);
        logger.info(
          `Emitted ${summary.pagesWritten} static decoy page(s) under /${resolved.routePrefix}/` +
            (summary.robotsPatched ? ', patched robots.txt' : '') +
            (summary.sitemapsCleaned > 0 ? `, cleaned ${summary.sitemapsCleaned} sitemap(s)` : ''),
        );
      },
    },
  };
}
