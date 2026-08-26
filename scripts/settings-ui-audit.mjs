/**
 * 설정모드 UI 감사 — 기준선 기록과 사후 검증에 같은 자를 쓴다.
 *
 * docs/SETTINGS_MODE_UI_PLAN.md §9 의 검증 기준을 브라우저에서 실측한다.
 * 앱에는 테스트가 없으므로(CLAUDE.md) 이 스크립트가 유일한 자동 측정 수단이다.
 *
 * 사용법
 *   1) preview 도구로 tactical-board-dev 를 띄운다 (Bash 로 npm run dev 를 돌리지 않는다)
 *      .claude/launch.json 이 autoPort: true 라 5173 이 아닐 수 있다 — 실제 포트를 --url 로 넘긴다.
 *   2) node scripts/settings-ui-audit.mjs --url http://localhost:5174 --out docs/baseline/before
 *
 * 옵션
 *   --url      개발 서버 주소 (기본 http://localhost:5173)
 *   --out      산출물 디렉터리 (기본 docs/baseline/before)
 *   --fixture  주입할 설정 내보내기 JSON (기본 tactical-board-settings-2026-08-06.json)
 *   --empty    아무것도 주입하지 않고 빈 설정 상태로 잰다
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
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** `--key value` 와 `--flag` 를 함께 받는다 — 값이 없는 플래그는 true */
const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith('--')) { args[key] = true; continue; }
  args[key] = next;
  i += 1;
}
const URL_BASE = args.url ?? 'http://localhost:5173';
const OUT      = args.out ?? 'docs/baseline/before';
const FIXTURE  = args.empty === true ? null : (args.fixture ?? 'tactical-board-settings-2026-08-06.json');

/**
 * 사이드바 항목 순서와 같다 — SettingsPage.tsx 의 SCENARIO_ITEMS + GLOBAL_ITEMS.
 *
 * 체크리스트는 여기 없다. 2026-08-25 에 우측 상주 레일로 옮겨서 사이드바
 * 항목이 아니게 됐다(§12-C). 레일은 어느 화면에서든 떠 있으므로 화면을
 * 옮겨 가며 재는 이 목록의 대상이 아니다.
 */
const SECTIONS = [
  '건물 · 소방시설', '현장요소', '구조대상자', '출동대', '시나리오 예측',
  '지휘절차', '상태 메시지', '임무 · 상태 프리셋',
];

/** §9 검증 폭. 1280 은 하한, 2560 은 훈련장 PC */
const WIDTHS = [1280, 1800, 2560];

/** WCAG 2.2 SC 2.5.8(Target Size, Minimum) 의 24×24 CSS px 을 기준으로 삼는다 */
const MIN_TARGET_PX = 24;

/**
 * SettingsExport 필드 → localStorage 키.
 * importSettings(src/utils/settingsStorage.ts:305) 가 쓰는 키와 반드시 같아야 한다.
 */
const STORAGE_KEYS = {
  settingsList:                'tacticalBoardSettingsList',
  workingPresets:              'tacticalBoardWorkingPresets',
  commandProcedureConfigs:     'tacticalBoardCommandProcedure',
  activeCommandProcedureLevel: 'tacticalBoardActiveCommandProcedureLevel',
  unitStatusConfig:            'tacticalBoardUnitStatus',
  unitTagPresetConfig:         'tacticalBoardTagPresets',
};

/** 파일명에 쓸 수 있게 공백·가운뎃점을 없앤다 */
const slug = s => s.replace(/[·\s]+/g, '-');

/**
 * 한 화면에서 측정한다. 브라우저 안에서 도는 함수라 바깥 스코프를 못 쓴다
 * — 상수는 인자로 받는다.
 */
