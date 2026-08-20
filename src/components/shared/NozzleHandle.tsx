import { useRef } from 'react';
import type { UnitToken } from '../../types';
import { useTokens }            from '../../context/TokenContext';
import { useWaterConnections }  from '../../context/WaterConnectionContext';
import { useDisplayOptions }    from '../../context/DisplayOptionsContext';
import { useHandleDrag }        from '../../hooks/useHandleDrag';
import { sprayBlockReason }     from '../../utils/waterSupply';
import { useWaterLevel }         from '../../context/WaterLevelContext';
import { resolveSprayTarget }   from '../../utils/sprayTarget';
import { logDragEvent }         from '../../utils/dragDiagnostics';
import './NozzleHandle.css';

// ─────────────────────────────────────────────
// 방수 핸들 — 토큰 우측 상단
//
//   드래그 → 놓은 지점으로 방수개시
//   클릭   → 방수중단 (방수 중일 때만)
//
// 두 가지를 겸한다. 조작은 같고 저장되는 상태와 급수 조건만 다르다.
//   관창   (진압대·구조대) — sprayState. 송수 사용 훈련이면 급수 연결이 필요하다.
//   방수포 (펌프·물탱크)   — aerialSprayTarget. 제 물탱크로 쏘므로 연결이 필요 없다.
//
// 우클릭 메뉴의 방수개시·방수중단은 그대로 남아 있다. 이건 기본 동선을
// 줄이는 수단이지 유일한 경로가 아니다.
// ─────────────────────────────────────────────

/** 자체 물탱크로 쏘는 방수포 차종 */
const MONITOR_TYPES = new Set(['pump', 'water_tank']);

interface Props {
  token: UnitToken;
}

export function NozzleHandle({ token }: Props) {
  const { setSprayState, setAerialSprayTarget, setStatusTag } = useTokens();
  const { connections }       = useWaterConnections();
  const { showWaterSupply }   = useDisplayOptions();
  const waterLevel            = useWaterLevel();
  const hintTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostRef               = useRef<HTMLDivElement>(null);

  const isMonitor  = MONITOR_TYPES.has(token.unitType);
  const isSpraying = isMonitor ? token.aerialSprayTarget != null : token.sprayState != null;
  // 방수포는 연결이 필요 없지만 제 수량이 0이면 못 쏜다
  const blockReason = sprayBlockReason(
    showWaterSupply, connections, token.id, token.unitType, waterLevel?.emptyVehicleIds,
  );
  const canSpray = blockReason === null;

  // 급수가 없어 못 쓰는 상태를 잠깐 알려준다 (숨기지 않는다 — 왜 안 되는지 보여야 한다)
  function flashBlocked() {
    const el = hostRef.current;
    if (!el) return;
    el.classList.add('nozzle-handle--blocked-flash');
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => el.classList.remove('nozzle-handle--blocked-flash'), 700);
  }

  const drag = useHandleDrag({
    enabled: true,
    lineColor: isSpraying ? '#88bbff' : '#66ccff',
    // originRef 를 주지 않으면 핸들 자신이 시작점이 된다 —
    // 방수선이 그려지는 자리(SprayOverlay)와 같아야 이어져 보인다.
    onDrop: ({ clientX, clientY }) => {
      if (!canSpray) { flashBlocked(); return; }
      const target = resolveSprayTarget(clientX, clientY);
      if (!target) return;                       // 판 밖에 놓음 — 조용히 취소
      if (isMonitor) {
        setAerialSprayTarget(token.id, { floorId: target.floorId ?? '', x: target.x, y: target.y });
        setStatusTag(token.id, { label: `${target.label} 방수`, color: 'blue' });
      } else {
        setSprayState(token.id, '100%', target);
      }
      logDragEvent('NozzleHandle spray start', `${token.label} → ${target.floorId ?? 'point'}`);
    },
    onTap: () => {
      if (isSpraying) {
        if (isMonitor) {
          setAerialSprayTarget(token.id, null);
          setStatusTag(token.id, null);
        } else {
          setSprayState(token.id, null);
        }
        logDragEvent('NozzleHandle spray stop', token.label);
      } else if (!canSpray) {
        flashBlocked();
      }
    },
  });

  const kindLabel = isMonitor ? '방수포' : '방수';
  const title = isSpraying
    ? `클릭 — ${kindLabel} 중단`
    : canSpray
      ? `끌어서 ${kindLabel} 지점 지정`
      : blockReason === 'empty'
        ? '수량이 소진되어 방수할 수 없습니다'
        : '송수 연결이 있어야 방수할 수 있습니다';

  return (
    <div
      ref={hostRef}
      className={[
        'nozzle-handle',
        isMonitor  ? 'nozzle-handle--monitor' : '',
        isSpraying ? 'nozzle-handle--active'  : '',
        !canSpray  ? 'nozzle-handle--blocked' : '',
      ].filter(Boolean).join(' ')}
      title={title}
      aria-label={title}
      {...drag}
    >
      {/* 관창 픽토그램 — 손잡이 + 노즐 + 물줄기 */}
      <svg viewBox="0 0 20 12" aria-hidden="true">
        <rect x="1" y="4.2" width="8" height="3.6" rx="1.2" />
        <path d="M9 3.6 L13.5 4.8 L13.5 7.2 L9 8.4 Z" />
        <rect x="3.4" y="7.6" width="2.4" height="3.4" rx="0.9" />
        <path className="nozzle-handle__jet" d="M14.8 6 H18.6" />
      </svg>
    </div>
  );
}
