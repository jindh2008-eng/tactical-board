import { useState, useRef } from 'react';
import { useSettings } from '../../store/settingsStore';
import type { ChecklistItem, ChecklistItemType, CommandProcedureLevel, CommandProcedureItemType, TagPreset, VictimSetupItem } from '../../types/settings';
import type { FireStatus } from '../../types';
import { EVENT_TYPE_STATUSES, resolveEventType } from '../../types/events';
import { generateId } from '../../utils/settingsStorage';
import { computeRosterDisplayName } from '../../utils/dispatchRoster';
import { downloadChecklistMarkdown } from '../../utils/exportChecklistMarkdown';
import './ChecklistSetupPanel.css';

const TYPE_LABELS: Record<ChecklistItemType, string> = {
  procedure: '절차',
  event:     '이벤트',
  arrival:   '도착',
  message:   '메세지',
  fire:      '화재',
  xvr:       'XVR',
  unit:      '출동대',
  incident:  '현장요소',
  victim:    '구조대상자',
};

function formatVictimLabel(item: VictimSetupItem, idx: number): string {
  const parts: string[] = [item.gender, item.ageGroup, item.condition];
  if (item.floor !== null) {
    parts.push(item.floor === 'RF' ? '옥상' : item.floor > 0 ? `${item.floor}층` : `B${-item.floor}층`);
  }
  if (item.face) parts.push(`${item.face}면`);
  if (item.detailLocation.trim()) parts.push(item.detailLocation.trim());
  return `#${idx + 1} ${parts.join('/')}`;
}

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
    victimSetup,
    unitStatusConfig,
    unitTagPresetConfig,
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

  // 메세지 타입 전용 상태 (새 항목 추가용)
  const [msgTitle,    setMsgTitle]    = useState<Record<string, string>>({});
  const [msgBody,     setMsgBody]     = useState<Record<string, string>>({});

  // 메세지 항목 인라인 편집 상태
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTitle,     setEditTitle]     = useState('');
  const [editBody,      setEditBody]      = useState('');

  // 이벤트 타입 전용 상태
  const [newEventIds,      setNewEventIds]      = useState<Record<string, string>>({});
  const [newEventStatuses, setNewEventStatuses] = useState<Record<string, string>>({});

  // 출동대 타입 전용 상태
  const [newUnitRosterIds,     setNewUnitRosterIds]     = useState<Record<string, string>>({});
  const [newUnitEffectTypes,   setNewUnitEffectTypes]   = useState<Record<string, 'statusMsg' | 'mission' | 'status'>>({});
  const [newUnitStatusTexts,   setNewUnitStatusTexts]   = useState<Record<string, string>>({});
  const [newUnitMissionLabels, setNewUnitMissionLabels] = useState<Record<string, string>>({});
  const [newUnitStatusTagLabels, setNewUnitStatusTagLabels] = useState<Record<string, string>>({});

  // 구조대상자 타입 전용 상태
  const [newVictimIds,          setNewVictimIds]          = useState<Record<string, string>>({});
  const [newVictimVisibilities, setNewVictimVisibilities] = useState<Record<string, 'show' | 'hide'>>({});

  // 연동 체크박스 (새 항목용) — true = 바로 위 항목과 연동
  const [newItemLinked, setNewItemLinked] = useState<Record<string, boolean>>({});

  // 불러오기 상태
  const [showImport,     setShowImport]     = useState(false);
  const [importLevel,    setImportLevel]    = useState<CommandProcedureLevel>('beginner');
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  // 드래그 상태
  const dragSection = useRef<number | null>(null);
  const dragItem    = useRef<{ sectionId: string; index: number } | null>(null);
  const [overSectionIndex, setOverSectionIndex] = useState<number | null>(null);
  const [overItemKey,      setOverItemKey]       = useState<string | null>(null);

  // 화재층 범위: 화점층 ~ 화점층+2 (건물 층 이내)
  const { aboveGroundFloors } = building.config;
  const availableFireFloors = [0, 1, 2, 3, 4]
    .map(offset => building.fireFloor + offset)
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
  function getMsgTitle(sectionId: string): string {
    return msgTitle[sectionId] ?? '';
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

  // 출동대 타입 헬퍼 — 임무/상태/메세지 프리셋이 하나라도 있는 로스터 표시
  const unitEligibleRoster = dispatchRoster.filter(r => {
    const hasMsgs      = (unitStatusConfig[r.unitType]?.length ?? 0) > 0;
    const hasMissions  = (unitTagPresetConfig[r.unitType]?.missions.length ?? 0) > 0;
    const hasStatuses  = (unitTagPresetConfig[r.unitType]?.statuses.length ?? 0) > 0;
    return hasMsgs || hasMissions || hasStatuses;
  });
  function getUnitRosterId(sectionId: string): string {
    return newUnitRosterIds[sectionId] ?? (unitEligibleRoster[0]?.id ?? '');
  }
  function getUnitEffectType(sectionId: string): 'statusMsg' | 'mission' | 'status' {
    return newUnitEffectTypes[sectionId] ?? 'statusMsg';
  }
  function getUnitStatusOptions(sectionId: string): string[] {
    const item = dispatchRoster.find(r => r.id === getUnitRosterId(sectionId));
    return item ? (unitStatusConfig[item.unitType] ?? []) : [];
  }
  function getMissionOptions(sectionId: string): TagPreset[] {
    const item = dispatchRoster.find(r => r.id === getUnitRosterId(sectionId));
    return item ? (unitTagPresetConfig[item.unitType]?.missions ?? []) : [];
  }
  function getStatusTagOptions(sectionId: string): TagPreset[] {
    const item = dispatchRoster.find(r => r.id === getUnitRosterId(sectionId));
    return item ? (unitTagPresetConfig[item.unitType]?.statuses ?? []) : [];
  }
  function getUnitStatusText(sectionId: string): string {
    return newUnitStatusTexts[sectionId] ?? (getUnitStatusOptions(sectionId)[0] ?? '');
  }
  function getUnitMissionLabel(sectionId: string): string {
    return newUnitMissionLabels[sectionId] ?? (getMissionOptions(sectionId)[0]?.label ?? '');
  }
  function getUnitStatusTagLabel(sectionId: string): string {
    return newUnitStatusTagLabels[sectionId] ?? (getStatusTagOptions(sectionId)[0]?.label ?? '');
  }
  function getVictimId(sectionId: string): string {
    return newVictimIds[sectionId] ?? (victimSetup[0]?.id ?? '');
  }
  function getVictimVisibility(sectionId: string): 'show' | 'hide' {
    return newVictimVisibilities[sectionId] ?? 'show';
  }

  function getNewItemLinked(sectionId: string): boolean {
    return newItemLinked[sectionId] ?? false;
  }

  /** 체인을 따라 올라가 루트 부모 ID를 반환 (순환 방지 포함) */
  function resolveRootId(startId: string, items: ChecklistItem[]): string {
    let current = startId;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(current)) break;
      visited.add(current);
      const it = items.find(i => i.id === current);
      if (!it?.linkedParentId) break;
      current = it.linkedParentId;
    }
    return current;
  }

  /** 바로 위 항목 기준으로 연결할 루트 상위 ID 계산 */
  function resolveParentId(sectionId: string): string | undefined {
    const section = checklistConfig.sections.find(s => s.id === sectionId);
    if (!section || section.items.length === 0) return undefined;
    const above = section.items[section.items.length - 1];
    const startId = above.linkedParentId ?? above.id;
    return resolveRootId(startId, section.items);
  }

  function resetUnitSelections(sectionId: string) {
    setNewUnitStatusTexts(prev    => { const n = { ...prev }; delete n[sectionId]; return n; });
    setNewUnitMissionLabels(prev  => { const n = { ...prev }; delete n[sectionId]; return n; });
    setNewUnitStatusTagLabels(prev => { const n = { ...prev }; delete n[sectionId]; return n; });
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
        sourceCommandProcedureItemId: it.id,
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
    const parentId = getNewItemLinked(sectionId) ? resolveParentId(sectionId) : undefined;
    const parentOpts = parentId ? { linkedParentId: parentId } : {};

    if (itemType === 'victim') {
      if (victimSetup.length === 0) return;
      const victimId   = getVictimId(sectionId);
      const victimItem = victimSetup.find(v => v.id === victimId);
      if (!victimItem) return;
      const visibility = getVictimVisibility(sectionId);
      const visLabel   = visibility === 'show' ? '보임' : '안보임';
      const idx        = victimSetup.indexOf(victimItem);
      const text       = `${formatVictimLabel(victimItem, idx)} → ${visLabel}`;
      addChecklistItem(sectionId, text, 'victim', { victimSetupId: victimId, victimVisibility: visibility, ...parentOpts });
      return;
    }

    if (itemType === 'incident') {
      if (eventSetup.length === 0) return;
      const eventId  = getEventId(sectionId);
      const status   = getEventStatus(sectionId);
      const ev       = eventSetup.find(e => e.id === eventId);
      if (!ev) return;
      const statusItem = getEventStatusOptions(sectionId).find(s => s.value === status);
      const text = `${ev.label} → ${statusItem?.label ?? status}`;
      addChecklistItem(sectionId, text, 'incident', { eventId, eventTargetStatus: status, ...parentOpts });
      return;
    }

    if (itemType === 'unit') {
      if (unitEligibleRoster.length === 0) return;
      const rosterId   = getUnitRosterId(sectionId);
      const rosterItem = dispatchRoster.find(r => r.id === rosterId);
      if (!rosterItem) return;
      const displayName  = computeRosterDisplayName(rosterItem);
      const effectType   = getUnitEffectType(sectionId);

      if (effectType === 'statusMsg') {
        const statusTxt = getUnitStatusText(sectionId);
        if (!statusTxt) return;
        addChecklistItem(sectionId, `${displayName} → ${statusTxt}`, 'unit', {
          unitRosterId: rosterId, unitEffectType: 'statusMsg', unitStatusText: statusTxt, ...parentOpts,
        });
      } else if (effectType === 'mission') {
        const label   = getUnitMissionLabel(sectionId);
        const preset  = getMissionOptions(sectionId).find(p => p.label === label);
        if (!preset) return;
        addChecklistItem(sectionId, `${displayName} → [임무] ${label}`, 'unit', {
          unitRosterId: rosterId, unitEffectType: 'mission',
          unitMissionLabel: preset.label, unitMissionColor: preset.color, ...parentOpts,
        });
      } else if (effectType === 'status') {
        const label  = getUnitStatusTagLabel(sectionId);
        const preset = getStatusTagOptions(sectionId).find(p => p.label === label);
        if (!preset) return;
        addChecklistItem(sectionId, `${displayName} → [상태] ${label}`, 'unit', {
          unitRosterId: rosterId, unitEffectType: 'status',
          unitStatusTagLabel: preset.label, unitStatusTagColor: preset.color, ...parentOpts,
        });
      }
      return;
    }

    if (itemType === 'arrival') {
      if (allOrders.length === 0) return;
      const order = getNewItemOrder(sectionId);
      const text  = `${order}착대 도착`;
      addChecklistItem(sectionId, text, 'arrival', { arrivalOrder: order, ...parentOpts });
      const nextOrder = allOrders.find(o => o !== order && !usedOrders.has(o));
      setNewItemArrivalOrders(prev => ({ ...prev, [sectionId]: nextOrder ?? allOrders[0] ?? 1 }));

    } else if (itemType === 'fire') {
      if (availableFireFloors.length === 0) return;
      const floor  = getFireFloor(sectionId);
      const status = getFireStatus(sectionId);
      const label  = FIRE_STATUS_LABELS[status] ?? status;
      addChecklistItem(sectionId, `${floor}층 → ${label}`, 'fire', { fireFloor: floor, fireTargetStatus: status, ...parentOpts });

    } else if (itemType === 'message') {
      const title = getMsgTitle(sectionId).trim();
      const body  = getMsgBody(sectionId).trim();
      if (!title || !body) return;
      addChecklistItem(sectionId, title.slice(0, 40), 'message', { messageTitle: title, messageBody: body, ...parentOpts });
      setMsgTitle(prev => ({ ...prev, [sectionId]: '' }));
      setMsgBody(prev => ({ ...prev, [sectionId]: '' }));

    } else {
      addChecklistItem(sectionId, '', itemType, Object.keys(parentOpts).length ? parentOpts : undefined);
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
      {/* 지휘절차 불러오기 + 마크다운 내보내기 */}
      {!showImport ? (
        <div className="checklist-setup__import-bar">
          <button
            className="checklist-setup__import-btn"
            onClick={() => { setShowImport(true); setImportSelected(new Set()); }}
          >
            지휘절차에서 불러오기
          </button>
          <button
            className="checklist-setup__import-btn"
            onClick={() => downloadChecklistMarkdown({
              checklistConfig,
              dispatchRoster,
              targetName: building.targetName,
              fireFloor:  building.fireFloor,
              arrivalMode,
            })}
            disabled={checklistConfig.sections.every(s => s.items.length === 0)}
            title="현재 시나리오/체크리스트 전체를 마크다운 파일로 내보냅니다"
          >
            마크다운으로 내보내기
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
        const curItemType       = getNewItemType(section.id);
        const curOrder          = getNewItemOrder(section.id);
        const curFireFloor      = getFireFloor(section.id);
        const curFireStatus     = getFireStatus(section.id);
        const availableOrders   = allOrders.filter(o => !usedOrders.has(o) || o === curOrder);
        const canAddArrival     = arrivalMode === 'order' && availableOrders.length > 0;

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
                <button
                  type="button"
                  className="checklist-setup__section-title"
                  onClick={() => startEditSection(section.id, section.title)}
                  title="클릭하여 수정"
                >
                  {section.title}
                </button>
              )}
              <button className="checklist-setup__delete-btn" onClick={() => removeChecklistSection(section.id)} title="섹션 삭제">✕</button>
            </div>

            {/* 항목 목록 */}
            <div className="checklist-setup__items">
              {section.items.map((item, itemIndex) => {
                const itemKey          = `${section.id}:${itemIndex}`;
                const isReadonly       = item.itemType === 'arrival' || item.itemType === 'fire' || item.itemType === 'message' || item.itemType === 'incident' || item.itemType === 'unit' || item.itemType === 'victim';
                const isEditingThisMsg = item.itemType === 'message' && editingItemId === item.id;
                const arrivalUnits     = item.itemType === 'arrival'
                  ? dispatchRoster.filter(r => r.arrivalOrder === (item.arrivalOrder ?? 1) && r.linkedTo === null).map(computeRosterDisplayName).join(', ')
                  : '';
                return (
                  <div key={item.id} className="checklist-setup__item-wrap">
                    <div
                      className={[
                        'checklist-setup__item',
                        overItemKey === itemKey && dragItem.current?.index !== itemIndex ? 'checklist-setup__item--drag-over' : '',
                        item.linkedParentId ? 'checklist-setup__item--linked' : '',
                      ].filter(Boolean).join(' ')}
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
                      {item.linkedParentId && <span className="checklist-setup__link-icon">└</span>}
                      <span className={`checklist-setup__type-badge checklist-setup__type-badge--${item.itemType}`}>
                        {TYPE_LABELS[item.itemType ?? 'procedure']}
                      </span>
                      {isReadonly ? (
                        <span className="checklist-setup__item-text">
                          {item.itemType === 'message' ? (item.messageTitle ?? item.text) : item.text}
                          {arrivalUnits && <span className="checklist-setup__item-units"> ({arrivalUnits})</span>}
                        </span>
                      ) : (
                        <input
                          className="checklist-setup__item-input"
                          value={item.text}
                          onChange={e => updateChecklistItem(section.id, item.id, { text: e.target.value })}
                        />
                      )}
                      {/* 메세지 항목 수정 버튼 */}
                      {item.itemType === 'message' && (
                        <button
                          className={`checklist-setup__edit-btn${isEditingThisMsg ? ' checklist-setup__edit-btn--active' : ''}`}
                          title="메세지 수정"
                          onClick={() => {
                            if (isEditingThisMsg) {
                              setEditingItemId(null);
                            } else {
                              setEditingItemId(item.id);
                              setEditTitle(item.messageTitle ?? item.text);
                              setEditBody(item.messageBody ?? '');
                            }
                          }}
                        >✎</button>
                      )}
                      {/* 상위 연동 체크박스 (첫 번째 항목 제외) */}
                      {itemIndex > 0 && (
                        <input
                          type="checkbox"
                          className="checklist-setup__link-cb"
                          checked={!!item.linkedParentId}
                          title="바로 위 항목과 연동"
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            if (e.target.checked) {
                              const above = section.items[itemIndex - 1];
                              const startId = above.linkedParentId ?? above.id;
                              const parentId = resolveRootId(startId, section.items);
                              updateChecklistItem(section.id, item.id, { linkedParentId: parentId });
                            } else {
                              updateChecklistItem(section.id, item.id, { linkedParentId: undefined });
                            }
                          }}
                        />
                      )}
                      <button className="checklist-setup__delete-btn" onClick={() => removeChecklistItem(section.id, item.id)} title="항목 삭제">✕</button>
                    </div>

                    {/* 메세지 인라인 편집 패널 */}
                    {isEditingThisMsg && (
                      <div className="checklist-setup__msg-edit-panel">
                        <input
                          className="checklist-setup__msg-edit-loc"
                          placeholder="제목 (필수)"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          autoFocus
                        />
                        <textarea
                          className="checklist-setup__message-textarea"
                          placeholder="내용"
                          value={editBody}
                          onChange={e => setEditBody(e.target.value)}
                          rows={3}
                        />
                        <div className="checklist-setup__msg-edit-actions">
                          <button
                            className="checklist-setup__import-cancel-btn"
                            onClick={() => setEditingItemId(null)}
                          >
                            취소
                          </button>
                          <button
                            className="checklist-setup__import-confirm-btn"
                            disabled={!editTitle.trim() || !editBody.trim()}
                            onClick={() => {
                              const title = editTitle.trim();
                              const body  = editBody.trim();
                              if (!title || !body) return;
                              updateChecklistItem(section.id, item.id, {
                                text:         title.slice(0, 40),
                                messageTitle: title,
                                messageBody:  body,
                              });
                              setEditingItemId(null);
                            }}
                          >
                            저장
                          </button>
                        </div>
                      </div>
                    )}
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
                <option value="incident">현장요소</option>
                <option value="unit">출동대</option>
                <option value="victim">구조대상자</option>
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

              {/* 현장요소 선택 */}
              {curItemType === 'incident' && (
                eventSetup.length === 0 ? (
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                    현장요소 설정에서 항목을 먼저 등록하세요.
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

              {/* 출동대 효과 선택 */}
              {curItemType === 'unit' && (() => {
                if (unitEligibleRoster.length === 0) {
                  return (
                    <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                      출동대 프리셋(메세지/임무/상태)을 먼저 등록하세요.
                    </span>
                  );
                }
                const curEffectType   = getUnitEffectType(section.id);
                const statusMsgOpts   = getUnitStatusOptions(section.id);
                const missionOpts     = getMissionOptions(section.id);
                const statusTagOpts   = getStatusTagOptions(section.id);
                const curOptsEmpty =
                  (curEffectType === 'statusMsg' && statusMsgOpts.length === 0) ||
                  (curEffectType === 'mission'   && missionOpts.length   === 0) ||
                  (curEffectType === 'status'    && statusTagOpts.length  === 0);

                return (
                  <>
                    <select
                      className="checklist-setup__fire-select"
                      style={{ flex: 1 }}
                      value={getUnitRosterId(section.id)}
                      onChange={e => {
                        setNewUnitRosterIds(prev => ({ ...prev, [section.id]: e.target.value }));
                        resetUnitSelections(section.id);
                      }}
                    >
                      {unitEligibleRoster.map(r => (
                        <option key={r.id} value={r.id}>{computeRosterDisplayName(r)}</option>
                      ))}
                    </select>

                    {/* 효과 유형 탭 */}
                    <div className="checklist-setup__message-loc-tabs">
                      {(['statusMsg', 'mission', 'status'] as const).map(et => {
                        const label = et === 'statusMsg' ? '메세지' : et === 'mission' ? '임무' : '상태';
                        return (
                          <button
                            key={et}
                            type="button"
                            className={`checklist-setup__message-loc-tab${curEffectType === et ? ' checklist-setup__message-loc-tab--active' : ''}`}
                            onClick={() => {
                              setNewUnitEffectTypes(prev => ({ ...prev, [section.id]: et }));
                              resetUnitSelections(section.id);
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 효과 유형별 옵션 */}
                    {curOptsEmpty ? (
                      <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                        해당 유형 없음
                      </span>
                    ) : curEffectType === 'statusMsg' ? (
                      <select
                        className="checklist-setup__fire-select"
                        value={getUnitStatusText(section.id)}
                        onChange={e => setNewUnitStatusTexts(prev => ({ ...prev, [section.id]: e.target.value }))}
                      >
                        {statusMsgOpts.map(msg => <option key={msg} value={msg}>{msg}</option>)}
                      </select>
                    ) : curEffectType === 'mission' ? (
                      <select
                        className="checklist-setup__fire-select"
                        value={getUnitMissionLabel(section.id)}
                        onChange={e => setNewUnitMissionLabels(prev => ({ ...prev, [section.id]: e.target.value }))}
                      >
                        {missionOpts.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                      </select>
                    ) : (
                      <select
                        className="checklist-setup__fire-select"
                        value={getUnitStatusTagLabel(section.id)}
                        onChange={e => setNewUnitStatusTagLabels(prev => ({ ...prev, [section.id]: e.target.value }))}
                      >
                        {statusTagOpts.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                      </select>
                    )}

                    <button
                      className="checklist-setup__add-item-btn"
                      onClick={() => handleAddItem(section.id)}
                      disabled={curOptsEmpty}
                    >
                      추가
                    </button>
                  </>
                );
              })()}

              {/* 구조대상자 선택 */}
              {curItemType === 'victim' && (
                victimSetup.length === 0 ? (
                  <span style={{ fontSize: '0.74rem', color: 'var(--color-text-dim)' }}>
                    구조대상자 설정에서 먼저 추가하세요.
                  </span>
                ) : (
                  <>
                    <select
                      className="checklist-setup__fire-select"
                      style={{ flex: 1 }}
                      value={getVictimId(section.id)}
                      onChange={e => setNewVictimIds(prev => ({ ...prev, [section.id]: e.target.value }))}
                    >
                      {victimSetup.map((v, idx) => (
                        <option key={v.id} value={v.id}>{formatVictimLabel(v, idx)}</option>
                      ))}
                    </select>
                    <div className="checklist-setup__message-loc-tabs">
                      {(['show', 'hide'] as const).map(vis => (
                        <button
                          key={vis}
                          type="button"
                          className={`checklist-setup__message-loc-tab${getVictimVisibility(section.id) === vis ? ' checklist-setup__message-loc-tab--active' : ''}`}
                          onClick={() => setNewVictimVisibilities(prev => ({ ...prev, [section.id]: vis }))}
                        >
                          {vis === 'show' ? '보임' : '안보임'}
                        </button>
                      ))}
                    </div>
                    <button
                      className="checklist-setup__add-item-btn"
                      onClick={() => handleAddItem(section.id)}
                    >
                      추가
                    </button>
                  </>
                )
              )}

              {/* 메세지 확장 입력 */}
              {curItemType === 'message' && (
                <div className="checklist-setup__message-panel">
                  <input
                    className="checklist-setup__msg-edit-loc"
                    placeholder="제목 (필수)"
                    value={getMsgTitle(section.id)}
                    onChange={e => setMsgTitle(prev => ({ ...prev, [section.id]: e.target.value }))}
                  />
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
                      disabled={!getMsgTitle(section.id).trim() || !getMsgBody(section.id).trim()}
                    >
                      + 추가
                    </button>
                  </div>
                </div>
              )}

              {/* 기본 텍스트 입력 */}
              {curItemType !== 'arrival' && curItemType !== 'fire' && curItemType !== 'message' && curItemType !== 'incident' && curItemType !== 'unit' && curItemType !== 'victim' && (
                <>
                  <input
                    className="checklist-setup__add-item-input"
                    placeholder="항목 추가..."
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (!val) return;
                        const pid = getNewItemLinked(section.id) ? resolveParentId(section.id) : undefined;
                        addChecklistItem(section.id, val, curItemType, pid ? { linkedParentId: pid } : undefined);
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
                      const pid = getNewItemLinked(section.id) ? resolveParentId(section.id) : undefined;
                      addChecklistItem(section.id, val, curItemType, pid ? { linkedParentId: pid } : undefined);
                      input.value = '';
                    }}
                  >
                    추가
                  </button>
                </>
              )}
            </div>

            {/* 연동 체크박스 (새 항목, 섹션에 항목이 있을 때만) */}
            {section.items.length > 0 && (
              <div className="checklist-setup__parent-link-row">
                <span className="checklist-setup__parent-link-label">↳ 연동</span>
                <input
                  type="checkbox"
                  className="checklist-setup__link-cb"
                  checked={getNewItemLinked(section.id)}
                  title="바로 위 항목과 연동"
                  onChange={e => setNewItemLinked(prev => ({ ...prev, [section.id]: e.target.checked }))}
                />
              </div>
            )}
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