function measure({ minTargetPx }) {
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
  /**
   * 조상을 거슬러 올라가며 **눈에 실제로 보이는** 배경을 합성해 낸다.
   *
   * 반투명 층을 그대로 돌려주면 안 된다. rgba(255,255,255,0.04) 처럼 살짝 밝힌
   * 표면을 순백으로 오인해, 그 위의 흰 테두리가 대비 1:1 로 잡히는 오측이 났었다
   * (`--active` 스와치 20개 × 4변 = 80건이 1차 기준선의 최악값을 차지했다).
   * 불투명한 층을 만날 때까지 모아 아래에서 위로 합성한다.
   */
  const bgOf = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      layers.push(c);
      if (c.a >= 1) break;
    }
    // 브라우저 캔버스 기본색(흰색)을 맨 아래에 깔고 위로 쌓는다
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i -= 1) acc = flatten(layers[i], acc);
    return acc;
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
  //
  // 판정 기준은 **눈에 보이는 상자가 아니라 실제 클릭 판정 영역**이다.
  // `::before` 로 히트 영역만 넓히는 패턴(표 안 인라인 버튼 · 색 스와치, §5.1
  // --set-h-btn-sm 주석)을 raw getBoundingClientRect() 로만 재면 늘 작다고
  // 나온다 — 시각 크기와 클릭 판정 영역이 의도적으로 다른 경우다. inset 이
  // 네 변 모두 숫자로 잡히는(= 사각형으로 펼쳐지는) 단순한 형태만 인정한다.
  const effectiveSize = el => {
    const r = el.getBoundingClientRect();
    const before = getComputedStyle(el, '::before');
    if (before.content !== 'none' && (before.position === 'absolute' || before.position === 'fixed')) {
      const t = parseFloat(before.top), rt = parseFloat(before.right), b = parseFloat(before.bottom), l = parseFloat(before.left);
      if ([t, rt, b, l].every(n => !Number.isNaN(n))) {
        return { w: r.width - l - rt, h: r.height - t - b, raw: r };
      }
    }
    /*
     * <label> 이 감싼 체크박스·라디오는 **라벨 전체가 타깃**이다.
     * 네이티브 체크박스는 어느 브라우저에서나 13×13 이라, input 상자만 재면
     * 라벨을 아무리 키워도 영원히 위반으로 남는다 — 실제로는 글자를 눌러도
     * 켜진다. WCAG 2.5.8 이 재는 것은 「활성화되는 영역」이다.
     */
    if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
      const label = el.closest('label');
      if (label) {
        const lr = label.getBoundingClientRect();
        if (lr.width > 0 && lr.height > 0) return { w: lr.width, h: lr.height, raw: lr };
      }
    }
    return { w: r.width, h: r.height, raw: r };
  };

  const SEL = 'button, [role="button"], a, input, select, textarea, summary';
  const controls = vis.filter(el => el.matches(SEL));
  const smallTargets = controls
    .map(el => ({ el, s: effectiveSize(el) }))
    .filter(x => x.s.h < minTargetPx || x.s.w < minTargetPx)
    .map(x => ({
      tag: x.el.tagName.toLowerCase(),
      cls: (typeof x.el.className === 'string' ? x.el.className : '').slice(0, 60),
      text: (x.el.textContent ?? '').trim().slice(0, 16),
      w: +x.s.w.toFixed(1), h: +x.s.h.toFixed(1),
    }));

  // ── 이름 없는 아이콘 전용 버튼 ──
  //
  // 판정 기준은 **글자 수가 아니라 글자 종류**다. 한글은 두 글자짜리 정상 라벨이
  // 흔해서(저장·추가·경찰) 길이로 자르면 전부 오탐이 된다. 실제 문제는 화면에
  // 기호 글리프만 있는 버튼(×, ✕, +, ▲, ✓, ⋯)이다.
  //
  // 기호를 일일이 나열하면 반드시 빠뜨린다 — 실제로 `×`(U+00D7)만 넣었다가
  // `✕`(U+2715)를 쓰는 dsp__extra-remove 7개를 통째로 놓쳤다. 문자·숫자가
  // 하나도 없으면(빈 문자열 포함) 이름이 없는 것으로 본다.
  const GLYPH_ONLY = /^[^\p{L}\p{N}]*$/u;
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
  //
  // 테두리는 **안쪽(자기 배경)과 바깥쪽(부모 배경) 중 한쪽과만 대비돼도** 선으로
  // 보인다. 색칠된 스와치의 흰 링처럼 자기 배경 위에 얹히는 테두리가 있어서
  // 부모 배경만 보면 실제보다 나쁘게 잡힌다 → 두 값 중 큰 쪽으로 판정한다.
  //
  // 색깔 하나당 한 번만 재도 안 된다(같은 색이 배경마다 다른 대비를 낸다).
  // 색별로 최솟값·최댓값을 누적한다.
  const borderStats = {};
  for (const el of vis) {
    const cs = getComputedStyle(el);
    let ownBg = null, outBg = null;
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      const w = parseFloat(cs[`border${side}Width`]);
      if (!w || cs[`border${side}Style`] === 'none') continue;
      const c = parse(cs[`border${side}Color`]);
      if (!c || c.a === 0) continue;
      if (!ownBg) { ownBg = bgOf(el); outBg = bgOf(el.parentElement ?? el); }
      const r = Math.max(ratio(flatten(c, ownBg), ownBg), ratio(flatten(c, outBg), outBg));
      const key = cs[`border${side}Color`];
      const s = borderStats[key] ?? (borderStats[key] = { count: 0, minRatio: r, maxRatio: r });
      s.count += 1;
      if (r < s.minRatio) s.minRatio = r;
      if (r > s.maxRatio) s.maxRatio = r;
    }
  }
  for (const s of Object.values(borderStats)) {
    s.minRatio = +s.minRatio.toFixed(2);
    s.maxRatio = +s.maxRatio.toFixed(2);
  }

  // ── 레이아웃 ──
  //
  // 자가 두 개다. 계획서 §0.2 의 43.6% 는 **본문**(section) 기준이고, §9 표에 54% 로
  // 적힌 값은 **프레임**(sidebar+main) 기준이라 서로 다른 자였다. 둘 다 내보내고
  // 이름을 붙여 after 비교 때 섞이지 않게 한다.
  const sidebar = page.querySelector('.settings-page__sidebar');
  const main    = page.querySelector('.settings-page__main');
  const section = page.querySelector('.settings-page__section');
  const sidebarW = +(sidebar?.getBoundingClientRect().width ?? 0).toFixed(1);
  const mainW    = +(main?.getBoundingClientRect().width ?? 0).toFixed(1);
  const sectionW = +(section?.getBoundingClientRect().width ?? 0).toFixed(1);
  // 시나리오 예측 화면은 .settings-page__section 없이 main 이 곧 본문이다
  const contentW = sectionW || mainW;

  // ── 행 채움률 ──
  //
  // §12-A 가 실제로 쓴 자다. 본문(section) 폭 기준 사용률은 2026-08-26 부로
  // 뜻을 잃었다 — 폭 상한을 섹션이 아니라 패널 루트에 걸어서 화면이 전부
  // 같은 값을 낸다.
  //
  // 재는 것은 **잉크**지 걸친 폭이 아니다. 왼쪽 끝에 글자, 오른쪽 끝에 ✕,
  // 그 사이가 통째로 빈 줄은 걸친 폭으로는 100% 지만 실제로 읽을 것은 2% 다.
  // 자식들의 폭을 더해 컨테이너 폭으로 나눈다.
  const rows = [...document.querySelectorAll('.settings-page__main *')].filter(el => {
    const cs = getComputedStyle(el);
    if (cs.display !== 'flex' && cs.display !== 'grid') return false;
    if (cs.display === 'flex' && cs.flexDirection.startsWith('column')) return false;
    const kids = [...el.children].filter(k => {
      const kr = k.getBoundingClientRect();
      return kr.width > 0 && kr.height > 0;
    });
    if (kids.length < 2) return false;
    const r = el.getBoundingClientRect();
    // 아주 좁은 줄은 채움률이 의미 없다. 카드 한 칸 폭을 하한으로 둔다.
    return r.width >= 240 && r.height > 0;
  });

  const rowFills = rows.map(el => {
    const w = el.getBoundingClientRect().width;
    const ink = [...el.children].reduce((a, k) => a + k.getBoundingClientRect().width, 0);
    return {
      sel: el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase(),
      w: +w.toFixed(1),
      pct: +(Math.min(ink / w, 1) * 100).toFixed(1),
    };
  }).sort((a, b) => a.pct - b.pct);

  return {
    fontSizes,
    minFontPx: Math.min(...Object.keys(fontSizes).map(Number)),
    rowCount: rowFills.length,
    // 최악 5줄만 남긴다 — 전부 실으면 audit.json 이 다시 만 줄이 된다
    worstRows: rowFills.slice(0, 5),
    minRowFillPct: rowFills.length ? rowFills[0].pct : null,
    medianRowFillPct: rowFills.length
      ? rowFills[Math.floor(rowFills.length / 2)].pct : null,
    distinctFontSizes: Object.keys(fontSizes).length,
    controls: controls.length,
    smallTargets,
    unnamedIconButtons: unnamed,
    borders: borderStats,
    minBorderRatio: Object.keys(borderStats).length
      ? Math.min(...Object.values(borderStats).map(b => b.minRatio))
      : null,
    layout: {
      viewport: innerWidth,
      sidebarW,
      mainW,
      sectionW,
      contentW,
      hasSectionWrapper: !!section,
      frameUsagePct:   +(((sidebarW + mainW) / innerWidth) * 100).toFixed(1),
      contentUsagePct: +((contentW / innerWidth) * 100).toFixed(1),
    },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
}

