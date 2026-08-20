import type { UnitToken } from '../../types';
import { useTokens }      from '../../context/TokenContext';
import { useHandleDrag }  from '../../hooks/useHandleDrag';
import {
  resolveAerialDeployFloor, maxDeployHeight, deployLabelOf, overHeightMessage,
} from '../../utils/aerialDeploy';
import { logDragEvent }   from '../../utils/dragDiagnostics';
import './LadderHandle.css';

// ─────────────────────────────────────────────
// 사다리·바스켓 핸들 — 고가차·굴절차 토큰 우측
//
//   드래그 → 놓은 지점으로 전개
//
// 전개가 끝나면 이 핸들은 사라지고, 그다음부터는 사다리 끝단을 직접 끌어
// 위치를 바꾼다(AerialOverlay). 두 조작이 같은 문법이라 이어진다.
// ─────────────────────────────────────────────

interface Props {
  token: UnitToken;
}

export function LadderHandle({ token }: Props) {
  const { setAerialTarget, setStatusTag } = useTokens();

  const isLadder    = token.unitType === 'ladder';
  const deployLabel = deployLabelOf(token.unitType);

  const drag = useHandleDrag({
    enabled: true,
    lineColor: isLadder ? '#ff9944' : '#ffcc44',
    onDrop: ({ clientX, clientY }) => {
      const target = resolveAerialDeployFloor(clientX, clientY);
      if (!target) return;                       // 지하층·A/C면·판 밖 — 조용히 취소
      if (target.floorHeight > maxDeployHeight(token.unitType)) {
        alert(overHeightMessage(token.unitType));
        return;
      }
      const rect = document.getElementById('tactical-area')?.getBoundingClientRect();
      if (!rect) return;

      setStatusTag(token.id, { label: `${target.displayLabel} ${deployLabel}`, color: 'yellow' });
      setAerialTarget(token.id, {
        floorId: target.floorId,
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top)  / rect.height,
        deployLabel,
      });
      logDragEvent('LadderHandle deploy', `${token.label} → ${target.displayLabel}`);
    },
  });

  const title = `끌어서 ${deployLabel} (최대 ${maxDeployHeight(token.unitType)}층)`;

  return (
    <div
      className={`ladder-handle${isLadder ? ' ladder-handle--boom' : ''}`}
      title={title}
      aria-label={title}
      {...drag}
    >
      {isLadder ? (
        /* 굴절차 — 관절 붐 */
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path className="ladder-handle__boom" d="M2.5 14 L8 8.5 L14 10" />
          <circle className="ladder-handle__joint" cx="8" cy="8.5" r="1.7" />
          <rect className="ladder-handle__basket" x="12" y="7" width="3.4" height="3.2" rx="0.6" />
        </svg>
      ) : (
        /* 고가차 — 레일 + 가로대 사다리 */
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path className="ladder-handle__rail" d="M2 14.5 L12.5 3 M4.2 15.6 L14.7 4.1" />
          <path
            className="ladder-handle__rung"
            d="M3.2 13.2 L5.4 14.4 M5.4 10.7 L7.6 11.9 M7.6 8.2 L9.8 9.4 M9.8 5.7 L12 6.9"
          />
        </svg>
      )}
    </div>
  );
}
