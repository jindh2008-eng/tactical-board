// ─────────────────────────────────────────────
// 설정 동기화 — 앱을 열 때 브라우저 쪽과 PC 파일 쪽 중 무엇을 따를지 정한다(순수 함수)
//
// 설정의 본거지는 PC 의 파일이다(scripts/settings-store.mjs, 2026-09-16 사용자 결정).
// 브라우저(localStorage)는 빠른 사본이다 — 설정 화면이 동기적으로 읽기 때문에 남겨 둔다.
// 양쪽은 마지막 수정 시각(updatedAt, ms)을 갖고 있고 **더 새것을 따른다.**
//
//   PC 파일이 없다             → 브라우저에 설정이 있으면 올린다(처음 쓰는 PC)
//   두 시각이 같다             → 이미 같은 판이다
//   브라우저가 더 새것         → 올린다(서버가 없던 사이 고친 것)
//   PC 파일이 더 새것 · 모름   → 받는다. 내용이 다르고 브라우저에 설정이 있으면
//                                **덮기 전에 브라우저 것을 서버 백업으로 남긴다** — 잃는 것이 없다
//
// 시각이 없는 브라우저(파일 저장 도입 전부터 쓰던 것)는 0 으로 본다 — 받는 쪽으로 가되 백업이 먼저다.
// ─────────────────────────────────────────────

export type SettingsSyncPlan =
  | { action: 'push' }
  | { action: 'pull'; backupLocal: boolean }
  | { action: 'none' };

export interface SyncSide {
  /** 비교용 내용 — settingsBundleContent 결과 */
  content:   string;
  /** 마지막 수정 시각(ms). 모르면 0 */
  updatedAt: number;
}

export function planSettingsSync(
  local: SyncSide & { hasData: boolean },
  server: SyncSide | null,
): SettingsSyncPlan {
  if (!server) return local.hasData ? { action: 'push' } : { action: 'none' };
  if (local.updatedAt > 0 && local.updatedAt === server.updatedAt) return { action: 'none' };
  if (local.updatedAt > server.updatedAt) return { action: 'push' };
  if (local.content === server.content) return { action: 'pull', backupLocal: false };
  return { action: 'pull', backupLocal: local.hasData };
}

/** 설정 묶음에서 비교할 내용만 — 내보낸 시각 · 수정 시각은 뺀다 */
export function settingsBundleContent(bundle: {
  settingsList?: unknown; workingPresets?: unknown; commandProcedureConfigs?: unknown;
  activeCommandProcedureLevel?: unknown; unitStatusConfig?: unknown; unitTagPresetConfig?: unknown;
}): string {
  return JSON.stringify([
    bundle.settingsList ?? [], bundle.workingPresets ?? null, bundle.commandProcedureConfigs ?? null,
    bundle.activeCommandProcedureLevel ?? null, bundle.unitStatusConfig ?? null, bundle.unitTagPresetConfig ?? null,
  ]);
}
