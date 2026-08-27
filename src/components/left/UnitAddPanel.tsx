import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens }   from '../../context/TokenContext';
import { useResourceStatus } from '../../context/ResourceStatusContext';
import { UnitStatus }  from './UnitStatus';
import { PoolTokenGrid } from '../shared/PoolTokenGrid';
import { ArrivalOrderList, PoolModeToggle } from '../shared/ArrivalOrderList';
import { UNIT_ADD_ZONE } from '../../utils/unitAddZone';
import { summarizeUnits, summaryText, toUnitRefs } from '../../utils/dispatchSummary';
import './UnitAddPanel.css';
import { rectToStage, stageBounds, stagePortalTarget } from '../../utils/stagePortal';

/**
 * UnitAddPanel — 좌측 최상단 `추가출동대` 박스 + 아래로 펼쳐지는 생성 메뉴.
 *
 * 이전에는 상단 nav 의 `출동대 추가` 버튼이 화면 좌측에서 슬라이드되는
 * 드로어(UnitAddDrawer)를 열었다. 만든 출동대가 어디로 갔는지 바로 안 보여서,
 * 박스와 메뉴를 좌측 패널 안으로 합쳤다.
 *
 *   - 박스는 항상 보인다. 메뉴는 박스 "아래"만 덮으므로 방금 만든 출동대가 가려지지 않는다.
 *   - 만든 출동대는 이 박스(zoneKey: 'unit-add')에 담기고, 이후에는 옮긴 자리에 표시된다.
 *   - 메뉴가 열려 있는 동안 이 박스의 출동대를 우클릭하면 바로 삭제된다.
 */
const ZONE_STANDBY1 = 'standby-standby1';
const ZONE_RESOURCE = 'standby-resource';

