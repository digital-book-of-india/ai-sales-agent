import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';

interface ImportRecord {
  headers: string[];
  rows: Record<string, string>[];
  expiresAt: number;
}

const TTL_MS = 30 * 60 * 1000;

/**
 * Holds parsed import rows in memory between the upload step and the
 * confirm step so the client doesn't have to re-upload the raw file.
 * Single-instance only — fine for this app's current deployment shape.
 */
@Injectable()
export class LeadImportStoreService {
  private readonly store = new Map<string, ImportRecord>();

  save(headers: string[], rows: Record<string, string>[]): string {
    this.evictExpired();
    const importId = randomUUID();
    this.store.set(importId, {
      headers,
      rows,
      expiresAt: Date.now() + TTL_MS,
    });
    return importId;
  }

  get(importId: string): ImportRecord | undefined {
    this.evictExpired();
    return this.store.get(importId);
  }

  delete(importId: string): void {
    this.store.delete(importId);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, record] of this.store) {
      if (record.expiresAt <= now) {
        this.store.delete(id);
      }
    }
  }
}
