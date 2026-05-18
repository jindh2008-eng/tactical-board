import { useState, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { ChecklistItemType, CommandProcedureLevel, CommandProcedureItemType } from '../../types/settings';
import type { FireStatus } from '../../types';
import { EVENT_TYPE_STATUSES, resolveEventType } from '../../types/events';
import { generateId } from '../../utils/settingsStorage';
import { computeRosterDisplayName } from '../../utils/dispatchRoster';
import './ChecklistSetupPanel.css';

const TYPE_LABELS: Record<ChecklistItemType, string> = {
  procedure: '절차',
  event:     '이벤트',
  arrival:   '도착',
  message:   '메세지',
  fire:      '화재',
  xvr:       'XVR',
  unit:      '출동대',
};

const FIRE_STATUS_OPTIONS: { value: FireStatus; label: string }[] = [
  { value: 'peak',     label: '최성기' },
  { value: 'seventy',  label: '큰불잡음' },
  { value: 'half',     label: '50%'   },
  { value: 'initial',  label: '초진'  },
  { value: 'complete', label: '완진'  },
];

const FIRE_STATUS_LABELS: Partial<Record<FireStatus, string>> = {
  'extension-peak': '연소확대',
  peak:             '최성기',
  seventy:          '큰불잡음',
  half:             '50%',
  initial:          '초진',
  complete:         '완진',
};

const ZONE_OPTIONS = ['A면', 'B면', 'C면', 'D면', '직전대기', '임시의료소'];

const CP_LEVELS: CommandProcedureLevel[] = ['beginner', 'intermediate', 'advanced'];
const CP_LEVEL_LABELS: Record<CommandProcedureLevel, string> = {
  beginner:     '초급',
  intermediate: '중급',
  advanced:     '고급',
};

function cpTypeToChecklistType(cpType: CommandProcedureItemType): ChecklistItemType {
  switch (cpType) {
    case 'event':   return 'event';
    case 'message': return 'message';
    case 'fire':    return 'fire';
    default:        return 'procedure';
  }
}

export function ChecklistSetupPanel() {
  const {
    checklistConfig,
    dispatchRoster,
    arrivalMode,
    building,
    eventSetup,
    unitStatusConfig,
    commandProcedureConfigs,
    appendChecklistSections,
    addChecklistSection,
    updateChecklistSection,
    removeChecklistSection,
    reorderChecklistSections,
    addChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    reorderChecklistItems,
  } = useSettings();

  const [newSectionTitle,     setNewSectionTitle]     = useState('');
  const [editingSectionId,    setEditingSectionId]     = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle]  = useState('');
  const [newItemTypes,        setNewItemTypes]         = useState<Record<string, ChecklistItemType>>({});
  const [newItemArrivalOrders,setNewItemArrivalOrders] = useState<Record<string, number>>({});
  const [newFireFloors,       setNewFireFloors]        = useState<Record<string, number>>({});
  const [newFireStatuses,     setNewFireStatuses]      = useState<Record<string, FireStatus>>({});

  // 메세지 타입 전용 상태
  const [msgLocType,  setMsgLocType]  = useState<Record<string, 'floor' | 'zone'>>({});
  const [msgFloor,    setMsgFloor]    = useState<Record<string, string>>({});
  const [msgZone,     setMsgZone]     = useState<Record<string, string>>({});
  const [msgBody,     setMsgBody]     = useState<Record<string, string>>({});

  // 이벤트 타입 전용 상태
  const [newEventIds,      setNewEventIds]      = useState<Record<string, string>>({});
  const [newEventStatuses, setNewEventStatuses] = useState<Record<string, string>>({});

  // 출동대 타입 전용 상태
  const [newUnitRosterIds,   setNewUnitRosterIds]   = useState<Record<string, string>>({});
  const [newUnitStatusTexts, setNewUnitStatusTexts] = useState<Record<string, string>>({});

  // 불러오기 상태
  const [showImport,     setShowImport]     = useState(false);
  const [importLevel,    setImportLevel]    = useState<CommandProcedureLevel>('beginner');
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  // 드래그 상태
  const dragSection = useRef<number | null>(null);
  const dragItem    = useRef<{ sectionId: string; index: number } | null>(null);
  const [overSectionIndex, setOverSectionIndex] = useState<number | null>(null);
  const [overItemKey,      setOverItemKey]       = useState<string | null>(null);

  // 건물 층 목록 생성 (위 → 아래)
  const { aboveGroundFloors, basementFloors } = building.config;
  const allFloorOptions: { id: string; label: string }[] = [];
  if (aboveGroundFloors >= 1) allFloorOptions.push({ id: 'RF', label: 'RF' });
  for (let f = aboveGroundFloors; f >= 1; f--) {
    allFloorOptions.push({ id: `${f}층`, label: `${f}층` });
  }
  for (let b = 1; b <= basementFloors; b++) {
    allFloorOptions.push({ id: `B${b}층`, label: `B${b}층` });
  }

  // 화재층 범위: 화점층 ~ 화점층+2 (건물 층 이내)
  const availableFireFloors = [building.fireFloor, building.fireFloor + 1, building.fireFloor + 2]
    .filter(f => f >= 1 && f <= aboveGroundFloors);

  const allOrders = arrivalMode === 'order'
    ? [...new Set(dispatchRoster.map(r => r.arrivalOrder).filter(Boolean))].sort((a, b) => a - b)
    : [];

  const usedOrders = new Set(
    checklistConfig.sections.flatMap(s =>
      s.items.filter(it => it.itemType === 'arrival' && it.arrivalOrder != null).map(it => it.arrivalOrder!)
    )
  );

  function getNewItemType(sectionId: string): ChecklistItemType {
    return newItemTypes[sectionId] ?? 'procedure';
  }
  function getNewItemOrder(sectionId: string): number {
    if (newItemArrivalOrders[sectionId] != null) return newItemArrivalOrders[sectionId];
    const available = allOrders.find(o => !usedOrders.has(o));
    return available ?? allOrders[0] ?? 1;
  }
  function getFireFloor(sectionId: string): number {
    return newFireFloors[sectionId] ?? availableFireFloors[0] ?? building.fireFloor;
  }
  function getFireStatus(sectionId: string): FireStatus {
    return newFireStatuses[sectionId] ?? 'complete';
  }
  function getMsgLocType(sectionId: string): 'floor' | 'zone' {
    return msgLocType[sectionId] ?? 'floor';
  }
  function getMsgFloor(sectionId: string): string {
    return msgFloor[sectionId] ?? (allFloorOptions[0]?.id ?? '1층');
  }
  function getMsgZone(sectionId: string): string {
    return msgZone[sectionId] ?? 'A면';
  }
  function getMsgBody(sectionId: string): string {
    return msgBody[sectionId] ?? '';
  }
  function getEventId(sectionId: string): string {
    return newEventIds[sectionId] ?? (eventSetup[0]?.id ?? '');
  }
  function getEventStatusOptions(sectionId: string) {
    const ev = eventSetup.find(e => e.id === getEventId(sectionId)) ?? eventSetup[0];
    if (!ev) return [];
    return EVENT_TYPE_STATUSES[resolveEventType(ev)].filter(s => s.value !== '-');
  }
  function getEventStatus(sectionId: string): string {
    const opts = getEventStatusOptions(sectionId);
    return newEventStatuses[sectionId] ?? (opts[0]?.value ?? '');
  }

  // 출동대 타입 헬퍼 — 상태메세지가 있는 로스터만 표시
  const unitEligibleRoster = dispatchRoster.filter(r => (unitStatusConfig[r.unitType]?.length ?? 0) > 0);
  function getUnitRosterId(sectionId: string): string {
    return newUnitRosterIds[sectionId] ?? (unitEligibleRoster[0]?.id ?? '');
  }
  function getUnitStatusOptions(sectionId: string): string[] {
    const rosterId = getUnitRosterId(sectionId);
    const item     = dispatchRoster.find(r => r.id === rosterId);
    return item ? (unitStatusConfig[item.unitType] ?? []) : [];
  }
  function getUnitStatusText(sectionId: string): string {
    return newUnitStatusTexts[sectionId] ?? (getUnitStatusOptions(sectionId)[0] ?? '');
  }

  // ── 불러오기 ─────────────────────────────────

  const importCategories = commandProcedureConfigs[importLevel] ?? [];

  function toggleImportCat(id: string) {
    setImportSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleImport() {
    const cats = importCategories.filter(c => importSelected.has(c.id));
    if (cats.length === 0) return;
    const newSections = cats.map(cat => ({
      id:    generateId(),
      title: cat.categoryTitle,
      items: cat.items.map(it => ({
        id:       generateId(),
        text:     it.text,
        itemType: cpTypeToChecklistType(it.type),
      })),
    }));
    appendChecklistSections(newSections);
    setShowImport(false);
    setImportSelected(new Set());
  }

  // ── 섹션 편집 ────────────────────────────────

  function handleAddSection() {
    const title = newSectionTitle.trim();
    if (!title) return;
    addChecklistSection(title);
    setNewSectionTitle('');
  }

  function startEditSection(id: string, title: string) {
    setEditingSectionId(id);
    setEditingSectionTitle(title);
  }

  function commitEditSection() {
    if (!editingSectionId) return;
    const title = editingSectionTitle.trim();
    if (title) updateChecklistSection(editingSectionId, title);
    setEditingSectionId(null);
  }

  // ── 항목 추가 ────────────────────────────────

  function handleAddItem(sectionId: string) {
    const itemType = getNewItemType(sectionId);

    if (itemType === 'event') {
      if (eventSetup.length === 0) return;
      const eventId  = getEventId(sectionId);
      const status   = getEventStatus(sectionId);
      const ev       = eventSetup.find(e => e.id === eventId);
      if (!ev) return;
      const statusItem = getEventStatusOptions(sectionId).find(s => s.value === status);
      const text = `${ev.label} → ${statusItem?.label ?? status}`;
      addChecklistItem(sectionId, text, 'event', { eventId, eventTargetStatus: status });
      return;
    }

    if (itemType === 'unit') {
      if (unitEligibleRoster.length === 0) return;
      const rosterId  = getUnitRosterId(sectionId);
      const statusTxt = getUnitStatusText(sectionId);
      if (!statusTxt) return;
      const rosterItem = dispatchRoster.find(r => r.id === rosterId);
      if (!rosterItem) return;
      const displayName = computeRosterDisplayName(rosterItem);
      const text = `${displayName} → ${statusTxt}`;
      addChecklistItem(sectionId, text, 'unit', { unitRosterId: rosterId, unitStatusText: statusTxt });
      return;
    }

    if (itemType === 'arrival') {
      if (allOrders.length === 0) return;
      const order = getNewItemOrder(sectionId);
      const text  = `${order}착대 도착`;
      addChecklistItem(sectionId, text, 'arrival', { arrivalOrder: order });
      const nextOrder = allOrders.find(o => o !== order && !usedOrders.has(o));
      setNewItemArrivalOrders(prev => ({ ...prev, [sectionId]: nextOrder ?? allOrders[0] ?? 1 }));

    } else if (itemType === 'fire') {
      if (availableFireFloors.length === 0) return;
      const floor  = getFireFloor(sectionId);
      const status = getFireStatus(sectionId);
      const label  = FIRE_STATUS_LABELS[status] ?? status;
      addChecklistItem(sectionId, `${floor}층 → ${label}`, 'fire', { fireFloor: floor, fireTargetStatus: status });

    } else if (itemType === 'message') {
      const body = getMsgBody(sectionId).trim();
      if (!body) return;
      const locType  = getMsgLocType(sectionId);
      const location = locType === 'floor' ? getMsgFloor(sectionId) : getMsgZone(sectionId);
      addChecklistItem(sectionId, location, 'message', { messageLocation: location, messageBody: body });
      setMsgBody(prev => ({ ...prev, [sectionId]: '' }));

    } else {
      addChecklistItem(sectionId, '', itemType);
    }
  }

  // ── 섹션 드래그 ──────────────────────────────

  function onSectionDragStart(e: React.DragEvent, index: number) {
    dragSection.current = index;
    dragItem.current    = null;
    e.dataTransfer.effectAllowed = 'move';
  }
  function onSectionDragOver(e: React.DragEvent, index: number) {
    if (dragSection.current === null) return;
    e.preventDefault();
    setOverSectionIndex(index);
  }
  function onSectionDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    if (dragSection.current !== null && dragSection.current !== toIndex) {
      reorderChecklistSections(dragSection.current, toIndex);
    }
    dragSection.current = null;
    setOverSectionIndex(null);
  }
  function onDragEnd() {
    dragSection.current = null;
    dragItem.current    = null;
    setOverSectionIndex(null);
    setOverItemKey(null);
  }

  // ── 항목 드래그 ──────────────────────────────

  function onItemDragStart(e: React.DragEvent, sectionId: string, index: number) {
    dragItem.current    = { sectionId, index };
    dragSection.current = null;
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  }
  function onItemDragOver(e: React.DragEvent, sectionId: string, index: number) {
    if (!dragItem.current || dragItem.current.sectionId !== sectionId) return;
    e.preventDefault();
    e.stopPropagation();
    setOverItemKey(`${sectionId}:${index}`);
  }
  function onItemDrop(e: React.DragEvent, sectionId: string, toIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    if (dragItem.current && dragItem.current.sectionId === sectionId && dragItem.current.index !== toIndex) {
      reorderChecklistItems(sectionId, dragItem.current.index, toIndex);
    }
    dragItem.current = null;
    setOverItemKey(null);
  }

  return (
    <div className="checklist-setup">
      {/* 지휘절차 불러오기 */}
      {!showImport ? (
        <div className="checklist-setup__import-bar">
          <button
            className="checklist-setup__import-btn"
            onClick={() => { setShowImport(true); setImportSelected(new Set()); }}
          >
            지휘절차에서 불러오기
          </button>
        </div>
      ) : (
        <div className="checklist-setup__import-panel">
          <div className="checklist-setup__import-level-tabs">
            {CP_LEVELS.map(lv => (
              <button
                key={lv}
                className={`checklist-setup__import-level-tab${importLevel === lv ? ' checklist-setup__import-level-tab--active' : ''}`}
                onClick={() => { setImportLevel(lv); setImportSelected(new Set()); }}
              >
                {CP_LEVEL_LABELS[lv]}
              </button>
            ))}
          </div>
          {importCategories.length === 0 ? (
            <p className="checklist-setup__import-empty">등록된 지휘절차가 없습니다.</p>
          ) : (
            <div className="checklist-setup__import-cats">
              {importCategories.map(cat => (
                <label key={cat.id} className="checklist-setup__import-cat-label">
                  <input type="checkbox" checked={importSelected.has(cat.id)} onChange={() => toggleImportCat(cat.id)} />
                  {cat.categoryTitle}
                  <span className="checklist-setup__import-cat-count">({cat.items.length}개)</span>
                </label>
              ))}
            </div>
          )}
          <div className="checklist-setup__import-actions">
            <button className="checklist-setup__import-confirm-btn" onClick={handleImport} disabled={importSelected.size === 0}>
              가져오기
            </button>
            <button className="checklist-setup__import-cancel-btn" onClick={() => { setShowImport(false); setImportSelected(new Set()); }}>
              취소
            </button>
          </div>
        </div>
      )}

      {/* 섹션 목록 */}
      {checklistConfig.sections.map((section, sectionIndex) => {
        const curItemType     = getNewItemType(section.id);
        const curOrder        = getNewItemOrder(section.id);
        const curFireFloor    = getFireFloor(section.id);
        const curFireStatus   = getFireStatus(section.id);
        const curMsgLocType   = getMsgLocType(section.id);
        const availableOrders = allOrders.filter(o => !usedOrders.has(o) || o === curOrder);
        const canAddArrival   = arrivalMode === 'order' && availableOrders.length > 0;

        return (
          <div
            key={section.id}
            className={`checklist-setup__section${overSectionIndex === sectionIndex && dragSection.current !== sectionIndex ? ' checklist-setup__section--drag-over' : ''}`}
            onDragOver={e => onSectionDragOver(e, sectionIndex)}
            onDrop={e => onSectionDrop(e, sectionIndex)}
          >
            {/* 섹션 헤더 */}
            <div className="checklist-setup__section-header">
              <span
                className="checklist-setup__drag-handle"
                draggable
                onDragStart={e => onSectionDragStart(e, sectionIndex)}
                onDragEnd={onDragEnd}
                title="드래그하여 순서 변경"
              >⠿</span>

              {editingSectionId === section.id ? (
                <input
                  className="checklist-setup__section-title-input"
                  value={editingSectionTitle}
                  onChange={e => setEditingSectionTitle(e.target.value)}
                  onBlur={commitEditSection}
                  onKeyDown={e => { if (e.key === 'Enter') commitEditSection(); }}
                  autoFocus
                />
              ) : (
                <span
                  className="checklist-setup__section-title"
                  onClick={() => startEditSection(section.id, section.title)}
                  title="클릭하여 수정"
                >
                  {section.title}
                </span>
              )}
              <button className="checklist-setup__delete-btn" onClick={() => removeChecklistSection(section.id)} title="섹션 삭제">✕</button>
            </div>

            {/* 항목 목록 */}
            <div className="checklist-setup__items">
              {section.items.map((item, itemIndex) => {
                const itemKey    = `${section.id}:${itemIndex}`;
                const isReadonly = item.itemType === 'arrival' || item.itemType === 'fire' || item.itemType === 'message' || item.itemType === 'event' || item.itemType === 'unit';
                return (
                  <div
                    key={item.id}
                    className={`checklist-setup__item${overItemKey === itemKey && dragItem.current?.index !== itemIndex ? ' checklist-setup__item--drag-over' : ''}`}
                    onDragOver={e => onItemDragOver(e, section.id, itemIndex)}
                    onDrop={e => onItemDrop(e, section.id, itemIndex)}
                  >
                    <span
                      className="checklist-setup__drag-handle checklist-setup__drag-handle--item"
                      draggable
                      onDragStart={e => onItemDragStart(e, section.id, itemIndex)}
                      onDragEnd={onDragEnd}
                      title="드래그하여 순서 변경"
                    >⠿</span>
                    <span className={`checklist-setup__type-badge checklist-setup__type-badge--${item.itemType}`}>
                      {TYPE_LABELS[item.itemType ?? 'procedure']}
                    </span>
                    {isReadonly ? (
                      <span className="checklist-setup__item-text">
                        {item.text}
                        {item.itemType === 'message' && item.messageBody && (
                          <span className="checklist-setup__message-preview">
                            {' — '}{item.messageBody.split('\n')[0].slice(0, 30)}{item.messageBody.length > 30 ? '…' : ''}
                          </span>
                        )}
                      </span>
                    ) : (
                      <input
                        className="checklist-setup__item-input"
                        value={item.text}
                        onChange={e => updateChecklistItem(section.id, item.id, { text: e.target.value })}
                      />
                    )}
                    <button className="checklist-setup__delete-btn" onClick={() => removeChecklistItem(section.id, item.id)} title="항목 삭제">✕</button>
                  </div>
                );
              })}
            </div>

            {/* 항목 추가 영역 */}
            <div className={`checklist-setup__add-item-row${curItemType === 'message' ? ' checklist-setup__add-item-row--message' : ''}`}>
              {/* 타입 선택 */}
              <select
                className="checklist-setup__type-select"
                value={curItemType}
                onChange={e => setNewItemTypes(prev => ({ ...prev, [section.id]: e.target.value as ChecklistItemType }))}
              >
                <option value="procedure">절차</option>
                <option value="event">이벤트</option>
                <option value="unit">출동대</option>
                <option value="message">메세지</option>
                <option value="fire">화재</option>
                <option value="xvr">XVR</option>
                {arrivalMode === 'order' && <option value="arrival">도착</option>}
              </select>

              {/* 출동대 착대 */}
              {curItemType === 'arrival' && (
                <>
                  <select
                    className="checklist-setup__arrival-select"
                    value={curOrder}
                    onChange={e => setNewItemArrivalOrders(prev => ({ ...prev, [section.id]: Number(e.target.value) }))}
                  >
                    {availableOrders.map(o => <option key={o} value={o}>{o}착대</option>)}
                  </select>
                  <button className="checklist-setup__add-item-btn" onClick={() => handleAddItem(section.id)} disabled={!canAddArrival}>
                    추가
                  </button>
                </>
              )}

              {/* 화재 상태 변경 */}
              {curItemType === 'fire' && (
                <>
                  <select
                    className="checklist-setup__fire-select"
                    value={curFireFloor}
                    onChange={e => setNewFireFloors(prev => ({ ...prev, [section.id]: Number(e.target.value) }))}
                  >
                    {availableFireFloors.map(f => <option key={f} value={f}>{f}층</option>)}
                  </select>
                  <select
                    className="checklist-setup__fire-select"
                    value={curFireStatus}
                    onChange={e => setNewFireStatuses(prev => ({ ...prev, [section.id]: e.target.value as FireStatus }))}
                  >
                    {FIRE_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <button className="checklist-setup__add-item-btn" onClick={() => handleAddItem(section.id)} disabled={availableFireFloors.length === 0}>
                    추가
                  </button>
                </>
              )}

              {/* 이벤트 상태 선택 */}
              {curItemType === 'event' && (
                eventSetup.length === 0 ? (
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                    돌발상황 설정에서 항목을 먼저 등록하세요.
                  </span>
                ) : (
                  <>
                    <select
                      className="checklist-setup__fire-select"
                      style={{ flex: 1 }}
                      value={getEventId(section.id)}
                      onChange={e => {
                        setNewEventIds(prev => ({ ...prev, [section.id]: e.target.value }));
                        setNewEventStatuses(prev => ({ ...prev, [section.id]: '' }));
                      }}
                    >
                      {eventSetup.map(ev => (
                        <option key={ev.id} value={ev.id}>{ev.label}</option>
                      ))}
                    </select>
                    <select
                      className="checklist-setup__fire-select"
                      value={getEventStatus(section.id)}
                      onChange={e => setNewEventStatuses(prev => ({ ...prev, [section.id]: e.target.value }))}
                    >
                      {getEventStatusOptions(section.id).map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <button
                      className="checklist-setup__add-item-btn"
                      onClick={() => handleAddItem(section.id)}
                    >
                      추가
                    </button>
                  </>
                )
              )}

              {/* 출동대 상태 선택 */}
              {curItemType === 'unit' && (
                unitEligibleRoster.length === 0 ? (
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                    출동대 상태메세지 설정에서 메세지를 먼저 등록하세요.
                  </span>
                ) : (
                  <>
                    <select
                      className="checklist-setup__fire-select"
                      style={{ flex: 1 }}
                      value={getUnitRosterId(section.id)}
                      onChange={e => {
                        setNewUnitRosterIds(prev => ({ ...prev, [section.id]: e.target.value }));
                        setNewUnitStatusTexts(prev => { const next = { ...prev }; delete next[section.id]; return next; });
                      }}
                    >
                      {unitEligibleRoster.map(r => (
                        <option key={r.id} value={r.id}>{computeRosterDisplayName(r)}</option>
                      ))}
                    </select>
                    <select
                      className="checklist-setup__fire-select"
                      value={getUnitStatusText(section.id)}
                      onChange={e => setNewUnitStatusTexts(prev => ({ ...prev, [section.id]: e.target.value }))}
                    >
                      {getUnitStatusOptions(section.id).map(msg => (
                        <option key={msg} value={msg}>{msg}</option>
                      ))}
                    </select>
                    <button
                      className="checklist-setup__add-item-btn"
                      onClick={() => handleAddItem(section.id)}
                      disabled={!getUnitStatusText(section.id)}
                    >
                      추가
                    </button>
                  </>
                )
              )}

              {/* 메세지 확장 입력 */}
              {curItemType === 'message' && (
                <div className="checklist-setup__message-panel">
                  <div className="checklist-setup__message-loc-row">
                    <div className="checklist-setup__message-loc-tabs">
                      <button
                        type="button"
                        className={`checklist-setup__message-loc-tab${curMsgLocType === 'floor' ? ' checklist-setup__message-loc-tab--active' : ''}`}
                        onClick={() => setMsgLocType(prev => ({ ...prev, [section.id]: 'floor' }))}
                      >층</button>
                      <button
                        type="button"
                        className={`checklist-setup__message-loc-tab${curMsgLocType === 'zone' ? ' checklist-setup__message-loc-tab--active' : ''}`}
                        onClick={() => setMsgLocType(prev => ({ ...prev, [section.id]: 'zone' }))}
                      >구역</button>
                    </div>
                    {curMsgLocType === 'floor' ? (
                      <select
                        className="checklist-setup__message-loc-select"
                        value={getMsgFloor(section.id)}
                        onChange={e => setMsgFloor(prev => ({ ...prev, [section.id]: e.target.value }))}
                      >
                        {allFloorOptions.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                      </select>
                    ) : (
                      <select
                        className="checklist-setup__message-loc-select"
                        value={getMsgZone(section.id)}
                        onChange={e => setMsgZone(prev => ({ ...prev, [section.id]: e.target.value }))}
                      >
                        {ZONE_OPTIONS.map(z => <option key={z} value={z}>{z}</option>)}
                      </select>
                    )}
                  </div>
                  <textarea
                    className="checklist-setup__message-textarea"
                    placeholder="내용 입력... (Enter: 다음 줄)"
                    value={getMsgBody(section.id)}
                    onChange={e => setMsgBody(prev => ({ ...prev, [section.id]: e.target.value }))}
                    rows={3}
                  />
                  <div className="checklist-setup__message-add-row">
                    <button
                      className="checklist-setup__add-item-btn"
                      onClick={() => handleAddItem(section.id)}
                      disabled={!getMsgBody(section.id).trim()}
                    >
                      + 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 기본 텍스트 입력 */}
              {curItemType !== 'arrival' && curItemType !== 'fire' && curItemType !== 'message' && curItemType !== 'event' && curItemType !== 'unit' && (
                <>
                  <input
                    className="checklist-setup__add-item-input"
                    placeholder="항목 추가..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val) return;
                        addChecklistItem(section.id, val, curItemType);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }}
                  />
                  <button
                    className="checklist-setup__add-item-btn"
                    onClick={e => {
                      const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                      const val   = input.value.trim();
                      if (!val) return;
                      addChecklistItem(section.id, val, curItemType);
                      input.value = '';
                    }}
                  >
                    추가
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      <div className="checklist-setup__add-section-row">
        <input
          className="checklist-setup__add-section-input"
          placeholder="새 섹션 제목..."
          value={newSectionTitle}
          onChange={e => setNewSectionTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); }}
        />
        <button className="checklist-setup__add-section-btn" onClick={handleAddSection}>
          + 섹션 추가
        </button>
      </div>
    </div>
  );
}
