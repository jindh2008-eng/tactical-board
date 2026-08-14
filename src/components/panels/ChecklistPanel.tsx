import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal }      from 'react-dom';
import { useSettings }       from '../../store/settingsStore';
import { useTokens }         from '../../context/TokenContext';
import { useVictims }        from '../../context/VictimContext';
import { useFireCommand }    from '../../context/FireCommandContext';
import { useEvents }         from '../../context/EventContext';
import { useChecklistProgress } from '../../context/ChecklistProgressContext';
import { useChecklistCommand }  from '../../context/ChecklistCommandContext';
import { ChecklistView }     from './ChecklistView';
import type { ChecklistItem } from '../../types/settings';
import './ChecklistPanel.css';

/**
 * ChecklistPanel — 진행상황 관리 (무플 화면용, 부수효과 담당)
 *
 * 표시는 ChecklistView 가 맡고, 이 컴포넌트는
 *  1. 항목 체크 시 발생하는 부수효과(화재·이벤트·출동대·도착·메시지·구조대상자)
 *  2. 하위 연동 항목 연쇄 적용
 *  3. 메시지 팝업
 *  4. 원격 명령(지휘교수 태블릿) 수신 처리기 등록
 * 을 담당한다.
 *
 * 부수효과 로직은 화면 분리 작업 전과 동일하다. 원격 명령도 같은 경로를 타므로
 * 무플이 직접 누른 것과 태블릿에서 누른 것의 결과가 항상 같다.
 * → docs/DUAL_SCREEN_SYNC_PLAN.md §4.1, §7 Phase M-1
 */

function floorNumToId(n: number): string {
  return n < 0 ? `B${-n}` : `${n}F`;
}

