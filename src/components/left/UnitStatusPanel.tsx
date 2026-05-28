import { useState, useMemo } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import './UnitStatusPanel.css';

const ZONE_STANDBY1 = 'standby-standby1';
const ZONE_RESOURCE = 'standby-resource';

/**
 * 착대모드 unitType 우선순위
 * 같은 착대 내에서: 진압대 > 물탱크 > 구조대 > 구급대 > 나머지
 */
const UNIT_TYPE_PRIORITY: Record<string, number> = {
  suppression: 0,
  water_tank:  1,
  rescue:      2,
  ems:         3,
};

function typePriority(unitType: string): number {
  return UNIT_TYPE_PRIORITY[unitType] ?? 99;
}

/** 출동대현황 — pool(미배치) 토큰 목록 + 반환 드롭 영역 */
export function UnitStatusPanel() {
  const { tokens, moveToken, removeToken, arrivalCountdowns } = useTokens();
  const { arrivalMode, dispatchRoster }          = useSettings();
  const [isDragOver, setIsDragOver] = useState(false);

  // ── pool 토큰 ────────────────────────────────
  const poolTokens = tokens.filter(t => t.zoneKey === null);

  // ── 착대모드: roster ID → arrivalOrder 매핑 ──
  const orderMap = useMemo(
    () => new Map(dispatchRoster.map(r => [`roster-${r.id}`, r.arrivalOrder ?? 1])),
    [dispatchRoster],
  );

  // ── 착대모드: 활동대 tokenId → 연동 차량 tokenId[] 매핑 ──
  // linkedTo 는 활동대의 roster.id 를 가리킴
  const linkedVehicleMap = useMemo(() => {
    const map = new Map<string, string[]>(); // activityTokenId → vehicleTokenId[]
    for (const item of dispatchRoster) {
      if (!item.linkedTo) continue;
      const activityTokenId = `roster-${item.linkedTo}`;
      const vehicleTokenId  = `roster-${item.id}`;
      map.set(activityTokenId, [...(map.get(activityTokenId) ?? []), vehicleTokenId]);
    }
    return map;
  }, [dispatchRoster]);

  // ── 정렬된 pool 토큰 ─────────────────────────
  const sortedPoolTokens = useMemo(() => {
    if (arrivalMode === 'time') {
      // 시간모드: arrival countdown 오름차순
      return [...poolTokens].sort((a, b) => {
        const ca = arrivalCountdowns[a.id] ?? Infinity;
        const cb = arrivalCountdowns[b.id] ?? Infinity;
        return ca - cb;
      });
    }
    // 착대모드: 1차=착대순서, 2차=unitType 우선순위
    return [...poolTokens].sort((a, b) => {
      const oa = orderMap.get(a.id) ?? 99;
      const ob = orderMap.get(b.id) ?? 99;
      if (oa !== ob) return oa - ob;
      return typePriority(a.unitType) - typePriority(b.unitType);
    });
  }, [poolTokens, arrivalMode, arrivalCountdowns, orderMap]);

  // ── 버튼 이동: 활동대 + 연동 차량 동시 이동 ───
  function handleButtonMove(tokenId: string, zoneKey: string) {
    moveToken(tokenId, zoneKey);

    // 연동 차량이 아직 pool 에 있으면 함께 이동
    const linked = linkedVehicleMap.get(tokenId) ?? [];
    for (const linkedId of linked) {
      const linkedToken = tokens.find(t => t.id === linkedId && t.zoneKey === null);
      if (linkedToken) moveToken(linkedToken.id, zoneKey);
    }
  }

  // ── 드롭 핸들러 ──────────────────────────────
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, null);
  }

  const bodyClass = [
    'unit-status-panel__body',
    isDragOver ? 'drop-target--active' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="panel unit-status-panel">
      <div className="panel__header">출동대현황</div>
      <div
        className={bodyClass}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {sortedPoolTokens.length === 0 ? (
          <span className="unit-status-panel__placeholder">―</span>
        ) : arrivalMode === 'time' ? (
          /* ── 시간모드: 기존 2열 카드 배치 ── */
          (() => {
            const n     = sortedPoolTokens.length;
            const right = sortedPoolTokens.slice(0, Math.ceil(n / 2));
            const left  = sortedPoolTokens.slice(Math.ceil(n / 2));
            return (
              <div className="unit-status-panel__columns">
                <div className="unit-status-panel__col">
                  {left.map(token => <TokenCard key={token.id} token={token} onRemove={() => removeToken(token.id)} />)}
                </div>
                <div className="unit-status-panel__col">
                  {right.map(token => <TokenCard key={token.id} token={token} onRemove={() => removeToken(token.id)} />)}
                </div>
              </div>
            );
          })()
        ) : (
          /* ── 착대모드: 1열 행 배치 + 이동 버튼 ── */
          <div className="unit-status-panel__order-list">
            {sortedPoolTokens.map(token => {
              const order = orderMap.get(token.id);
              return (
                <div key={token.id} className="usp-order-row">
                  <div className="usp-order-row__card">
                    <TokenCard token={token} onRemove={() => removeToken(token.id)} />
                  </div>
                  <div className="usp-order-row__btns">
                    {order != null && (
                      <span className="usp-order-row__badge">{order}</span>
                    )}
                    <button
                      className="usp-order-btn usp-order-btn--standby1"
                      type="button"
                      onClick={() => handleButtonMove(token.id, ZONE_STANDBY1)}
                    >
                      대기
                    </button>
                    <button
                      className="usp-order-btn usp-order-btn--resource"
                      type="button"
                      onClick={() => handleButtonMove(token.id, ZONE_RESOURCE)}
                    >
                      자원
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