// ── 실 시나리오 주입 ──
//
// 빈 설정으로 재면 롤 목록이 있어야 렌더되는 요소(색 스와치, ×/− 글리프 버튼 등)가
// 아예 화면에 없어서 "이름 없는 아이콘 버튼 0건" 같은 거짓 합격이 나온다.
// importSettings() 와 같은 키에 같은 값을 심어 파일 선택 없이 실 데이터 상태를 만든다.
let fixtureEntries = null;
let fixtureInfo = null;
if (FIXTURE) {
  const raw = JSON.parse(await readFile(FIXTURE, 'utf8'));
  if (raw.version !== 1 || !Array.isArray(raw.settingsList) || !raw.workingPresets) {
    throw new Error(`올바른 설정 내보내기 파일이 아니다: ${FIXTURE}`);
  }
  fixtureEntries = Object.entries(STORAGE_KEYS)
    .filter(([field]) => raw[field] !== undefined)
    .map(([field, key]) => [key, typeof raw[field] === 'string' ? raw[field] : JSON.stringify(raw[field])]);
  fixtureInfo = {
    file: FIXTURE,
    exportedAt: raw.exportedAt ?? null,
    settingsList: raw.settingsList.length,
    dispatchRoster: raw.workingPresets.dispatchRoster?.length ?? 0,
    victimSetup: raw.workingPresets.victimSetup?.length ?? 0,
    keys: fixtureEntries.map(([k]) => k),
  };
}

