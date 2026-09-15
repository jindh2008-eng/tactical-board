// ─────────────────────────────────────────────
// 작업 모드 배너 문구 — src/utils/actionModeLabel.ts
//
// 작업 모드가 켜져 있으면 모든 출동대 끌기가 꺼진다. 배너는 무슨 모드인지와 이동이
// 잠겼다는 것을 말해야 한다(2026-09-15). 모드가 늘었는데 이름·안내를 빠뜨리면 배너가
// 빈칸으로 뜬다 — 두 표가 같은 모드를 다 갖는지 여기서 본다.
// ─────────────────────────────────────────────
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_MODE_NAMES, ACTION_MODE_HINTS, blockedDragNotice } from '../src/utils/actionModeLabel.ts';

const MODES = [
  'rescue', 'select-floor', 'select-pump', 'water-connect', 'aerial-floor-select',
  'aerial-spray-target', 'spray-target', 'drawing', 'drawing-erase',
];

describe('작업 모드 이름 · 안내', () => {
  it('모든 모드에 이름과 안내가 있다', () => {
    assert.deepEqual(Object.keys(ACTION_MODE_NAMES).sort(), [...MODES].sort());
    assert.deepEqual(Object.keys(ACTION_MODE_HINTS).sort(), [...MODES].sort());
    for (const m of MODES) {
      assert.ok(ACTION_MODE_NAMES[m].trim(), `${m} 이름이 비었다`);
      assert.ok(ACTION_MODE_HINTS[m].trim(), `${m} 안내가 비었다`);
    }
  });

  it('막힌 끌기 안내 — 모드 이름 · 이유 · 푸는 법', () => {
    assert.equal(blockedDragNotice('rescue'), '구조 모드 중에는 출동대를 옮길 수 없습니다 — Esc 또는 [해제]');
    assert.equal(blockedDragNotice('water-connect'), '송수 연결 모드 중에는 출동대를 옮길 수 없습니다 — Esc 또는 [해제]');
  });
});
