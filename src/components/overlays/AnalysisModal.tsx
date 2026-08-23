import { CommandInfo }  from '../right/CommandInfo';
import { useUIOverlay } from '../../context/UIOverlayContext';
import './overlays.css';
import { createPortal } from 'react-dom';
import { stagePortalTarget } from '../../utils/stagePortal';

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
export function AnalysisModal() {
  const { overlay, closeOverlay } = useUIOverlay();
  if (overlay !== 'analysis') return null;

  return createPortal(
    <div className="overlay-backdrop" onClick={closeOverlay}>
      <div className="overlay-modal analysis-modal" onClick={e => e.stopPropagation()}>
        <button className="overlay-modal-close" onClick={closeOverlay}>✕</button>
        <CommandInfo collapsed={false} onToggle={() => {}} />
      </div>
    </div>,
    stagePortalTarget(),
  );
}
