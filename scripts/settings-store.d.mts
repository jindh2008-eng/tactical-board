// scripts/settings-store.mjs 의 타입 — vite.config.ts 가 가져다 쓴다
import type { IncomingMessage, ServerResponse } from 'node:http';

export declare const SETTINGS_API: string;
export declare function isSettingsBundle(v: unknown): boolean;

export interface SettingsStore {
  file:      string;
  backupDir: string;
  read(): Promise<unknown | null>;
  write(bundle: unknown): Promise<void>;
  saveCopy(bundle: unknown, tag?: string): Promise<string>;
  /** `/api/settings` 요청이면 처리하고 true, 아니면 false */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
}

export declare function createSettingsStore(opts: {
  dataDir:           string;
  keepBackups?:      number;
  backupIntervalMs?: number;
}): SettingsStore;
