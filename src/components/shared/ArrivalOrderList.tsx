import { useMemo, useState } from 'react';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { isMountedPump } from '../../utils/unitPairing';
import {
  UNLISTED_ORDER, buildRosterOrderMap, effectiveOrder, typePriority,
} from '../../utils/arrivalOrder';
import { TokenCard } from './TokenCard';
import './ArrivalOrderList.css';

// ─────────────────────────────────────────────
// 착대 목록(모드2) — 출동대현황 · 추가출동대 공용
//
// 설정모드의 `DispatchArrivalAside`(settings/ui/AsideContent.tsx)와 같은 문법이다.
// 착대 한 줄이 드롭 자리이고, 맨 아래 빈 줄에 놓으면 착대가 하나 늘어난다.
//
// ## 두 패널의 차이는 zoneKey 뿐이다
//
// 드롭은 「착대를 바꾸고 이 패널의 자리로 옮긴다」로 정의된다. 그래서 추가출동대의
// 2차 줄에서 출동대현황의 3차 줄로 바로 끌어올 수 있다.
//
// ## 빈 착대를 압축하지 않는다
//
// 설정모드는 착대를 옮긴 뒤 빈 번호를 없앤다(compactArrivalOrders). 훈련 중에
// 같은 일을 하면 이미 남은 이벤트 로그·지휘 발화가 가리키는 번호와 어긋난다.
// 여기서는 빈 줄을 그대로 두고, 그 줄도 드롭을 받는다.
// ─────────────────────────────────────────────

/** 드래그 중인 것이 출동대 토큰인가 — 구조대상자 드래그에는 반응하지 않는다 */
function hasTokenId(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes('tokenid') || e.dataTransfer.types.includes('tokenId');
}

interface Props {
  /** 이 패널이 담당하는 토큰 */
  tokens:   UnitToken[];
  /** 드롭받은 토큰을 옮길 자리 — 출동대현황은 null, 추가출동대는 'unit-add' */
  zoneKey:  string | null;
  selectMode?:         boolean;
  selected?:           Set<string>;
  onToggleSelect?:     (tokenId: string) => void;
  onTokenDoubleClick?: (tokenId: string) => void;
  /** 착대 라벨 더블클릭 — 없으면 그 동작이 꺼진다(라벨이 평범한 글자가 된다) */
  onOrderDoubleClick?: (items: UnitToken[]) => void;
}

