import { useEffect } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useSettings } from '../../store/settingsStore';
import { useMedicalPost } from '../../context/MedicalPostContext';
import { useUIOverlay } from '../../context/UIOverlayContext';
import { TokenCard } from '../shared/TokenCard';
import { CategorizedTokenGrid } from '../shared/CategorizedTokenGrid';
import { VictimCard } from '../shared/VictimCard';
import { RescueStats } from './RescueStats';
import { ArrivedGroupRow } from '../shared/ArrivedGroupRow';
import { splitArrivalGroup } from '../../utils/arrivalGroup';

import './StandbyColumn.css';

// ─────────────────────────────────────────────
// 드롭 패널 공통 훅
// ─────────────────────────────────────────────

function useDropPanel() {
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  return { onDragOver };
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
//
// A면 하단 밴드의 마지막 칸이다(AFaceBottomZones.tsx). 현장에 설치되는
// 공간이라 상황판 위에 있는 것이 교리에 맞다.
// 스타일은 A면과 이질감이 없도록 옅은 선 + 명칭만 — .a-face-band__zone
// (AFaceBottomZones.css) / .a-face-zone__body·__label (ExteriorZone.css)
// ─────────────────────────────────────────────

export function MedicalPostBox() {
  const { tokens, moveToken, addLog } = useTokens();
  const { victims, moveVictim } = useVictims();
  const {
    isInstalled, setIsInstalled,
    assignedTokenId, setAssignedTokenId,
  } = useMedicalPost();
  const { openOverlay } = useUIOverlay();

  // 설치·소장 지명은 지휘관의 명시적 결정이라 시각이 남아야 한다 (EVENT_LOG_PLAN N-13)
  function toggleInstalled() {
    const next = !isInstalled;
    setIsInstalled(next);
    addLog({
      logType: 'post', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
      note:    next ? '임시의료소 설치' : '임시의료소 해제',
      payload: { kind: 'post-install', post: 'medical', installed: next },
    });
  }

  function changeChief(nextId: string | null) {
    if (nextId === assignedTokenId) return;
    setAssignedTokenId(nextId);
    const label = nextId ? (tokens.find(t => t.id === nextId)?.label ?? nextId) : null;
    addLog({
      logType: 'post', tokenId: nextId ?? '', tokenName: label ?? '', fromZoneId: '', toZoneId: '',
      note:    label ? `임시의료소장 지명: ${label}` : '임시의료소장 해제',
      payload: { kind: 'post-chief', post: 'medical', chiefTokenId: nextId, chiefLabel: label },
    });
  }

  const zoneKey     = 'medical-post';
  const zoneTokens  = tokens.filter(t => t.zoneKey === zoneKey);
  // 이송 연결된 구조대상자는 출동대 토큰 우측에 붙어 렌더된다(TokenCard) — 구역 배치에서 제외.
  const zoneVictims = victims.filter(v => v.zoneKey === zoneKey && !v.carriedBy);

  // 담당 토큰이 구역을 벗어나면 담당자만 자동 해제 (설치 상태는 유지)
  useEffect(() => {
    if (assignedTokenId && !zoneTokens.some(t => t.id === assignedTokenId)) {
      changeChief(null);
    }
  // changeChief는 매 렌더 새로 만들어진다 — 의존성에 넣으면 매 렌더 재실행된다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneTokens, assignedTokenId]);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // A면(부모) 드롭존으로 버블링 방지
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation(); // A면 핸들러가 같은 이벤트를 또 처리해 zoneKey가 'face-A'로
    // 덮어써지는 것을 막는다 (직전대기와 동일한 이유)
    const victimId = e.dataTransfer.getData('victimId');
    if (victimId) { moveVictim(victimId, zoneKey); return; }
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="a-face-band__zone a-face-band__zone--medical">
      <div className="a-face-zone__header">
        <div className="standby-chief">
          <select
            className="standby-chief__select"
            value={assignedTokenId ?? ''}
            onChange={e => changeChief(e.target.value || null)}
          >
            <option value="">소장 미지정</option>
            {zoneTokens.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
        {/* 헤더 우측 끝 — 구조활동통계를 화면 가운데 팝업으로 연다.
            이 자리는 좁아서 표를 넣으면 글씨를 줄여야 한다 */}
        <button
          className="medical-stats-toggle"
          onClick={() => openOverlay('rescue-stats')}
          title="구조활동통계 보기"
        >
          구조활동통계
        </button>
        {/* 설치 여부는 구조활동통계 우측 — 헤더 맨 끝에 둔다 */}
        <button
          className={`medical-status-btn medical-status-btn--${isInstalled ? 'installed' : 'none'}`}
          onClick={toggleInstalled}
        >
          {isInstalled ? '설치' : '미설치'}
        </button>
      </div>

      <div
        className="a-face-zone__body"
        data-zone-key={zoneKey}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {zoneVictims.map(v => <VictimCard key={v.id} victim={v} />)}
        {zoneTokens.map(t => (
          <div
            key={t.id}
            className={[
              'medical-post__token-wrap',
              assignedTokenId === t.id ? 'medical-post__token-wrap--selected' : '',
            ].filter(Boolean).join(' ')}
          >
            <TokenCard token={t} />
          </div>
        ))}
      </div>
    {/* 명칭은 박스 하단 — 직전대기·RIT·현장지휘소 와 같은 자리 */}
      <span className="a-face-zone__label a-face-zone__label--bottom">임시의료소</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// 단순 대기구역 박스 (자원대기소 / 대기1단계)
// ─────────────────────────────────────────────

interface SimpleStandbyBoxProps {
  label:               string;
  zoneKey:             string;
  colorMod:            string;
  chief?:              string;
  onChiefChange?:      (name: string) => void;
  onTokenDoubleClick?: (tokenId: string) => void;
}

function SimpleStandbyBox({ label, zoneKey, colorMod, chief, onChiefChange, onTokenDoubleClick }: SimpleStandbyBoxProps) {
  const { tokens, moveToken } = useTokens();
  const zoneTokens = tokens.filter(t => t.zoneKey === zoneKey);
  // 맨 윗줄은 "도착대" — 방금 들어온 한 무리. 나머지는 아래에서 종류별로 정렬한다.
  const { arrived, rest } = splitArrivalGroup(zoneTokens);
  const panel = useDropPanel();

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
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
        className="standby-box__body"
        data-zone-key={zoneKey}
        onDragOver={panel.onDragOver}
        onDrop={onDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="standby-box__placeholder">―</span>
        ) : (
          <>
            <ArrivedGroupRow tokens={arrived} onTokenDoubleClick={onTokenDoubleClick} />
            {rest.length > 0 && (
              <div className="standby-box__rest">
                <CategorizedTokenGrid tokens={rest} onTokenDoubleClick={onTokenDoubleClick} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// StandbyColumn — TacticalArea col 1 좌측 운영패널
//
// 순서: 임시의료소(소장+분할) → 구조현황통계 → 자원대기소(2열) → 대기1단계(2열)
// 임시의료소·직전대기·RIT는 A면으로 이동함(2026-08-18)
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// BottomStandbyBoxes — 좌측 운영 패널의 "대기1단계" 섹션
// 더블클릭하면 A면의 직전대기로 보낸다(차량은 여기 남는다 — 교리대로)
// ─────────────────────────────────────────────

export function BottomStandbyBoxes() {
  const { moveToken } = useTokens();
  return (
    <div className="bottom-standby-boxes">
      <SimpleStandbyBox
        label="대기1단계"
        zoneKey="standby-standby1"
        colorMod="standby1"
        onTokenDoubleClick={id => moveToken(id, 'standby-imminent')}
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
  const { addLog } = useTokens();

  function changeStagingChief(name: string) {
    if (name === stagingAreaChief) return;
    updateStagingAreaChief(name);
    addLog({
      logType: 'post', tokenId: '', tokenName: name, fromZoneId: '', toZoneId: '',
      note:    name ? `자원대기소장 지명: ${name}` : '자원대기소장 해제',
      payload: { kind: 'post-chief', post: 'resource', chiefTokenId: null, chiefLabel: name || null },
    });
  }

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
        onChiefChange={changeStagingChief}
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
