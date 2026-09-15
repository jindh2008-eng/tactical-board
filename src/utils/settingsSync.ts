import { useSyncExternalStore } from 'react';
import {
  buildSettingsBundle, applySettingsBundle, hasLocalSettings, touchLocalSettingsUpdatedAt,
  loadLocalSettingsUpdatedAt, onSettingsChanged, type SettingsExport,
} from './settingsStorage';
import { planSettingsSync, settingsBundleContent } from './settingsSyncPlan';

// ─────────────────────────────────────────────
// 설정 ⇄ PC 파일 동기화 (2026-09-16 사용자 결정)
//
// 설정(시나리오 · 공통 설정)의 본거지는 서버가 PC 에 두는 data/settings.json 이다
// (scripts/settings-store.mjs — serve-dist.mjs 와 개발 서버가 `/api/settings` 로 연다).
// 브라우저 localStorage 는 빠른 사본이다.
//
//   앱을 열 때  initSettingsSync() — 서버 것을 먼저 받아 브라우저 사본에 깐 뒤 화면을 그린다
//               (main.tsx). 어느 쪽을 따를지는 settingsSyncPlan 이 정한다
//   고칠 때마다 사본에 쓴 뒤 0.5초 모아서 서버로 올린다
//   서버가 없으면 지금처럼 브라우저에만 둔다 — 설정 화면 칩이 「이 브라우저에만 저장」으로 알린다
//
// 여러 기기가 동시에 고치면 나중에 올린 쪽이 이긴다 — 설정은 교관 한 사람이 고친다고 본다.
// ─────────────────────────────────────────────

const API = '/api/settings';
const PUSH_DELAY_MS = 500;

/** checking 앱을 여는 중 · server PC 파일에 저장됨 · local-only 서버가 없어 이 브라우저에만 */
export type SettingsSyncStatus = 'checking' | 'server' | 'local-only';

let status: SettingsSyncStatus = 'checking';
const statusListeners = new Set<() => void>();

function setStatus(next: SettingsSyncStatus): void {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn();
}

export function getSettingsSyncStatus(): SettingsSyncStatus {
  return status;
}

function subscribeStatus(fn: () => void): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

/** 설정 화면 칩이 쓴다 */
export function useSettingsSyncStatus(): SettingsSyncStatus {
  return useSyncExternalStore(subscribeStatus, getSettingsSyncStatus, getSettingsSyncStatus);
}

async function request(method: string, url: string, body?: unknown, timeoutMs = 4000): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      signal:  ctrl.signal,
      cache:   'no-store',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body:    body === undefined ? undefined : JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

function isBundle(v: unknown): v is SettingsExport {
  const b = v as Partial<SettingsExport> | null;
  return !!b && b.version === 1 && Array.isArray(b.settingsList) && !!b.workingPresets;
}

/** 브라우저 사본 전체를 서버로 올린다. 수정 시각이 없으면(도입 전 사본) 지금으로 찍는다 */
async function push(): Promise<void> {
  // 도입 전부터 쓰던 사본은 시각이 없다 — 지금으로 찍어야 다음에 어느 쪽이 새것인지 가릴 수 있다.
  // markSettingsChanged 를 쓰면 구독자가 또 올리려 들어 한 번 더 보내게 된다
  if (loadLocalSettingsUpdatedAt() === 0) touchLocalSettingsUpdatedAt();
  try {
    const res = await request('PUT', API, buildSettingsBundle());
    setStatus(res.ok ? 'server' : 'local-only');
  } catch {
    setStatus('local-only');
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
let watching = false;

function startWatching(): void {
  if (watching) return;
  watching = true;
  onSettingsChanged(() => {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { void push(); }, PUSH_DELAY_MS);
  });
}

/**
 * 앱을 열 때 한 번 — 끝나야 화면을 그린다(main.tsx). 실패해도 던지지 않는다.
 * 서버가 없으면 2초 안에 포기하고 브라우저 사본으로 연다.
 */
export async function initSettingsSync(): Promise<void> {
  let server: SettingsExport | null;
  try {
    const res = await request('GET', API, undefined, 2000);
    if (res.status === 404) server = null;
    else if (res.ok) {
      const body: unknown = await res.json();
      server = isBundle(body) ? body : null;
    } else {
      throw new Error(`설정 서버 응답 ${res.status}`);
    }
  } catch {
    setStatus('local-only');
    startWatching();
    return;
  }

  const local = buildSettingsBundle();
  const plan  = planSettingsSync(
    { content: settingsBundleContent(local), updatedAt: local.updatedAt ?? 0, hasData: hasLocalSettings() },
    server && { content: settingsBundleContent(server), updatedAt: server.updatedAt ?? 0 },
  );

  try {
    if (plan.action === 'push') {
      await push();
    } else if (plan.action === 'pull' && server) {
      if (plan.backupLocal) {
        // 덮기 전에 브라우저 것을 서버 백업으로 — 실패하면 덮지 않는다(아무것도 잃지 않게)
        const res = await request('POST', `${API}/backup`, local);
        if (!res.ok) throw new Error('브라우저 설정 백업 실패');
      }
      applySettingsBundle(server);
      setStatus('server');
    } else {
      setStatus('server');
    }
  } catch {
    setStatus('local-only');
  }
  startWatching();
}
