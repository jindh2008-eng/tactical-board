import React from 'react';
import './ControlLine.css';

/**
 * ControlLine — 통제선 띠 (소방 / 경찰).
 *
 * 예전에는 소방통제선만 이미지 두 장(fire_line1·2.png)을 반복해 그렸는데,
 * 결국 "색 있는 띠 + 반복 문구"라 이미지 없이 CSS 로 그린다.
 * 배율에 따라 늘어나고 색·문구를 값 하나로 바꿀 수 있다.
 */
export type ControlLineVariant = 'fire' | 'police';

const LABELS: Record<ControlLineVariant, string> = {
  fire:   '출입통제 FIRE LINE',
  police: '출입통제 POLICE LINE',
};

/** 나머지 div 속성(포인터 핸들러 등)은 그대로 넘긴다 — 소방통제선은 끌어서 옮긴다 */
interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant: ControlLineVariant;
  height:  number;
}

/** 띠 폭이 넓어도 빈자리가 없도록 넉넉히 반복한다 (overflow 로 잘린다) */
const REPEAT = 14;

export function ControlLine({ variant, height, style, className, ...rest }: Props) {
  return (
    <div
      className={`control-line control-line--${variant}${className ? ` ${className}` : ''}`}
      style={{ height, ...style }}
      aria-label={variant === 'fire' ? '소방 통제선' : '경찰 통제선'}
      {...rest}
    >
      {Array.from({ length: REPEAT }, (_, i) => (
        <span key={i} className="control-line__text">{LABELS[variant]}</span>
      ))}
    </div>
  );
}
