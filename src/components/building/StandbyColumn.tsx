import { useState } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { TokenCard } from '../shared/TokenCard';
import { VictimCard } from '../shared/VictimCard';
import { RescueStats } from './RescueStats';
import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 차량 unitType 집합
// ─────────────────────────────────────────────

const VEHICLE_UNIT_TYPES = new Set([
  'pump', 'water_tank', 'rescue_vehicle', 'aerial', 'ladder',
  'smoke_exhaust', 'hazmat', 'wildfire', 'command', 'vehicle',
]);

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
  const options = tokens.filter(t => t.zoneKey === zoneKey && !VEHICLE_UNIT_TYPES.has(t.unitType));

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
// 임시의료소 — 소장 + 좌(구조대상자) / 우(출동대) 분리
// ─────────────────────────────────────────────

function MedicalPostBox() {
  const { tokens, moveToken }   = useTokens();
  const { victims, moveVictim } = useVictims();
  const { medicalPostChief, updateMedicalPostChief } = useSettings();

  const zoneKey     = 'medical-post';
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey);

  // 좌측(구조대상자) 드롭
  const victimPanel = useDropPanel();
  function onVictimDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    victimPanel.setIsDragOver(false);
    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) moveVictim(victimId, zoneKey);
  }

  // 우측(출동대) 드롭
  const tokenPanel = useDropPanel();
  function onTokenDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    tokenPanel.setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="standby-box standby-box--medical standby-box--medical-large">
      <div className="standby-box__header standby-box__header--chief">
        <span className="standby-box__title">임시의료소</span>
        <ChiefSelector value={medicalPostChief} onChange={updateMedicalPostChief} zoneKey="medical-post" />
      </div>

      <div className="medical-split">
        {/* 좌: 구조대상자 */}
        <div className="medical-split__pane">
          <div className="medical-split__pane-label">구조대상자</div>
          <div
            className={[
              'medical-split__body',
              victimPanel.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={victimPanel.onDragOver}
            onDragLeave={victimPanel.onDragLeave}
            onDrop={onVictimDrop}
          >
            {zoneVictims.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              zoneVictims.map(v => <VictimCard key={v.id} victim={v} />)
            )}
          </div>
        </div>

        <div className="medical-split__divider" />

        {/* 우: 출동대 */}
        <div className="medical-split__pane">
          <div className="medical-split__pane-label">출동대</div>
          <div
            className={[
              'medical-split__body',
              tokenPanel.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={tokenPanel.onDragOver}
            onDragLeave={tokenPanel.onDragLeave}
            onDrop={onTokenDrop}
          >
            {zoneTokens.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              zoneTokens.map(t => <TokenCard key={t.id} token={t} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 2열 대기구역 박스 (자원대기소 / 대기1단계)
// 차량(좌) | 출동대(우) 분리 표시
// ─────────────────────────────────────────────

interface SplitStandbyBoxProps {
  label:          string;
  zoneKey:        string;
  colorMod:       string;
  chief?:         string;
  onChiefChange?: (name: string) => void;
}

function SplitStandbyBox({ label, zoneKey, colorMod, chief, onChiefChange }: SplitStandbyBoxProps) {
  const { tokens, moveToken } = useTokens();

  const zoneTokens    = tokens.filter(t => t.zoneKey === zoneKey);
  const vehicleTokens = zoneTokens.filter(t =>  VEHICLE_UNIT_TYPES.has(t.unitType));
  const unitTokens    = zoneTokens.filter(t => !VEHICLE_UNIT_TYPES.has(t.unitType));

  const vehicleCol = useDropPanel();
  const unitCol    = useDropPanel();

  function onVehicleColDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    vehicleCol.setIsDragOver(false);
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  function onUnitColDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    unitCol.setIsDragOver(false);
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

      <div className="standby-split">
        {/* 좌: 차량 */}
        <div className="standby-split__col">
          <div className="standby-split__col-label">차량</div>
          <div
            className={[
              'standby-split__body',
              vehicleCol.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={vehicleCol.onDragOver}
            onDragLeave={vehicleCol.onDragLeave}
            onDrop={onVehicleColDrop}
          >
            {vehicleTokens.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              vehicleTokens.map(t => <TokenCard key={t.id} token={t} />)
            )}
          </div>
        </div>

        <div className="standby-split__divider" />

        {/* 우: 출동대 */}
        <div className="standby-split__col">
          <div className="standby-split__col-label">출동대</div>
          <div
            className={[
              'standby-split__body',
              unitCol.isDragOver ? 'drop-target--active' : '',
            ].filter(Boolean).join(' ')}
            onDragOver={unitCol.onDragOver}
            onDragLeave={unitCol.onDragLeave}
            onDrop={onUnitColDrop}
          >
            {unitTokens.length === 0 ? (
              <span className="standby-box__placeholder">―</span>
            ) : (
              unitTokens.map(t => <TokenCard key={t.id} token={t} />)
            )}
          </div>
        </div>
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
      <SplitStandbyBox
        label="자원대기소"
        zoneKey="standby-resource"
        colorMod="resource"
        chief={stagingAreaChief}
        onChiefChange={updateStagingAreaChief}
      />

      {/* 대기1단계 — 2열: 차량(좌) / 출동대(우) */}
      <SplitStandbyBox
        label="대기1단계"
        zoneKey="standby-standby1"
        colorMod="standby1"
      />
    </div>
  );
}
