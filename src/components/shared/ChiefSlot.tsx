import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { TokenCard } from './TokenCard';
import './ChiefSlot.css';

// ─────────────────────────────────────────────
// 소장 슬롯 — 임시의료소장 · 자원대기소장
//
// 드롭다운으로 이름을 고르던 것을 **자리**로 바꿨다. 출동대를 끌어다 놓으면
// 그 토큰이 슬롯에 들어앉고, 그것이 곧 지명이다. 소방통제선·경찰통제선과
// 같은 문법이다 — 끌어다 놓는 것이 결정이다.
//
// ## 자리는 하나다
//
// 차 있으면 드롭을 **조용히 거절**한다. 소장은 한 명이고, 덮어쓰기를 허용하면
// 훈련 중에 실수로 바뀌어도 알아채기 어렵다. 바꾸려면 먼저 빼야 한다.
//
// ## 토큰은 구역을 떠나지 않는다
//
// 소장이 되어도 zoneKey 는 그대로다 — 소장은 그 자리에 있는 사람이지 다른
// 데로 간 사람이 아니다. 대신 **구역 박스는 소장을 그리지 않는다**(호출부가
// 걸러낸다). 그래서 한 토큰이 두 번 보이지 않는다.
//
// 해제하면 표시만 박스로 돌아온다 — 토큰 자체는 움직인 적이 없다.
// ─────────────────────────────────────────────

interface ChiefSlotProps {
  /** 지금 소장인 토큰. 없으면 빈 슬롯 */
  chief: UnitToken | null;
  /** 슬롯 이름 — "임시의료소장" 처럼 무엇의 장인지 */
  label: string;
  /** 드롭으로 지명됐을 때 */
  onAssign: (token: UnitToken) => void;
  /** 해제 버튼을 눌렀을 때 */
  onRelease: () => void;
}

export function ChiefSlot({ chief, label, onAssign, onRelease }: ChiefSlotProps) {
  const { tokens } = useTokens();

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    // 차 있으면 드롭 커서를 주지 않는다 — 놓을 수 없다는 것이 손에 먼저 온다
    if (chief) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // 부모 구역이 같은 이벤트를 또 처리하지 않게 끊는다
    e.stopPropagation();
    if (chief) return;

    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId) return;
    const token = tokens.find(t => t.id === tokenId);
    // 차량·유관기관이 아니라 **출동대**만 소장이 된다
    if (!token || token.type !== 'activity') return;

    onAssign(token);
  }

  return (
    <div
      className={`chief-slot${chief ? ' chief-slot--filled' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={chief
        ? `${label}: ${chief.label}`
        : `${label} — 출동대를 끌어다 놓으세요`}
    >
      {chief ? (
        <>
          <TokenCard token={chief} />
          <button
            type="button"
            className="chief-slot__release"
            onClick={onRelease}
            title={`${label} 해제`}
            aria-label={`${label} 해제 — ${chief.label}`}
          >
            ✕
          </button>
        </>
      ) : (
        <span className="chief-slot__empty">{label}</span>
      )}
    </div>
  );
}
