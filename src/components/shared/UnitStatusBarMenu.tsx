import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import { useTokens } from '../../context/TokenContext';
import { useActionMode } from '../../context/ActionModeContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useSettings } from '../../store/settingsStore';
import './UnitStatusBarMenu.css';

// ─────────────────────────────────────────────
// 상태 태그 색상 팔레트 (TokenCard와 동일)
// ─────────────────────────────────────────────

const TAG_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff' },
  yellow: { bg: '#2a1e00', border: '#aa7700', text: '#ffcc44' },
  red:    { bg: '#2a0808', border: '#aa2222', text: '#ff7777' },
  green:  { bg: '#0a1e10', border: '#228844', text: '#55cc88' },
  white:  { bg: '#1e1e22', border: '#888888', text: '#dddddd' },
};

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AnchorRect {
  left:   number;
  top:    number;
  right:  number;
  bottom: number;
  width:  number;
  height: number;
}

interface Props {
  token:      UnitToken;
  anchorRect: AnchorRect;   // wrapperRef 의 getBoundingClientRect() 스냅샷
  onClose:    () => void;
}

// 송수 연결 가능한 unitType (hydrant는 전용 HydrantBarMenu에서 처리)
const WATER_SOURCE_TYPES = new Set(['pump', 'water_tank']);

// 방수 가능 unitType
const SUPPRESSION_TYPES = new Set(['suppression']);

// 방수포 가능 unitType (펌프차/물탱크차)
const MONITOR_TYPES = new Set(['pump', 'water_tank']);

// 고가차/굴절차 전용 메뉴 대상 unitType
const AERIAL_TYPES = new Set(['aerial', 'ladder']);

// 고가차/굴절차 메뉴 버튼 색상
const AERIAL_BTN: Record<string, { bg: string; border: string; text: string }> = {
  deploy:  { bg: '#2a1e00', border: '#aa7700', text: '#ffcc44' }, // yellow — 전개
  water:   { bg: '#0d1e3a', border: '#2255aa', text: '#88bbff' }, // blue  — 방수
  standby: { bg: '#1e1e22', border: '#888888', text: '#dddddd' }, // white — 임무대기
  broken:  { bg: '#2a0808', border: '#aa2222', text: '#ff7777' }, // red   — 장비고장
};

// ─────────────────────────────────────────────
// UnitStatusBarMenu
// ─────────────────────────────────────────────

