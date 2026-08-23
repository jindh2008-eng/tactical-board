import { useEffect } from 'react';
import { RescueStats }  from '../building/RescueStats';
import { useUIOverlay } from '../../context/UIOverlayContext';
import './RescueStatsModal.css';
import { createPortal } from 'react-dom';
import { stagePortalTarget } from '../../utils/stagePortal';

/**
 * RescueStatsModal — 구조활동통계를 훈련 화면 가운데에 띄우는 팝업.
 *
 * A면 임시의료소 헤더의 `구조활동통계` 버튼에서 연다. 임시의료소 자리에 표를
 * 끼워 넣으면 글씨를 줄여야 해서, 좌우 패널과 같은 글씨 크기로 읽히도록
 * 가운데 팝업으로 뺐다.
 */
/*
 * 이 오버레이는 **포털**로 나간다.
 *
 * `.overlay-backdrop` 은 `position: fixed; inset: 0` 으로 화면 전체를 덮어 뒤쪽
 * 조작을 막는 것이 목적이다. 그런데 스테이지(`transform: scale`) 안에 두면
 * `fixed` 가 뷰포트가 아니라 **캔버스** 기준이 되어 상단 nav 36px 을 덮지 못한다.
 * 모달이 열린 채로 `훈련 세팅`·`종료` 를 누를 수 있게 되는 것이라 그냥 넘길 수 없다.
 * 포털 루트는 뷰포트 전면이므로 예전 동작이 그대로 돌아온다.
 * → docs/SCREEN_STAGE_PLAN.md §4.1
 */
export function RescueStatsModal() {
  const { overlay, closeOverlay } = useUIOverlay();
  const isOpen = overlay === 'rescue-stats';

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeOverlay();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, closeOverlay]);

  if (!isOpen) return null;

  return createPortal(
    <div className="overlay-backdrop rescue-stats-backdrop" onMouseDown={closeOverlay}>
      <div className="rescue-stats-modal" onMouseDown={e => e.stopPropagation()}>
        <button
          className="rescue-stats-modal__close"
          onClick={closeOverlay}
          aria-label="닫기"
        >✕</button>
        <RescueStats />
      </div>
    </div>,
    stagePortalTarget(),
  );
}
