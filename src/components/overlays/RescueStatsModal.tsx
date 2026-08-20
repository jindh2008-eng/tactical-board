import { useEffect } from 'react';
import { RescueStats }  from '../building/RescueStats';
import { useUIOverlay } from '../../context/UIOverlayContext';
import './RescueStatsModal.css';

/**
 * RescueStatsModal — 구조활동통계를 훈련 화면 가운데에 띄우는 팝업.
 *
 * A면 임시의료소 헤더의 `구조활동통계` 버튼에서 연다. 임시의료소 자리에 표를
 * 끼워 넣으면 글씨를 줄여야 해서, 좌우 패널과 같은 글씨 크기로 읽히도록
 * 가운데 팝업으로 뺐다.
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

  return (
    <div className="overlay-backdrop rescue-stats-backdrop" onMouseDown={closeOverlay}>
      <div className="rescue-stats-modal" onMouseDown={e => e.stopPropagation()}>
        <button
          className="rescue-stats-modal__close"
          onClick={closeOverlay}
          aria-label="닫기"
        >✕</button>
        <RescueStats />
      </div>
    </div>
  );
}
