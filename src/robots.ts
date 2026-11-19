import { sanitizeRoutePrefix } from './config.js';

export interface PatchRobotsOptions {
  readonly contentSignal?: boolean;
}

function insertBeforeTrailingBlanks(lines: string[], additions: readonly string[]): string[] {
  const trailing: string[] = [];
  while (lines.length > 0) {
    const last = lines[lines.length - 1] ?? '';
    const trimmed = last.trim();
    if (trimmed !== '' && !trimmed.startsWith('#')) {
      break;
    }
    trailing.unshift(lines.pop() ?? '');
  }
  lines.push(...additions, ...trailing);
  return lines;
}

/**
 * Injects `Disallow: /<prefix>/` into every RFC 9309 User-agent group so named
 * Allow: / blocks (such as OAI-SearchBot or PerplexityBot) cannot shadow the rule.
 */
export function patchRobotsTxt(
  existingContent: string,
  routePrefix: string,
  options: PatchRobotsOptions = {},
): string {
  const cleanPrefix = sanitizeRoutePrefix(routePrefix);
  const rule = `Disallow: /${cleanPrefix}/`;
  const signalLine = 'Content-Signal: search=yes, ai-train=no';
  const normalized = existingContent.replace(/\r\n?/g, '\n');
  const trimmedAll = normalized.trim();

  if (trimmedAll === '') {
    const starter = ['User-agent: *', rule];
    if (options.contentSignal) {
      starter.push(signalLine);
    }
    return `${starter.join('\n')}\n`;
  }

  const lines = normalized.replace(/\n+$/, '').split('\n');
  let result: string[] = [];
  let inGroup = false;
  let hasNonUaDirective = false;
  let groupHasDisallow = false;
  let groupIsStar = false;
  let groupHasSignal = false;
  let foundAnyUa = false;

  const flushGroup = (): void => {
    const additions: string[] = [];
    if (!groupHasDisallow) {
      additions.push(rule);
    }
    if (options.contentSignal && groupIsStar && !groupHasSignal) {
      additions.push(signalLine);
    }
    if (additions.length > 0) {
      result = insertBeforeTrailingBlanks(result, additions);
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const uaMatch = /^user-agent\s*:\s*(.+)$/i.exec(trimmed);
    const isMeta = trimmed === '' || trimmed.startsWith('#') || /^sitemap\s*:/i.test(trimmed);

    if (uaMatch) {
      foundAnyUa = true;
      if (inGroup && hasNonUaDirective) {
        flushGroup();
        inGroup = false;
      }
      if (!inGroup) {
        inGroup = true;
        hasNonUaDirective = false;
        groupHasDisallow = false;
        groupIsStar = false;
        groupHasSignal = false;
      }
      if ((uaMatch[1] ?? '').trim() === '*') {
        groupIsStar = true;
      }
      result.push(line);
      continue;
    }

    if (inGroup && !isMeta) {
      hasNonUaDirective = true;
      if (trimmed.toLowerCase() === rule.toLowerCase()) {
        groupHasDisallow = true;
      }
      if (/^content-signal\s*:/i.test(trimmed)) {
        groupHasSignal = true;
      }
    } else if (inGroup && trimmed === '' && hasNonUaDirective) {
      flushGroup();
      inGroup = false;
      hasNonUaDirective = false;
      groupHasDisallow = false;
      groupIsStar = false;
      groupHasSignal = false;
    }

    result.push(line);
  }

  if (inGroup) {
    flushGroup();
  }

  if (!foundAnyUa) {
    result.push('User-agent: *', rule);
    if (options.contentSignal) {
      result.push(signalLine);
    }
  }

  return `${result.join('\n')}\n`;
}

/**
 * Strips any `<url>...</url>` entry referencing `/<prefix>/` from sitemap XML files
 * so disallowed honeypot routes never appear in search engine sitemaps.
 */
export function stripTrapFromSitemapXml(xml: string, routePrefix: string): string {
  const cleanPrefix = sanitizeRoutePrefix(routePrefix);
  const escaped = cleanPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const urlBlockRegex = new RegExp(
    `\\s*<url>\\s*<loc>[^<]*\\/${escaped}(?:\\/[^<]*)?<\\/loc>[\\s\\S]*?<\\/url>`,
    'gi',
  );
  return xml.replace(urlBlockRegex, '');
}
