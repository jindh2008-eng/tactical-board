// ─────────────────────────────────────────────
// 이벤트 로그 문장 시험 — src/utils/logPhrase.ts
//
// 로그 문장은 사용자가 한 줄씩 정한 무전 멘트 형식이다(docs/EVENT_LOG_PHRASING_PLAN.md).
// 문구를 고칠 때마다 다른 문장이 함께 흔들리기 쉬워, 정해진 형식을 여기서 못 박는다.
// 문장이 바뀌어야 한다면 이 시험의 기대값을 **사용자 결정과 함께** 고친다.
//
// 돌리는 법: npm test
// 출동대는 칩(unit 조각)이라 [진압1대] 처럼 대괄호로 적어 비교한다.
// ─────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as lp from '../src/utils/logPhrase.ts';

/** 조각 → 「[진압1대] 대기1단계 → 직전대기 이동」 — 칩은 대괄호로 */
const t = parts => (parts === null ? null : parts.map(p => (p.kind === 'unit' ? `[${p.text}]` : p.text)).join(''));

const s1   = { tokenId: 's1', label: '진압1', unitType: 'suppression', color: 'red' };
const r1   = { tokenId: 'r1', label: '구조1', unitType: 'rescue' };
const e1   = { tokenId: 'e1', label: '구급1', unitType: 'ems' };
const p1   = { tokenId: 'p1', label: '펌프1', unitType: 'pump' };
const w1   = { tokenId: 'w1', label: '물탱크1', unitType: 'water_tank' };
const a1   = { tokenId: 'a1', label: '고가1', unitType: 'aerial' };
const l1   = { tokenId: 'l1', label: '굴절1', unitType: 'ladder' };
const woman30 = { id: 'v1', kind: 'person', gender: '여', age: 34, zoneKey: '2F-center', originZoneKey: '2F-center' };

describe('부르는 이름 · 조각', () => {
  it('활동대는 「대」를 붙이고 차량은 이름 그대로', () => {
    assert.equal(lp.unitCallName('진압1', 'suppression'), '진압1대');
    assert.equal(lp.unitCallName('구조1', 'rescue'), '구조1대');
    assert.equal(lp.unitCallName('구급1', 'ems'), '구급1대');
    assert.equal(lp.unitCallName('진압1대', 'suppression'), '진압1대', '이미 붙어 있으면 또 붙이지 않는다');
    assert.equal(lp.unitCallName('펌프1', 'pump'), '펌프1');
  });

  it('note 는 조각을 이은 문자열이다', () => {
    const parts = lp.moveParts(s1, 'standby-standby1', 'standby-imminent');
    assert.equal(lp.partsText(parts), '진압1대 대기1단계 → 직전대기 이동');
    assert.deepEqual(parts[0], { kind: 'unit', text: '진압1대', tokenId: 's1', color: 'red' }, '출동대는 칩 조각이다');
  });
});

describe('이동의 성격 — classifyMove', () => {
  const cases = [
    [null, 'standby-standby1', 'arrive'],
    ['pool', 'standby-resource', 'arrive'],
    ['unit-add', 'standby-standby1', 'arrive'],
    ['pool', 'face-A', 'arrive'],                  // 대기1단계 미운영 — 면으로 곧장 나간다
    ['2F-center', 'standby-standby1', 'return'],
    ['standby-standby1', 'standby-resource', 'move'],
    ['standby-standby1', 'face-A', 'move'],
    ['2F-center', 'standby-rit', 'mission'],
    ['standby-standby1', 'pool', 'withdraw'],
    ['2F-center', 'unit-add', 'withdraw'],
    ['2F-center', '3F-center', 'move'],
  ];
  for (const [from, to, kind] of cases) {
    it(`${from} → ${to} = ${kind}`, () => assert.equal(lp.classifyMove(from, to), kind));
  }
});

