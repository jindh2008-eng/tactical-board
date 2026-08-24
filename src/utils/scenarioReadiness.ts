/**
 * 설정 사이드바의 완료 배지·준비도 요약이 읽는 값 (SETTINGS_MODE_UI_PLAN.md §4.1 · §7.2).
 *
 * "완료"의 기준은 화면마다 다르다 — 통일된 스키마가 없어서 화면 하나하나 실측해
 * 정했다. 어느 것도 강제(block)하지 않는다 — Q-2가 아직 미결이라(§11) 훈련 실행을
 * 막는 문턱은 만들지 않았고, 지금은 시각적 안내(warn)로만 쓴다.
 */
import type { SettingsContextValue } from '../store/settingsStore';

export interface SectionReadiness {
  /** true 면 사이드바 배지에 체크를, false 면 경고점을 그린다 */
  ok: boolean;
  /** 사이드바에 붙는 보조 표기 — 건수 또는 상태 문구 */
  badge: string;
  /** 준비도 요약 하단에 쓰이는 미입력 안내. ok 면 없다 */
  warning?: string;
}

export type ReadinessMap = Record<
  'building' | 'event' | 'victim' | 'dispatch' | 'tagpreset' | 'unitstatus' | 'checklist' | 'commandprocedure',
  SectionReadiness
>;

/** 임무·상태 프리셋: 유닛 타입 5종 중 하나라도 라벨이 있으면 충족으로 본다 */
function tagPresetFilled(cfg: SettingsContextValue['unitTagPresetConfig']): boolean {
  return Object.values(cfg).some(p => (p.missions?.length ?? 0) > 0 || (p.statuses?.length ?? 0) > 0);
}

function unitStatusFilled(cfg: SettingsContextValue['unitStatusConfig']): boolean {
  return Object.values(cfg).some(messages => (messages?.length ?? 0) > 0);
}

export function computeReadiness(s: SettingsContextValue): ReadinessMap {
  const buildingOk = s.building.targetName.trim().length > 0;
  const checklistItemCount = s.checklistConfig.sections.reduce((n, sec) => n + sec.items.length, 0);
  const cpCategoryCount = s.commandProcedureConfigs[s.activeCommandProcedureLevel]?.length ?? 0;

  return {
    building: buildingOk
      ? { ok: true, badge: '완료' }
      : { ok: false, badge: '대상명 없음', warning: '건물 · 소방시설 — 대상명이 비어 있습니다' },
    event: { ok: true, badge: `${s.eventSetup.length}` },
    victim: s.victimSetup.length > 0
      ? { ok: true, badge: `${s.victimSetup.length}명` }
      : { ok: false, badge: '0명', warning: '구조대상자가 등록되지 않았습니다' },
    dispatch: s.dispatchRoster.length > 0
      ? { ok: true, badge: `${s.dispatchRoster.length}` }
      : { ok: false, badge: '0', warning: '출동대가 등록되지 않았습니다' },
    tagpreset: { ok: true, badge: tagPresetFilled(s.unitTagPresetConfig) ? '완료' : '기본값' },
    unitstatus: unitStatusFilled(s.unitStatusConfig)
      ? { ok: true, badge: '완료' }
      : { ok: false, badge: '비어 있음', warning: '상태 메시지가 비어 있습니다' },
    checklist: checklistItemCount > 0
      ? { ok: true, badge: `${s.checklistConfig.sections.length}개 절` }
      : { ok: false, badge: '0개 절', warning: '체크리스트가 비어 있습니다' },
    commandprocedure: cpCategoryCount > 0
      ? { ok: true, badge: `${cpCategoryCount}개 분류` }
      : { ok: false, badge: '0개 분류', warning: '지휘절차가 비어 있습니다' },
  };
}

/** 사이드바 하단 요약 — n/총 화면 수, 그리고 첫 번째 미입력 경고 하나 */
export function summarizeReadiness(map: ReadinessMap) {
  const entries = Object.values(map);
  const done = entries.filter(e => e.ok).length;
  const total = entries.length;
  const firstWarning = entries.find(e => e.warning)?.warning;
  return { done, total, firstWarning };
}
