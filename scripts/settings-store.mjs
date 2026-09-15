// ─────────────────────────────────────────────
// 설정(시나리오) 파일 저장소 — PC 의 파일에 설정 전체를 둔다
//
// 설정모드의 시나리오는 원래 브라우저(localStorage)에만 있었다. 브라우저 저장은 **주소
// (포트 · IP)마다 따로**라서 태블릿이나 다른 포트로 들어오면 목록이 비어 보이고, 사이트
// 데이터를 지우면 영구히 사라진다(2026-09-16 사용자 결정으로 파일 저장 도입).
//
// 이 모듈이 `/api/settings` 를 처리한다. 두 곳이 같은 것을 쓴다.
//   scripts/serve-dist.mjs   훈련장 PC 배포 서버
//   vite.config.ts           개발 서버(npm run dev · preview)
//
//   GET  /api/settings          저장된 설정 묶음(SettingsExport). 없으면 404
//   PUT  /api/settings          설정 묶음 전체를 덮어쓴다(원자적 교체)
//   POST /api/settings/backup   받은 묶음을 backups/ 에 따로 남긴다 — 브라우저 쪽 설정을
//                               서버 것으로 덮기 전에 앱이 먼저 부른다(아무것도 잃지 않게)
//
// 파일 배치 — <dataDir>/settings.json, <dataDir>/backups/settings-YYYYMMDD-HHMMSS-xxxx.json
// 백업은 덮어쓰기 직전의 settings.json 을 **10분에 한 번** 떠 두고 30개까지 남긴다.
// 편집할 때마다 저장되므로 매번 뜨면 몇 분 만에 쓸 만한 옛 판이 밀려난다.
//
// **의존성이 없다** — Node 표준 모듈만 쓴다(serve-dist.mjs 와 같은 원칙).
// ─────────────────────────────────────────────

import { mkdir, readFile, writeFile, rename, readdir, unlink, copyFile } from 'node:fs/promises';
import path from 'node:path';

export const SETTINGS_API = '/api/settings';

/** 받는 몸체 한도 — 시나리오 수십 개도 수 MB 안이다 */
const MAX_BODY_BYTES = 20 * 1024 * 1024;

/** 20260916-101530 */
function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

/** 앱의 SettingsExport 모양인가 — 최소한 이것이 있어야 설정 묶음이다 */
export function isSettingsBundle(v) {
  return !!v && typeof v === 'object' && v.version === 1 &&
    Array.isArray(v.settingsList) && !!v.workingPresets && typeof v.workingPresets === 'object';
}

export function createSettingsStore({ dataDir, keepBackups = 30, backupIntervalMs = 10 * 60 * 1000 } = {}) {
  if (!dataDir) throw new Error('dataDir 가 필요하다');
  const file      = path.join(dataDir, 'settings.json');
  const backupDir = path.join(dataDir, 'backups');
  let lastBackupAt = 0;

  async function read() {
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async function prune() {
    const names = (await readdir(backupDir))
      .filter(n => n.startsWith('settings-') && n.endsWith('.json'))
      .sort();
    for (const n of names.slice(0, Math.max(0, names.length - keepBackups))) {
      await unlink(path.join(backupDir, n));
    }
  }

  /** 덮어쓰기 — 직전 판을 (10분에 한 번) 백업으로 떠 두고, 임시 파일에 쓴 뒤 이름을 바꾼다 */
  async function write(bundle) {
    if (!isSettingsBundle(bundle)) throw new Error('설정 묶음이 아니다');
    await mkdir(backupDir, { recursive: true });
    const now = Date.now();
    if (now - lastBackupAt >= backupIntervalMs) {
      try {
        const suffix = Math.random().toString(36).slice(2, 6);
        await copyFile(file, path.join(backupDir, `settings-${stamp()}-${suffix}.json`));
        lastBackupAt = now;
        await prune();
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;   // 처음 저장이면 떠 둘 것이 없다
      }
    }
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(bundle, null, 2), 'utf8');
    await rename(tmp, file);
  }

  /** 따로 남기기 — 「browser-20260916-101530.json」. 돌려 쓰지 않는다(지우지 않는다) */
  async function saveCopy(bundle, tag = 'copy') {
    if (!isSettingsBundle(bundle)) throw new Error('설정 묶음이 아니다');
    await mkdir(backupDir, { recursive: true });
    const safe = String(tag).replace(/[^a-z0-9-]/gi, '') || 'copy';
    const name = `${safe}-${stamp()}-${Math.random().toString(36).slice(2, 6)}.json`;
    await writeFile(path.join(backupDir, name), JSON.stringify(bundle, null, 2), 'utf8');
    return name;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', c => {
        size += c.length;
        if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('너무 크다'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function json(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type':   'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control':  'no-store',
    });
    res.end(text);
  }

  /** `/api/settings` 요청이면 처리하고 true, 아니면 false(다음 처리기로 넘긴다) */
  async function handle(req, res) {
    const p = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (p !== SETTINGS_API && p !== `${SETTINGS_API}/backup`) return false;
    try {
      if (p === SETTINGS_API && req.method === 'GET') {
        const b = await read();
        if (b) json(res, 200, b); else json(res, 404, { error: 'none' });
        return true;
      }
      if (p === SETTINGS_API && req.method === 'PUT') {
        const b = JSON.parse(await readBody(req));
        if (!isSettingsBundle(b)) { json(res, 400, { error: 'invalid' }); return true; }
        await write(b);
        json(res, 200, { ok: true, updatedAt: b.updatedAt ?? null });
        return true;
      }
      if (p === `${SETTINGS_API}/backup` && req.method === 'POST') {
        const b = JSON.parse(await readBody(req));
        if (!isSettingsBundle(b)) { json(res, 400, { error: 'invalid' }); return true; }
        json(res, 200, { ok: true, name: await saveCopy(b, 'browser') });
        return true;
      }
      json(res, 405, { error: 'method' });
      return true;
    } catch (e) {
      json(res, e.status ?? (e instanceof SyntaxError ? 400 : 500), { error: String(e?.message ?? e) });
      return true;
    }
  }

  return { file, backupDir, read, write, saveCopy, handle };
}