describe('도착 · 이동 · 임무 · 거점', () => {
  it('동시 도착은 한 줄 — 활동대가 차량보다 먼저 불린다', () => {
    const units = [{ ...p1, fromZoneKey: 'pool' }, { ...s1, fromZoneKey: 'pool' }, { ...e1, fromZoneKey: 'pool' }];
    assert.equal(t(lp.arrivalParts('arrive', 'standby-standby1', units)), '대기1단계 도착: [진압1대], [구급1대], [펌프1]');
  });

  it('현장에서 돌아오면 복귀', () => {
    assert.equal(t(lp.arrivalParts('return', 'standby-resource', [{ ...s1, fromZoneKey: '2F-center' }])), '자원대기소 복귀: [진압1대]');
  });

  it('임시의료소를 떠날 때 — 받침에 맞춰 로/으로', () => {
    assert.equal(t(lp.moveParts(s1, 'medical-post', 'standby-imminent')), '[진압1대] 임시의료소에서 직전대기로 이동');
    assert.equal(t(lp.moveParts(s1, 'medical-post', 'face-A')), '[진압1대] 임시의료소에서 A면으로 이동');
    assert.equal(t(lp.moveParts(s1, 'medical-post', '3F-stair')), '[진압1대] 임시의료소에서 3층 계단실로 이동', 'ㄹ 받침은 「로」');
    assert.equal(t(lp.moveParts(s1, 'medical-post', '3F-center')), '[진압1대] 임시의료소에서 3층 내부로 이동');
  });

  it('RIT 는 임무지정', () => {
    assert.equal(t(lp.missionParts(s1, 'RIT')), '[진압1대] RIT 임무지정');
  });

  it('거점 설치 · 지정은 소장과 한 줄', () => {
    assert.equal(t(lp.postOpenParts('resource', '지휘운전')), '자원대기소 지정, 소장: 지휘운전');
    assert.equal(t(lp.postOpenParts('medical', s1)), '임시의료소 설치, 소장: [진압1대]');
  });
});

describe('구조대상자 이름', () => {
  it('성별/연령대 — 나이만 있으면 연령대를 낸다', () => {
    assert.equal(lp.victimDesc(woman30), '여/30대');
    assert.equal(lp.victimDesc({ id: 'k', kind: 'person', gender: '남', age: 7, zoneKey: null }), '남/소아');
    assert.equal(lp.victimDesc({ id: 'r', kind: 'person', gender: '남', ageGroup: '60대', age: 63, zoneKey: null }), '남/60대', '연령대가 있으면 그것을 쓴다');
    assert.equal(lp.victimDesc({ id: 'g', kind: 'group', groupCount: 3, zoneKey: null }), '3명');
    assert.equal(lp.victimDesc({ id: 'c', kind: 'custom', customLabel: '할머니', zoneKey: null }), '할머니');
  });

  it('처음 놓였던 자리로 부른다 — 옮겨도 이름이 같다', () => {
    assert.equal(lp.victimRefText(woman30), '2층 구조대상자(여/30대)');
    assert.equal(lp.victimRefText({ ...woman30, zoneKey: '5F-stair' }), '2층 구조대상자(여/30대)');
    assert.equal(lp.victimRefText({ ...woman30, zoneKey: 'face-A', fellToFace: 'A' }), '2층/A면추락 구조대상자(여/30대)');
    assert.equal(lp.victimRefText({ id: 'x', kind: 'person', zoneKey: 'medical-post' }), '구조대상자', '자리도 성별도 모르면 이름만');
  });

  it('여러 명은 같은 자리끼리 괄호를 합친다', () => {
    const man50 = { ...woman30, id: 'v2', gender: '남', age: 52 };
    const faceB = { id: 'v3', kind: 'person', gender: '남', ageGroup: '60대', zoneKey: 'face-B', originZoneKey: 'face-B' };
    assert.equal(lp.victimsRefText([woman30, man50, faceB]), '2층 구조대상자(여/30대, 남/50대), B면 구조대상자(남/60대)');
    assert.equal(lp.victimsRefText([]), '구조대상자');
  });
});

