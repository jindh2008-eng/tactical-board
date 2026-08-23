import { useDisplayOptions, type DisplayOptionKey } from '../../context/DisplayOptionsContext';
import './DisplayOptionsBar.css';

/**
 * 표시옵션 바 — C면 좌측 상단에 붙는다.
 *
 * 원래 상단 nav 에 있었으나 C면으로 내렸다. 다섯 항목이 전부 **보드에 그려지는
 * 것**을 제어하므로 제어 대상 옆에 두는 편이 맞고, nav 폭도 433px(30%) 비었다.
 *
 * 두 가지가 nav 시절과 달라진다.
 *
 * 1. **배율을 따른다.** 스테이지 안이라 캔버스 px 로 그린다. 훈련장 PC 배율이
 *    0.975 라 조작자 화면에서는 예전과 사실상 같은 크기다(태블릿은 보는
 *    용도라 작아지는 것을 감수한다 — SCREEN_STAGE_PLAN.md §3.1).
 * 2. **테마가 바뀐다.** nav 는 어두운 앱 테마였지만 C면은 화이트보드(`--ctr-*`)다.
 *    그래서 nav-options 스타일을 재사용하지 않고 따로 둔다.
 *
 * C면 좌측 상단은 원래 드롭 존이지만, 이 영역을 덮는 것은 사용자가 승인했다.
 */

const ITEMS: { key: DisplayOptionKey; label: string }[] = [
  { key: 'waterSupply', label: '송수·수량' },
  { key: 'spray',       label: '방수 표시' },
  { key: 'controlLine', label: '통제선'   },
  { key: 'victims',     label: '구조대상자' },
  { key: 'drawing',     label: '그리기 도구' },
];

export function DisplayOptionsBar() {
  const opts = useDisplayOptions();

  const checked: Record<DisplayOptionKey, boolean> = {
    waterSupply: opts.showWaterSupply,
    spray:       opts.showSpray,
    controlLine: opts.showControlLine,
    victims:     opts.showAllVictims,
    drawing:     opts.showDrawingTools,
  };

  return (
    <div
      className="display-options-bar"
      // 보드 위에 얹히므로 여기서 시작된 드래그가 구역 드롭으로 새지 않게 막는다
      onDragOver={e => e.stopPropagation()}
      onDrop={e => e.stopPropagation()}
    >
      <span className="display-options-bar__label">표시옵션</span>
      {ITEMS.map(item => (
        <label key={item.key} className="display-options-bar__item">
          <input
            type="checkbox"
            checked={checked[item.key]}
            onChange={() => opts.toggleOption(item.key)}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}
