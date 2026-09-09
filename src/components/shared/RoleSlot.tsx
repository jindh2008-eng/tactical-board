import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { TokenCard } from './TokenCard';
import './RoleSlot.css';

// ─────────────────────────────────────────────
// 역할 슬롯 — 단위지휘관 · 자원대기소장 · 임시의료소장
//
// 드롭다운으로 이름을 고르던 것을 **자리**로 바꿨다. 출동대를 끌어다 놓으면
// 그 토큰이 슬롯에 들어앉고, 그것이 곧 지명이다. 소방통제선·경찰통제선과
// 같은 문법이다 — 끌어다 놓는 것이 결정이다.
//
// 원래 이름은 `ChiefSlot`(소장 슬롯)이었다. 층별 단위지휘관이 같은 자리를
// 쓰게 되면서 「소장」이라는 이름이 좁아져 역할 슬롯으로 일반화했다.
//
// ## 자리는 하나다
//
// 차 있으면 드롭을 **조용히 거절**한다. 그 역할은 한 명이고, 덮어쓰기를
// 허용하면 훈련 중에 실수로 바뀌어도 알아채기 어렵다. 바꾸려면 먼저 빼야 한다.
//
// ## 해제 버튼이 없다 — 끌어내는 것이 해제다
//
// 예전에는 옆에 ✕ 가 붙어 있었다. 지우는 방법이 둘(✕ · 토큰 이동)이면
// 어느 쪽이 정본인지 흐려진다. 지금은 **그 토큰을 어디로든 다시 끌어다 놓으면
// 해제**다 — 같은 구역 안에서 자리만 옮겨도 마찬가지다. 지휘관은 그 자리에
// 있는 사람이므로, 자리를 뜨는 동작이 곧 해제라는 뜻이다.
//
// 해제 자체는 여기서 하지 않는다. `TokenContext.moveToken` 이 이동할 때마다
// `RoleReleaseContext` 로 알리고, 역할을 들고 있던 쪽이 스스로 놓는다.
// 드롭 경로가 여럿(구역·패널·체크리스트 명령·도착 배치)이라 한 곳에 모아야
// 빠뜨리지 않는다.
//
// ## 이름표는 지우지 않는다 — 「소장 물탱크1」
//
// 처음엔 토큰이 이름표 자리를 통째로 차지했다. 그러면 「물탱크1」만 남아
// 그것이 소장인지 그냥 거기 있는 출동대인지 화면에서 구별되지 않는다.
// 역할 이름을 앞에 두고 토큰을 옆에 붙인다.
//
// ## 빈 자리와 찬 자리는 **말이 다르다**
//
// 비었을 때는 「그 자리가 아직 없다」를 말한다 — 「[미설치]」·「단위지휘관」.
// 차면 그 사람이 무엇인지 말한다 — 「소장」·「단위」 파란 칩 + 토큰.
// 표기는 호출부가 글자 그대로 정한다(대괄호가 필요하면 글자에 넣는다).
//
// 색도 같은 순서로 간다. 빈 자리는 **배경에 묻히고**(옅은 글자만), 찬 자리만
// 파랗게 뜬다. 예전에는 빈 자리가 옅은 하늘색 칩이라 오히려 눈에 띄어
// 지정·미지정이 한눈에 구별되지 않았다(2026-09-02 사용자 지적).
//
// 정식 명칭(`roleName`)은 툴팁과 스크린리더에 남긴다.
//
// ## 토큰은 구역을 떠나지 않는다
//
// 역할을 맡아도 zoneKey 는 그대로다 — 지휘관은 그 자리에 있는 사람이지 다른
// 데로 간 사람이 아니다. 대신 **구역 박스는 그 토큰을 그리지 않는다**(호출부가
// 걸러낸다). 그래서 한 토큰이 두 번 보이지 않는다.
// ─────────────────────────────────────────────

/**
 * 역할을 맡을 수 있는가 — **유관기관만 제외**한다.
 *
 * 처음엔 활동대(type: 'activity')로 좁혔는데 너무 좁았다. 차량 지휘차의
 * 운전요원이나 직접입력으로 만든 인원도 역할을 맡는다. 소속이 다른
 * 유관기관(경찰·한전·가스…)만 우리 쪽 지휘 계선에 들어올 수 없다.
 */
function canHoldRole(token: UnitToken): boolean {
  return token.type !== 'agency';
}

interface RoleSlotProps {
  /** 지금 이 역할을 맡은 토큰. 없으면 빈 슬롯 */
  holder: UnitToken | null;
  /** 찼을 때 표기 — "소장" · "단위지휘관" */
  tag: string;
  /** 비었을 때 표기. 생략하면 tag 를 그대로 쓴다 — "미설치" */
  emptyTag?: string;
  /** 정식 명칭 — 툴팁·aria-label 용. "임시의료소장" 처럼 무엇의 장인지 */
  roleName: string;
  /** 드롭으로 지명됐을 때 */
  onAssign: (token: UnitToken) => void;
  /**
   * 이미 찬 자리에 또 떨어뜨렸을 때 — 소속대 편입.
   *
   * 주지 않으면 찬 자리는 드롭을 조용히 거절한다(소장 슬롯이 그렇다).
   * 단위지휘관만 이 통로를 쓴다 — 그 밑으로 대를 붙이는 것이 지휘 관계다.
   */
  onAddMember?: (token: UnitToken) => void;
}

export function RoleSlot({ holder, tag, emptyTag, roleName, onAssign, onAddMember }: RoleSlotProps) {
  const { tokens } = useTokens();
  const acceptsDrop = !holder || !!onAddMember;

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    // 받지 않는 자리에는 드롭 커서를 주지 않는다 — 손에 먼저 온다
    if (!acceptsDrop) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // 부모 구역이 같은 이벤트를 또 처리하지 않게 끊는다
    e.stopPropagation();
    if (!acceptsDrop) return;

    const tokenId = e.dataTransfer.getData('tokenId');
    if (!tokenId) return;
    const token = tokens.find(t => t.id === tokenId);
    if (!token || !canHoldRole(token)) return;
    if (holder && token.id === holder.id) return;   // 자기 자신을 자기 밑에 두지 않는다

    if (holder) onAddMember!(token);
    else        onAssign(token);
  }

  return (
    <div
      className={`role-slot${holder ? ' role-slot--filled' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      title={holder
        ? `${roleName}: ${holder.label}${onAddMember ? ' — 출동대를 여기 놓으면 소속대가 됩니다' : ' — 끌어내면 해제됩니다'}`
        : `${roleName} — 출동대를 끌어다 놓으세요 (유관기관 제외)`}
      aria-label={holder ? `${roleName}: ${holder.label}` : `${roleName} 미지정`}
    >
      {/* 이름표는 비었든 찼든 늘 남는다 — 이 자리가 무엇인지 먼저 읽혀야 한다 */}
      <span className="role-slot__tag">{holder ? tag : (emptyTag ?? tag)}</span>
      {holder && <TokenCard token={holder} />}
    </div>
  );
}
