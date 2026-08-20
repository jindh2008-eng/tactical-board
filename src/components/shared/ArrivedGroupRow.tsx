import type { UnitToken } from '../../types';
import { TokenCard } from './TokenCard';
import './ArrivedGroupRow.css';

/**
 * ArrivedGroupRow — 자원대기소·대기1단계 맨 윗줄의 "도착대".
 *
 * 방금 들어온 한 무리를 가로로 늘어놓는다. 판정은 utils/arrivalGroup 이 한다.
 */
interface Props {
  tokens:              UnitToken[];
  onTokenDoubleClick?: (tokenId: string) => void;
}

export function ArrivedGroupRow({ tokens, onTokenDoubleClick }: Props) {
  if (tokens.length === 0) return null;

  return (
    <div className="arrived-row">
      <span className="arrived-row__label">도착대</span>
      <div className="arrived-row__body">
        {tokens.map(t => (
          <TokenCard
            key={t.id}
            token={t}
            onDoubleClick={onTokenDoubleClick ? () => onTokenDoubleClick(t.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