export function UnitStatusBarMenu({ token, anchorRect, onClose }: Props) {
  const { setMissionTag, setStatusTag, setCustomNote, setSprayState, setAerialTarget, setAerialSprayTarget } = useTokens();
  const { enterMode }                                  = useActionMode();
  const { connections }                                = useWaterConnections();
  const { unitTagPresetConfig }                        = useSettings();
  const menuRef = useRef<HTMLDivElement>(null);

  const [noteOpen,  setNoteOpen]  = useState(false);
  const [noteDraft, setNoteDraft] = useState(token.customNote ?? '');

  const canWaterConnect   = WATER_SOURCE_TYPES.has(token.unitType);
  const isAerialVehicle   = AERIAL_TYPES.has(token.unitType);
  const deployLabel       = token.unitType === 'aerial' ? '사다리전개' : '바스켓전개';
  const isSuppressionUnit = SUPPRESSION_TYPES.has(token.unitType);
  const hasWaterSource    = isSuppressionUnit &&
    connections.some(c => c.toId === token.id && WATER_SOURCE_TYPES.has(c.fromType));
  const isSprayActive     = isSuppressionUnit && token.sprayState != null;
  const isMonitorUnit     = MONITOR_TYPES.has(token.unitType);
  const isMonitorActive   = isMonitorUnit && token.aerialSprayTarget != null;

  // ── 위치 계산 (레이아웃 후 측정) ────────────
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden', position: 'fixed', left: 0, top: 0 });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    const vw    = window.innerWidth;
    const vh    = window.innerHeight;
    const GAP   = 6;

    const cx  = anchorRect.left + anchorRect.width / 2;
    let left  = Math.round(cx - menuW / 2);
    left      = Math.max(8, Math.min(left, vw - menuW - 8));

    const spaceAbove = anchorRect.top;
    const spaceBelow = vh - anchorRect.bottom;
    let top: number;

    if (spaceAbove >= menuH + GAP || spaceAbove >= spaceBelow) {
      top = Math.max(8, anchorRect.top - menuH - GAP);
    } else {
      top = Math.min(anchorRect.bottom + GAP, vh - menuH - 8);
    }

    setStyle({ position: 'fixed', left, top, visibility: 'visible' });
  }, [anchorRect, noteOpen]);

  // ── 외부 클릭 / Esc ──────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown',   onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown',   onKeyDown);
    };
  }, [onClose]);

  // ── 핸들러 ──────────────────────────────────

  function handleMission(label: string, color: string) {
    if (token.missionTag?.label === label) {
      setMissionTag(token.id, null);
    } else {
      setMissionTag(token.id, { label, color });
    }
    onClose();
  }

  function handleStatus(label: string, color: string) {
    if (token.statusTag?.label === label) {
      setStatusTag(token.id, null);
    } else {
      setStatusTag(token.id, { label, color });
    }
    onClose();
  }

  function handleSaveNote() {
    setCustomNote(token.id, noteDraft.trim());
    onClose();
  }

  function handleClearNote() {
    setCustomNote(token.id, '');
    onClose();
  }

  function handleWaterConnect() {
    enterMode({ type: 'water-connect', sourceId: token.id, sourceType: token.unitType });
    onClose();
  }

  function handleSprayStart() {
    enterMode({ type: 'spray-target', sourceId: token.id, sourceZoneKey: token.zoneKey });
    onClose();
  }

  function handleSprayStop() {
    setSprayState(token.id, null);
    onClose();
  }

  // ── 방수포 핸들러 (펌프차/물탱크차) ──────────
  function handleMonitorStart() {
    enterMode({ type: 'aerial-spray-target', sourceId: token.id });
    onClose();
  }

  function handleMonitorStop() {
    setAerialSprayTarget(token.id, null);
    setStatusTag(token.id, null);
    onClose();
  }

  // ── 고가차/굴절차 전용 핸들러 ────────────────
  function handleAerialDeploy(actionLabel: string) {
    enterMode({ type: 'aerial-floor-select', sourceId: token.id, unitType: token.unitType, actionLabel });
    onClose();
  }

  function handleAerialStandby() {
    setStatusTag(token.id, { label: '임무대기', color: 'white' });
    setAerialTarget(token.id, null);
    setAerialSprayTarget(token.id, null);
    onClose();
  }

  function handleAerialBroken() {
    setStatusTag(token.id, { label: '장비고장', color: 'red' });
    setAerialTarget(token.id, null);
    setAerialSprayTarget(token.id, null);
    onClose();
  }

  // ── 데이터 ──────────────────────────────────
  const missionPresets = unitTagPresetConfig[token.unitType]?.missions ?? [];
  const statusPresets  = unitTagPresetConfig[token.unitType]?.statuses ?? [];

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return createPortal(
    <>
      <div className="usbm__backdrop" onMouseDown={onClose} />

      <div
        ref={menuRef}
        className="usbm"
        style={style}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── 상태 버튼 바 ─────────────────────── */}

        {/* 고가차/굴절차 전용 버튼 바 */}
        {isAerialVehicle ? (
          <div className="usbm__bar">
            {/* 전개 버튼 (사다리전개 / 바스켓전개) */}
            <button
              className="usbm__btn"
              style={{
                background:  AERIAL_BTN.deploy.bg,
                borderColor: AERIAL_BTN.deploy.border,
                color:       AERIAL_BTN.deploy.text,
              }}
              onMouseDown={e => { e.stopPropagation(); handleAerialDeploy(deployLabel); }}
              title={`건물 층을 클릭하여 ${deployLabel} 층을 선택하세요`}
            >
              {deployLabel}
            </button>

            <div className="usbm__sep" aria-hidden="true" />

            {/* 임무대기 버튼 */}
            <button
              className="usbm__btn"
              style={{
                background:  AERIAL_BTN.standby.bg,
                borderColor: AERIAL_BTN.standby.border,
                color:       AERIAL_BTN.standby.text,
              }}
              onMouseDown={e => { e.stopPropagation(); handleAerialStandby(); }}
              title="임무대기 상태로 설정"
            >
              임무대기
            </button>

            {/* 장비고장 버튼 */}
            <button
              className="usbm__btn"
              style={{
                background:  AERIAL_BTN.broken.bg,
                borderColor: AERIAL_BTN.broken.border,
                color:       AERIAL_BTN.broken.text,
              }}
              onMouseDown={e => { e.stopPropagation(); handleAerialBroken(); }}
              title="장비고장 상태로 설정"
            >
              장비고장
            </button>

            <div className="usbm__sep" aria-hidden="true" />

            {/* 메모 버튼 */}
            <button
              className={[
                'usbm__btn',
                'usbm__btn--note',
                noteOpen ? 'usbm__btn--note-open' : '',
                !noteOpen && token.customNote ? 'usbm__btn--has-note' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={e => { e.stopPropagation(); setNoteOpen(v => !v); }}
              title={token.customNote ? `메모: ${token.customNote}` : '메모 입력'}
            >
              {token.customNote && !noteOpen ? '메모 ✎' : '메모'}
            </button>
          </div>
        ) : (
          /* 일반 유닛 버튼 바 — 임무 | 상태 두 섹션 */
          <div className="usbm__bar">
            {/* ── 헤더 ── */}
            {(missionPresets.length > 0 || statusPresets.length > 0) && (
              <div className="usbm__section-header">
                {missionPresets.length > 0 && <span className="usbm__section-label">임무</span>}
                {missionPresets.length > 0 && statusPresets.length > 0 && (
                  <span className="usbm__section-divider" aria-hidden="true">|</span>
                )}
                {statusPresets.length > 0 && <span className="usbm__section-label">상태</span>}
              </div>
            )}

            {/* ── 임무 버튼 ── */}
            {missionPresets.map(preset => {
              const isActive = token.missionTag?.label === preset.label;
              const col      = TAG_COLORS[preset.color] ?? TAG_COLORS.white;
              return (
                <button
                  key={preset.label}
                  className={['usbm__btn', isActive ? 'usbm__btn--active' : ''].filter(Boolean).join(' ')}
                  style={{
                    background:  col.bg,
                    borderColor: isActive ? col.text : col.border,
                    color:       col.text,
                    ...(isActive ? { outline: `2px solid ${col.text}`, outlineOffset: '2px' } : {}),
                  }}
                  onMouseDown={e => { e.stopPropagation(); handleMission(preset.label, preset.color); }}
                  title={preset.label + (isActive ? ' — 클릭하여 해제' : '')}
                >
                  {isActive && <span className="usbm__check" aria-hidden="true">✓ </span>}
                  {preset.label}
                </button>
              );
            })}

            {/* ── 임무/상태 구분선 ── */}
            {missionPresets.length > 0 && statusPresets.length > 0 && (
              <div className="usbm__sep" aria-hidden="true" />
            )}

            {/* ── 상태 버튼 ── */}
            {statusPresets.map(preset => {
              const isActive = token.statusTag?.label === preset.label;
              const col      = TAG_COLORS[preset.color] ?? TAG_COLORS.white;
              return (
                <button
                  key={preset.label}
                  className={['usbm__btn', isActive ? 'usbm__btn--active' : ''].filter(Boolean).join(' ')}
                  style={{
                    background:  col.bg,
                    borderColor: isActive ? col.text : col.border,
                    color:       col.text,
                    ...(isActive ? { outline: `2px solid ${col.text}`, outlineOffset: '2px' } : {}),
                  }}
                  onMouseDown={e => { e.stopPropagation(); handleStatus(preset.label, preset.color); }}
                  title={preset.label + (isActive ? ' — 클릭하여 해제' : '')}
                >
                  {isActive && <span className="usbm__check" aria-hidden="true">✓ </span>}
                  {preset.label}
                </button>
              );
            })}

            {(missionPresets.length > 0 || statusPresets.length > 0) && (
              <div className="usbm__sep" aria-hidden="true" />
            )}

            {/* 방수개시 / 방수중단 (진압대 + 수원 연결 시) */}
            {isSuppressionUnit && hasWaterSource && !isSprayActive && (
              <>
                <button
                  className="usbm__btn usbm__btn--spray-start"
                  onMouseDown={e => { e.stopPropagation(); handleSprayStart(); }}
                  title="방수 지점을 클릭하여 방수 개시"
                >
                  방수개시
                </button>
                <div className="usbm__sep" aria-hidden="true" />
              </>
            )}
            {isSprayActive && (
              <>
                <button
                  className="usbm__btn usbm__btn--spray-stop"
                  onMouseDown={e => { e.stopPropagation(); handleSprayStop(); }}
                  title="방수 중단"
                >
                  방수중단
                </button>
                <div className="usbm__sep" aria-hidden="true" />
              </>
            )}

            {/* 송수 연결 버튼 (펌프/물탱크 전용) */}
            {canWaterConnect && (
              <>
                <button
                  className="usbm__btn usbm__btn--water"
                  onMouseDown={e => { e.stopPropagation(); handleWaterConnect(); }}
                  title="송수 연결 대상 토큰을 클릭하세요"
                >
                  송수
                </button>
                <div className="usbm__sep" aria-hidden="true" />
              </>
            )}

            {/* 메모 버튼 */}
            <button
              className={[
                'usbm__btn',
                'usbm__btn--note',
                noteOpen ? 'usbm__btn--note-open' : '',
                !noteOpen && token.customNote ? 'usbm__btn--has-note' : '',
              ].filter(Boolean).join(' ')}
              onMouseDown={e => { e.stopPropagation(); setNoteOpen(v => !v); }}
              title={token.customNote ? `메모: ${token.customNote}` : '메모 입력'}
            >
              {token.customNote && !noteOpen ? '메모 ✎' : '메모'}
            </button>

            {/* 방수포 (펌프차/물탱크차 전용, 맨우측) */}
            {isMonitorUnit && (
              <>
                <div className="usbm__sep" aria-hidden="true" />
                {isMonitorActive ? (
                  <button
                    className="usbm__btn usbm__btn--spray-stop"
                    onMouseDown={e => { e.stopPropagation(); handleMonitorStop(); }}
                    title="방수포 중단"
                  >
                    방수중단
                  </button>
                ) : (
                  <button
                    className="usbm__btn usbm__btn--spray-start"
                    onMouseDown={e => { e.stopPropagation(); handleMonitorStart(); }}
                    title="방수포 지점을 클릭하여 방수 개시"
                  >
                    방수포
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 메모 입력 패널 ───────────────────── */}
        {noteOpen && (
          <div className="usbm__input-panel">
            <input
              className="usbm__input"
              value={noteDraft}
              onChange={e => setNoteDraft(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter')  handleSaveNote();
                if (e.key === 'Escape') onClose();
              }}
              placeholder="메모 입력…"
              maxLength={40}
              autoFocus
            />
            <div className="usbm__input-row">
              {token.customNote && (
                <button
                  className="usbm__clear-btn"
                  onMouseDown={e => { e.stopPropagation(); handleClearNote(); }}
                >
                  삭제
                </button>
              )}
              <button
                className="usbm__save-btn"
                onMouseDown={e => { e.stopPropagation(); handleSaveNote(); }}
              >
                저장
              </button>
            </div>
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
