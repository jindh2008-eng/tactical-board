import { useEffect, useRef } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useWaterConnections } from '../../context/WaterConnectionContext';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { deriveWaterMissions } from '../../utils/waterMissions';
import { DERIVED_MISSION_LABELS } from '../../config/unitMissions';
import type { TagPreset } from '../../types/settings';

// ─────────────────────────────────────────────
// 급수 임무 다리 — 그리는 것이 없는 부품
//
// 「중요」·「1선」·「순환급수」는 **연결과 배치가 정한다.** 그 셈은 순수 함수가 하고
// (utils/waterMissions.ts), 결과를 토큰에 붙이고 로그를 남기는 일만 여기서 한다.
//
// ## 왜 렌더 시점 파생으로 끝내지 않는가
//
// 「몇 분에 어느 대를 중요물탱크로 세웠는가」가 평가 항목이다. 로그와 분석창이
// `missionTags` 와 `status-tag` 로그를 읽으므로 저장까지 가야 훈련 기록이 남는다.
// 대신 **쓰는 곳은 이 다리 하나**다 — 그래야 이중 출처가 안 생긴다.
//
// ## 「단위」는 건드리지 않는다
//
// 단위지휘관은 손으로 붙이는 임무다. 여기서는 `DERIVED_MISSION_LABELS` 셋만
// 붙이고 뗀다 — 그 밖의 임무 태그는 그대로 둔다.
//
// `TokenProvider`(toggleMissionTag) 와 `WaterConnectionProvider`(연결),
// `HydrantCirculationProvider`(줄) 안쪽이어야 한다.
// ─────────────────────────────────────────────

/** 파생 임무는 색이 하나다 — 판 위 임무 칩의 파랑(App.css) */
function missionTag(label: string): TagPreset {
  return { label, color: 'blue' };
}

export function WaterMissionBridge() {
  const { tokens, toggleMissionTag, addLog } = useTokens();
  const { connections }                      = useWaterConnections();
  const { circulationIds }                   = useHydrantCirculation();

  /*
   * 최신값을 ref 로도 든다. 아래 이펙트는 **파생값이 바뀔 때만** 돌아야 하는데,
   * `toggleMissionTag` 가 tokens 를 바꾸므로 tokens 를 의존성에 넣으면 제가 만든
   * 변화에 다시 깨어난다. 읽기는 ref 로, 깨우는 것은 연결·줄로만 한다.
   */
  const tokensRef = useRef(tokens);
  const toggleRef = useRef(toggleMissionTag);
  const addLogRef = useRef(addLog);
  useEffect(() => { tokensRef.current = tokens;           }, [tokens]);
  useEffect(() => { toggleRef.current = toggleMissionTag; }, [toggleMissionTag]);
  useEffect(() => { addLogRef.current = addLog;           }, [addLog]);

  useEffect(() => {
    const current = tokensRef.current;
    const derived = deriveWaterMissions(
      connections,
      circulationIds,
      id => current.find(t => t.id === id)?.unitType,
    );

    for (const token of current) {
      const want = derived.get(token.id) ?? null;
      const has  = token.missionTags?.find(m => DERIVED_MISSION_LABELS.includes(m.label))?.label ?? null;
      if (want === has) continue;

      /*
       * 뗀 다음 붙인다. 켜는 쪽이 같은 묶음의 다른 하나를 밀어내지만
       * (EXCLUSIVE_MISSION_GROUPS), 뗄 것만 있고 붙일 것이 없는 경우가 있어
       * 두 걸음으로 나눈다.
       */
      if (has) {
        toggleRef.current(token.id, missionTag(has));
        addLogRef.current({
          logType: 'status-tag', tokenId: token.id, tokenName: token.label,
          tokenColor: token.color, fromZoneId: '', toZoneId: '',
          note:    `급수임무 해제: ${token.label} · ${has}`,
          payload: {
            kind: 'water-mission', tokenId: token.id, tokenLabel: token.label,
            missionLabel: has, assigned: false,
          },
        });
      }
      if (want) {
        toggleRef.current(token.id, missionTag(want));
        addLogRef.current({
          logType: 'status-tag', tokenId: token.id, tokenName: token.label,
          tokenColor: token.color, fromZoneId: '', toZoneId: '',
          note:    `급수임무 지정: ${token.label} · ${want}`,
          payload: {
            kind: 'water-mission', tokenId: token.id, tokenLabel: token.label,
            missionLabel: want, assigned: true,
          },
        });
      }
    }
  }, [connections, circulationIds]);

  return null;
}
