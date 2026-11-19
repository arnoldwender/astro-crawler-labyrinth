import { getActiveIntegrationConfig, sanitizeRoutePrefix, sanitizeSeed, DEFAULT_SECRET } from './config.js';
import { hmacSha256Hex, signTrapToken } from './crypto.js';
import type { BaitLink, CrawlerTrapProps } from './types.js';

/**
 * Generates deterministic depth-1 trap entry links matching the static decoy
 * files emitted during `astro:build:done`.
 */
export async function buildBaitLinks(props: CrawlerTrapProps = {}): Promise<readonly BaitLink[]> {
  const active = getActiveIntegrationConfig();
  const routePrefix = sanitizeRoutePrefix(props.routePrefix ?? active?.routePrefix);
  const countRaw = props.count ?? active?.linkCount ?? 1;
  const count = Math.max(1, Math.min(5, Math.trunc(countRaw)));
  const seedBase = sanitizeSeed(props.seed ?? active?.entrySeed);
  const secret = props.secret && props.secret.length >= 16 ? props.secret : (active?.secret ?? DEFAULT_SECRET);
  const baseLabel = props.label && props.label.trim().length > 0 ? props.label.trim() : 'Archival Reference Index';

  const links: BaitLink[] = [];
  for (let i = 0; i < count; i++) {
    const subHash = await hmacSha256Hex(`entry|${seedBase}|${i}`, secret);
    const token = await signTrapToken(1, subHash.slice(0, 12), secret);
    links.push({
      href: `/${routePrefix}/${token}/`,
      label: count === 1 ? baseLabel : `${baseLabel} ${i + 1}`,
      token,
    });
  }

  return links;
}
