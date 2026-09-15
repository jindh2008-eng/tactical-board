// ─────────────────────────────────────────────
// 대기 박스의 출동대를 어디로 내보내는가 — src/utils/dispatchTarget.ts
//
// 자원대기소(지정) → 대기1단계(운영) → A면(2026-09-14 사용자 정의).
// 미운영이면 A면으로 나가는 것은 의도한 것이다(2026-09-15 사용자 확인).
// 더블클릭 · 차수 더블클릭 · 동승 펌프 하차 지점 · 시간 도착이 모두 이 규칙을 따른다.
// ─────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTarget, standby1OrFace, ZONE_RESOURCE, ZONE_STANDBY1, ZONE_FACE_A } from '../src/utils/dispatchTarget.ts';

describe('dispatchTarget — 더블클릭 · 차수 · 펌프 하차 지점', () => {
  it('자원대기소가 지정됐으면 대기1단계 운영과 무관하게 자원대기소', () => {
    assert.equal(dispatchTarget(true, true), ZONE_RESOURCE);
    assert.equal(dispatchTarget(true, false), ZONE_RESOURCE);
  });

  it('자원대기소가 없고 대기1단계 운영 중이면 대기1단계', () => {
    assert.equal(dispatchTarget(false, true), ZONE_STANDBY1);
  });

  it('둘 다 아니면 A면', () => {
    assert.equal(dispatchTarget(false, false), ZONE_FACE_A);
  });
});

describe('standby1OrFace — 시간 도착 · 자원대기소에서 내보낼 때', () => {
  it('자원대기소를 보지 않는다 — 대기1단계 운영 여부만', () => {
    assert.equal(standby1OrFace(true), ZONE_STANDBY1);
    assert.equal(standby1OrFace(false), ZONE_FACE_A);
  });

  it('구역 키가 판 위 구역과 같다', () => {
    assert.deepEqual([ZONE_RESOURCE, ZONE_STANDBY1, ZONE_FACE_A], ['standby-resource', 'standby-standby1', 'face-A']);
  });
});
