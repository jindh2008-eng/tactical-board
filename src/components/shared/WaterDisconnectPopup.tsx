import ReactDOM from 'react-dom';
import { stagePortalTarget } from '../../utils/stagePortal';
import './WaterDisconnectPopup.css';

// ─────────────────────────────────────────────
// 송수 해제 팝업 — 연결 하나를 끊는 단추 하나짜리 창
//
// 진입점이 둘이라 부품으로 뺐다.
//   ① 연결선 클릭 (WaterConnectionOverlay)
//   ② 펌프·물탱크 토큰 위 번호 배지 클릭 (TokenCard)
//
// ②가 없으면 「송수라인」을 끈 순간 진압대·구조대로 간 선이 사라지면서
// 해제할 방법까지 함께 사라진다. 배지가 그 선의 대역이므로 해제도 배지가 받는다.
//
// 좌표는 클릭 지점(clientX/clientY)이고 `position: fixed` 라 뷰포트 기준이다.
// ─────────────────────────────────────────────

interface Props {
  /** 클릭 지점 (clientX / clientY) */
  x: number;
  y: number;
  onDisconnect: () => void;
  onClose:      () => void;
}

export function WaterDisconnectPopup({ x, y, onDisconnect, onClose }: Props) {
  return ReactDOM.createPortal(
    <>
      <div className="wdp-backdrop" onMouseDown={onClose} />
      <div className="wdp" style={{ left: x, top: y }}>
        <button
          className="wdp__btn"
          onMouseDown={e => { e.stopPropagation(); onDisconnect(); }}
        >
          송수 해제
        </button>
      </div>
    </>,
    stagePortalTarget(),
  );
}