export function ChecklistPanel() {
  const { checklistConfig, dispatchRoster } = useSettings();
  const { tokens, moveToken, addLog, setCustomNote, toggleMissionTag, setStatusTag } = useTokens();
  const { setVictimDiscovered }             = useVictims();
  const { callSetFire }                     = useFireCommand();
  const { setEventStatus }                  = useEvents();
  const { checked, setChecked }             = useChecklistProgress();
  const { register }                        = useChecklistCommand();
  const [activeMessages,  setActiveMessages]  = useState<ChecklistItem[]>([]);

  function getArrivalTokenIds(order: number): string[] {
    return dispatchRoster
      .filter(r => r.arrivalOrder === order)
      .map(r => `roster-${r.id}`);
  }

  function isArrivalLocked(order: number): boolean {
    const ids = getArrivalTokenIds(order);
    return tokens.some(t =>
      ids.includes(t.id) &&
      t.zoneKey !== null &&
      t.zoneKey !== 'standby-standby1'
    );
  }

  function toggleItem(itemId: string, itemText: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: itemText });
      }
      return next;
    });
  }

  function toggleArrivalItem(itemId: string, order: number, itemText: string) {
    const isCk = checked.has(itemId);
    if (!isCk) {
      getArrivalTokenIds(order).forEach(id => {
        const t = tokens.find(t => t.id === id);
        if (t && t.zoneKey !== 'standby-standby1') moveToken(id, 'standby-standby1');
      });
      setChecked(prev => new Set([...prev, itemId]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: itemText });
    } else {
      if (isArrivalLocked(order)) return;
      getArrivalTokenIds(order).forEach(id => {
        const t = tokens.find(t => t.id === id);
        if (t && t.zoneKey === 'standby-standby1') moveToken(id, null);
      });
      setChecked(prev => { const n = new Set(prev); n.delete(itemId); return n; });
    }
  }

  function toggleFireItem(item: ChecklistItem) {
    const isCk = checked.has(item.id);
    if (!isCk) {
      if (item.fireFloor != null && item.fireTargetStatus != null) {
        callSetFire(floorNumToId(item.fireFloor), item.fireTargetStatus);
      }
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  function toggleEventItem(item: ChecklistItem) {
    const isCk = checked.has(item.id);
    if (!isCk) {
      if (item.eventId && item.eventTargetStatus != null) {
        setEventStatus(item.eventId, item.eventTargetStatus);
      }
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  function toggleUnitItem(item: ChecklistItem) {
    const isCk    = checked.has(item.id);
    const tokenId = item.unitRosterId ? `roster-${item.unitRosterId}` : null;
    if (!tokenId) return;
    const effectType = item.unitEffectType ?? 'statusMsg';

    if (!isCk) {
      if (effectType === 'statusMsg' && item.unitStatusText != null) {
        setCustomNote(tokenId, item.unitStatusText);
      } else if (effectType === 'mission' && item.unitMissionLabel && item.unitMissionColor) {
        toggleMissionTag(tokenId, { label: item.unitMissionLabel, color: item.unitMissionColor });
      } else if (effectType === 'status' && item.unitStatusTagLabel && item.unitStatusTagColor) {
        setStatusTag(tokenId, { label: item.unitStatusTagLabel, color: item.unitStatusTagColor });
      }
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      if (effectType === 'statusMsg') {
        setCustomNote(tokenId, '');
      } else if (effectType === 'mission' && item.unitMissionLabel && item.unitMissionColor) {
        toggleMissionTag(tokenId, { label: item.unitMissionLabel, color: item.unitMissionColor });
      } else if (effectType === 'status') {
        setStatusTag(tokenId, null);
      }
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  function applyChildEffect(child: ChecklistItem, checking: boolean) {
    const t = child.itemType ?? 'procedure';
    if (t === 'unit') {
      const tokenId = child.unitRosterId ? `roster-${child.unitRosterId}` : null;
      if (!tokenId) return;
      const et = child.unitEffectType ?? 'statusMsg';
      if (checking) {
        if (et === 'statusMsg' && child.unitStatusText != null)
          setCustomNote(tokenId, child.unitStatusText);
        else if (et === 'mission' && child.unitMissionLabel && child.unitMissionColor)
          toggleMissionTag(tokenId, { label: child.unitMissionLabel, color: child.unitMissionColor });
        else if (et === 'status' && child.unitStatusTagLabel && child.unitStatusTagColor)
          setStatusTag(tokenId, { label: child.unitStatusTagLabel, color: child.unitStatusTagColor });
      } else {
        if (et === 'statusMsg') setCustomNote(tokenId, '');
        else if (et === 'mission' && child.unitMissionLabel && child.unitMissionColor)
          toggleMissionTag(tokenId, { label: child.unitMissionLabel, color: child.unitMissionColor });
        else if (et === 'status') setStatusTag(tokenId, null);
      }
    } else if (t === 'incident') {
      if (checking && child.eventId && child.eventTargetStatus != null)
        setEventStatus(child.eventId, child.eventTargetStatus);
    } else if (t === 'fire') {
      if (checking && child.fireFloor != null && child.fireTargetStatus != null)
        callSetFire(floorNumToId(child.fireFloor), child.fireTargetStatus);
    } else if (t === 'arrival') {
      const order = child.arrivalOrder ?? 1;
      if (checking) {
        getArrivalTokenIds(order).forEach(id => {
          const tk = tokens.find(tk => tk.id === id);
          if (tk && tk.zoneKey !== 'standby-standby1') moveToken(id, 'standby-standby1');
        });
      } else {
        if (!isArrivalLocked(order)) {
          getArrivalTokenIds(order).forEach(id => {
            const tk = tokens.find(tk => tk.id === id);
            if (tk && tk.zoneKey === 'standby-standby1') moveToken(id, null);
          });
        }
      }
    } else if (t === 'message') {
      if (checking) setActiveMessages(prev => prev.some(m => m.id === child.id) ? prev : [...prev, child]);
      else          setActiveMessages(prev => prev.filter(m => m.id !== child.id));
    } else if (t === 'victim') {
      const tokenId = child.victimSetupId ? `victim-setup-${child.victimSetupId}` : null;
      if (!tokenId) return;
      const vis = child.victimVisibility ?? 'show';
      setVictimDiscovered(tokenId, checking ? vis === 'show' : vis === 'hide');
    }
    // procedure, event, xvr: 사이드이펙트 없음
  }

  function triggerLinkedChildren(parentId: string, checking: boolean) {
    const children: ChecklistItem[] = [];
    for (const sec of checklistConfig.sections) {
      for (const it of sec.items) {
        if (it.linkedParentId === parentId) children.push(it);
      }
    }
    if (children.length === 0) return;
    children.forEach(c => applyChildEffect(c, checking));
    setChecked(prev => {
      const next = new Set(prev);
      children.forEach(c => checking ? next.add(c.id) : next.delete(c.id));
      return next;
    });
    if (checking) {
      children.forEach(c => addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: c.text }));
    }
    // 자식의 자식도 연쇄 적용 (다단계 연동)
    children.forEach(c => triggerLinkedChildren(c.id, checking));
  }

  function toggleVictimItem(item: ChecklistItem) {
    const isCk      = checked.has(item.id);
    const tokenId   = item.victimSetupId ? `victim-setup-${item.victimSetupId}` : null;
    if (!tokenId) return;
    const visibility = item.victimVisibility ?? 'show';
    if (!isCk) {
      setVictimDiscovered(tokenId, visibility === 'show');
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      setVictimDiscovered(tokenId, visibility === 'hide');
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  function toggleMessageItem(item: ChecklistItem) {
    const isCk = checked.has(item.id);
    if (!isCk) {
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
      setActiveMessages(prev => prev.some(m => m.id === item.id) ? prev : [...prev, item]);
    } else {
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
      setActiveMessages(prev => prev.filter(m => m.id !== item.id));
    }
  }

  // ── 항목 토글 진입점 ────────────────────────────────────────────────
  // 로컬 클릭과 원격 명령이 모두 여기로 들어온다.
  // checking 을 명시로 받아 멱등하게 동작한다 (이미 목표 상태면 무시).
  function applyItemToggle(item: ChecklistItem, checking: boolean) {
    if (checked.has(item.id) === checking) return;

    const itemType = item.itemType ?? 'procedure';
    const order    = item.arrivalOrder ?? 1;

    // 배치된 출동대가 있는 도착 항목은 해제할 수 없다
    if (itemType === 'arrival' && !checking && isArrivalLocked(order)) return;

    if (itemType === 'arrival')       toggleArrivalItem(item.id, order, item.text);
    else if (itemType === 'fire')     toggleFireItem(item);
    else if (itemType === 'message')  toggleMessageItem(item);
    else if (itemType === 'incident') toggleEventItem(item);
    else if (itemType === 'unit')     toggleUnitItem(item);
    else if (itemType === 'victim')   toggleVictimItem(item);
    else                              toggleItem(item.id, item.text);
    triggerLinkedChildren(item.id, checking);
  }

  function handleToggle(item: ChecklistItem) {
    applyItemToggle(item, !checked.has(item.id));
  }

  // ── 🔒 표시 대상: 배치된 출동대가 있어 해제 불가한 도착 항목 ──────────
  const lockedItemIds = useMemo(() => {
    const locked = new Set<string>();
    for (const sec of checklistConfig.sections) {
      for (const it of sec.items) {
        if ((it.itemType ?? 'procedure') !== 'arrival') continue;
        if (checked.has(it.id) && isArrivalLocked(it.arrivalOrder ?? 1)) locked.add(it.id);
      }
    }
    return locked;
    // isArrivalLocked 는 tokens·dispatchRoster 에서 파생된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistConfig, checked, tokens, dispatchRoster]);

  // ── 원격 명령(지휘교수 태블릿) 수신 처리기 등록 ──────────────────────
  // 최신 클로저를 유지하기 위해 ref 를 매 렌더 갱신한다.
  const remoteToggleRef = useRef<(itemId: string, checking: boolean) => void>(() => {});
  useEffect(() => {
    remoteToggleRef.current = (itemId, checking) => {
      for (const sec of checklistConfig.sections) {
        const item = sec.items.find(it => it.id === itemId);
        if (item) { applyItemToggle(item, checking); return; }
      }
    };
  });

  useEffect(() => {
    register((itemId, checking) => remoteToggleRef.current(itemId, checking));
    return () => register(null);
  }, [register]);

  return (
    <>
      <ChecklistView
        checked={checked}
        lockedItemIds={lockedItemIds}
        onToggle={handleToggle}
      />
      {activeMessages.length > 0 && createPortal(
        <div className="checklist-panel__msg-overlay" onClick={() => setActiveMessages([])}>
          <div className="checklist-panel__msg-stack" onClick={e => e.stopPropagation()}>
            {activeMessages.map(msg => (
              <div key={msg.id} className="checklist-panel__msg-popup">
                <div className="checklist-panel__msg-header">
                  <span className="checklist-panel__msg-title">
                    {msg.messageTitle ?? msg.text}
                  </span>
                </div>
                <hr className="checklist-panel__msg-divider" />
                <div className="checklist-panel__msg-body">
                  {msg.messageBody ?? msg.text}
                </div>
                <div className="checklist-panel__msg-footer">
                  <button
                    className="checklist-panel__msg-close"
                    onClick={() => setActiveMessages(prev => prev.filter(m => m.id !== msg.id))}
                  >
                    닫기
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
