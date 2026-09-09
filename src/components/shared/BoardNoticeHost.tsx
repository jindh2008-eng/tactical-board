import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { stagePortalTarget } from '../../utils/stagePortal';
import { subscribeBoardNotice, type BoardNotice } from '../../utils/boardNotice';
import './BoardNoticeHost.css';

// ─────────────────────────────────────────────
// 판 위 안내 말풍선 — 그리는 쪽 (한 화면에 하나)
//
// `showBoardNotice(문구, x, y)` 를 부르면 그 자리 위에 뜬다.
// 「송수 해제」 팝업(WaterDisconnectPopup)과 같은 모양이고, 다른 점은 둘이다.
//
//   ① **단추가 없다.** 확인을 요구하지 않는다 — 읽고 계속 하면 된다.
//   ② **스스로 사라진다.** 훈련 중에 손을 멈추게 하지 않는 것이 요점이라
//      뒤에 가림막(backdrop)도 두지 않는다. 판을 계속 누를 수 있다.
//
// 왜 부르는 쪽에서 그리지 않는가는 utils/boardNotice.ts 주석 참고 —
// 안내를 띄우자마자 사라지는 호출부(우클릭 메뉴)가 있다.
// ─────────────────────────────────────────────

/** 저절로 사라지기까지 (ms). 한 문장을 읽는 시간 */
const AUTO_HIDE_MS = 2600;

export function BoardNoticeHost() {
  const [notice, setNotice] = useState<BoardNotice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeBoardNotice(next => {
    setNotice(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(null), AUTO_HIDE_MS);
  }), []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!notice) return null;

  return ReactDOM.createPortal(
    <div
      /* seq 를 key 로 둔다 — 같은 안내가 다시 와도 등장 동작이 새로 돈다 */
      key={notice.seq}
      className="board-notice"
      style={{ left: notice.x, top: notice.y }}
      role="status"
      onMouseDown={() => setNotice(null)}
    >
      {notice.message}
    </div>,
    stagePortalTarget(),
  );
}
