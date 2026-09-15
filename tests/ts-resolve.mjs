// ─────────────────────────────────────────────
// 시험용 resolve 훅 — 확장자 없는 상대 import('./logLabels')를 .ts 로 풀어 준다
//
// Node 24 는 .ts 의 타입을 지우고 바로 돌리지만(type stripping), ESM 은 확장자를 요구한다.
// 앱 코드는 Vite 방식으로 확장자를 생략해 쓰므로 여기서 한 번 채워 준다.
// tsconfig 의 verbatimModuleSyntax · erasableSyntaxOnly 가 「타입만 지우면 돌아가는 코드」를
// 보장하므로 추가 도구(vitest · tsx)가 필요 없다.
//
// 쓰는 법: npm test  (package.json — node --import ./tests/ts-resolve.mjs --test ...)
// ─────────────────────────────────────────────
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    try {
      return await next(spec, ctx);
    } catch (e) {
      const relative = spec.startsWith('.') || spec.startsWith('/');
      if (relative && !/\\.[cm]?[jt]sx?$/.test(spec)) {
        for (const ext of ['.ts', '.tsx', '/index.ts']) {
          try { return await next(spec + ext, ctx); } catch { /* 다음 확장자 */ }
        }
      }
      throw e;
    }
  }
`));
