import { sanitizeSeed } from './config.js';

const encoder = new TextEncoder();

export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Constant-time hex string comparison avoiding early-exit timing side channels.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Normalizes client IP strings so IPv6 case variants, bracketed `[::1]:port`,
 * IPv4 `ip:port`, and zone suffixes resolve deterministically to the same digest.
 */
export function normalizeClientIp(rawIp: string): string {
  let ip = rawIp.trim();
  if (!ip) {
    return '';
  }

  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(ip);
  if (bracketed && bracketed[1]) {
    ip = bracketed[1];
  } else {
    const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(ip);
    if (ipv4Port && ipv4Port[1]) {
      ip = ipv4Port[1];
    }
  }

  const zoneIdx = ip.indexOf('%');
  if (zoneIdx > 0) {
    ip = ip.slice(0, zoneIdx);
  }

  ip = ip.toLowerCase();
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(mapped)) {
      return mapped;
    }
  }
  return ip;
}

export async function signTrapToken(depth: number, seed: string, secret: string): Promise<string> {
  const boundedDepth = Math.max(1, Math.min(16, Math.trunc(depth)));
  const cleanSeed = sanitizeSeed(seed);
  const digest = await hmacSha256Hex(`${boundedDepth}|${cleanSeed}`, secret);
  return `${boundedDepth}-${cleanSeed}-${digest.slice(0, 16)}`;
}

export interface ParsedTrapToken {
  readonly depth: number;
  readonly seed: string;
}

export async function verifyTrapToken(token: string, secret: string): Promise<ParsedTrapToken | null> {
  const match = /^([1-9][0-9]?)-([a-z0-9]{4,24})-([a-f0-9]{16})$/.exec(token);
  if (!match) {
    return null;
  }
  const depth = Number(match[1]);
  const seed = match[2];
  const actualSig = match[3];
  if (!Number.isInteger(depth) || depth < 1 || depth > 16 || !seed || !actualSig) {
    return null;
  }
  const expectedSig = (await hmacSha256Hex(`${depth}|${seed}`, secret)).slice(0, 16);
  if (!timingSafeEqualHex(expectedSig, actualSig)) {
    return null;
  }
  return { depth, seed };
}

/**
 * Privacy-safe daily keyed HMAC digest of a normalized client IP. Raw IPs are never stored.
 */
export async function hashClientIp(rawIp: string, secret: string, utcDay?: string): Promise<string> {
  const day = utcDay ?? new Date().toISOString().slice(0, 10);
  const normalized = normalizeClientIp(rawIp);
  const ip = normalized.length > 0 ? normalized : '0.0.0.0';
  return hmacSha256Hex(`${ip}|${day}`, secret);
}
