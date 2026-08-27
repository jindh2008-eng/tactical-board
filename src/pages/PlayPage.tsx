import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { stagePortalTarget } from '../utils/stagePortal';
import { useSettings }        from '../store/settingsStore';
import { useTraining }        from '../context/TrainingContext';
import { useNavSlot }         from '../context/NavSlotContext';
import { DisplayOptionsContext, type DisplayOptionKey } from '../context/DisplayOptionsContext';
import { useTokens, TokenProvider } from '../context/TokenContext';
import { LogProvider, useLog }  from '../context/LogContext';
import { VictimProvider }     from '../context/VictimContext';
import { EventProvider }      from '../context/EventContext';
import { ActionModeProvider, useActionMode } from '../context/ActionModeContext';
import { WaterConnectionProvider } from '../context/WaterConnectionContext';
import { WaterLevelProvider }      from '../context/WaterLevelContext';
import { HydrantStateProvider }    from '../context/HydrantStateContext';
import { ChecklistProgressProvider } from '../context/ChecklistProgressContext';
import { ResourceStatusProvider, useResourceStatus } from '../context/ResourceStatusContext';
import { MedicalPostProvider } from '../context/MedicalPostContext';
import { FireCommandProvider }     from '../context/FireCommandContext';
import { ChecklistCommandProvider } from '../context/ChecklistCommandContext';
import { StageRoot }               from '../components/stage/StageRoot';
import { FireLineProvider }        from '../context/FireLineContext';
import { DrawingProvider }         from '../context/DrawingContext';
import { SprayOverlay }            from '../components/overlay/SprayOverlay';
import { AerialOverlay }          from '../components/overlay/AerialOverlay';
import { UnitStatusPanel as UnitInfoPanel } from '../components/left/UnitStatusPanel';
import { UnitAddPanel }       from '../components/left/UnitAddPanel';
import { ArrivedGroupRow }    from '../components/shared/ArrivedGroupRow';
import { splitArrivalGroup }  from '../utils/arrivalGroup';
import { CategorizedTokenGrid } from '../components/shared/CategorizedTokenGrid';
import { TacticalArea }       from '../components/building/TacticalArea';
import { BottomStandbyBoxes } from '../components/building/StandbyColumn';
import { WaterConnectionOverlay } from '../components/overlay/WaterConnectionOverlay';
import { AnalysisModal }      from '../components/overlays/AnalysisModal';
import { RescueStatsModal }   from '../components/overlays/RescueStatsModal';
import { DragDiagnosticsPanel } from '../components/dev/DragDiagnosticsPanel';
import { logDragEvent } from '../utils/dragDiagnostics';
import {
  resolveAerialDeployFloor, maxDeployHeight, overHeightMessage,
} from '../utils/aerialDeploy';
import { resolveSprayTarget } from '../utils/sprayTarget';
import { LogPanel }           from '../components/right/LogPanel';
import { CommandProcedureTrainingBox } from '../components/right/CommandProcedureTrainingBox';
import { ChiefSlot }          from '../components/shared/ChiefSlot';
import './PlayPage.css';


// ─────────────────────────────────────────────
// 훈련 시작·종료 → 이벤트 로그 브릿지
//
// `TrainingProvider`는 App 최상위(LogProvider 바깥)라 `TrainingContext` 안에서는
// `useLog()`를 쓸 수 없다. `EventLayer`가 이벤트 상태 로그를 대신 처리하는 것과 같은 이유다.
// 훈련 시작·종료는 **모든 경과시간(MM:SS)의 기준점**이라 로그에 반드시 남아야 한다.
// docs/EVENT_LOG_PLAN.md N-1
// ─────────────────────────────────────────────

function TrainingLogBridge() {
  const { status } = useTraining();
  const { addLog } = useLog();

  // 마운트 시점 상태를 기준으로 잡는다 — 새로고침으로 'running'이 복원돼도 다시 기록하지 않는다
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === status) return;
    prevStatusRef.current = status;

    if (prev === 'idle' && status === 'running') {
      addLog({
        logSource: 'system', logType: 'training',
        tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note: '훈련 시작',
        payload: { kind: 'training', phase: 'start' },
      });
    } else if (status === 'ended') {
      addLog({
        logSource: 'system', logType: 'training',
        tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note: '훈련 종료',
        payload: { kind: 'training', phase: 'end' },
      });
    }
  }, [status, addLog]);

  return null;
}


