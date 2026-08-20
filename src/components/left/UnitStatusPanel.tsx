import { useState, useMemo, useEffect } from 'react';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import { useResourceStatus } from '../../context/ResourceStatusContext';
import { PoolTokenGrid } from '../shared/PoolTokenGrid';
import { isMountedPump } from '../../utils/unitPairing';
import { TokenCard } from '../shared/TokenCard';
import './UnitStatusPanel.css';

const ZONE_STANDBY1 = 'standby-standby1';
const ZONE_RESOURCE = 'standby-resource';

/** 로스터에 없는 출동대(직접 추가분)를 모으는 가상 착대 순번 — 항상 맨 뒤 */
const UNLISTED_ORDER = 999;

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
  // 나열 방식 — 모드1: 종류별 컬럼(기존) / 모드2: 설정한 착대 순서
  const [listMode, setListMode]     = useState<'category' | 'arrival'>('category');

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

  // ── 모드2: 설정창에 지정한 착대 순서 ─────────
  // 시간모드/착대모드(arrivalMode)와 무관하게 로스터의 arrivalOrder 를 그대로 쓴다.
  // 착대 순번 하나가 열 하나가 된다. 로스터에 없는 출동대(직접 추가분)는 맨 뒤 열로.
  const arrivalColumns = useMemo(() => {
    const groups = new Map<number, UnitToken[]>();
    // 모드1(PoolTokenGrid)과 같은 규칙 — 동승 중인 펌프는 진압대 하나로 다룬다
    for (const t of poolTokens.filter(t => !isMountedPump(t, poolTokens, dispatchRoster))) {
      const order = orderMap.get(t.id) ?? UNLISTED_ORDER;
      groups.set(order, [...(groups.get(order) ?? []), t]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a - b)
      .map(([order, items]) => ({
        order,
        label: order === UNLISTED_ORDER ? '추가' : `${order}차`,
        items: items.sort((a, b) => {
          const pa = typePriority(a.unitType), pb = typePriority(b.unitType);
          if (pa !== pb) return pa - pb;
          return a.label.localeCompare(b.label, 'ko');
        }),
      }));
  }, [poolTokens, orderMap, dispatchRoster]);

  // ── 더블클릭 이동 ────────────────────────────
  // 자원대기소가 "지정"(운영) 상태면 자원대기소로, 아니면 대기1단계로 바로 이동.
  // 동승 중인 펌프를 함께 내보내는 일은 TokenContext.moveToken 이 맡는다 —
  // 여기서 또 옮기면 로스터 짝만 처리돼 훈련 중 만든 짝과 규칙이 갈린다.
  function handleButtonMove(tokenId: string, zoneKey: string) {
    moveToken(tokenId, zoneKey);
  }

  function handleTokenDoubleClick(tokenId: string) {
    handleButtonMove(tokenId, resourceAssigned ? ZONE_RESOURCE : ZONE_STANDBY1);
  }

  // 착대 라벨 더블클릭 — 그 차수 전체를 한꺼번에 도착시킨다.
  // 같은 순간에 옮기므로 도착지에서 하나의 "도착대"로 묶인다(utils/arrivalGroup).
  const canDispatchByOrder = arrivalMode === 'order';

  function handleOrderDoubleClick(items: UnitToken[]) {
    const target = resourceAssigned ? ZONE_RESOURCE : ZONE_STANDBY1;
    for (const t of items) moveToken(t.id, target);
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
        <div className="usp__mode">
          {(['category', 'arrival'] as const).map((m, i) => (
            <button
              key={m}
              className={`usp__mode-btn${listMode === m ? ' usp__mode-btn--on' : ''}`}
              onClick={() => setListMode(m)}
              title={m === 'category' ? '종류별로 나열' : '설정한 착대 순서로 나열'}
            >
              모드{i + 1}
            </button>
          ))}
        </div>
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
        data-touch-drop-target="true"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {poolTokens.length === 0 ? (
          <span className="unit-status-panel__placeholder">―</span>
        ) : listMode === 'category' ? (
          <PoolTokenGrid
            tokens={sortedPoolTokens}
            selectMode={selectMode}
            selected={selected}
            onToggleSelect={toggleSelect}
            onTokenDoubleClick={handleTokenDoubleClick}
          />
        ) : (
          /* 모드2 — 착대 순번마다 한 줄. 라벨 더블클릭이면 그 차수 전체가 출동한다 */
          <div className="usp-arrival-list">
            {arrivalColumns.map(col => (
              <div key={col.order} className="usp-arrival-list__row">
                <div
                  className={`usp-arrival-list__label${canDispatchByOrder && col.order !== UNLISTED_ORDER ? ' usp-arrival-list__label--dispatch' : ''}`}
                  onDoubleClick={
                    canDispatchByOrder && col.order !== UNLISTED_ORDER
                      ? () => handleOrderDoubleClick(col.items)
                      : undefined
                  }
                  title={
                    canDispatchByOrder && col.order !== UNLISTED_ORDER
                      ? `더블클릭 — ${col.label} 전체 도착`
                      : undefined
                  }
                >
                  {col.label}
                </div>
                <div className="usp-arrival-list__body">
                  {col.items.map(token => (
                    <TokenCard
                      key={token.id}
                      token={token}
                      selectMode={selectMode}
                      selected={selected.has(token.id)}
                      onToggleSelect={() => toggleSelect(token.id)}
                      onDoubleClick={() => handleTokenDoubleClick(token.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
