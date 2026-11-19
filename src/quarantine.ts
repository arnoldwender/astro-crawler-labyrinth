interface StrikeRecord {
  strikes: number;
  quarantinedUntil: number;
  expiresAt: number;
}

export class QuarantineStore {
  private readonly entries = new Map<string, StrikeRecord>();
  private readonly maxEntries: number;

  constructor(maxEntries = 4096) {
    this.maxEntries = Math.max(64, Math.trunc(maxEntries));
  }

  isQuarantined(ipDigest: string, nowMs = Date.now()): { quarantined: boolean; retryAfterSeconds: number; strikes: number } {
    const rec = this.entries.get(ipDigest);
    if (!rec) {
      return { quarantined: false, retryAfterSeconds: 0, strikes: 0 };
    }
    if (rec.expiresAt <= nowMs) {
      this.entries.delete(ipDigest);
      return { quarantined: false, retryAfterSeconds: 0, strikes: 0 };
    }
    // Refresh insertion order for bounded LRU behavior.
    this.entries.delete(ipDigest);
    this.entries.set(ipDigest, rec);

    if (rec.quarantinedUntil > nowMs) {
      const retryAfterSeconds = Math.max(60, Math.ceil((rec.quarantinedUntil - nowMs) / 1000));
      return { quarantined: true, retryAfterSeconds, strikes: rec.strikes };
    }
    return { quarantined: false, retryAfterSeconds: 0, strikes: rec.strikes };
  }

  recordHit(
    ipDigest: string,
    mode: 'hybrid' | 'labyrinth' | 'block',
    strikeThreshold: number,
    blockTtlMs: number,
    nowMs = Date.now(),
  ): { quarantined: boolean; retryAfterSeconds: number; strikes: number } {
    const existing = this.entries.get(ipDigest);
    const active = existing && existing.expiresAt > nowMs ? existing : undefined;
    const strikes = (active?.strikes ?? 0) + 1;
    const shouldQuarantine = mode === 'block' || (mode === 'hybrid' && strikes > strikeThreshold);
    const quarantinedUntil = shouldQuarantine ? nowMs + blockTtlMs : (active?.quarantinedUntil ?? 0);
    const expiresAt = Math.max(nowMs + blockTtlMs, quarantinedUntil);

    if (this.entries.has(ipDigest)) {
      this.entries.delete(ipDigest);
    } else if (this.entries.size >= this.maxEntries) {
      this.evictOldest(nowMs);
    }

    this.entries.set(ipDigest, { strikes, quarantinedUntil, expiresAt });

    if (shouldQuarantine || quarantinedUntil > nowMs) {
      return {
        quarantined: true,
        retryAfterSeconds: Math.max(60, Math.ceil((quarantinedUntil - nowMs) / 1000)),
        strikes,
      };
    }

    return { quarantined: false, retryAfterSeconds: 0, strikes };
  }

  size(): number {
    return this.entries.size;
  }

  private evictOldest(nowMs: number): void {
    for (const [key, value] of this.entries) {
      if (value.expiresAt <= nowMs) {
        this.entries.delete(key);
      }
    }
    // Prefer evicting unquarantined entries so spoofed/low-strike floods cannot displace active bans.
    if (this.entries.size >= this.maxEntries) {
      for (const [key, value] of this.entries) {
        if (this.entries.size < this.maxEntries) {
          break;
        }
        if (value.quarantinedUntil <= nowMs) {
          this.entries.delete(key);
        }
      }
    }
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (!oldestKey) {
        break;
      }
      this.entries.delete(oldestKey);
    }
  }
}
