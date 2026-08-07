import { useState, useMemo, useEffect } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { useResourceStatus } from '../../context/ResourceStatusContext';
import { CategorizedTokenGrid } from '../shared/CategorizedTokenGrid';
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
  const { resourceAssigned }        = useResourceStatus();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  // ── pool 토큰 ────────────────────────────────
  const poolTokens = tokens.filter(t => t.zoneKey === null);

  // 선택모드 중 pool에서 빠진 토큰은 선택 해제
  const poolIds = useMemo(() => new Set(poolTokens.map(t => t.id)), [poolTokens]);
  useEffect(() => {
    if (!selectMode) return;
    setSelected(prev => {
      const next = new Set([...prev].filter(id => poolIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectMode, poolIds]);

  function toggleSelect(tokenId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tokenId)) next.delete(tokenId); else next.add(tokenId);
      return next;
    });
  }

  function handleBulkRemove() {
    if (selected.size === 0) return;
    if (!window.confirm(`선택한 ${selected.size}개 출동대를 삭제하겠습니까?`)) return;
    for (const id of selected) removeToken(id);
    setSelected(new Set());
    setSelectMode(false);
  }

  function handleCancelSelect() {
    setSelected(new Set());
    setSelectMode(false);
  }

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

  // ── 더블클릭 이동: 활동대 + 연동 차량 동시 이동 ───
  // 자원대기소가 "지정"(운영) 상태면 자원대기소로, 아니면 대기1단계로 바로 이동
  function handleButtonMove(tokenId: string, zoneKey: string) {
    moveToken(tokenId, zoneKey);

    // 연동 차량이 아직 pool 에 있으면 함께 이동
    const linked = linkedVehicleMap.get(tokenId) ?? [];
    for (const linkedId of linked) {
      const linkedToken = tokens.find(t => t.id === linkedId && t.zoneKey === null);
      if (linkedToken) moveToken(linkedToken.id, zoneKey);
    }
  }

  function handleTokenDoubleClick(tokenId: string) {
    handleButtonMove(tokenId, resourceAssigned ? ZONE_RESOURCE : ZONE_STANDBY1);
  }

  // ── 드롭 핸들러 ──────────────────────────────
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, null);
  }

  return (
    <div className="panel unit-status-panel">
      <div className="panel__header usp__header">
        <span>출동대현황</span>
        {poolTokens.length > 0 && (
          <div className="usp__header-actions">
            {selectMode ? (
              <>
                <button
                  className="usp__header-btn usp__header-btn--delete"
                  onClick={handleBulkRemove}
                  disabled={selected.size === 0}
                  title="선택한 출동대 삭제"
                >
                  🗑 {selected.size > 0 && selected.size}
                </button>
                <button className="usp__header-btn" onClick={handleCancelSelect}>
                  취소
                </button>
              </>
            ) : (
              <button className="usp__header-btn" onClick={() => setSelectMode(true)}>
                선택삭제
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="unit-status-panel__body"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {sortedPoolTokens.length === 0 ? (
          <span className="unit-status-panel__placeholder">―</span>
        ) : (
          <CategorizedTokenGrid
            tokens={sortedPoolTokens}
            hideQuantity
            selectMode={selectMode}
            selected={selected}
            onToggleSelect={toggleSelect}
            onTokenDoubleClick={handleTokenDoubleClick}
          />
        )}
      </div>
    </div>
  );
}
