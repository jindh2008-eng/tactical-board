import { useState }          from 'react';
import { createPortal }      from 'react-dom';
import { useSettings }       from '../../store/settingsStore';
import { useTokens }         from '../../context/TokenContext';
import { useFireCommand }    from '../../context/FireCommandContext';
import { useEvents }         from '../../context/EventContext';
import type { ChecklistItem, ChecklistItemType } from '../../types/settings';
import type { FireStatus }    from '../../types';
import './ChecklistPanel.css';

const FIRE_STATUS_LABELS: Partial<Record<FireStatus, string>> = {
  'extension-peak': '연소확대',
  peak:             '최성기',
  seventy:          '큰불잡음',
  half:             '50%',
  initial:          '초진',
  complete:         '완진',
};

const TYPE_LABELS: Record<ChecklistItemType, string> = {
  procedure: '절차',
  event:     '이벤트',
  arrival:   '도착',
  message:   '메세지',
  fire:      '화재',
  xvr:       'XVR',
  unit:      '출동대',
  incident:  '돌발상황',
};

function floorNumToId(n: number): string {
  return n < 0 ? `B${-n}` : `${n}F`;
}

export function ChecklistPanel() {
  const { checklistConfig, dispatchRoster } = useSettings();
  const { tokens, moveToken, addLog, setCustomNote, toggleMissionTag, setStatusTag } = useTokens();
  const { callSetFire }                     = useFireCommand();
  const { setEventStatus }                  = useEvents();
  const [checked,         setChecked]         = useState<Set<string>>(new Set());
  const [collapsed,       setCollapsed]       = useState<Set<string>>(new Set());
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [activeMessage,   setActiveMessage]   = useState<ChecklistItem | null>(null);

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
      if (checking) setActiveMessage(child);
      else setActiveMessage(prev => prev?.id === child.id ? null : prev);
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

  function toggleMessageItem(item: ChecklistItem) {
    const isCk = checked.has(item.id);
    if (!isCk) {
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
    setActiveMessage(activeMessage?.id === item.id ? null : item);
  }

  function toggleSection(sectionId: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else                     next.add(sectionId);
      return next;
    });
  }

  const totalItems   = checklistConfig.sections.reduce((n, s) => n + s.items.length, 0);
  const checkedCount = checklistConfig.sections.reduce(
    (n, s) => n + s.items.filter(it => checked.has(it.id)).length, 0
  );

  return (
    <div className="checklist-panel">
      <div className="checklist-panel__header">
        <span className="checklist-panel__title">진행상황 관리</span>
        {totalItems > 0 && (
          <span className="checklist-panel__progress">{checkedCount}/{totalItems}</span>
        )}
      </div>
      <div className="checklist-panel__body">
        {checklistConfig.sections.length === 0 ? (
          <span className="checklist-panel__empty">설정창에서 체크리스트를 추가하세요.</span>
        ) : (
          checklistConfig.sections.map(section => {
            const isCollapsed = collapsed.has(section.id);
            // 이 섹션에서 하위 항목을 가진 상위 항목 ID 집합
            const parentItemIds = new Set(
              section.items.filter(it => it.linkedParentId).map(it => it.linkedParentId!)
            );

            return (
              <div key={section.id} className="checklist-panel__section">
                <button
                  className="checklist-panel__section-title"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="checklist-panel__section-arrow">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  {section.title}
                </button>
                <div className="checklist-panel__divider" />
                {!isCollapsed && section.items.map(item => {
                  const itemType  = item.itemType ?? 'procedure';
                  const isChecked = checked.has(item.id);
                  const order     = item.arrivalOrder ?? 1;
                  const isLocked  = itemType === 'arrival' && isChecked && isArrivalLocked(order);
                  const isLinked  = !!item.linkedParentId;
                  const isParent  = parentItemIds.has(item.id);

                  // 하위 항목은 상위가 펼쳐진 경우에만 표시
                  if (isLinked && !expandedParents.has(item.linkedParentId!)) return null;

                  const fireTitle = itemType === 'fire' && item.fireFloor != null
                    ? `${item.fireFloor}층 → ${FIRE_STATUS_LABELS[item.fireTargetStatus!] ?? ''}`
                    : undefined;
                  const title = isLocked ? '배치된 출동대가 있어 해제할 수 없습니다' : fireTitle;

                  function handleClick() {
                    if (isLocked) return;
                    const checking = !isChecked;
                    if (itemType === 'arrival')       toggleArrivalItem(item.id, order, item.text);
                    else if (itemType === 'fire')     toggleFireItem(item);
                    else if (itemType === 'message')  toggleMessageItem(item);
                    else if (itemType === 'incident') toggleEventItem(item);
                    else if (itemType === 'unit')     toggleUnitItem(item);
                    else                              toggleItem(item.id, item.text);
                    triggerLinkedChildren(item.id, checking);
                  }

                  return (
                    <div
                      key={item.id}
                      className={[
                        'checklist-panel__item',
                        isChecked ? 'checklist-panel__item--checked' : '',
                        isLocked  ? 'checklist-panel__item--locked'  : '',
                        isLinked  ? 'checklist-panel__item--linked'   : '',
                      ].filter(Boolean).join(' ')}
                      onClick={handleClick}
                      title={title}
                    >
                      {isLinked && <span className="checklist-panel__link-icon">└</span>}
                      <span className={`checklist-panel__item-badge checklist-panel__item-badge--${itemType}`}>
                        {TYPE_LABELS[itemType] ?? itemType}
                      </span>
                      <span className="checklist-panel__item-text">{item.text}</span>
                      {isLocked && <span className="checklist-panel__lock-icon">🔒</span>}
                      {/* 상위 항목 하위 숨김/표시 체크박스 */}
                      {isParent && (
                        <input
                          type="checkbox"
                          className="checklist-panel__expand-cb"
                          checked={!expandedParents.has(item.id)}
                          title={expandedParents.has(item.id) ? '하위 항목 숨기기' : '하위 항목 표시'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation();
                            setExpandedParents(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(item.id);
                              else                  next.add(item.id);
                              return next;
                            });
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
      {activeMessage && createPortal(
        <div className="checklist-panel__msg-overlay">
          <div className="checklist-panel__msg-popup">
            {activeMessage.messageLocation && (
              <div className="checklist-panel__msg-location">
                {activeMessage.messageLocation}
              </div>
            )}
            <div className="checklist-panel__msg-body">
              {activeMessage.messageBody ?? activeMessage.text}
            </div>
            <div className="checklist-panel__msg-footer">
              <button className="checklist-panel__msg-close" onClick={() => setActiveMessage(null)}>
                ✕
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
