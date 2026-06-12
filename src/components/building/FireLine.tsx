import React from 'react';

const W1 = 445, H1 = 106;
const W2 = 556, H2 = 108;
const PAIRS = 25;

interface Props {
  height: number;
  style?: React.CSSProperties;
}

export function FireLine({ height, style }: Props) {
  const w1 = height * (W1 / H1);
  const w2 = height * (W2 / H2);

  return (
    <div
      style={{
        display: 'flex',
        height,
        overflow: 'hidden',
        pointerEvents: 'none',
        flexShrink: 0,
        ...style,
      }}
    >
      {Array.from({ length: PAIRS }, (_, i) => (
        <React.Fragment key={i}>
          <img src="/fire_line1.png" style={{ height, width: w1, flexShrink: 0, display: 'block' }} draggable={false} alt="" />
          <img src="/fire_line2.png" style={{ height, width: w2, flexShrink: 0, display: 'block' }} draggable={false} alt="" />
        </React.Fragment>
      ))}
    </div>
  );
}
