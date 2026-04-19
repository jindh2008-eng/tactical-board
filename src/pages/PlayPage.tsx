import { useSettings }        from '../store/settingsStore';
import { DispatchPanel }      from '../components/panels/DispatchPanel';
import { VictimSectionPanel } from '../components/panels/VictimSectionPanel';
import { TacticalArea }       from '../components/building/TacticalArea';
import { RightPanel }         from '../components/right/RightPanel';

/**
 * PlayPage — 전술 상황 실행 페이지 (/play)
 *
 * 레이아웃: 좌(출동대·구조대상자) | 중앙(전술상황판) | 우(로그·지휘정보)
 *
 * - 건물/화점/연기 설정은 settingsStore에서 읽어옴 (읽기 전용)
 * - 토큰 생성·이동·로그는 TokenContext 에서 관리
 * - 출동대 상태 프리셋은 settingsStore 에서 읽어옴 (편집 불가, 선택만 가능)
 * - 실행 중 직접 입력한 임시 상태는 TokenContext 에서만 관리 (설정에 저장 안 됨)
 */
export function PlayPage() {
  const { building } = useSettings();

  return (
    <div className="app">
      {/* ── 좌측: 출동대 + 구조대상자 ── */}
      <aside className="left-panel">
        <DispatchPanel />
        <VictimSectionPanel />
      </aside>

      {/* ── 중앙: 전술상황판 ── */}
      <div className="center-column">
        <TacticalArea
          config={building.config}
          fireFloor={building.fireFloor}
          stairSmokeStartFloor={building.stairSmokeStartFloor}
        />
      </div>

      {/* ── 우측: 로그·지휘정보 ── */}
      <RightPanel />
    </div>
  );
}
