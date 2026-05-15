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
};

function floorNumToId(n: number): string {
  return n < 0 ? `B${-n}` : `${n}F`;
}

export function ChecklistPanel() {
  const { checklistConfig, dispatchRoster } = useSettings();
  const { tokens, moveToken, addLog, setCustomNote } = useTokens();
  const { callSetFire }                     = useFireCommand();
  const { setEventStatus }                  = useEvents();
  const [checked,       setChecked]       = useState<Set<string>>(new Set());
  const [collapsed,     setCollapsed]     = useState<Set<string>>(new Set());
  const [activeMessage, setActiveMessage] = useState<ChecklistItem | null>(null);

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
    const isCk = checked.has(item.id);
    if (!isCk) {
      if (item.unitRosterId && item.unitStatusText != null) {
        setCustomNote(`roster-${item.unitRosterId}`, item.unitStatusText);
      }
      setChecked(prev => new Set([...prev, item.id]));
      addLog({ logType: 'checklist', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '', note: item.text });
    } else {
      setChecked(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
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

                  const fireTitle = itemType === 'fire' && item.fireFloor != null
                    ? `${item.fireFloor}층 → ${FIRE_STATUS_LABELS[item.fireTargetStatus!] ?? ''}`
                    : undefined;
                  const title = isLocked ? '배치된 출동대가 있어 해제할 수 없습니다' : fireTitle;

                  function handleClick() {
                    if (isLocked) return;
                    if (itemType === 'arrival')      toggleArrivalItem(item.id, order, item.text);
                    else if (itemType === 'fire')    toggleFireItem(item);
                    else if (itemType === 'message') toggleMessageItem(item);
                    else if (itemType === 'event')   toggleEventItem(item);
                    else if (itemType === 'unit')    toggleUnitItem(item);
                    else                             toggleItem(item.id, item.text);
                  }

                  return (
                    <div
                      key={item.id}
                      className={[
                        'checklist-panel__item',
                        isChecked ? 'checklist-panel__item--checked' : '',
                        isLocked  ? 'checklist-panel__item--locked'  : '',
                      ].filter(Boolean).join(' ')}
                      onClick={handleClick}
                      title={title}
                    >
                      <span className={`checklist-panel__item-badge checklist-panel__item-badge--${itemType}`}>
                        {TYPE_LABELS[itemType] ?? itemType}
                      </span>
                      <span className="checklist-panel__item-text">{item.text}</span>
                      {isLocked && <span className="checklist-panel__lock-icon">🔒</span>}
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
            <div className="checklist-panel__msg-location">
              {activeMessage.messageLocation ?? activeMessage.text}
            </div>
            <div className="checklist-panel__msg-body">
              {activeMessage.messageBody ?? ''}
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