export function UnitAddPanel() {
  const { tokens, moveToken, removeToken, addLog } = useTokens();
  const { resourceAssigned } = useResourceStatus();
  const [open, setOpen] = useState(false);
  // 나열 방식 — 출동대현황과 같은 두 모드. 여기서 만든 대도 착대를 갖는다.
  const [listMode, setListMode] = useState<'category' | 'arrival'>('category');

  // ── 추가출동대 요청·회수 로그 ────────────────────────────────────────
  // 생성할 때마다 로그를 남기면 "진압대 → 펌프 → 구조대 …"로 잘게 흩어져
  // 무전 한 번(추가 요청)이 여러 줄이 된다. 창을 **닫는 시점**에 순증·순감을 모아
  // 한 줄로 남긴다. docs/EVENT_LOG_PLAN.md N-5 · N-6
  // 지워진 토큰은 목록에서 사라져 되살릴 수 없다 — 창을 열 때 종류까지 함께 담아 둔다.
  const openSnapshotRef = useRef<Map<string, UnitToken> | null>(null);
  const tokensRef = useRef(tokens);
  useEffect(() => { tokensRef.current = tokens; }, [tokens]);

  useEffect(() => {
    if (open) {
      openSnapshotRef.current = new Map(tokensRef.current.map(t => [t.id, t]));
      return;
    }
    const before = openSnapshotRef.current;
    openSnapshotRef.current = null;
    if (!before) return;   // 최초 마운트(열린 적 없음)

    const now   = tokensRef.current;
    const added = now.filter(t => !before.has(t.id));

    if (added.length > 0) {
      const summary = summarizeUnits(added);
      addLog({
        logType: 'dispatch',
        tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note:    `추가출동대 요청: ${summaryText(summary)}`,
        payload: { kind: 'dispatch-add', units: toUnitRefs(added), summary },
      });
    }

    const nowIds  = new Set(now.map(t => t.id));
    const removed = [...before.values()].filter(t => !nowIds.has(t.id));
    if (removed.length > 0) {
      const summary = summarizeUnits(removed);
      addLog({
        logType: 'dispatch',
        tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note:    `추가출동대 회수: ${summaryText(summary)}`,
        payload: { kind: 'dispatch-remove', units: toUnitRefs(removed), summary },
      });
    }
  }, [open, addLog]);

  const boxRef  = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 메뉴는 body 로 포털한다.
  // 좌측 패널은 .op-panel__section 부터 .app-content 까지 전 조상이 overflow:hidden 이라
  // 안쪽에 절대배치하면 박스 아래로 나간 부분이 통째로 잘려 아무것도 안 보인다.
  const [rect, setRect] = useState<
    { left: number; top: number; width: number; maxHeight: number } | null
  >(null);

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    // 패널이 스테이지 안 포털이라 캔버스 좌표로 잡는다.
    const c = rectToStage(el.getBoundingClientRect());
    const bottom = c.top + c.height;
    // 높이는 내용에 맞추고 화면을 넘길 때만 스크롤한다 (아래 빈 공간 없이)
    setRect({
      left: c.left, top: bottom, width: c.width,
      maxHeight: Math.max(160, stageBounds().height - bottom - 10),
    });
  }, []);

  useLayoutEffect(() => { if (open) measure(); }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open, measure]);

  const zoneTokens = tokens.filter(t => t.zoneKey === UNIT_ADD_ZONE);

  // 박스·메뉴 바깥을 누르면 닫는다. 상황판 조작을 막지 않도록 mousedown 으로 받는다.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  /**
   * 더블클릭 — 자원대기소가 「지정」이면 그리로, 아니면 대기1단계로.
   * 출동대현황(UnitStatusPanel)과 같은 규칙이다. 동승 펌프를 함께 내보내는
   * 일은 moveToken 이 맡는다 — 추가출동대도 대기 박스라 동승이 유지된다.
   */
  function handleTokenDoubleClick(tokenId: string) {
    moveToken(tokenId, resourceAssigned ? ZONE_RESOURCE : ZONE_STANDBY1);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, UNIT_ADD_ZONE);
  }

  /** 생성 메뉴가 열린 동안 이 박스의 출동대를 우클릭하면 바로 지운다 */
  function handleContextMenuDelete(e: React.MouseEvent<HTMLDivElement>) {
    const holder = (e.target as HTMLElement).closest<HTMLElement>('[data-token-id]');
    const tokenId = holder?.getAttribute('data-token-id');
    if (!tokenId) return;
    e.preventDefault();
    e.stopPropagation();
    removeToken(tokenId);
  }

  return (
    <div className="unit-add-panel">
      <div className="panel unit-add-panel__box" ref={boxRef}>
        <div className="panel__header unit-add-panel__header">
          <span>추가출동대</span>
          <PoolModeToggle mode={listMode} onChange={setListMode} />
          <button
            className={`unit-add-panel__btn${open ? ' unit-add-panel__btn--on' : ''}`}
            onClick={() => setOpen(v => !v)}
          >
            출동대 추가
          </button>
        </div>
        <div
          className="unit-add-panel__body"
          data-touch-drop-target="true"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          // 메뉴가 열려 있을 때만 우클릭 삭제 — 평소에는 기존 상태 메뉴가 열린다.
          // 토큰마다 감싸지 않고 여기서 위임 처리한다(정렬을 CategorizedTokenGrid 에 맡기려면
          // 토큰 사이에 래퍼를 끼울 수 없다).
          onContextMenu={open ? handleContextMenuDelete : undefined}
        >
          {zoneTokens.length === 0 ? (
            <span className="unit-add-panel__placeholder">―</span>
          ) : listMode === 'category' ? (
            <PoolTokenGrid
              tokens={zoneTokens}
              onTokenDoubleClick={handleTokenDoubleClick}
            />
          ) : (
            /* 모드2 — 착대 순번마다 한 줄. 여기서는 차수 일괄 도착을 두지 않는다:
               추가 요청한 대는 한 무리로 오는 것이 아니라 그때그때 도착한다 */
            <ArrivalOrderList
              tokens={zoneTokens}
              zoneKey={UNIT_ADD_ZONE}
              onTokenDoubleClick={handleTokenDoubleClick}
            />
          )}
        </div>
      </div>

      {/* 생성 메뉴 + 배경 흐림 (body 로 포털) */}
      {open && rect && createPortal(
        <>
          {/* 배경 — 추가출동대 박스만 남기고 흐리게. 박스는 방금 만든 출동대를
              바로 확인하는 자리라 가리지 않는다. 아래·우측 두 조각으로 나눠 덮는다. */}
          <div
            className="unit-add-panel__scrim"
            style={{ left: 0, top: rect.top, right: 0, bottom: 0 }}
          />
          <div
            className="unit-add-panel__scrim"
            style={{ left: rect.left + rect.width, top: 0, right: 0, height: rect.top }}
          />
        <div
          className="unit-add-panel__menu"
          ref={menuRef}
          style={{ left: rect.left, top: rect.top, width: rect.width, maxHeight: rect.maxHeight }}
        >
          <div className="unit-add-panel__menu-header">
            <span>출동대 생성</span>
            <button
              className="unit-add-panel__menu-close"
              onClick={() => setOpen(false)}
              aria-label="닫기"
            >✕</button>
          </div>
          <div className="unit-add-panel__menu-body">
            <UnitStatus />
          </div>
        </div>
        </>,
        stagePortalTarget(),
      )}
    </div>
  );
}
