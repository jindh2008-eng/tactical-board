import { useEffect, useState } from 'react';
import { useActionMode } from '../../context/ActionModeContext';
import { getDragLog, clearDragLog } from '../../utils/dragDiagnostics';
import './DragDiagnosticsPanel.css';

// ─────────────────────────────────────────────
// 드래그 진단 패널 (개발 모드 전용)
// docs/TECHNICAL_IMPROVEMENT_PLAN.md P0-DRAG-01
//
// - 현재 ActionMode와 그에 대응하는 전체화면 오버레이를 함께 보여줌
//   (오버레이는 화면에 보이지 않는 투명 레이어라 존재 자체를 인지하기 어려움)
// - 최근 드래그 이벤트(dragstart/dragend/drop, 차단·거부 사유)를 순환 버퍼로 표시
// - React 상태·DataTransfer 처리가 없는 순수 native draggable 진단 토큰
//   → 장애 중 이 토큰도 안 끌리면 브라우저/탭의 native DnD 문제,
//      이 토큰만 정상이면 앱의 dragstart 핸들러 쪽 문제로 분류 가능
// ─────────────────────────────────────────────

const MODE_OVERLAY_HINT: Record<string, string> = {
  'rescue':              '전체화면 오버레이 없음 — 구조대상자 카드 클릭 대기',
  'select-floor':        '전체화면 오버레이 없음 — 층/구역 클릭 대기',
  'select-pump':         '전체화면 오버레이 없음 — 부서 위치 클릭 대기',
  'water-connect':       '전체화면 오버레이 없음 — 대상 토큰 클릭 대기',
  'spray-target':        'SprayTargetOverlay (전체화면) — 잘못된 지점 클릭 시 모드가 풀리지 않고 유지될 수 있음',
  'aerial-floor-select': 'AerialTargetOverlay (전체화면) — 층 라벨 클릭 대기',
  'aerial-spray-target': 'AerialSprayTargetOverlay (전체화면) — 모든 클릭에서 정상 종료됨',
};

export function DragDiagnosticsPanel() {
  const { mode, clearMode } = useActionMode();
  const [open, setOpen]     = useState(false);
  const [, forceTick]       = useState(0);

  // 열려있는 동안만 로그를 주기적으로 다시 읽어 화면 갱신
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => forceTick(n => n + 1), 500);
    return () => clearInterval(id);
  }, [open]);

  if (!import.meta.env.DEV) return null;

  const log = getDragLog();

  async function handleCopy() {
    const text = [
      `mode: ${mode.type ?? 'null'}`,
      `time: ${new Date().toISOString()}`,
      '',
      ...log.map(e => `[${new Date(e.ts).toLocaleTimeString()}] ${e.label}  ${e.detail}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 권한 없음 — 무시 (패널에서 직접 선택 복사 가능) */
    }
  }

  return (
    <div className="drag-diag">
      <button className="drag-diag__toggle" onClick={() => setOpen(o => !o)}>
        DRAG DIAG {open ? '▼' : '▲'}
      </button>

      {open && (
        <div className="drag-diag__panel">
          <div className="drag-diag__row">
            ActionMode: <b>{mode.type ?? 'null'}</b>
          </div>
          {mode.type !== null && (
            <>
              <div className="drag-diag__hint">{MODE_OVERLAY_HINT[mode.type] ?? '-'}</div>
              <button className="drag-diag__btn" onClick={clearMode}>모드 강제 취소</button>
            </>
          )}

          <div className="drag-diag__actions">
            <button className="drag-diag__btn" onClick={clearDragLog}>로그 지우기</button>
            <button className="drag-diag__btn" onClick={handleCopy}>복사</button>
          </div>

          <hr className="drag-diag__sep" />

          <div className="drag-diag__row">순수 native 진단 토큰 (React 로직 없음):</div>
          <div className="drag-diag__native-token" draggable title="이 토큰이 안 끌리면 브라우저/탭 자체의 DnD 문제">
            진단토큰
          </div>

          <hr className="drag-diag__sep" />

          <div className="drag-diag__log">
            {log.length === 0
              ? <div className="drag-diag__empty">기록된 이벤트 없음</div>
              : log.slice().reverse().map((e, i) => (
                  <div key={i} className="drag-diag__log-row">
                    [{new Date(e.ts).toLocaleTimeString()}] {e.label} {e.detail}
                  </div>
                ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
