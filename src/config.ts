import type { LabyrinthOptions, ResolvedLabyrinthConfig, ResponseFormat, TrapMode } from './types.js';

export const DEFAULT_ROUTE_PREFIX = 'crawler-trap';
export const DEFAULT_SECRET = 'astro-crawler-labyrinth-default-seed-v1';

const RESERVED_PREFIXES: readonly string[] = [
  '_astro',
  '_assets',
  'api',
  'media',
  'well-known',
  'robots',
  'sitemap',
  'favicon',
  'admin',
];

const ALLOWED_SEARCH_UA_TOKENS: readonly string[] = [
  'Googlebot',
  'Bingbot',
  'Applebot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'MistralAI-User',
  'Slackbot',
  'Storebot-Google',
  'DuckDuckBot',
];

const TRAINING_ONLY_UA_TOKENS: readonly string[] = [
  'GPTBot',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Bytespider',
  'PetalBot',
  'Diffbot',
  'Omgilibot',
  'ImagesiftBot',
  'DataForSeoBot',
  'Scrapy',
];

const GLOBAL_CONFIG_SYMBOL = Symbol.for('astro-crawler-labyrinth.config');

type GlobalWithConfig = typeof globalThis & {
  [GLOBAL_CONFIG_SYMBOL]?: ResolvedLabyrinthConfig;
};

export function setActiveIntegrationConfig(config: ResolvedLabyrinthConfig): void {
  (globalThis as GlobalWithConfig)[GLOBAL_CONFIG_SYMBOL] = config;
}

export function getActiveIntegrationConfig(): ResolvedLabyrinthConfig | null {
  return (globalThis as GlobalWithConfig)[GLOBAL_CONFIG_SYMBOL] ?? null;
}

export function sanitizeRoutePrefix(raw: string | undefined): string {
  if (!raw) {
    return DEFAULT_ROUTE_PREFIX;
  }
  const clean = raw
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/^-+|-+$/g, '');

  const primary = (clean.split('.')[0] ?? '').replace(/[^a-z0-9_-]/g, '');
  if (primary.length < 3 || primary.length > 32 || clean.includes('.')) {
    return DEFAULT_ROUTE_PREFIX;
  }
  for (const reserved of RESERVED_PREFIXES) {
    if (primary === reserved || primary.startsWith(`${reserved}-`) || primary.startsWith(`.${reserved}`)) {
      return DEFAULT_ROUTE_PREFIX;
    }
  }
  return primary;
}

function sanitizeMode(raw: TrapMode | undefined): TrapMode {
  return raw === 'labyrinth' || raw === 'block' || raw === 'hybrid' ? raw : 'hybrid';
}

function sanitizeFormat(raw: ResponseFormat | undefined): ResponseFormat {
  return raw === 'plain' ? 'plain' : 'html';
}

function clampInt(val: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    return fallback;
  }
  const n = Math.trunc(val);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function sanitizeSeed(raw: string | undefined, fallback = 'archroot0001'): string {
  if (!raw) return fallback;
  const clean = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.length < 4) {
    return `${clean}arch0001`.slice(0, 12);
  }
  return clean.slice(0, 24);
}

export function resolveConfig(options: LabyrinthOptions = {}): ResolvedLabyrinthConfig {
  return {
    routePrefix: sanitizeRoutePrefix(options.routePrefix),
    mode: sanitizeMode(options.mode),
    format: sanitizeFormat(options.format),
    secret: options.secret && options.secret.length >= 16 ? options.secret : DEFAULT_SECRET,
    staticPages: clampInt(options.staticPages, 4, 256, 24),
    maxDepth: clampInt(options.maxDepth, 1, 16, 8),
    linkCount: clampInt(options.linkCount, 1, 5, 1),
    strikeThreshold: clampInt(options.strikeThreshold, 1, 100, 5),
    blockTtlMs: clampInt(options.blockTtlMs, 60_000, 7 * 24 * 60 * 60 * 1000, 6 * 60 * 60 * 1000),
    blockStatus: options.blockStatus === 403 ? 403 : 429,
    patchRobots: options.patchRobots ?? true,
    contentSignal: options.contentSignal ?? false,
    interceptTrainingBots: options.interceptTrainingBots ?? false,
    enableSsrEndpoint: options.enableSsrEndpoint ?? false,
    stripFromSitemap: options.stripFromSitemap ?? true,
    entrySeed: sanitizeSeed(options.entrySeed),
    onViolation: options.onViolation,
  };
}

/**
 * Matches verified AI training or bulk scraper User-Agents while explicitly
 * sparing search, citation, and link-preview crawlers.
 */
export function isTrainingOnlyUserAgent(userAgent: string): boolean {
  const normalized = userAgent.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }
  for (const allowed of ALLOWED_SEARCH_UA_TOKENS) {
    if (normalized.includes(allowed.toLowerCase())) {
      return false;
    }
  }
  for (const token of TRAINING_ONLY_UA_TOKENS) {
    if (normalized.includes(token.toLowerCase())) {
      return true;
    }
  }
  return false;
}
