import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { RescueStats } from './RescueStats';
import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 드롭 패널 공통 훅
// ─────────────────────────────────────────────

function useDropPanel() {
  const [isDragOver, setIsDragOver] = useState(false);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  return { isDragOver, setIsDragOver, onDragOver, onDragLeave };
}

// ─────────────────────────────────────────────
// 소장 선택 드롭다운
// ─────────────────────────────────────────────

interface ChiefSelectorProps {
  value:    string;
  onChange: (name: string) => void;
  zoneKey:  string;
}

function ChiefSelector({ value, onChange, zoneKey }: ChiefSelectorProps) {
  const { tokens } = useTokens();
  const options = tokens.filter(t => t.zoneKey === zoneKey);

  return (
    <div className="standby-chief">
      <select
        className="standby-chief__select"
        value={value}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">소장 미지정</option>
        {options.map(t => (
          <option key={t.id} value={t.label}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────
// 임시의료소 — 단일 드롭 영역 (구조대상자 + 출동대)
// ─────────────────────────────────────────────

export function MedicalPostBox() {
  const { tokens, moveToken }   = useTokens();
  const { victims, moveVictim } = useVictims();
  const { medicalPostChief, updateMedicalPostChief } = useSettings();

  const zoneKey     = 'medical-post';
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);

  const panel = useDropPanel();

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    panel.setIsDragOver(false);
    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) { moveVictim(victimId, zoneKey); return; }
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="standby-box standby-box--medical standby-box--medical-large">
      <div className="standby-box__header standby-box__header--chief">
        <span className="standby-box__title">임시의료소</span>
        <ChiefSelector value={medicalPostChief} onChange={updateMedicalPostChief} zoneKey="medical-post" />
      </div>

      <div
        className={[
          'standby-box__body',
          panel.isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={panel.onDragOver}
        onDragLeave={panel.onDragLeave}
        onDrop={onDrop}
      >
        {zoneVictims.length === 0 && zoneTokens.length === 0 ? (
          <span className="standby-box__placeholder">―</span>
        ) : (
          <>
            {zoneVictims.map(v => <VictimCard key={v.id} victim={v} />)}
            {zoneTokens.map(t => <TokenCard key={t.id} token={t} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 단순 대기구역 박스 (자원대기소 / 대기1단계)
// ─────────────────────────────────────────────

interface SimpleStandbyBoxProps {
  label:          string;
  zoneKey:        string;
  colorMod:       string;
  chief?:         string;
  onChiefChange?: (name: string) => void;
}

function SimpleStandbyBox({ label, zoneKey, colorMod, chief, onChiefChange }: SimpleStandbyBoxProps) {
  const { tokens, moveToken } = useTokens();
  const zoneTokens = tokens.filter(t => t.zoneKey === zoneKey);
  const panel = useDropPanel();

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    panel.setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className={`standby-box standby-box--${colorMod}`}>
      <div className="standby-box__header standby-box__header--chief">
        <span className="standby-box__title">{label}</span>
        {chief !== undefined && onChiefChange && (
          <ChiefSelector value={chief} onChange={onChiefChange} zoneKey={zoneKey} />
        )}
      </div>

      <div
        className={[
          'standby-box__body',
          panel.isDragOver ? 'drop-target--active' : '',
        ].filter(Boolean).join(' ')}
        onDragOver={panel.onDragOver}
        onDragLeave={panel.onDragLeave}
        onDrop={onDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="standby-box__placeholder">―</span>
        ) : (
          zoneTokens.map(t => <TokenCard key={t.id} token={t} />)
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// StandbyColumn — TacticalArea col 1 좌측 운영패널
//
// 순서: 임시의료소(소장+분할) → 구조현황통계 → 자원대기소(2열) → 대기1단계(2열)
// 직전대기는 ImminentStandby (TacticalArea col 2, row 3) 로 분리
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// BottomStandbyBoxes — TacticalArea col 1, row 3
// 자원대기소 + 대기1단계를 세로로 쌓아 배치
// ─────────────────────────────────────────────

export function BottomStandbyBoxes() {
  return (
    <div className="bottom-standby-boxes">
      <SimpleStandbyBox
        label="대기1단계"
        zoneKey="standby-standby1"
        colorMod="standby1"
      />
    </div>
  );
}

export const STANDBY_ZONE_KEYS = [
  'medical-post',
  'standby-resource',
  'standby-standby1',
  'standby-imminent',
] as const;

export type StandbyZoneKey = typeof STANDBY_ZONE_KEYS[number];

export function StandbyColumn() {
  const { stagingAreaChief, updateStagingAreaChief } = useSettings();

  return (
    <div className="standby-column">
      {/* 임시의료소 — 소장 선택 + 구조대상자/출동대 분리 */}
      <MedicalPostBox />

      {/* 구조현황통계 */}
      <RescueStats />

      {/* 자원대기소 — 2열: 차량(좌) / 출동대(우) + 소장 지정 */}
      <SimpleStandbyBox
        label="자원대기소"
        zoneKey="standby-resource"
        colorMod="resource"
        chief={stagingAreaChief}
        onChiefChange={updateStagingAreaChief}
      />

      {/* 대기1단계 — 2열: 차량(좌) / 출동대(우) */}
      <SimpleStandbyBox
        label="대기1단계"
        zoneKey="standby-standby1"
        colorMod="standby1"
      />
    </div>
  );
}
