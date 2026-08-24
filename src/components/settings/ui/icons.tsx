/**
 * 설정모드 아이콘 세트 — 인라인 SVG.
 *
 * 문자 글리프(×, ▲, +, ✓)를 쓰지 않는 이유는 미감이 아니다. 폰트에 따라 모양과
 * 세로 정렬이 흔들리고, 화면에 기호만 있는 버튼은 접근성 이름이 없어진다.
 * S-0 기준선에서 이름 없는 아이콘 버튼이 26건 잡힌 것이 그 결과다(§9).
 *
 * 규격: 16px 그리드 · stroke 1.5 · 색은 currentColor 를 따른다.
 * 외부 패키지는 쓰지 않는다 — 필요한 것이 12종뿐이라 이 파일 하나로 끝난다(§6).
 */

export interface IconProps {
  /** 그리드 배수가 아니어도 되지만 12·16·20 을 벗어나지 않는 편이 낫다 */
  size?: number;
}

/** 모든 아이콘이 공유하는 속성. aria-hidden 은 버튼 쪽 aria-label 이 이름을 맡기 때문이다. */
function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };
}

export function IconSave({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 2.75h7L13.25 6v7.25a.5.5 0 0 1-.5.5h-9.5a.5.5 0 0 1-.5-.5v-10a.5.5 0 0 1 .5-.5z" />
      <path d="M5.25 2.75v3.5h4.5" />
      <path d="M5.25 13.75v-3.5h5.5v3.5" />
    </svg>
  );
}

export function IconList({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.75 4h10.5M2.75 8h10.5M2.75 12h6.5" />
    </svg>
  );
}

export function IconChevronDown({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 6.25 8 10.25l4-4" />
    </svg>
  );
}

export function IconChevronUp({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 9.75 8 5.75l4 4" />
    </svg>
  );
}

export function IconMore({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)} fill="currentColor" stroke="none">
      <circle cx="3.25" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.75" cy="8" r="1.25" />
    </svg>
  );
}

export function IconExport({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 2.75v7.5" />
      <path d="M5.25 7.5 8 10.25l2.75-2.75" />
      <path d="M2.75 11.75v1.5h10.5v-1.5" />
    </svg>
  );
}

export function IconImport({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 10.25v-7.5" />
      <path d="M5.25 5.5 8 2.75l2.75 2.75" />
      <path d="M2.75 11.75v1.5h10.5v-1.5" />
    </svg>
  );
}

export function IconPlus({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 3.75v8.5M3.75 8h8.5" />
    </svg>
  );
}

export function IconMinus({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3.75 8h8.5" />
    </svg>
  );
}

export function IconClose({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function IconTrash({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M2.75 4.25h10.5" />
      <path d="M6.25 4.25V2.75h3.5v1.5" />
      <path d="M4.25 4.25l.55 8.5a.5.5 0 0 0 .5.5h5.4a.5.5 0 0 0 .5-.5l.55-8.5" />
    </svg>
  );
}

export function IconEdit({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M10.25 2.75l3 3-7.5 7.5H2.75v-3z" />
    </svg>
  );
}

export function IconCheck({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M3 8.5l3.25 3.25L13 5" />
    </svg>
  );
}

export function IconReset({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M13.25 8a5.25 5.25 0 1 1-1.6-3.75" />
      <path d="M13.25 2.25v3.1h-3.1" />
    </svg>
  );
}

export function IconWarn({ size = 16 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path d="M8 2.75l5.5 9.5h-11z" />
      <path d="M8 6.5v2.75" />
      <path d="M8 11.1v.05" />
    </svg>
  );
}
