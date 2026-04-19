import './ImmediateStandby.css';

/** 직전대기 박스 — 하단 중앙 배치 */
export function ImmediateStandby() {
  return (
    <div className="panel immediate-standby">
      <div className="panel__header">직전대기</div>
      <div className="immediate-standby__body">
        {/* 향후: 직전대기 토큰 표시 */}
        <span className="immediate-standby__placeholder">― 대기 중 ―</span>
      </div>
    </div>
  );
}
