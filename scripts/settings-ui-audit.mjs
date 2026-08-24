/**
 * 설정모드 UI 감사 — 기준선 기록과 사후 검증에 같은 자를 쓴다.
 *
 * docs/SETTINGS_MODE_UI_PLAN.md §9 의 검증 기준을 브라우저에서 실측한다.
 * 앱에는 테스트가 없으므로(CLAUDE.md) 이 스크립트가 유일한 자동 측정 수단이다.
 *
 * 사용법
 *   1) preview 도구로 tactical-board-dev 를 띄운다 (Bash 로 npm run dev 를 돌리지 않는다)
 *   2) node scripts/settings-ui-audit.mjs --url http://localhost:5174 --out docs/baseline/before
 *
 * 산출물
 *   <out>/audit.json              측정값 전체
 *   <out>/audit.md                사람이 읽는 요약
 *   <out>/shot-<섹션>-<폭>.png    화면 캡처
 *
 * 주의: 스크린샷은 커밋하지 않는다(.gitignore). 기준선은 커밋된 이 스크립트와
 * audit.json 이며, 이미지는 언제든 해당 커밋을 체크아웃해 다시 만들 수 있다.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const URL_BASE = args.url ?? 'http://localhost:5173';
const OUT      = args.out ?? 'docs/baseline/before';

/** 사이드바 항목 순서와 같다 — SettingsPage.tsx 의 NAV_GROUPS */
const SECTIONS = [
  '건물 · 소방시설', '현장요소', '구조대상자',
  '출동대', '임무 · 상태 프리셋', '상태 메시지',
  '체크리스트', '지휘절차', '시나리오 예측',
];

/** §9 검증 폭. 1280 은 하한, 2560 은 훈련장 PC */
const WIDTHS = [1280, 1800, 2560];

/** 파일명에 쓸 수 있게 공백·가운뎃점을 없앤다 */
const slug = s => s.replace(/[·\s]+/g, '-');

/**
 * 한 화면에서 측정한다. 브라우저 안에서 도는 함수라 바깥 스코프를 못 쓴다.
 */
function measure() {
  const page = document.querySelector('.settings-page');
  if (!page) return { error: '.settings-page 없음' };

  // ── 색 유틸 (WCAG 상대휘도) ──
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const parse = s => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    const hi = Math.max(x, y), lo = Math.min(x, y);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** 반투명 색을 배경 위에 합성한다 — 알파를 무시하면 대비가 과대평가된다 */
  const flatten = (fg, bg) => fg.a >= 1 ? fg : {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
  /** 조상을 거슬러 올라가 실제로 칠해진 배경을 찾는다 */
  const bgOf = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) return c;
      n = n.parentElement;
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  };

  const all = [...page.querySelectorAll('*')];
  const vis = all.filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });

  // ── 글자 크기 : 실제로 글자를 가진 요소만 ──
  const fontSizes = {};
  for (const el of vis) {
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize).toFixed(2);
    fontSizes[fs] = (fontSizes[fs] ?? 0) + 1;
  }

  // ── 클릭 타깃 ──
  const SEL = 'button, [role="button"], a, input, select, textarea, summary';
  const controls = vis.filter(el => el.matches(SEL));
  const smallTargets = controls
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(x => x.r.height < 24 || x.r.width < 24)
    .map(x => ({
      tag: x.el.tagName.toLowerCase(),
      cls: (typeof x.el.className === 'string' ? x.el.className : '').slice(0, 60),
      text: (x.el.textContent ?? '').trim().slice(0, 16),
      w: +x.r.width.toFixed(1), h: +x.r.height.toFixed(1),
    }));

  // ── 이름 없는 아이콘 전용 버튼 ──
  //
  // 판정 기준은 **글자 수가 아니라 글자 종류**다. 한글은 두 글자짜리 정상 라벨이
  // 흔해서(저장·추가·경찰) 길이로 자르면 전부 오탐이 된다. 실제 문제는 화면에
  // 기호 글리프만 있는 버튼(×, +, ▲, ✓, ⋯)이다.
  const GLYPH_ONLY = /^[\s\u00d7\u002b\u2212\u2013\u2014\u25b2\u25bc\u25c0\u25b6\u2713\u2714\u2717\u22ef\u2026<>^v|/\\*-]*$/u;
  const unnamed = controls.filter(el => {
    if (el.matches('input, select, textarea')) return false;
    const t = (el.textContent ?? '').trim();
    const named = el.getAttribute('aria-label') || el.getAttribute('title')
      || el.getAttribute('aria-labelledby');
    return !named && GLYPH_ONLY.test(t);
  }).map(el => ({
    tag: el.tagName.toLowerCase(),
    cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
    text: (el.textContent ?? '').trim(),
  }));

  // ── 경계 대비 : 실제로 그려진 테두리를 전부 잰다 ──
  const borderStats = {};
  for (const el of vis) {
    const cs = getComputedStyle(el);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (!w || cs[`border${side}Style`] === 'none') continue;
      const c = parse(cs[`border${side}Color`]);
      if (!c || c.a === 0) continue;
      const bg = bgOf(el.parentElement ?? el);
      const r = ratio(flatten(c, bg), bg);
      const key = cs[`border${side}Color`];
      const s = borderStats[key] ?? (borderStats[key] = { count: 0, ratio: +r.toFixed(2) });
      s.count += 1;
    }
  }

  // ── 레이아웃 ──
  const sidebar = page.querySelector('.settings-page__sidebar');
  const main    = page.querySelector('.settings-page__main');
  const section = page.querySelector('.settings-page__section');
  const frame   = (sidebar?.getBoundingClientRect().width ?? 0) + (main?.getBoundingClientRect().width ?? 0);

  return {
    fontSizes,
    minFontPx: Math.min(...Object.keys(fontSizes).map(Number)),
    distinctFontSizes: Object.keys(fontSizes).length,
    controls: controls.length,
    smallTargets,
    unnamedIconButtons: unnamed,
    borders: borderStats,
    minBorderRatio: Math.min(...Object.values(borderStats).map(b => b.ratio)),
    layout: {
      viewport: innerWidth,
      sidebarW: +(sidebar?.getBoundingClientRect().width ?? 0).toFixed(1),
      mainW:    +(main?.getBoundingClientRect().width ?? 0).toFixed(1),
      sectionW: +(section?.getBoundingClientRect().width ?? 0).toFixed(1),
      frameUsagePct: +((frame / innerWidth) * 100).toFixed(1),
    },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
}

