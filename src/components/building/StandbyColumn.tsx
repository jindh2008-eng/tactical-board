import { useEffect } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useVictims } from '../../context/VictimContext';
import { useMedicalPost } from '../../context/MedicalPostContext';
import { useUIOverlay } from '../../context/UIOverlayContext';
import { TokenCard } from '../shared/TokenCard';
import { ChiefSlot } from '../shared/ChiefSlot';
import { CategorizedTokenGrid } from '../shared/CategorizedTokenGrid';
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
  // moveVictim 만 쓴다 — 구조대상자를 그리지는 않지만 드롭(=구조 처리)은 받는다
  const { moveVictim } = useVictims();
  const {
    isInstalled, setIsInstalled,
    assignedTokenId, setAssignedTokenId,
  } = useMedicalPost();
  const { openOverlay } = useUIOverlay();

  /*
   * 설치 토글을 없앴다 — 소장을 지명하면 그것이 곧 설치다.
   *
   * 「미설치」 버튼과 소장 드롭다운이 따로 있어서 둘의 상태가 어긋날 수 있었다
   * (소장은 있는데 미설치, 설치했는데 소장 미지정). 지명 하나로 묶는다.
   *
   * **해제해도 설치는 유지한다.** 한 번 세운 임시의료소는 소장을 바꾸는 동안에도
   * 서 있는 것이고, 무엇보다 isInstalled 는 표시용이 아니다 — 이 값이 꺼지면
   * 도착 경로가 달라진다(자원대기소의 resourceAssigned 와 같은 성질).
   */
  function changeChief(nextId: string | null) {
    if (nextId === assignedTokenId) return;
    setAssignedTokenId(nextId);
    const label = nextId ? (tokens.find(t => t.id === nextId)?.label ?? nextId) : null;
    addLog({
      logType: 'post', tokenId: nextId ?? '', tokenName: label ?? '', fromZoneId: '', toZoneId: '',
      note:    label ? `임시의료소장 지명: ${label}` : '임시의료소장 해제',
      payload: { kind: 'post-chief', post: 'medical', chiefTokenId: nextId, chiefLabel: label },
    });

    // 지명이 곧 설치. 해제해도 되돌리지 않는다(위 주석)
    if (nextId && !isInstalled) {
      setIsInstalled(true);
      addLog({
        logType: 'post', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note:    '임시의료소 설치',
        payload: { kind: 'post-install', post: 'medical', installed: true },
      });
    }
  }

  const zoneKey     = 'medical-post';
  const allZoneTokens = tokens.filter(t => t.zoneKey === zoneKey);
  const chiefToken  = allZoneTokens.find(t => t.id === assignedTokenId) ?? null;
  // 소장은 슬롯이 그린다 — 박스에도 그리면 한 토큰이 두 번 보인다
  const zoneTokens  = allZoneTokens.filter(t => t.id !== assignedTokenId);

  // 담당 토큰이 구역을 벗어나면 담당자만 자동 해제 (설치 상태는 유지)
  useEffect(() => {
    if (assignedTokenId && !allZoneTokens.some(t => t.id === assignedTokenId)) {
      changeChief(null);
    }
  // changeChief는 매 렌더 새로 만들어진다 — 의존성에 넣으면 매 렌더 재실행된다
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allZoneTokens, assignedTokenId]);

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
        <ChiefSlot
          chief={chiefToken}
          label="임시의료소장"
          onAssign={t => {
            // 소장은 그 자리에 있는 사람이다 — 밖에서 끌어왔으면 구역으로 함께 들인다
            if (t.zoneKey !== zoneKey) moveToken(t.id, zoneKey);
            changeChief(t.id);
          }}
          onRelease={() => changeChief(null)}
        />
        {/* 헤더 우측 끝 — 구조활동통계를 화면 가운데 팝업으로 연다.
            이 자리는 좁아서 표를 넣으면 글씨를 줄여야 한다 */}
        <button
          className="medical-stats-toggle"
          onClick={() => openOverlay('rescue-stats')}
          title="구조활동통계 보기"
        >
          구조활동통계
        </button>
      </div>

      <div
        className="a-face-zone__body"
        data-zone-key={zoneKey}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/*
          구조대상자는 여기 그리지 않는다 — 임시의료소에는 출동대만 선다.
          드롭은 그대로 받는다(아래 onDrop): 구조 처리가 바로 그 경로이고,
          구조 결과는 오른쪽 구조 현황판(RescueBoard)에서 색으로 나타난다.
        */}
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
  onTokenDoubleClick?: (tokenId: string) => void;
}

function SimpleStandbyBox({ label, zoneKey, colorMod, onTokenDoubleClick }: SimpleStandbyBoxProps) {
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
