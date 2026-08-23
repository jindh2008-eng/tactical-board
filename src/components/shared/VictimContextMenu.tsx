import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VictimToken, VictimCondition } from '../../types/victim';
import { VICTIM_CONDITIONS } from '../../types/victim';
import type { UnitToken } from '../../types';
import type { VictimUpdate } from '../../context/VictimContext';
import './VictimContextMenu.css';
import { stageBounds, stagePortalTarget, viewportToStage } from '../../utils/stagePortal';

interface Props {
  victim:   VictimToken;
  x:        number;
  y:        number;
  tokens:   UnitToken[];
  onUpdate: (update: VictimUpdate) => void;
  onRescue: (unit: UnitToken) => void;
  onClose:  () => void;
}

export function VictimContextMenu({ victim, x: vx, y: vy, tokens, onUpdate, onRescue, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [subDraft,    setSubDraft]    = useState(victim.subLocation);
  const [labelDraft,  setLabelDraft]  = useState(victim.customLabel ?? '');
  const [showRescue,  setShowRescue]  = useState(false);

  // 외부 클릭 / Esc → 닫기
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

  // 화면 경계 보정
  // 클릭 좌표는 뷰포트 px 로 들어온다. 메뉴가 스테이지(배율) 안 포털에
  // 그려지므로 캔버스 좌표로 바꿔 쓴다. → docs/SCREEN_STAGE_PLAN.md §4.1
  const { x, y } = viewportToStage(vx, vy);
  const safeX = Math.min(x, stageBounds().width  - 230 - 8);
  const safeY = Math.min(y, stageBounds().height - 380 - 8);

  function applySubLocation() {
    onUpdate({ subLocation: subDraft.trim() });
  }

  function applyLabel() {
    onUpdate({ customLabel: labelDraft.trim() || '기타' });
  }

  function applyCondition(c: VictimCondition) {
    onUpdate({ condition: c });
  }

  // ── 구조 처리 관련 ────────────────────────────────
  const isAlreadyRescued = victim.zoneKey === 'medical-post';

  /**
   * 피해자 층 추출.
   * 건물 내부 zoneKey ("2F-center", "RF-stair", "B1-left") → floorId 반환.
   * 외곽/특수 구역 → null.
   */
  const victimFloor = extractBuildingFloor(victim.zoneKey);

  /**
   * 구조 가능한 출동대.
   * - 건물 내부: 피해자와 같은 floorId (층) 기준 매칭 (서브존 무관)
   * - 외곽/특수: 완전 일치
   */
  const rescuableUnits = victim.zoneKey
    ? tokens.filter(t => {
        if (t.badges.some(b => b.line1 === '구조중')) return false;
        if (victimFloor && extractBuildingFloor(t.zoneKey) === victimFloor) return true;
        return t.zoneKey === victim.zoneKey;
      })
    : [];

  /**
   * 외곽 방면(A/B/C/D)에 배치된 굴절차·고가차.
   * 이미 같은 구역 목록에 포함된 경우 중복 제외.
   */
  const rescuableUnitIds = new Set(rescuableUnits.map(u => u.id));
  const faceRescuableUnits = tokens.filter(t =>
    (t.unitType === 'ladder' || t.unitType === 'aerial') &&
    extractFace(t.zoneKey) !== null &&
    !t.badges.some(b => b.line1 === '구조중') &&
    !rescuableUnitIds.has(t.id)
  );

  const hasAnyRescuable = rescuableUnits.length > 0 || faceRescuableUnits.length > 0;

  return createPortal(
    <div
      ref={menuRef}
      className="vcm"
      style={{ left: safeX, top: safeY }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ── 1. 환자정보 ─────────────────────────── */}
      <div className="vcm__header">
        <span className="vcm__header-top">
          {victim.kind === 'person'
            ? [victim.gender, victim.age, victim.condition].filter(v => v != null).join('/')
            : victim.kind === 'group' ? `다수 ${victim.groupCount ?? 2}명`
            : victim.customLabel?.trim() || '기타'}
        </span>
      </div>

      {/* ── 2. 구조 처리 ────────────────────────── */}
      <div className="vcm__section vcm__section--rescue">
        <button
          className={`vcm__rescue-toggle ${showRescue ? 'vcm__rescue-toggle--open' : ''}`}
          onClick={() => setShowRescue(v => !v)}
          disabled={isAlreadyRescued}
        >
          <span>{isAlreadyRescued ? '이미 임시의료소에 있습니다' : '구조 처리'}</span>
          {!isAlreadyRescued && (
            <span className="vcm__arrow">{showRescue ? '▲' : '▼'}</span>
          )}
        </button>

        {showRescue && !isAlreadyRescued && (
          <div className="vcm__rescue-list">
            {!hasAnyRescuable ? (
              <div className="vcm__rescue-empty">
                구조 가능한 출동대가 없습니다
              </div>
            ) : (
              <>
                {/* 같은 구역 출동대 */}
                {rescuableUnits.length > 0 && (
                  <>
                    <div className="vcm__rescue-sub-label">같은 구역</div>
                    {rescuableUnits.map(unit => (
                      <button
                        key={unit.id}
                        className={`vcm__rescue-unit vcm__rescue-unit--${unit.color}`}
                        onClick={() => { onRescue(unit); }}
                      >
                        <span className="vcm__rescue-unit-name">{unit.label}</span>
                        <span className="vcm__rescue-unit-arrow">→ 임시의료소</span>
                      </button>
                    ))}
                  </>
                )}

                {/* 외곽 방면 굴절차/고가차 */}
                {faceRescuableUnits.length > 0 && (
                  <>
                    <div className="vcm__rescue-sub-label vcm__rescue-sub-label--face">외곽 방면</div>
                    {faceRescuableUnits.map(unit => {
                      const face     = extractFace(unit.zoneKey)!;
                      const typeLbl  = unit.unitType === 'aerial' ? '고가차' : '굴절차';
                      return (
                        <button
                          key={unit.id}
                          className="vcm__rescue-unit vcm__rescue-unit--face"
                          onClick={() => { onRescue(unit); }}
                        >
                          <span className="vcm__rescue-unit-name">
                            {face}면 {typeLbl}
                            <span className="vcm__rescue-unit-sub"> / {unit.label}</span>
                          </span>
                          <span className="vcm__rescue-unit-arrow">→ 임시의료소</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── 3. 상태 변경 (person) ───────────────── */}
      {victim.kind === 'person' && (
        <div className="vcm__section">
          <div className="vcm__section-label">환자상태</div>
          <div className="vcm__cond-grid">
            {VICTIM_CONDITIONS.map(c => (
              <button
                key={c}
                className={[
                  'vcm__cond-btn',
                  `vcm__cond-btn--${condClass(c)}`,
                  victim.condition === c ? 'vcm__cond-btn--active' : '',
                ].join(' ')}
                onClick={() => applyCondition(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. 라벨 변경 (custom) ───────────────── */}
      {victim.kind === 'custom' && (
        <div className="vcm__section">
          <div className="vcm__section-label">라벨</div>
          <div className="vcm__input-row">
            <input
              className="vcm__input"
              value={labelDraft}
              onChange={e => setLabelDraft(e.target.value)}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { applyLabel(); onClose(); }
              }}
              placeholder="기타"
              maxLength={20}
              autoFocus
            />
            <button
              className="vcm__apply-btn"
              onClick={() => { applyLabel(); onClose(); }}
            >
              ✓
            </button>
          </div>
        </div>
      )}

      {/* ── 4. 세부위치 입력 ────────────────────── */}
      <div className="vcm__section">
        <div className="vcm__section-label">세부위치</div>
        <div className="vcm__input-row">
          <input
            className="vcm__input"
            value={subDraft}
            onChange={e => setSubDraft(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter') { applySubLocation(); onClose(); }
            }}
            placeholder="212호, 복도…"
            maxLength={20}
            autoFocus={victim.kind !== 'custom'}
          />
          <button
            className="vcm__apply-btn"
            onClick={() => { applySubLocation(); onClose(); }}
          >
            ✓
          </button>
        </div>
      </div>
    </div>,
    stagePortalTarget(),
  );
}

function condClass(c: VictimCondition): string {
  switch (c) {
    case '경상': return 'minor';
    case '중상': return 'critical';
    case '사망': return 'dead';
    default:     return '';
  }
}

/**
 * 건물 내부 zoneKey에서 floorId를 추출.
 * 지원 형식: "2F-center", "RF-stair", "B1-left"
 * 외곽/특수 구역("face-A", "medical-post" 등)은 null 반환.
 */
function extractBuildingFloor(zoneKey: string | null): string | null {
  if (!zoneKey) return null;
  const m = zoneKey.match(/^(RF|\d+F|B\d+)-/);
  return m ? m[1] : null;
}

/**
 * zoneKey에서 방면 문자(A/B/C/D)를 추출.
 * 지원 형식:
 *   "face-A"  (buildingData valid zones)
 *   "A-face", "A-pump", "A-tank"  (faceZoneData zone ids)
 */
function extractFace(zoneKey: string | null): 'A' | 'B' | 'C' | 'D' | null {
  if (!zoneKey) return null;
  const m1 = zoneKey.match(/^face-([ABCD])$/);
  if (m1) return m1[1] as 'A' | 'B' | 'C' | 'D';
  const m2 = zoneKey.match(/^([ABCD])-/);
  if (m2) return m2[1] as 'A' | 'B' | 'C' | 'D';
  return null;
}
