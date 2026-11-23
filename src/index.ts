export { default, emitStaticLabyrinth } from './integration.js';
export type { StaticBuildSummary } from './integration.js';
export { buildBaitLinks, renderCrawlerBaitHtml } from './bait.js';
export {
  DEFAULT_ROUTE_PREFIX,
  DEFAULT_SECRET,
  formatTrapPath,
  getActiveIntegrationConfig,
  isTrainingOnlyUserAgent,
  normalizeBasePath,
  resolveConfig,
  sanitizeBurstLimit,
  sanitizeRoutePrefix,
  sanitizeSeed,
  sanitizeTrailingSlash,
  setActiveIntegrationConfig,
} from './config.js';
export {
  hashClientIp,
  hmacSha256Hex,
  normalizeClientIp,
  signTrapToken,
  timingSafeEqualHex,
  verifyTrapToken,
} from './crypto.js';
export { createEdgeLabyrinthHandler } from './edge.js';
export type { EdgeLabyrinthHandler } from './edge.js';
export { createLabyrinthEndpoint } from './endpoint.js';
export { generateDecoyDocument } from './generator.js';
export type { GenerateDecoyParams } from './generator.js';
export { createLabyrinthMiddleware } from './middleware.js';
export { QuarantineStore } from './quarantine.js';
export { patchRobotsTxt, stripTrapFromSitemapXml } from './robots.js';
export type { PatchRobotsOptions } from './robots.js';
export type {
  BaitLink,
  CrawlerTrapProps,
  DecoyDocument,
  EdgeLabyrinthOptions,
  EntryVector,
  LabyrinthOptions,
  ResolvedLabyrinthConfig,
  ResponseFormat,
  TrailingSlashMode,
  TrapMode,
  TrapViolationEvent,
} from './types.js';
