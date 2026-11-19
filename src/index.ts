export { default, emitStaticLabyrinth } from './integration.js';
export type { StaticBuildSummary } from './integration.js';
export { buildBaitLinks } from './bait.js';
export {
  DEFAULT_ROUTE_PREFIX,
  DEFAULT_SECRET,
  getActiveIntegrationConfig,
  isTrainingOnlyUserAgent,
  resolveConfig,
  sanitizeRoutePrefix,
  sanitizeSeed,
  setActiveIntegrationConfig,
} from './config.js';
export { hashClientIp, hmacSha256Hex, signTrapToken, timingSafeEqualHex, verifyTrapToken } from './crypto.js';
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
  LabyrinthOptions,
  ResolvedLabyrinthConfig,
  ResponseFormat,
  TrapMode,
  TrapViolationEvent,
} from './types.js';