// ─────────────────────────────────────────────
// ActionMode 오버레이 배너
// (ActionModeProvider 내부에서만 동작)
// ─────────────────────────────────────────────

function ActionModeBanner() {
  const { mode, clearMode } = useActionMode();
  if (mode.type === null) return null;

  let message = '';
  if (mode.type === 'rescue') {
    message = '구조대상자를 클릭하세요  (같은 구역의 피해자만 선택 가능)';
  } else if (mode.type === 'select-floor') {
    message = '층·구역을 클릭하세요';
  } else if (mode.type === 'select-pump') {
    message = '부서 위치를 클릭하세요';
  } else if (mode.type === 'water-connect') {
    message = '송수 대상 토큰을 클릭하세요  (ESC 취소)';
  } else if (mode.type === 'spray-target') {
    message = '방수 지점을 클릭하세요  (ESC 취소)';
  } else if (mode.type === 'aerial-floor-select') {
    message = `전개 지점을 클릭하세요  (ESC 취소)`;
  } else if (mode.type === 'aerial-spray-target') {
    message = '방수 지점을 클릭하세요  (ESC 취소)';
  } else if (mode.type === 'drawing') {
    message = '전술상황판에 선을 그리세요  (우클릭 또는 ESC 취소)';
  } else if (mode.type === 'drawing-erase') {
    message = '삭제할 선을 클릭하거나 드래그하세요  (우클릭 또는 ESC 취소)';
  }

  return (
    <div className="action-mode-banner">
      <span className="action-mode-banner__icon">⬤</span>
      <span className="action-mode-banner__msg">{message}</span>
      <button className="action-mode-banner__cancel" onClick={clearMode}>
        ESC 취소
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// 방수 지점 선택 오버레이
// spray-target 모드 중 전체 화면에 클릭 영역을 제공
// ─────────────────────────────────────────────

function SprayTargetOverlay() {
  const { mode, clearMode } = useActionMode();
  const { setSprayState }   = useTokens();
  // 잘못된 지점 클릭 시 모드는 유지하되(재시도 가능) 사용자에게 즉시 피드백을 준다.
  // 이전에는 아무 반응도 없어 모드가 "조용히" 계속 켜진 채로 남는 문제가 있었다.
  // (docs/TECHNICAL_IMPROVEMENT_PLAN.md P0-DRAG-02)
  const [invalidClickAt, setInvalidClickAt] = useState<{ x: number; y: number } | null>(null);
  const invalidTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (invalidTimerRef.current) clearTimeout(invalidTimerRef.current);
  }, []);

  if (mode.type !== 'spray-target') return null;
  const sprayMode = mode;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = resolveSprayTarget(e.clientX, e.clientY);

    // 전술상황판 밖 클릭 — 모드는 유지(재시도 가능), 사용자에게 피드백만 표시
    if (!target || !sprayMode.sourceZoneKey) {
      logDragEvent('SprayTargetOverlay invalid click', `sourceZone=${sprayMode.sourceZoneKey ?? 'null'}`);
      if (invalidTimerRef.current) clearTimeout(invalidTimerRef.current);
      setInvalidClickAt({ x: e.clientX, y: e.clientY });
      invalidTimerRef.current = setTimeout(() => setInvalidClickAt(null), 900);
      return;
    }

    setSprayState(sprayMode.sourceId, '100%', target);
    logDragEvent('SprayTargetOverlay resolved', `sourceId=${sprayMode.sourceId} floorId=${target.floorId ?? 'null'}`);
    clearMode();
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
        onClick={handleClick}
      />
      {/* 피드백 말풍선은 **포털**로 뺀다.
          `position: fixed` 인 요소가 스테이지(transform: scale) 안에 있으면 left/top 이
          뷰포트가 아니라 **캔버스** 기준으로 해석되는데, 여기 좌표는 clientX/clientY —
          즉 뷰포트 px 다. 스테이지 안에 두면 배율만큼 어긋난 자리에 뜬다
          (배율 0.9749·판 우측에서 가로 50px). 포털 루트는 뷰포트 전면이라
          좌표 변환 없이 클릭 지점에 정확히 얹힌다.
          → docs/SCREEN_STAGE_PLAN.md §4.1 */}
      {invalidClickAt && createPortal(
        <div
          className="spray-target-overlay__invalid-msg"
          style={{ left: invalidClickAt.x, top: invalidClickAt.y }}
        >
          방수 대상 구역이 아닙니다
        </div>,
        stagePortalTarget(),
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// 고가차/굴절차 전개·방수 지점 선택 오버레이
// aerial-floor-select 모드 중 임의 지점 클릭 → 층 정보 자동 감지
// ─────────────────────────────────────────────

function AerialTargetOverlay() {
  const { mode, clearMode }               = useActionMode();
  const { setStatusTag, setAerialTarget } = useTokens();

  if (mode.type !== 'aerial-floor-select') return null;
  const aerialMode = mode;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    // 건물 내부는 클릭한 층 행, B·D면은 같은 높이의 층 행으로 환산한다.
    // (지하층·A/C면·판 밖은 null → 전개하지 않음)
    const target = resolveAerialDeployFloor(e.clientX, e.clientY);
    if (!target) return;
    const { floorId, floorHeight, displayLabel } = target;

    // 높이 제한 검증
    if (floorHeight > maxDeployHeight(aerialMode.unitType)) {
      alert(overHeightMessage(aerialMode.unitType));
      return;
    }

    const board = document.getElementById('tactical-area');
    const rect  = board?.getBoundingClientRect();
    if (!rect) return;

    setStatusTag(aerialMode.sourceId, { label: `${displayLabel} ${aerialMode.actionLabel}`, color: 'yellow' });
    setAerialTarget(aerialMode.sourceId, {
      floorId,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
      deployLabel: aerialMode.actionLabel,
    });
    clearMode();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
      onClick={handleClick}
    />
  );
}

// ─────────────────────────────────────────────
// 고가차/굴절차 방수 지점 선택 오버레이
// aerial-spray-target 모드 중 임의 지점 클릭 → aerialSprayTarget 저장
// ─────────────────────────────────────────────

function AerialSprayTargetOverlay() {
  const { mode, clearMode }                           = useActionMode();
  const { setAerialSprayTarget, setStatusTag, tokens } = useTokens();

  if (mode.type !== 'aerial-spray-target') return null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    let floorEl: Element | null = null;
    let faceKey: string | null  = null;
    for (const el of elements) {
      let cur: Element | null = el;
      while (cur) {
        if (!floorEl && cur.getAttribute('data-floor-id')) { floorEl = cur; }
        if (!faceKey) {
          const zk = cur.getAttribute('data-zone-key');
          if (zk?.startsWith('face-')) faceKey = zk;
        }
        if (floorEl && faceKey) break;
        cur = cur.parentElement;
      }
      if (floorEl && faceKey) break;
    }

    const board = document.getElementById('tactical-area');
    const rect  = board?.getBoundingClientRect();
    if (!rect) return;

    const floorId = floorEl?.getAttribute('data-floor-id') ?? faceKey ?? null;

    if (mode.type !== 'aerial-spray-target') return;
    const token = tokens.find(t => t.id === mode.sourceId);
    if (!token) return;

    const floorLabel  = floorEl?.getAttribute('data-floor-label') ?? '';
    setStatusTag(mode.sourceId, { label: `${floorLabel} 방수`, color: 'blue' });
    setAerialSprayTarget(mode.sourceId, {
      floorId: floorId ?? (token.aerialTarget?.floorId ?? ''),
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top)  / rect.height,
    });
    clearMode();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9800, cursor: 'crosshair' }}
      onClick={handleClick}
    />
  );
}

