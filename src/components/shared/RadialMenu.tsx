import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UnitToken } from '../../types';
import type { TagPreset } from '../../types/settings';
import { useTokens } from '../../context/TokenContext';
import { useSettings } from '../../store/settingsStore';
import './RadialMenu.css';
import { stageBounds, stagePortalTarget, viewportToStage } from '../../utils/stagePortal';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

/** 단일 링 반지름 */
const RADIUS_RING = 110;
/** 직접입력 패널 너비 */
const PANEL_W = 220;

// ─────────────────────────────────────────────
// 상태 태그 색상 팔레트
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

interface Props {
  token:   UnitToken;
  /** 뷰포트 기준 메뉴 중심 X (토큰 중심) */
  cx:      number;
  /** 뷰포트 기준 메뉴 중심 Y (토큰 중심) */
  cy:      number;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// 각도 → 픽셀 오프셋
// ─────────────────────────────────────────────

function angleOffset(deg: number, radius: number) {
  const rad = deg * (Math.PI / 180);
  return {
    rx: Math.round(radius * Math.cos(rad)),
    ry: Math.round(radius * Math.sin(rad)),
  };
}

// ─────────────────────────────────────────────
// RadialMenu
// ─────────────────────────────────────────────

export function RadialMenu({ token, cx: rawCx, cy: rawCy, onClose }: Props) {
  // 뷰포트 클릭 좌표 → 캔버스 좌표 (스테이지 안 포털)
  const { x: cx, y: cy } = viewportToStage(rawCx, rawCy);
  const { setStatusTag, setCustomNote } = useTokens();
  const { unitTagPresetConfig }         = useSettings();

  const [inputOpen,  setInputOpen]  = useState(false);
  const [noteDraft,  setNoteDraft]  = useState(token.customNote ?? '');

  // ESC → 닫기
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── 데이터 준비 ──────────────────────────────
  const presets: TagPreset[] = unitTagPresetConfig[token.unitType]?.statuses ?? [];
  const totalItems = presets.length + 1;  // +1 = 직접입력

  // 직접입력 패널 방향
  const panelOnRight = cx + RADIUS_RING + 8 + PANEL_W < stageBounds().width;

  // ── 핸들러 ──────────────────────────────────

  function handlePreset(e: React.MouseEvent, label: string, color: string) {
    e.stopPropagation();
    if (token.statusTag?.label === label) {
      // 같은 태그 재선택 → 해제
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

  // ─────────────────────────────────────────────
  // 렌더
  // ─────────────────────────────────────────────

  return createPortal(
    <>
      {/* 백드롭: 외부 클릭 닫기 */}
      <div className="rm__backdrop" onMouseDown={onClose} />

      {/* 0×0 앵커 컨테이너 */}
      <div
        className="rm"
        style={{ left: cx, top: cy }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* ── 가이드 링/연결선 ────────────────────
            · 링: 아이템 3개 이상일 때만 표시
            · 연결선: 실제 아이템 각도에만 표시
        ─────────────────────────────────────── */}
        <div className="rm__guide" aria-hidden="true">
          {totalItems >= 3 && <div className="rm__guide-ring" />}
          {Array.from({ length: totalItems }, (_, i) => {
            const deg = i * (360 / totalItems) - 90;
            return (
              <div
                key={i}
                className="rm__guide-line"
                style={{ transform: `rotate(${deg}deg)` }}
              />
            );
          })}
        </div>

        {/* ── 상태 태그 프리셋 버튼 ───────────────── */}
        {presets.map((preset: TagPreset, i: number) => {
          const deg        = i * (360 / totalItems) - 90;
          const { rx, ry } = angleOffset(deg, RADIUS_RING);
          const isActive   = token.statusTag?.label === preset.label;
          const col        = TAG_COLORS[preset.color] ?? TAG_COLORS.white;

          return (
            <button
              key={preset.label}
              className={[
                'rm__preset-item',
                isActive ? 'rm__preset-item--active' : '',
              ].filter(Boolean).join(' ')}
              style={{
                transform:   `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))`,
                background:  col.bg,
                color:       col.text,
                borderColor: isActive ? col.text : col.border,
              }}
              onMouseDown={e => handlePreset(e, preset.label, preset.color)}
              title={preset.label + (isActive ? ' (적용중 — 클릭하여 해제)' : '')}
            >
              <span className="rm__preset-label">{preset.label}</span>
              {isActive && <span className="rm__preset-check">✓</span>}
            </button>
          );
        })}

        {/* ── 직접입력 버튼 (항상 마지막 슬롯) ── */}
        {(() => {
          const deg        = presets.length * (360 / totalItems) - 90;
          const { rx, ry } = angleOffset(deg, RADIUS_RING);
          return (
            <button
              className={[
                'rm__preset-item',
                'rm__preset-item--custom',
                inputOpen ? 'rm__preset-item--open' : '',
                token.customNote ? 'rm__preset-item--has-note' : '',
              ].filter(Boolean).join(' ')}
              style={{ transform: `translate(calc(-50% + ${rx}px), calc(-50% + ${ry}px))` }}
              onMouseDown={e => { e.stopPropagation(); setInputOpen(v => !v); }}
              title={token.customNote ? `메모: ${token.customNote}` : '메모 입력'}
            >
              <span className="rm__preset-label">메모</span>
              {token.customNote
                ? <span className="rm__preset-sub rm__preset-sub--note" title={token.customNote}>
                    {token.customNote.length > 5 ? token.customNote.slice(0, 5) + '…' : token.customNote}
                  </span>
                : <span className="rm__preset-sub">입력</span>
              }
            </button>
          );
        })()}

        {/* ── 직접입력 서브 패널 ──────────────────── */}
        {inputOpen && (
          <div
            className={`rm__badge-panel${panelOnRight ? ' rm__badge-panel--right' : ' rm__badge-panel--left'}`}
            style={panelOnRight
              ? { left: RADIUS_RING + 8 }
              : { right: RADIUS_RING + 8 }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="rm__bp-header">메모</div>

            <div className="rm__bp-section">
              <input
                className="rm__bp-input"
                placeholder="메모 내용 입력…"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleSaveNote();
                  if (e.key === 'Escape') onClose();
                }}
                maxLength={40}
                autoFocus
              />
              <div className="rm__bp-row">
                {token.customNote && (
                  <button
                    className="rm__bp-clear-btn"
                    onMouseDown={e => { e.stopPropagation(); handleClearNote(); }}
                  >
                    삭제
                  </button>
                )}
                <button
                  className="rm__bp-add-btn"
                  onMouseDown={e => { e.stopPropagation(); handleSaveNote(); }}
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>,
    stagePortalTarget()
  );
}