describe('구조대상자 이동 · 추락', () => {
  it('층 → 층', () => {
    assert.equal(t(lp.victimMoveParts(woman30, '1F-center', '2F-center')), '2층 구조대상자(여/30대) 1층에서 2층으로 이동');
  });

  it('같은 층 안이면 내부 · 계단실까지', () => {
    assert.equal(t(lp.victimMoveParts(woman30, '2F-center', '2F-stair')), '2층 구조대상자(여/30대) 2층 내부에서 2층 계단실로 이동');
  });

  it('층 → 방면은 추락', () => {
    assert.equal(lp.victimFallFace('2F-center', 'face-A'), 'A');
    assert.equal(lp.victimFallFace('RF-center', 'face-C'), 'C');
    assert.equal(lp.victimFallFace('face-A', 'face-B'), null, '방면 → 방면은 추락이 아니다');
    assert.equal(lp.victimFallFace('2F-center', '3F-center'), null);
    assert.equal(t(lp.victimMoveParts(woman30, '2F-center', 'face-A')), '2층 구조대상자(여/30대) A면 지상으로 추락');
  });

  it('처음 놓일 때는 배치', () => {
    assert.equal(t(lp.victimMoveParts({ id: 'c', kind: 'custom', customLabel: '할머니', zoneKey: null }, null, 'face-B')), '구조대상자(할머니) B면 배치');
  });

  it('구조대상자 줄에는 칩이 없다 — 칩은 출동대만', () => {
    const parts = lp.victimMoveParts(woman30, '2F-center', 'face-A');
    assert.ok(parts.every(p => p.kind === 'text'));
  });
});

describe('구조 시작 · 구조완료', () => {
  it('구조 시작 — 출동대 칩 + 구조대상자 이름', () => {
    assert.equal(t(lp.rescueStartParts(s1, '2층 구조대상자(여/30대)')), '[진압1대] 2층 구조대상자(여/30대) → 구조, 임시의료소로 이동');
  });

  it('구조완료 — 층·인원을 센다. 묶음은 인원만큼', () => {
    const trip = lp.rescueTripOf([woman30, { id: 'g', kind: 'group', groupCount: 3, zoneKey: '2F-center', originZoneKey: '2F-center' }]);
    assert.deepEqual(trip, { victimIds: ['v1', 'g'], floorLabels: ['2층'], count: 4 });
    assert.equal(t(lp.rescueDoneParts(s1, trip)), '[진압1대] 2층 구조대상자 4명 구조완료');
  });

  it('추락한 사람의 구조완료도 같은 이름', () => {
    const fallen = { ...woman30, zoneKey: 'face-A', fellToFace: 'A' };
    assert.equal(t(lp.rescueDoneParts(s1, lp.rescueTripOf([fallen]))), '[진압1대] 2층/A면추락 구조대상자 1명 구조완료');
  });

  it('이송 내용이 없으면 층·인원을 뺀다', () => {
    assert.equal(t(lp.rescueDoneParts(s1)), '[진압1대] 구조대상자 구조완료');
  });

  it('카운트다운 중에 또 데려오면 같은 이송에 더한다', () => {
    const a = lp.rescueTripOf([woman30]);
    const b = lp.rescueTripOf([{ id: 'v9', kind: 'person', zoneKey: '3F-center', originZoneKey: '3F-center' }]);
    assert.deepEqual(lp.mergeRescueTrips(a, b), { victimIds: ['v1', 'v9'], floorLabels: ['2층', '3층'], count: 2 });
  });
});

describe('고가 · 굴절차 구조', () => {
  const roof = lp.rescueTripOf([{ id: 'v', zoneKey: 'face-A', originZoneKey: 'RF-center' }]);

  it('탄 대원이 없으면 차가 주어', () => {
    assert.equal(t(lp.aerialRescueParts(a1, roof)), '[고가1] 옥상 구조대상자 1명 구조완료');
  });

  it('바스켓에 탄 활동대가 있으면 대원이 주어, 차는 수단', () => {
    assert.equal(t(lp.aerialRescueParts(a1, roof, s1)), '[진압1대] 옥상 구조대상자 1명 고가차 이용 구조완료');
    assert.equal(t(lp.aerialRescueParts(l1, roof, r1)), '[구조1대] 옥상 구조대상자 1명 굴절차 이용 구조완료');
  });

  it('바스켓에서 넘겨받은 구조대상자는 다시 세지 않는다', () => {
    const logs = [
      { payload: { kind: 'aerial-rescue', riderTokenId: 's1', victimIds: ['v1', 'v2'] } },
      { payload: { kind: 'aerial-rescue', riderTokenId: 'r1', victimIds: ['v9'] } },
      { payload: { kind: 'move' } },
      {},
    ];
    assert.deepEqual([...lp.aerialCreditedVictimIds(logs, 's1')], ['v1', 'v2']);
  });
});