export function ArrivalOrderList({
  tokens, zoneKey, selectMode, selected, onToggleSelect,
  onTokenDoubleClick, onOrderDoubleClick,
}: Props) {
  const { tokens: allTokens, moveToken, setArrivalOrder } = useTokens();
  const { dispatchRoster } = useSettings();
  const [overOrder, setOverOrder] = useState<number | null>(null);

  const orderMap = useMemo(() => buildRosterOrderMap(dispatchRoster), [dispatchRoster]);

  const { rows, unlisted, newOrder } = useMemo(() => {
    // 모드1(PoolTokenGrid)과 같은 규칙 — 동승 중인 펌프는 진압대 하나로 다룬다
    const visible = tokens.filter(t => !isMountedPump(t, tokens, dispatchRoster));

    const groups = new Map<number, UnitToken[]>();
    for (const t of visible) {
      const order = effectiveOrder(t, orderMap);
      groups.set(order, [...(groups.get(order) ?? []), t]);
    }
    const sortItems = (items: UnitToken[]) => [...items].sort((a, b) => {
      const pa = typePriority(a.unitType), pb = typePriority(b.unitType);
      if (pa !== pb) return pa - pb;
      return a.label.localeCompare(b.label, 'ko');
    });

    /*
     * 있는 착대의 min..max 를 **연속으로** 그린다.
     *
     * 있는 것만 그리면 비어 버린 착대가 목록에서 사라져 되돌려 놓을 자리가 없다.
     * 1 부터 그리지 않는 이유는 추가출동대 때문이다 — 로스터가 5착대까지 차 있으면
     * 훈련 중 만든 대는 6착대부터 시작하는데, 1~5 를 빈 줄로 그리면 박스가
     * 빈 줄로만 채워진다.
     */
    const listed = [...groups.keys()].filter(o => o !== UNLISTED_ORDER).sort((a, b) => a - b);
    const min = listed[0] ?? 1;
    const max = listed[listed.length - 1] ?? 0;

    return {
      rows: Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => {
        const order = min + i;
        return { order, items: sortItems(groups.get(order) ?? []) };
      }),
      unlisted: sortItems(groups.get(UNLISTED_ORDER) ?? []),
      newOrder: max + 1,
    };
  }, [tokens, dispatchRoster, orderMap]);

  function dropProps(order: number) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!hasTokenId(e)) return;
        e.preventDefault();
        // 패널 본문의 드롭(= 자리 이동만)이 같은 이벤트를 삼키지 않게 끊는다
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOverOrder(order);
      },
      onDragLeave: () => setOverOrder(o => (o === order ? null : o)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOverOrder(null);
        const tokenId = e.dataTransfer.getData('tokenId');
        if (!tokenId) return;
        const token = allTokens.find(t => t.id === tokenId);
        if (!token) return;
        // 자리를 먼저 옮긴다 — 동승 펌프가 따라온 뒤라야 착대도 함께 바뀐다
        if (token.zoneKey !== zoneKey) moveToken(tokenId, zoneKey);
        setArrivalOrder(tokenId, order);
      },
    };
  }

  const renderTokens = (items: UnitToken[]) => items.map(token => (
    <TokenCard
      key={token.id}
      token={token}
      selectMode={selectMode}
      selected={selected?.has(token.id)}
      onToggleSelect={onToggleSelect ? () => onToggleSelect(token.id) : undefined}
      onDoubleClick={onTokenDoubleClick ? () => onTokenDoubleClick(token.id) : undefined}
    />
  ));

  return (
    <div className="arr-list">
      {rows.map(({ order, items }) => (
        <div
          key={order}
          className={`arr-list__row${overOrder === order ? ' arr-list__row--over' : ''}`}
          {...dropProps(order)}
        >
          <div
            className={`arr-list__label${onOrderDoubleClick ? ' arr-list__label--dispatch' : ''}`}
            onDoubleClick={onOrderDoubleClick ? () => onOrderDoubleClick(items) : undefined}
            title={onOrderDoubleClick ? `더블클릭 — ${order}차 전체 도착` : undefined}
          >
            {order}차
          </div>
          <div className="arr-list__body">{renderTokens(items)}</div>
        </div>
      ))}

      {/* 빈 줄 — 여기 놓으면 착대가 하나 늘어난다 (설정모드 「새 착대」와 같은 자리) */}
      <div
        className={`arr-list__row arr-list__row--new${overOrder === newOrder ? ' arr-list__row--over' : ''}`}
        {...dropProps(newOrder)}
      >
        <div className="arr-list__label">{newOrder}차</div>
        <div className="arr-list__body">
          <span className="arr-list__hint">여기로 끌어다 놓으면 착대가 하나 늘어납니다</span>
        </div>
      </div>

      {/*
        착대가 없는 출동대 — 유관기관·직접입력.
        드롭을 받지 않는다. 우리 편성이 아니라서 착대를 떼어 낼 일이 없고,
        받게 하면 「착대 없음」이 착대의 한 종류처럼 보인다.
      */}
      {unlisted.length > 0 && (
        <div className="arr-list__row arr-list__row--unlisted">
          <div className="arr-list__label">추가</div>
          <div className="arr-list__body">{renderTokens(unlisted)}</div>
        </div>
      )}
    </div>
  );
}

/** 모드1·모드2 전환 — 출동대현황·추가출동대가 같은 모양으로 쓴다 */
export function PoolModeToggle({
  mode, onChange,
}: {
  mode:     'category' | 'arrival';
  onChange: (mode: 'category' | 'arrival') => void;
}) {
  return (
    <div className="pool-mode">
      {(['category', 'arrival'] as const).map((m, i) => (
        <button
          key={m}
          className={`pool-mode__btn${mode === m ? ' pool-mode__btn--on' : ''}`}
          onClick={() => onChange(m)}
          title={m === 'category' ? '종류별로 나열' : '착대 순서로 나열 (끌어서 착대 변경)'}
        >
          모드{i + 1}
        </button>
      ))}
    </div>
  );
}
