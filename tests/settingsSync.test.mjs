// ─────────────────────────────────────────────
// 설정 파일 저장 — 동기화 판단(src/utils/settingsSyncPlan.ts) · 서버 저장소(scripts/settings-store.mjs)
//
// 설정의 본거지는 PC 의 파일이고 브라우저는 사본이다(2026-09-16 사용자 결정).
// 가장 나쁜 실패는 **브라우저에만 있던 시나리오가 서버 것에 조용히 덮여 사라지는 것** —
// 그래서 「덮기 전에 백업」을 여기서 못 박는다.
// ─────────────────────────────────────────────
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planSettingsSync, settingsBundleContent } from '../src/utils/settingsSyncPlan.ts';
import { createSettingsStore, isSettingsBundle } from '../scripts/settings-store.mjs';

const A = settingsBundleContent({ settingsList: [{ id: 'a' }], workingPresets: {} });
const B = settingsBundleContent({ settingsList: [{ id: 'b' }], workingPresets: {} });

describe('동기화 판단 — planSettingsSync', () => {
  it('PC 파일이 없으면 브라우저 설정을 올린다(처음 쓰는 PC)', () => {
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 0, hasData: true }, null), { action: 'push' });
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 0, hasData: false }, null), { action: 'none' });
  });

  it('두 시각이 같으면 그대로', () => {
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 100, hasData: true }, { content: B, updatedAt: 100 }), { action: 'none' });
  });

  it('브라우저가 더 새것이면 올린다 — 서버가 없던 사이 고친 것', () => {
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 200, hasData: true }, { content: B, updatedAt: 100 }), { action: 'push' });
  });

  it('PC 파일이 더 새것이면 받는다 — 내용이 다르면 브라우저 것을 먼저 백업', () => {
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 100, hasData: true }, { content: B, updatedAt: 200 }), { action: 'pull', backupLocal: true });
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 100, hasData: true }, { content: A, updatedAt: 200 }), { action: 'pull', backupLocal: false });
  });

  it('도입 전부터 쓰던 브라우저(시각 없음)는 받되, 다르면 백업이 먼저다', () => {
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 0, hasData: true }, { content: B, updatedAt: 50 }), { action: 'pull', backupLocal: true });
    assert.deepEqual(planSettingsSync({ content: A, updatedAt: 0, hasData: false }, { content: B, updatedAt: 50 }), { action: 'pull', backupLocal: false });
  });

  it('비교 내용은 내보낸 시각 · 수정 시각을 보지 않는다', () => {
    const base = { version: 1, settingsList: [{ id: 'a' }], workingPresets: { x: 1 } };
    assert.equal(
      settingsBundleContent({ ...base, exportedAt: '2026-01-01', updatedAt: 1 }),
      settingsBundleContent({ ...base, exportedAt: '2026-09-16', updatedAt: 999 }),
    );
  });
});

describe('서버 저장소 — scripts/settings-store.mjs', () => {
  let dir;
  const bundle = (id, updatedAt) => ({ version: 1, exportedAt: 'x', updatedAt, settingsList: [{ id }], workingPresets: {} });
  before(async () => { dir = await mkdtemp(path.join(tmpdir(), 'tb-settings-')); });
  after(async () => { await rm(dir, { recursive: true, force: true }); });

  it('설정 묶음 모양을 가린다', () => {
    assert.equal(isSettingsBundle(bundle('a', 1)), true);
    assert.equal(isSettingsBundle({ version: 1, settingsList: [] }), false, 'workingPresets 없음');
    assert.equal(isSettingsBundle({ version: 2, settingsList: [], workingPresets: {} }), false);
    assert.equal(isSettingsBundle(null), false);
  });

  it('처음엔 없고, 쓰면 읽힌다', async () => {
    const store = createSettingsStore({ dataDir: dir });
    assert.equal(await store.read(), null);
    await store.write(bundle('a', 1));
    assert.deepEqual((await store.read()).settingsList, [{ id: 'a' }]);
  });

  it('덮어쓰기 직전 판을 백업으로 떠 둔다 — 간격 안에서는 한 번만', async () => {
    const store = createSettingsStore({ dataDir: dir, backupIntervalMs: 60_000 });
    await store.write(bundle('b', 2));      // 직전 판(a)을 뜬다
    await store.write(bundle('c', 3));      // 간격 안 — 또 뜨지 않는다
    const backups = (await readdir(store.backupDir)).filter(n => n.startsWith('settings-'));
    assert.equal(backups.length, 1);
    const saved = JSON.parse(await readFile(path.join(store.backupDir, backups[0]), 'utf8'));
    assert.deepEqual(saved.settingsList, [{ id: 'a' }]);
    assert.deepEqual((await store.read()).settingsList, [{ id: 'c' }]);
  });

  it('백업은 정한 수만 남긴다', async () => {
    const store = createSettingsStore({ dataDir: path.join(dir, 'prune'), keepBackups: 2, backupIntervalMs: 0 });
    for (let i = 0; i < 5; i += 1) await store.write(bundle(`p${i}`, i));
    const backups = (await readdir(store.backupDir)).filter(n => n.startsWith('settings-'));
    assert.equal(backups.length, 2);
  });

  it('브라우저 사본은 따로 남기고 지우지 않는다', async () => {
    const store = createSettingsStore({ dataDir: dir });
    const name = await store.saveCopy(bundle('local', 0), 'browser');
    assert.match(name, /^browser-\d{8}-\d{6}-[a-z0-9]+\.json$/);
    assert.ok((await readdir(store.backupDir)).includes(name));
  });

  it('설정 묶음이 아니면 쓰지 않는다', async () => {
    const store = createSettingsStore({ dataDir: dir });
    await assert.rejects(store.write({ hello: 1 }));
    assert.deepEqual((await store.read()).settingsList, [{ id: 'c' }], '기존 파일은 그대로');
  });
});