describe('송수', () => {
  const W = (connected, fromType, toType, fromName, toName, extra = {}) => ({ connected, fromType, toType, fromName, toName, ...extra });

  it('소화전 점령 — 받는 쪽이 주어, 임무는 같은 줄 뒤에', () => {
    assert.equal(t(lp.waterRelayParts(W(true, 'hydrant', 'water_tank', '44호 소화전', '물탱크1', { toUnit: w1 }), [{ missionLabel: '중요', assigned: true }])),
      '[물탱크1] 44호 소화전 점령 / 중요물탱크 지정');
    assert.equal(t(lp.waterRelayParts(W(false, 'hydrant', 'water_tank', '44호 소화전', '물탱크1', { toUnit: w1 }), [])), '[물탱크1] 44호 소화전 점령 해제');
  });

  it('순환보수', () => {
    assert.equal(t(lp.waterRelayParts(W(true, 'circulation', 'pump', '순환', '펌프1', { toUnit: p1 }), [])), '[펌프1]에 순환보수 실시');
    assert.equal(t(lp.waterRelayParts(W(false, 'circulation', 'pump', '순환', '펌프1', { toUnit: p1 }), [])), '[펌프1] 순환보수 중단');
  });

  it('연결송수구 점령 · 고가 급수 펌프 지정', () => {
    assert.equal(t(lp.waterRelayParts(W(true, 'pump', 'siamese_pipe', '펌프1', '연결송수구', { fromUnit: p1 }), [])), '[펌프1] 연결송수구 점령');
    assert.equal(t(lp.waterRelayParts(W(true, 'pump', 'aerial', '펌프1', '고가1', { fromUnit: p1, toUnit: a1 }), [])), '[펌프1] [고가1] 급수 펌프 지정');
  });

  it('차량 간 급수 — 주는 쪽이 주어. 1선펌프는 같은 줄 뒤에', () => {
    assert.equal(t(lp.waterRelayParts(W(true, 'water_tank', 'pump', '물탱크1', '펌프1', { fromUnit: w1, toUnit: p1 }), [{ missionLabel: '1선', assigned: true }])),
      '[물탱크1] [펌프1]에 급수 지원 / 1선펌프 지정');
    assert.equal(t(lp.waterRelayParts(W(false, 'water_tank', 'pump', '물탱크1', '펌프1', { fromUnit: w1, toUnit: p1 }), [])), '[물탱크1] [펌프1] 급수 중단');
  });

  it('수관전개는 남기고 수관철수는 기록하지 않는다', () => {
    assert.equal(t(lp.waterRelayParts(W(true, 'pump', 'suppression', '펌프1', '진압1', { fromUnit: p1, toUnit: s1 }), [])), '[진압1대] [펌프1]에서 수관전개');
    assert.equal(lp.waterRelayParts(W(false, 'pump', 'suppression', '펌프1', '진압1', { fromUnit: p1, toUnit: s1 }), []), null);
  });
});

describe('도착 철회 판정 — mentionsToken', () => {
  it('그 대의 줄이거나 payload 에 id 가 있으면 흔적이다', () => {
    assert.equal(lp.mentionsToken({ tokenId: 's1' }, 's1'), true);
    assert.equal(lp.mentionsToken({ tokenId: 'x', payload: { kind: 'water-relay', fromId: 's1' } }, 's1'), true);
  });

  it('편성 기록은 흔적이 아니고, 비슷한 id 에 걸리지 않는다', () => {
    assert.equal(lp.mentionsToken({ tokenId: '', payload: { kind: 'dispatch-initial', units: [{ tokenId: 's1' }] } }, 's1'), false);
    assert.equal(lp.mentionsToken({ tokenId: 'x', payload: { kind: 'move', tokenId: 'roster-12' } }, 'roster-1'), false);
  });
});
