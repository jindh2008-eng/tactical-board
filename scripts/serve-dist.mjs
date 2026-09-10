#!/usr/bin/env node

// ─────────────────────────────────────────────
// dist 정적 서버 — 훈련장 PC 배포용
//
// **의존성이 없다.** Node 표준 모듈만 쓰므로 훈련장에서는 `npm install` 이 필요 없고
// Node.js 설치와 `dist/` 폴더만 있으면 된다. 옮길 것은 두 가지다.
//
//   dist/                    (npm run build 결과)
//   scripts/serve-dist.mjs   (이 파일)
//
// 왜 `file://` 더블클릭이 아니라 서버인가
//  - 번들이 `type="module"` 이라 `file://` 에서는 CORS(origin null)로 차단된다.
//  - public 이미지가 하드코딩된 절대경로다(`/event-icon/…` · `/소화전.png`).
//    서버로 띄우면 이 경로가 그대로 맞아떨어져 **코드를 한 줄도 안 고쳐도 된다.**
//  - `BrowserRouter` 라 `/play` 직접 접근·새로고침에 SPA 폴백이 필요하다(아래 §폴백).
//
// 사용법
//   node scripts/serve-dist.mjs                 → http://localhost:4173
//   node scripts/serve-dist.mjs --port 8080
//   node scripts/serve-dist.mjs --host 127.0.0.1  (같은 PC에서만)
//   node scripts/serve-dist.mjs --root ../dist
// ─────────────────────────────────────────────

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── 인자 ─────────────────────────────────────
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.PORT ?? 4173));
/*
 * 기본 바인딩이 0.0.0.0 인 이유 — 같은 와이파이의 태블릿·실기기에서 접속해야 한다
 * (vite.config.ts 의 `server.host: true` 와 같은 사정). 훈련장 밖에 노출될 자리가
 * 아니면 `--host 127.0.0.1` 로 좁힌다.
 */
const HOST = arg('host', '0.0.0.0');
const ROOT = path.resolve(HERE, arg('root', '../dist'));

// ── MIME ─────────────────────────────────────
// dist 에 실제로 들어가는 확장자만 적는다. 모르는 것은 다운로드로 떨어뜨린다.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.txt':  'text/plain; charset=utf-8',
};

function mimeOf(file) {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * URL 경로 → 실제 파일 경로.
 *
 * `decodeURIComponent` 를 반드시 거쳐야 한다 — `/소화전.png` 가 퍼센트 인코딩되어
 * 들어오므로 그대로 붙이면 파일을 못 찾는다.
 * 그리고 **ROOT 밖으로 나가는 경로는 거부한다**(`../` 로 상위 폴더를 읽는 것 차단).
 */
function resolveInRoot(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;                                  // 잘못된 인코딩
  }
  const full = path.resolve(ROOT, '.' + path.posix.normalize(decoded));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

async function fileOrNull(fullPath) {
  if (!fullPath) return null;
  try {
    const s = await stat(fullPath);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

function send(res, status, headers, stream) {
  res.writeHead(status, headers);
  if (stream) stream.pipe(res);
  else res.end();
}

// ── 요청 처리 ────────────────────────────────
const server = createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  const isHead  = req.method === 'HEAD';

  if (req.method !== 'GET' && !isHead) {
    return send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8', 'Allow': 'GET, HEAD' });
  }

  let target = resolveInRoot(urlPath === '/' ? '/index.html' : urlPath);
  let info   = await fileOrNull(target);

  /*
   * SPA 폴백 — 파일이 없으면 index.html 을 준다.
   * `BrowserRouter` 라 `/play` · `/settings` 는 디스크에 없는 경로다. 다만
   * **확장자가 있는 요청은 폴백하지 않는다** — 없는 이미지에 HTML 을 돌려주면
   * 404 대신 파싱 오류가 나서 원인을 찾기 어려워진다.
   */
  if (!info && path.extname(urlPath) === '') {
    target = path.join(ROOT, 'index.html');
    info   = await fileOrNull(target);
  }

  if (!info) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(isHead ? undefined : '404 Not Found');
    return;
  }

  /*
   * 캐시 — `assets/` 는 파일명에 해시가 박혀 있어 영구 캐시해도 안전하다.
   * 나머지(index.html · public 이미지)는 이름이 그대로라 매번 확인하게 둔다.
   * 새 빌드를 덮어썼는데 옛 화면이 뜨는 사고를 막는다.
   */
  const cache = urlPath.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

  const headers = {
    'Content-Type':   mimeOf(target),
    'Content-Length': info.size,
    'Cache-Control':  cache,
  };

  if (isHead) return send(res, 200, headers);
  send(res, 200, headers, createReadStream(target));
});

// ── 시작 ─────────────────────────────────────
const rootInfo = await stat(ROOT).catch(() => null);
if (!rootInfo?.isDirectory()) {
  console.error(`dist 폴더가 없습니다: ${ROOT}`);
  console.error('먼저 `npm run build` 를 하거나 `--root <경로>` 로 위치를 알려주세요.');
  process.exit(1);
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`포트 ${PORT} 가 이미 사용 중입니다. --port 로 다른 값을 주세요.`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`전술상황판  ${ROOT}`);
  console.log(`  로컬    http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    for (const list of Object.values(networkInterfaces())) {
      for (const ni of list ?? []) {
        if (ni.family === 'IPv4' && !ni.internal) {
          console.log(`  네트워크 http://${ni.address}:${PORT}   (같은 와이파이의 태블릿용)`);
        }
      }
    }
  }
  console.log('\n종료: Ctrl+C');
});