const browser = await chromium.launch();
const report = { url: URL_BASE, at: new Date().toISOString(), widths: WIDTHS, sections: {} };
await mkdir(OUT, { recursive: true });

for (const width of WIDTHS) {
  const ctx  = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/settings`, { waitUntil: 'networkidle' });

  for (const name of SECTIONS) {
    await page.getByRole('button', { name, exact: true }).click();
    // TacticalArea 가 그리드를 JS 로 재는 구간이 있어 한 프레임 넘긴다 (CLAUDE.md)
    await page.waitForTimeout(160);

    const m = await page.evaluate(measure);
    (report.sections[name] ??= {})[width] = m;

    await page.screenshot({ path: join(OUT, `shot-${slug(name)}-${width}.png`), fullPage: false });
  }
  await ctx.close();
}
await browser.close();

// ── 요약 ──
const flat = Object.entries(report.sections).flatMap(([s, byW]) =>
  Object.entries(byW).map(([w, m]) => ({ s, w: +w, m })));
const ok = flat.filter(x => !x.m.error);

const summary = {
  최소_글자px:        Math.min(...ok.map(x => x.m.minFontPx)),
  최소_경계대비:      Math.min(...ok.map(x => x.m.minBorderRatio)),
  작은_클릭타깃_총계: ok.reduce((a, x) => a + x.m.smallTargets.length, 0),
  이름없는_아이콘버튼: ok.reduce((a, x) => a + x.m.unnamedIconButtons.length, 0),
  가로스크롤_발생:    ok.filter(x => x.m.horizontalOverflow).map(x => `${x.s}@${x.w}`),
  작은_클릭타깃_화면별: Object.fromEntries(
    [...new Set(ok.map(x => x.s))]
      .map(s => [s, Math.max(...ok.filter(x => x.s === s).map(x => x.m.smallTargets.length))])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]),
  ),
  최소대비_경계색: (() => {
    let worst = null;
    for (const x of ok) for (const [color, b] of Object.entries(x.m.borders)) {
      if (!worst || b.ratio < worst.ratio) worst = { color, ratio: b.ratio, at: `${x.s}@${x.w}` };
    }
    return worst;
  })(),
  프레임_사용률: Object.fromEntries(WIDTHS.map(w => {
    const rows = ok.filter(x => x.w === w);
    return [w, rows.length ? +(rows.reduce((a, x) => a + x.m.layout.frameUsagePct, 0) / rows.length).toFixed(1) : null];
  })),
};
report.summary = summary;

await writeFile(join(OUT, 'audit.json'), JSON.stringify(report, null, 2) + '\n');

const md = [
  `# 설정모드 UI 감사 — ${report.at.slice(0, 10)}`,
  '',
  `대상: \`${URL_BASE}/settings\` · 검증 폭 ${WIDTHS.join(' / ')}px · 화면 ${SECTIONS.length}개`,
  '',
  '## 요약',
  '',
  '| 지표 | 값 | 목표(§9) |',
  '|---|---|---|',
  `| 최소 글자 크기 | **${summary.최소_글자px}px** | ≥12px |`,
  `| 최소 경계 대비 | **${summary.최소_경계대비}:1** | ≥3:1 |`,
  `| 24px 미만 클릭 타깃 | **${summary.작은_클릭타깃_총계}건** | 0 |`,
  `| 이름 없는 아이콘 버튼 | **${summary.이름없는_아이콘버튼}건** | 0 |`,
  `| 가로 스크롤 | **${summary.가로스크롤_발생.length}건** | 0 |`,
  ...WIDTHS.map(w => `| 프레임 사용률 @${w}px | **${summary.프레임_사용률[w]}%** | ≥80% |`),
  '',
  '## 화면별 프레임 사용률',
  '',
  `| 화면 | ${WIDTHS.map(w => `${w}px`).join(' | ')} |`,
  `|---|${WIDTHS.map(() => '---').join('|')}|`,
  ...SECTIONS.map(s => `| ${s} | ${WIDTHS.map(w => {
    const m = report.sections[s]?.[w];
    return m && !m.error ? `${m.layout.frameUsagePct}%` : '—';
  }).join(' | ')} |`),
  '',
].join('\n');
await writeFile(join(OUT, 'audit.md'), md);

console.log(JSON.stringify(summary, null, 2));
console.log(`\n→ ${OUT}/audit.json · audit.md · 스크린샷 ${WIDTHS.length * SECTIONS.length}장`);
