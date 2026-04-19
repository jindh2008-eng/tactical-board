import { UnitStatus }      from '../left/UnitStatus';
import { UnitStatusPanel } from '../left/UnitStatusPanel';
// LeftPanel.css에서 section 레이아웃 스타일 사용
import '../left/LeftPanel.css';

/**
 * DispatchPanel — 출동대 패널
 *
 * 출동대 생성 / 출동대현황을 하나로 묶는 컴포지션 컴포넌트.
 * 대기구역(임시의료소·자원대기소·대기1단계·직전대기)은 B면 좌측으로 이동됨.
 */
export function DispatchPanel() {
  return (
    <div className="left-panel__section left-panel__section--unit">
      <UnitStatus />
      <UnitStatusPanel />
    </div>
  );
}
