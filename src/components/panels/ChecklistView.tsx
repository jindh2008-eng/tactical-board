import { useState } from 'react';
import { useSettings } from '../../store/settingsStore';
import { computeRosterDisplayName } from '../../utils/dispatchRoster';
import type { ChecklistItem, ChecklistItemType } from '../../types/settings';
import type { FireStatus } from '../../types';
import './ChecklistPanel.css';

/**
 * ChecklistView — 진행상황 관리 표시 전용 컴포넌트
 *
 * 런타임 Context(Token/Victim/Event/FireCommand)에 의존하지 않는다.
 * 설정(checklistConfig · dispatchRoster)만 읽으므로 SettingsProvider 아래라면
 * 어디서든 렌더할 수 있다.
 *
 * 무플 화면  : ChecklistPanel 이 감싸서 부수효과를 실행한다
 * 교수 태블릿: 이 컴포넌트를 직접 쓰고, onToggle 에서 명령만 송신한다
 *              (무상태 미러 — docs/DUAL_SCREEN_SYNC_PLAN.md §5.6)
 *
 * 접기/펼치기 같은 순수 UI 상태는 여기서 소유한다. 화면마다 독립이어야 한다.
 */

const FIRE_STATUS_LABELS: Partial<Record<FireStatus, string>> = {
  'extension-peak': '연소확대',
  peak:             '최성기',
  seventy:          '큰불잡음',
  half:             '50%',
  initial:          '초진',
  complete:         '완진',
};

const TYPE_LABELS: Record<ChecklistItemType, string> = {
  procedure: '절차',
  event:     '이벤트',
  arrival:   '도착',
  message:   '메세지',
  fire:      '화재',
  xvr:       'XVR',
  unit:      '출동대',
  incident:  '현장요소',
  victim:    '구조대상자',
};

export interface ChecklistViewProps {
  /** 체크된 항목 ID. 무플은 로컬 상태, 교수 태블릿은 서버 수신값 */
  checked: ReadonlySet<string>;
  /** 🔒 표시 및 클릭 차단 대상. 교수 태블릿은 비워 둔다(빈 집합) */
  lockedItemIds?: ReadonlySet<string>;
  variant?: 'desktop' | 'tablet';
  onToggle: (item: ChecklistItem) => void;
}

export function ChecklistView({
  checked,
  lockedItemIds,
  variant = 'desktop',
  onToggle,
}: ChecklistViewProps) {
  const { checklistConfig, dispatchRoster } = useSettings();
  const [collapsed,       setCollapsed]       = useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  function toggleSection(sectionId: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else                     next.add(sectionId);
      return next;
    });
  }

  const totalItems   = checklistConfig.sections.reduce((n, s) => n + s.items.length, 0);
  const checkedCount = checklistConfig.sections.reduce(
    (n, s) => n + s.items.filter(it => checked.has(it.id)).length, 0
  );

  return (
    <div className={`checklist-panel${variant === 'tablet' ? ' checklist-panel--tablet' : ''}`}>
      <div className="checklist-panel__header">
        <span className="checklist-panel__title">진행상황 관리</span>
        {totalItems > 0 && (
          <span className="checklist-panel__progress">{checkedCount}/{totalItems}</span>
        )}
      </div>
      <div className="checklist-panel__body">
        {checklistConfig.sections.length === 0 ? (
          <span className="checklist-panel__empty">설정창에서 체크리스트를 추가하세요.</span>
        ) : (
          checklistConfig.sections.map(section => {
            const isCollapsed = collapsed.has(section.id);
            // 이 섹션에서 하위 항목을 가진 상위 항목 ID 집합
            const parentItemIds = new Set(
              section.items.filter(it => it.linkedParentId).map(it => it.linkedParentId!)
            );

            return (
              <div key={section.id} className="checklist-panel__section">
                <button
                  className="checklist-panel__section-title"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="checklist-panel__section-arrow">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  {section.title}
                </button>
                <div className="checklist-panel__divider" />
                {!isCollapsed && section.items.map(item => {
                  const itemType  = item.itemType ?? 'procedure';
                  const isChecked = checked.has(item.id);
                  const order       = item.arrivalOrder ?? 1;
                  const isLocked    = lockedItemIds?.has(item.id) ?? false;
                  const arrivalUnits = itemType === 'arrival'
                    ? dispatchRoster.filter(r => r.arrivalOrder === order && r.linkedTo === null).map(computeRosterDisplayName).join(', ')
                    : '';
                  const isLinked  = !!item.linkedParentId;
                  const isParent  = parentItemIds.has(item.id);

                  // 하위 항목은 상위가 펼쳐진 경우에만 표시
                  if (isLinked && !expandedParents.has(item.linkedParentId!)) return null;

                  const fireTitle = itemType === 'fire' && item.fireFloor != null
                    ? `${item.fireFloor}층 → ${FIRE_STATUS_LABELS[item.fireTargetStatus!] ?? ''}`
                    : undefined;
                  const title = isLocked ? '배치된 출동대가 있어 해제할 수 없습니다' : fireTitle;

                  return (
                    <div
                      key={item.id}
                      className={[
                        'checklist-panel__item',
                        isChecked ? 'checklist-panel__item--checked' : '',
                        isLocked  ? 'checklist-panel__item--locked'  : '',
                        isLinked  ? 'checklist-panel__item--linked'   : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => { if (!isLocked) onToggle(item); }}
                      title={title}
                    >
                      {isLinked && <span className="checklist-panel__link-icon">└</span>}
                      <span className={`checklist-panel__item-badge checklist-panel__item-badge--${itemType}`}>
                        {TYPE_LABELS[itemType] ?? itemType}
                      </span>
                      <span className="checklist-panel__item-text">
                        {item.text}
                        {itemType === 'arrival' && (
                          arrivalUnits
                            ? <span className="checklist-panel__item-units"> ({arrivalUnits})</span>
                            /*
                             * 편성이 없는 도착 항목. 설정모드의 같은 표시와 짝이다
                             * (ChecklistSetupPanel). 착대 번호가 밀려 가리킬 곳이
                             * 사라진 항목인데, 예전에는 괄호째 안 그려서 훈련 중에
                             * 「4착대 도착」이 멀쩡해 보였다.
                             */
                            : <span className="checklist-panel__item-units checklist-panel__item-units--empty"> (편성없음)</span>
                        )}
                      </span>
                      {isLocked && <span className="checklist-panel__lock-icon">🔒</span>}
                      {/* 상위 항목 하위 숨김/표시 체크박스 */}
                      {isParent && (
                        <input
                          type="checkbox"
                          className="checklist-panel__expand-cb"
                          checked={expandedParents.has(item.id)}
                          title={expandedParents.has(item.id) ? '하위 항목 숨기기' : '하위 항목 표시'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation();
                            setExpandedParents(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item.id);
                              else                  next.delete(item.id);
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
