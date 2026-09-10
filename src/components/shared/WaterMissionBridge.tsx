import { useEffect, useRef } from 'react';
import { useTokens } from '../../context/TokenContext';
import { useWaterConnections, type WaterConnection } from '../../context/WaterConnectionContext';
import { useHydrantCirculation } from '../../context/HydrantCirculationContext';
import { deriveWaterMissions } from '../../utils/waterMissions';
import { waterRelayPhrase } from '../../utils/logPhrase';
import { DERIVED_MISSION_LABELS } from '../../config/unitMissions';
import type { TagPreset } from '../../types/settings';
import type { WaterMissionChange } from '../../types';

// ─────────────────────────────────────────────
// 급수 임무 다리 — 그리는 것이 없는 부품
//
// 「중요」·「1선」·「순환급수」는 **연결과 배치가 정한다.** 그 셈은 순수 함수가 하고
// (utils/waterMissions.ts), 결과를 토큰에 붙이고 로그를 남기는 일만 여기서 한다.
//
// ## 왜 렌더 시점 파생으로 끝내지 않는가
//
// 「몇 분에 어느 대를 중요물탱크로 세웠는가」가 평가 항목이다. 로그와 분석창이
// `missionTags` 와 로그를 읽으므로 저장까지 가야 훈련 기록이 남는다.
// 대신 **쓰는 곳은 이 다리 하나**다 — 그래야 이중 출처가 안 생긴다.
//
// ## 송수 로그도 여기서 남긴다 (2026-09-10)
//
// 연결 한 건이 무전 한 번이다 — 「물탱크1 44호 소화전 점령 / 중요물탱크 지정」.
// 그 연결로 바뀐 급수 임무를 **같은 줄에** 붙이려면 연결·순환칸·토큰을 한꺼번에
// 봐야 하는데, 셋을 다 보는 자리가 여기뿐이다(순환칸 Provider 가 송수 Provider
// 보다 안쪽이라 addConnection 에서는 닿지 않는다). 그래서 연결 목록이 바뀔 때
// 앞뒤를 비교해 줄을 만든다. docs/EVENT_LOG_PHRASING_PLAN.md §2.3
//
// 연결로 설명되지 않는 임무 변화(순환칸 배치, 윗단이 끊겨 따라 풀린 1선)는
// 종전처럼 「급수임무 지정/해제」 줄로 따로 남긴다.
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

  /*
   * 직전 연결 목록 — 이번에 생기고 끊긴 것을 가르는 기준.
   * 첫값은 마운트 시점의 목록이다. 세션에서 되살아난 연결을 「방금 연결」로
   * 다시 적지 않기 위해서다.
   */
  const prevConnsRef = useRef<WaterConnection[]>(connections);

  useEffect(() => {
    const current = tokensRef.current;
    const tokenOf = (id: string) => current.find(t => t.id === id);
    const derived = deriveWaterMissions(connections, circulationIds, id => tokenOf(id)?.unitType);

    // ── ① 임무 — 판 위 칩을 파생값에 맞추고, 바뀐 것을 모은다 ──────────
    const changes: WaterMissionChange[] = [];
    for (const token of current) {
      const want = derived.get(token.id) ?? null;
      const has  = token.missionTags?.find(m => DERIVED_MISSION_LABELS.includes(m.label))?.label ?? null;
      if (want === has) continue;

      /*
       * 뗀 다음 붙인다. 켜는 쪽이 같은 묶음의 다른 하나를 밀어내지만
       * (EXCLUSIVE_MISSION_GROUPS), 뗄 것만 있고 붙일 것이 없는 경우가 있어
       * 두 걸음으로 나눈다. 로그는 아래에서 한 번에 남긴다 — toggle 은 조용히.
       */
      if (has) {
        toggleRef.current(token.id, missionTag(has), { silent: true });
        changes.push({ tokenId: token.id, tokenLabel: token.label, missionLabel: has, assigned: false });
      }
      if (want) {
        toggleRef.current(token.id, missionTag(want), { silent: true });
        changes.push({ tokenId: token.id, tokenLabel: token.label, missionLabel: want, assigned: true });
      }
    }

    // ── ② 송수 — 연결 한 건이 한 줄. 물을 받는 차의 임무 변화는 같은 줄에 붙인다 ──
    const prev = prevConnsRef.current;
    prevConnsRef.current = connections;
    const nowIds  = new Set(connections.map(c => c.id));
    const prevIds = new Set(prev.map(c => c.id));
    const relays = [
      ...prev.filter(c => !nowIds.has(c.id)).map(conn => ({ conn, connected: false })),
      ...connections.filter(c => !prevIds.has(c.id)).map(conn => ({ conn, connected: true })),
    ];

    const claimed = new Set<WaterMissionChange>();
    for (const { conn, connected } of relays) {
      const mine = changes.filter(m => m.tokenId === conn.toId && !claimed.has(m));
      for (const m of mine) claimed.add(m);

      // 연결 시점에 박아 둔 이름을 우선 쓴다 — 소화전·연결송수구는 tokens 에 없다
      const fromName = conn.fromName ?? tokenOf(conn.fromId)?.label ?? conn.fromId;
      const toName   = conn.toName   ?? tokenOf(conn.toId)?.label   ?? conn.toId;
      const note = waterRelayPhrase(
        { connected, fromType: conn.fromType, toType: conn.toType, fromName, toName },
        mine,
      );
      if (note === null) continue;   // 수관철수 — 기록하지 않는다

      addLogRef.current({
        logType:    'water-relay',
        tokenId:    conn.fromId,
        tokenName:  fromName,
        tokenColor: tokenOf(conn.fromId)?.color,
        fromZoneId: conn.fromId,
        toZoneId:   conn.toId,
        note,
        payload: {
          kind: 'water-relay', connected, connectionId: conn.id,
          fromId: conn.fromId, toId: conn.toId, fromType: conn.fromType, toType: conn.toType,
          fromName, toName, missions: mine,
        },
      });
    }

    // ── ③ 연결로 설명되지 않는 임무 변화 — 순환칸 배치, 윗단에 딸려 풀린 1선 ──
    for (const m of changes) {
      if (claimed.has(m)) continue;
      addLogRef.current({
        logType: 'status-tag', tokenId: m.tokenId, tokenName: m.tokenLabel,
        tokenColor: tokenOf(m.tokenId)?.color, fromZoneId: '', toZoneId: '',
        note:    `급수임무 ${m.assigned ? '지정' : '해제'}: ${m.tokenLabel} · ${m.missionLabel}`,
        payload: {
          kind: 'water-mission', tokenId: m.tokenId, tokenLabel: m.tokenLabel,
          missionLabel: m.missionLabel, assigned: m.assigned,
        },
      });
    }
  }, [connections, circulationIds]);

  return null;
}