const browser = await chromium.launch();
const report = {
  url: URL_BASE,
  at: new Date().toISOString(),
  widths: WIDTHS,
  minTargetPx: MIN_TARGET_PX,
  fixture: fixtureInfo,
  sections: {},
};
await mkdir(OUT, { recursive: true });

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
  if (fixtureEntries) {
    await ctx.addInitScript(entries => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
    }, fixtureEntries);
  }
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/settings`, { waitUntil: 'networkidle' });

  for (const name of SECTIONS) {
    // 사이드바로 한정한다 — 실 데이터가 들어오면 같은 이름의 버튼이 본문에도 생길 수 있다
    await page.locator('.settings-page__sidebar').getByRole('button', { name, exact: true }).click();
    // TacticalArea 가 그리드를 JS 로 재는 구간이 있어 한 프레임 넘긴다 (CLAUDE.md)
    await page.waitForTimeout(200);

    const m = await page.evaluate(measure, { minTargetPx: MIN_TARGET_PX });
    if (m.error) throw new Error(`${name}@${width}: ${m.error} — --url 이 실제 개발 서버 포트인지 확인한다`);
    (report.sections[name] ??= {})[width] = m;

    await page.screenshot({ path: join(OUT, `shot-${slug(name)}-${width}.png`), fullPage: false });
  }
  await ctx.close();
}
await browser.close();

// ── 요약 ──
//
// 폭 3개를 그냥 합치면 같은 결함이 3배로 계상된다(1차 기준선의 "450건" 이 실제로는
// 150건 × 3폭이었다). 페이지 단위 총계는 폭별로 내고, 대표값은 **가장 나쁜 폭** 하나를 쓴다.
const flat = Object.entries(report.sections).flatMap(([s, byW]) =>
  Object.entries(byW).map(([w, m]) => ({ s, w: +w, m })));
const ok = flat.filter(x => !x.m.error);

const perWidth = pick => Object.fromEntries(
  WIDTHS.map(w => [w, ok.filter(x => x.w === w).reduce((a, x) => a + pick(x.m), 0)]));
const smallByWidth   = perWidth(m => m.smallTargets.length);
const unnamedByWidth = perWidth(m => m.unnamedIconButtons.length);

/** 폭별로 가장 나쁜 화면의 사용률 — 평균을 내면 전체폭 예외(시나리오 예측)가 수치를 끌어올린다 */
const worstUsage = key => Object.fromEntries(WIDTHS.map(w => {
  const rows = ok.filter(x => x.w === w);
  if (!rows.length) return [w, null];
  const worst = rows.reduce((a, b) => (b.m.layout[key] < a.m.layout[key] ? b : a));
  return [w, { 최소: worst.m.layout[key], 화면: worst.s }];
}));

/** 폭별로 채움률이 가장 낮은 화면. layout 이 아니라 측정 루트에 있어 자를 따로 둔다 */
const worstRowFill = key => Object.fromEntries(WIDTHS.map(w => {
  const rows = ok.filter(x => x.w === w && x.m[key] != null);
  if (!rows.length) return [w, null];
  const worst = rows.reduce((a, b) => (b.m[key] < a.m[key] ? b : a));
  return [w, { 최소: worst.m[key], 화면: worst.s }];
}));

/** 화면별 최댓값 — 폭이 달라도 같은 화면이므로 합치지 않는다 */
const worstPerSection = pick => Object.fromEntries(
  [...new Set(ok.map(x => x.s))]
    .map(s => [s, Math.max(...ok.filter(x => x.s === s).map(x => pick(x.m)))])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]));

const fontSizeUnion = new Set(ok.flatMap(x => Object.keys(x.m.fontSizes)));
const withBorders = ok.filter(x => x.m.minBorderRatio != null);

const summary = {
  실데이터_주입: fixtureInfo
    ? `${fixtureInfo.file} (시나리오 ${fixtureInfo.settingsList}건 · 출동대 ${fixtureInfo.dispatchRoster}건 · 구조대상자 ${fixtureInfo.victimSetup}명)`
    : '없음 — 빈 설정',
  최소_글자px: Math.min(...ok.map(x => x.m.minFontPx)),
  글자크기_종류: fontSizeUnion.size,
  최소_경계대비: withBorders.length ? Math.min(...withBorders.map(x => x.m.minBorderRatio)) : null,
  작은_클릭타깃_폭별: smallByWidth,
  작은_클릭타깃_최악폭: Math.max(...Object.values(smallByWidth)),
  이름없는_아이콘버튼_폭별: unnamedByWidth,
  이름없는_아이콘버튼_최악폭: Math.max(...Object.values(unnamedByWidth)),
  가로스크롤_발생: ok.filter(x => x.m.horizontalOverflow).map(x => `${x.s}@${x.w}`),
  작은_클릭타깃_화면별: worstPerSection(m => m.smallTargets.length),
  이름없는_아이콘버튼_화면별: worstPerSection(m => m.unnamedIconButtons.length),
  최소대비_경계색: (() => {
    let worst = null;
    for (const x of ok) for (const [color, b] of Object.entries(x.m.borders)) {
      if (!worst || b.minRatio < worst.ratio) worst = { color, ratio: b.minRatio, count: b.count, at: `${x.s}@${x.w}` };
    }
    return worst;
  })(),
  /*
   * 행 채움률 — §12-A 의 자.
   * 최소는 한 줄이라도 심하게 빈 곳을 잡고, 중앙값은 화면 전체가
   * 성긴지를 잡는다. 최소만 보면 아이콘 두 개짜리 줄에 끌려간다.
   */
  행채움률_최소: worstRowFill('minRowFillPct'),
  행채움률_중앙값: worstRowFill('medianRowFillPct'),
  /*
   * 아래 둘은 참고값이다. 2026-08-26 부로 화면을 가르지 못한다 —
   * 폭 상한이 섹션이 아니라 패널 루트에 걸려 여덟 화면이 같은 값을 낸다.
   * 지우지 않는 것은 before 기록과 이어 보기 위해서다.
   */
  본문_사용률_최악_참고: worstUsage('contentUsagePct'),
  프레임_사용률_최악_참고: worstUsage('frameUsagePct'),
};
report.summary = summary;

await writeFile(join(OUT, 'audit.json'), JSON.stringify(report, null, 2) + '\n');

const md = [
  `# 설정모드 UI 감사 — ${report.at.slice(0, 10)}`,
  '',
  `대상: \`${URL_BASE}/settings\` · 검증 폭 ${WIDTHS.join(' / ')}px · 화면 ${SECTIONS.length}개`,
  `데이터: ${summary.실데이터_주입}`,
  '',
  '## 요약',
  '',
  '건수는 **폭별**로 낸다 — 폭 3개를 합치면 같은 결함이 3배로 계상된다.',
  '채움률은 화면 중 **가장 나쁜 화면**의 값이다 — 평균을 내면 설계상',
  '전체폭인 시나리오 예측이 수치를 끌어올린다.',
  '',
  '| 지표 | 값 | 목표(§9) |',
  '|---|---|---|',
  `| 최소 글자 크기 | **${summary.최소_글자px}px** | ≥12px |`,
  `| 서로 다른 글자 크기 | **${summary.글자크기_종류}종** | ≤6 |`,
  `| 최소 경계 대비 | **${summary.최소_경계대비}:1** | ≥3:1 |`,
  `| ${MIN_TARGET_PX}px 미만 클릭 타깃 (최악 폭) | **${summary.작은_클릭타깃_최악폭}건** | 0 |`,
  `| 이름 없는 아이콘 버튼 (최악 폭) | **${summary.이름없는_아이콘버튼_최악폭}건** | 0 |`,
  `| 가로 스크롤 | **${summary.가로스크롤_발생.length}건** | 0 |`,
  ...WIDTHS.map(w => `| 행 채움률 중앙값 @${w}px | **${summary.행채움률_중앙값[w]?.최소 ?? '—'}%** (${summary.행채움률_중앙값[w]?.화면 ?? '—'}) | ≥60% **(잠정)** |`),
  '',
  '## 화면별 행 채움률',
  '',
  '가로로 놓인 줄(flex row · grid, 폭 240px 이상)에서 **자식들의 폭 합 ÷ 줄 폭**.',
  '걸친 폭이 아니라 잉크를 잰다 — 왼쪽에 글자, 오른쪽 끝에 ✕, 사이가 통째로 빈',
  '줄은 걸친 폭으로는 100% 지만 여기서는 낮게 나온다. 그것이 §12-A 가 고친 결함이다.',
  '',
  '**목표 60% 는 잠정값이다.** §9 가 정한 것이 아니라 이 지표를 넣으면서 임의로',
  '적었다. 화면을 여러 번 재서 "고쳤다고 합의한 화면"이 어디쯤 나오는지 본 뒤에',
  '§9 에 정식으로 올려야 한다. 그전까지 이 열은 통과/실패로 읽지 않는다.',
  '',
  '`.settings-page__section` 폭 기준 사용률은 2026-08-26 부로 화면을 가르지 못한다',
  '— 폭 상한이 섹션이 아니라 패널 루트에 걸려 모든 화면이 같은 값을 낸다.',
  'audit.json 의 `본문_사용률_최악_참고` 에 before 비교용으로만 남겼다.',
  '',
  `| 화면 | ${WIDTHS.map(w => `${w}px 최소 / 중앙`).join(' | ')} |`,
  `|---|${WIDTHS.map(() => '---').join('|')}|`,
  ...SECTIONS.map(s => `| ${s} | ${WIDTHS.map(w => {
    const m = report.sections[s]?.[w];
    return m && !m.error && m.minRowFillPct != null
      ? `${m.minRowFillPct}% / ${m.medianRowFillPct}%` : '—';
  }).join(' | ')} |`),
  '',
  '## 화면별 결함 건수 (폭별 최댓값)',
  '',
  `| 화면 | ${MIN_TARGET_PX}px 미만 타깃 | 이름 없는 아이콘 버튼 |`,
  '|---|---|---|',
  ...SECTIONS.map(s => `| ${s} | ${summary.작은_클릭타깃_화면별[s] ?? 0} | ${summary.이름없는_아이콘버튼_화면별[s] ?? 0} |`),
  '',
].join('\n');
await writeFile(join(OUT, 'audit.md'), md);

console.log(JSON.stringify(summary, null, 2));
console.log(`\n→ ${OUT}/audit.json · audit.md · 스크린샷 ${WIDTHS.length * SECTIONS.length}장`);
