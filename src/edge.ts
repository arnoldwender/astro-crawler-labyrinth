import { getActiveIntegrationConfig, isTrainingOnlyUserAgent, resolveConfig } from './config.js';
import { hashClientIp, hmacSha256Hex, verifyTrapToken } from './crypto.js';
import { generateDecoyDocument } from './generator.js';
import { QuarantineStore } from './quarantine.js';
import type { EdgeLabyrinthOptions, TrapViolationEvent } from './types.js';

const DEFAULT_EXCLUDED_PREFIXES: readonly string[] = [
  '/_astro',
  '/_assets',
  '/.well-known',
  '/robots.txt',
  '/sitemap',
  '/media',
  '/favicon',
  '/api',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSecurityHeaders(contentType: string, retryAfterSeconds?: number): Headers {
  const headers = new Headers({
    'Content-Type': contentType,
    'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noai, noimageai',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'X-Content-Type-Options': 'nosniff',
  });
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    headers.set('Retry-After', String(retryAfterSeconds));
  }
  return headers;
}

function buildBlockResponse(status: 429 | 403, retryAfterSeconds: number): Response {
  const message =
    status === 429
      ? 'HTTP 429 Too Many Requests: Automated traversal of disallowed robots.txt routes is rate-limited.'
      : 'HTTP 403 Forbidden: Automated traversal of disallowed robots.txt routes is prohibited.';

  return new Response(`${message}\n`, {
    status,
    headers: buildSecurityHeaders('text/plain; charset=utf-8', status === 429 ? retryAfterSeconds : undefined),
  });
}

function extractClientIp(request: Request, explicitIp?: string): string {
  if (explicitIp && explicitIp.trim().length > 0) {
    return explicitIp.trim();
  }
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }
  const nfIp = request.headers.get('x-nf-client-connection-ip');
  if (nfIp && nfIp.trim().length > 0) {
    return nfIp.trim();
  }
  const xff = request.headers.get('x-forwarded-for');
  if (xff && xff.trim().length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return '0.0.0.0';
}

export type EdgeLabyrinthHandler = (request: Request, clientIp?: string) => Promise<Response | null>;

/**
 * Web-standard Request/Response handler for Edge Functions, Cloudflare Workers,
 * Deno, and Astro SSR middleware. Returns `null` when the request should pass through.
 */
export function createEdgeLabyrinthHandler(options?: EdgeLabyrinthOptions): EdgeLabyrinthHandler {
  const base = options ? resolveConfig(options) : (getActiveIntegrationConfig() ?? resolveConfig());
  const excludedPrefixes = options?.excludedPrefixes ?? DEFAULT_EXCLUDED_PREFIXES;
  const store = new QuarantineStore();
  const trapRegex = new RegExp(`^\\/${escapeRegex(base.routePrefix)}(?:\\/([a-zA-Z0-9_-]{1,96}))?\\/?$`);

  return async (request: Request, clientIp?: string): Promise<Response | null> => {
    const url = new URL(request.url);
    const pathname = url.pathname || '/';
    const lowerPath = pathname.toLowerCase();

    for (const excluded of excludedPrefixes) {
      if (lowerPath.startsWith(excluded.toLowerCase())) {
        return null;
      }
    }

    const userAgent = request.headers.get('user-agent') ?? '';
    const rawIp = extractClientIp(request, clientIp);
    const ipDigest = await hashClientIp(rawIp, base.secret);

    const existing = store.isQuarantined(ipDigest);
    if (existing.quarantined) {
      return buildBlockResponse(base.blockStatus, existing.retryAfterSeconds);
    }

    const trapMatch = trapRegex.exec(pathname);
    const uaMatched = !trapMatch && base.interceptTrainingBots && isTrainingOnlyUserAgent(userAgent);
    if (!trapMatch && !uaMatched) {
      return null;
    }

    const rawToken = trapMatch ? (trapMatch[1] ?? '') : 'ua-guard';
    const outcome = store.recordHit(ipDigest, base.mode, base.strikeThreshold, base.blockTtlMs);

    const notify = async (event: TrapViolationEvent): Promise<void> => {
      if (base.onViolation) {
        await base.onViolation(event);
      }
    };

    if (outcome.quarantined) {
      await notify({
        timestamp: new Date().toISOString(),
        ipDigest,
        userAgentExcerpt: userAgent.slice(0, 120),
        routeToken: rawToken || 'root',
        actionTaken: 'quarantined',
        strikes: outcome.strikes,
        status: base.blockStatus,
      });
      return buildBlockResponse(base.blockStatus, outcome.retryAfterSeconds);
    }

    const parsed = rawToken ? await verifyTrapToken(rawToken, base.secret) : null;
    const depth = parsed ? parsed.depth : 1;
    const seed = parsed
      ? parsed.seed
      : (await hmacSha256Hex(`entry|${pathname}`, base.secret)).slice(0, 12);

    const decoy = await generateDecoyDocument({
      depth,
      seed,
      secret: base.secret,
      routePrefix: base.routePrefix,
      format: base.format,
      maxDepth: base.maxDepth,
      linksPerPage: 3,
    });

    await notify({
      timestamp: new Date().toISOString(),
      ipDigest,
      userAgentExcerpt: userAgent.slice(0, 120),
      routeToken: rawToken || 'root',
      actionTaken: 'decoy_served',
      strikes: outcome.strikes,
      status: 200,
    });

    return new Response(decoy.body, {
      status: 200,
      headers: buildSecurityHeaders(decoy.contentType),
    });
  };
}
