import { useCallback } from 'react';
import { useWaterConnections } from '../context/WaterConnectionContext';
import { useHandleDrag } from './useHandleDrag';
import { canConnectWater, isSourceFull } from '../utils/waterConnectRules';
import { logDragEvent } from '../utils/dragDiagnostics';

// ─────────────────────────────────────────────
// 송수 연결 드래그 — 소화전 토출구·옥내소화전·수량 게이지 공용
//
// 끄는 동안 연결 가능한 대상만 밝게 표시한다. 대상 판정은 DOM 의
// `data-water-type` 을 읽어서 하므로, 새 급수 설비를 추가할 때 그 속성만
// 달아 주면 이 훅이 자동으로 인식한다.
//
// 끄는 동안 **감춰 둔 송수라인도 되살린다.** 「송수라인」을 껐으면 활동대로
// 가는 선이 안 보이는데, 그 상태에서는 연결 가능 강조만으로 부족하다 —
// 이미 물을 받고 있는 대인지 알 수가 없어 같은 대에 또 끌어다 놓게 된다.
// 되살리는 일은 CSS 가 한다(WaterConnectionOverlay.css). 여기서는 몸통에
// 표를 붙였다 떼기만 한다 — 리렌더 없이 켜지고 꺼져야 하는 표시라
// React 상태로 두지 않았다.
// ─────────────────────────────────────────────

const VALID_TARGET_CLASS = 'water-drop-ok';
/** 송수를 끄는 중임을 알리는 몸통 표 — 감춘 선을 되살리는 열쇠 */
const DRAGGING_CLASS = 'water-connect-dragging';

interface Options {
  /** 출발 설비 id (`data-token-id` 와 같아야 한다) */
  fromId:   string;
  fromType: string;
  /** 로그·표시용 이름. 토큰이면 생략해도 label 을 쓴다 */
  fromName?: string;
  /** 고장 등으로 송수가 불가능한 상태 */
  disabled?: boolean;
}

export function useWaterConnectDrag({ fromId, fromType, fromName, disabled }: Options) {
  const { connections, addConnection } = useWaterConnections();

  const full = isSourceFull(connections, fromId, fromType);

  // 드래그를 시작하면 연결 가능한 대상에 표시를 켜고, 감춘 선을 되살린다
  const highlight = useCallback(() => {
    document.body.classList.add(DRAGGING_CLASS);
    for (const el of document.querySelectorAll<HTMLElement>('[data-water-type]')) {
      const toId   = el.getAttribute('data-token-id');
      const toType = el.getAttribute('data-water-type');
      if (!toId || !toType) continue;
      if (canConnectWater(connections, fromId, fromType, toId, toType)) {
        el.classList.add(VALID_TARGET_CLASS);
      }
    }
  }, [connections, fromId, fromType]);

  const clearHighlight = useCallback(() => {
    document.body.classList.remove(DRAGGING_CLASS);
    for (const el of document.querySelectorAll<HTMLElement>('.' + VALID_TARGET_CLASS)) {
      el.classList.remove(VALID_TARGET_CLASS);
    }
  }, []);

  const drag = useHandleDrag({
    enabled: !disabled && !full,
    lineColor: '#4a9fe0',
    onDragStart: highlight,
    onDragEnd:   clearHighlight,
    onDrop: ({ targetId, targetEl }) => {
      const toType = targetEl?.getAttribute('data-water-type');
      if (!targetId || !toType) return;                       // 대상 아님 — 조용히 취소
      if (!canConnectWater(connections, fromId, fromType, targetId, toType)) return;
      addConnection(fromId, targetId, fromType, toType, fromName);
      logDragEvent('WaterConnectDrag', `${fromId}(${fromType}) → ${targetId}(${toType})`);
    },
  });

  return { drag, full };
}