// ─────────────────────────────────────────────
// 자원대기소 패널
// ─────────────────────────────────────────────

function ResourcePanel() {
  const { tokens, moveToken, addLog }                = useTokens();
  const { stagingAreaChief, updateStagingAreaChief } = useSettings();
  const { resourceAssigned, setResourceAssigned }    = useResourceStatus();

  /*
   * 운영 지정 토글을 없앴다 — 소장을 지명하면 그것이 곧 운영 지정이다.
   * (EVENT_LOG_PLAN N-14 의 로그는 그대로 남긴다)
   *
   * **해제해도 운영 지정은 유지한다.** resourceAssigned 는 표시용이 아니라
   * 도착한 출동대와 하차하는 펌프가 자원대기소로 갈지 대기1단계로 갈지를
   * 정한다(TokenContext · UnitStatusPanel). 소장을 바꾸려고 잠깐 빼는 사이
   * 도착 경로가 흔들리면 안 된다.
   */
  function changeChief(name: string) {
    if (name === stagingAreaChief) return;
    updateStagingAreaChief(name);
    addLog({
      logType: 'post', tokenId: '', tokenName: name, fromZoneId: '', toZoneId: '',
      note:    name ? `자원대기소장 지명: ${name}` : '자원대기소장 해제',
      payload: { kind: 'post-chief', post: 'resource', chiefTokenId: null, chiefLabel: name || null },
    });

    if (name && !resourceAssigned) {
      setResourceAssigned(true);
      addLog({
        logType: 'post', tokenId: '', tokenName: '', fromZoneId: '', toZoneId: '',
        note:    '자원대기소 운영 지정',
        payload: { kind: 'post-install', post: 'resource', installed: true },
      });
    }
  }

  const zoneKey    = 'standby-resource';
  const allZoneTokens = tokens.filter(t => t.zoneKey === zoneKey);
  // 소장은 이름 문자열로 저장된다(설정모드 stagingAreaChief 와 같은 형식)
  const chiefToken = allZoneTokens.find(t => t.label === stagingAreaChief) ?? null;
  // 소장은 슬롯이 그린다 — 박스에도 그리면 한 토큰이 두 번 보인다
  const zoneTokens = chiefToken ? allZoneTokens.filter(t => t.id !== chiefToken.id) : allZoneTokens;
  // 맨 윗줄은 "도착대" — 방금 들어온 한 무리
  const { arrived, rest } = splitArrivalGroup(zoneTokens);

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const tokenId = e.dataTransfer.getData('tokenId');
    if (tokenId) moveToken(tokenId, zoneKey);
  }

  return (
    <div className="resource-panel">
      <div className="resource-panel__header">
        <span className="resource-panel__title">자원대기소</span>
        <ChiefSlot
          chief={chiefToken}
          label="자원대기소장"
          onAssign={t => {
            // 소장은 그 자리에 있는 사람이다 — 밖에서 끌어왔으면 구역으로 함께 들인다.
            // (이미 구역 안이면 moveToken 이 같은 zoneKey 로 아무 일도 하지 않는다)
            if (t.zoneKey !== zoneKey) moveToken(t.id, zoneKey);
            changeChief(t.label);
          }}
          onRelease={() => changeChief('')}
        />
      </div>
      <div
        className="resource-panel__body"
        data-zone-key={zoneKey}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {zoneTokens.length === 0 ? (
          <span className="resource-panel__placeholder">―</span>
        ) : (
          <>
          <ArrivedGroupRow
            tokens={arrived}
            onTokenDoubleClick={id => moveToken(id, 'standby-standby1')}
          />
          {rest.length > 0 && (
            <div className="resource-panel__rest">
              <CategorizedTokenGrid
                tokens={rest}
                onTokenDoubleClick={id => moveToken(id, 'standby-standby1')}
              />
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 운영 패널 — 추가출동대 → 출동대현황 → 자원대기소 → 대기1단계 → 이벤트 로그
// 화면 좌측 고정 열. 원래 우측에 있었으나 지휘절차 훈련 패널에 자리를 내주고
// 좌측으로 옮겼다 — 무전 플레이어 모드 UI 개편(2026-08-18).
//
// 임시의료소·직전대기·RIT는 현장에 실재하는 공간이라 A면으로 옮겼다(2026-08-18).
// 그 결과 임시의료소 ⇄ 구조활동통계 토글이 상대를 잃어, 통계표만 단독으로 남긴다
// (통계는 장소가 아니라 표라서 상황판보다 패널에 맞다).
//
// 이벤트 로그는 원래 상단 nav 버튼 → LogDrawer(오버레이)로만 볼 수 있었다.
// 항상 보이는 독립 열(LogColumn)이 생기며 그 오버레이 경로는 완전히 대체됐다 —
// nav 버튼과 LogDrawer 를 제거했다(2026-08-22).
// ─────────────────────────────────────────────

function OperationPanel() {
  return (
    <div className="op-panel">
      <div className="op-panel__section op-panel__section--unit-add">
        <UnitAddPanel />
      </div>
      <div className="op-panel__section op-panel__section--unit">
        <UnitInfoPanel />
      </div>
      <div className="op-panel__section op-panel__section--resource">
        <ResourcePanel />
      </div>
      <div className="op-panel__section op-panel__section--standby1">
        <BottomStandbyBoxes />
      </div>
    </div>
  );
}

/**
 * 이벤트 로그 열 — 운영 패널에서 분리한 다섯 번째 칸.
 *
 * 가로에서는 운영 패널 **아래**에 붙어 예전과 똑같이 1/5 높이를 차지하고,
 * 세로에서는 **독립 열**이 되어 세로로 길어진다(로그는 줄 단위라 폭보다
 * 높이가 이득이다). 배치는 전적으로 .play-layout 의 방향별 규칙이 정한다.
 *
 * 겉을 `.op-panel` 로 감싸 둔 이유는 기존 CSS 를 그대로 쓰기 위해서다 —
 * 화이트보드 통일 규칙과 로그 전용 어두운 테마가 모두
 * `.op-panel ...` 선택자에 걸려 있다.
 */
function LogColumn() {
  return (
    <div className="op-panel op-panel--log">
      <div className="op-panel__section op-panel__section--log">
        <LogPanel collapsed={false} onToggle={() => {}} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// nav 옵션 드롭다운
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// PlayPage
//
// 진행상황 관리(ChecklistPanel)는 무플 화면에 표시하지 않는다.
// 지휘절차 항목은 우측 CommandProcedureTrainingBox 로 대체됐다
// (무플 UI 개편, 2026-08-18 — docs/DEFERRED_PROPAGATION.md P-2·P-7 참고).
// ─────────────────────────────────────────────

export function PlayPage() {
  const { building, timing, dispatchRoster, victimSetup, arrivalMode } = useSettings();
  const { runKey, status, elapsed, loadSettings, start, stop }         = useTraining();

  const [showWaterSupply, setShowWaterSupply] = useState(true);
  const [showSpray,       setShowSpray]       = useState(true);
  const [showControlLine, setShowControlLine] = useState(true);
  const [showAllVictims,  setShowAllVictims]  = useState(false);
  // 그리기 도구모음은 기본 숨김 — 상단 표시옵션에서 켠다
  const [showDrawingTools, setShowDrawingTools] = useState(false);

  const handleOptionToggle = useCallback((key: DisplayOptionKey) => {
    if (key === 'waterSupply')      setShowWaterSupply(v => !v);
    else if (key === 'spray')       setShowSpray(v => !v);
    else if (key === 'controlLine') setShowControlLine(v => !v);
    else if (key === 'victims')     setShowAllVictims(v => !v);
    else if (key === 'drawing')     setShowDrawingTools(v => !v);
  }, []);

  const displayOptions = useMemo(
    () => ({ showWaterSupply, showSpray, showControlLine, showAllVictims, showDrawingTools,
             toggleOption: handleOptionToggle }),
    [showWaterSupply, showSpray, showControlLine, showAllVictims, showDrawingTools, handleOptionToggle],
  );

  const elapsedRef = useRef(elapsed);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // ── nav 슬롯: 훈련 컨트롤을 상단 공유 nav 바에 주입 ──
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const timerLabel =
    status === 'running' ? `진행중 ${mm}:${ss}` :
    status === 'ended'   ? `종료   ${mm}:${ss}` :
                           '대기중 00:00';

  useNavSlot(
    <div className="play-nav-slot">
      {/* 좌 */}
      <div className="play-nav__left">
        {/* 표시옵션은 C면 좌측 상단(DisplayOptionsBar)으로 옮겼다 */}
        <div className="play-nav__divider" />
      </div>

      {/* 중앙 — 대상명 + 타이머 */}
      <div className="play-nav__center">
        <span className="play-nav__target">{building.targetName || '대상 미설정'}</span>
        <span className={`play-nav__timer${status === 'running' ? ' play-nav__timer--running' : ''}`}>
          {timerLabel}
        </span>
      </div>

      {/* 우 */}
      <div className="play-nav__btns">
        <button
          className="nav-btn nav-btn--setting"
          onClick={loadSettings}
          title="설정 데이터를 실행 상태로 불러오고 초기화"
        >
          훈련 세팅
        </button>
        <button className="nav-btn nav-btn--start" onClick={start} disabled={status !== 'idle'}>
          시작
        </button>
        <button className="nav-btn nav-btn--stop" onClick={stop} disabled={status !== 'running'}>
          종료
        </button>
      </div>
    </div>
  );

  const started = status === 'running';

  return (
    <div className="play-page" onContextMenu={e => e.preventDefault()}>
      <FireLineProvider>
      <DisplayOptionsContext.Provider value={displayOptions}>
      {/* LogProvider는 runKey Provider 중 가장 바깥이다 — 안쪽 어디서든 useLog()를 쓸 수 있게 한다.
          훈련 시작 전에는 undefined를 넘겨 로그가 00:00으로 뭉치지 않게 한다(EVENT_LOG_PLAN E-2). */}
      <LogProvider
        key={runKey}
        getElapsed={() => (status === 'idle' ? undefined : elapsed)}
      >
      <TrainingLogBridge />
      <EventProvider key={runKey}>
      <ChecklistProgressProvider key={runKey}>
      <ResourceStatusProvider key={runKey}>
      <MedicalPostProvider key={runKey}>
      <TokenProvider
        key={runKey}
        timingConfig={{ rescueTimeSec: timing.rescueTimeSec, moveTimeSec: timing.moveTimeSec }}
        initialRoster={dispatchRoster}
        started={started}
        arrivalMode={arrivalMode}
      >
        <VictimProvider
          key={runKey}
          initialVictimSetup={victimSetup}
          buildingConfig={building.config}
          fireFloor={building.fireFloor}
        >
          {/* ActionModeProvider: TokenContext + VictimContext 내부에 배치 */}
          <ActionModeProvider key={runKey}>
          <DrawingProvider key={runKey}>
          <WaterConnectionProvider>
          <FireCommandProvider>
          <ChecklistCommandProvider>
          <WaterLevelProvider>
          <HydrantStateProvider>
            <StageRoot>
            <div className="play-layout">
              {/* ── 좌측 운영 패널 — 추가출동대 → 출동대현황 → 자원대기소 → 대기1단계 ── */}
              <OperationPanel />

              {/* ── 이벤트 로그 — 가로: 운영 패널 아래 / 세로: 우측 독립 열 ── */}
              <LogColumn />

              {/* ── 전술상황판 ── */}
              <div className="tactical-board-wrap">
                <div className="tactical-board-inner">
                  <TacticalArea
                    config={building.config}
                    fireFloor={building.fireFloor}
                    initialFireStatus={building.fireStatus}
                    extraFireFloors={building.extraFireFloors ?? []}
                  />
                </div>
              </div>

              {/* ── 우측 지휘절차 훈련 패널 — 진행상황관리 대신 표시 ── */}
              <div className="procedure-panel">
                <div className="procedure-panel__box">
                  <CommandProcedureTrainingBox />
                </div>
              </div>

              {/* ── 오버레이 (Modal) ── */}
              <AnalysisModal />
              <RescueStatsModal />

              {/* ── ActionMode 배너 (모드 활성 시만 표시) ── */}
              <ActionModeBanner />

              {/* ── 송수 연결선 오버레이 ── */}
              <WaterConnectionOverlay />

              {/* ── 방수 SVG 오버레이 ── */}
              <SprayOverlay />

              {/* ── 고가차/굴절차 전개 SVG 오버레이 ── */}
              <AerialOverlay />

              {/* ── 방수 지점 선택 오버레이 ── */}
              <SprayTargetOverlay />

              {/* ── 고가차/굴절차 전개·방수 지점 선택 오버레이 ── */}
              <AerialTargetOverlay />
              <AerialSprayTargetOverlay />

              {/* ── 드래그 진단 패널 (개발 모드 전용) ── */}
              <DragDiagnosticsPanel />
            </div>
            </StageRoot>
          </HydrantStateProvider>
          </WaterLevelProvider>
          </ChecklistCommandProvider>
          </FireCommandProvider>
          </WaterConnectionProvider>
          </DrawingProvider>
          </ActionModeProvider>
        </VictimProvider>
      </TokenProvider>
      </MedicalPostProvider>
      </ResourceStatusProvider>
      </ChecklistProgressProvider>
      </EventProvider>
      </LogProvider>
      </DisplayOptionsContext.Provider>
      </FireLineProvider>
    </div>
  );
}
