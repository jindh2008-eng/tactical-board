import './CommandInfo.css';

const COMMAND_ITEMS = [
  { key: 'initial-report',   label: '초기 상황 보고' },
  { key: 'sector-assign',    label: '방면 지정' },
  { key: 'command-method',   label: '지휘 방법 (고정/전진/이동)' },
  { key: 'strategy',         label: '전략 (공격/방어)' },
  { key: 'additional-units', label: '추가 출동대' },
  { key: 'standby1',         label: '대기 1단계' },
  { key: 'standby2',         label: '대기 2단계' },
  { key: 'response-level',   label: '대응단계 발령' },
  { key: 'control-center',   label: '통제단 가동 요청' },
];

interface CommandInfoProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * CommandInfo — 지휘정보 패널
 *
 * 향후 확장 포인트:
 * - 각 항목에 입력 필드, 버튼, 토글 상태 추가
 * - commandState를 상위에서 prop으로 받아 실제 데이터 표시
 */
export function CommandInfo({ collapsed, onToggle }: CommandInfoProps) {
  return (
    <div className={`panel command-info${collapsed ? ' command-info--collapsed' : ''}`}>
      <div className="panel__header panel__header--toggleable" onClick={onToggle}>
        지휘정보
        <span className="panel__toggle-icon">{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div className="command-info__body">
          {COMMAND_ITEMS.map(item => (
            <div key={item.key} className="command-info__row">
              <span className="command-info__label">{item.label}</span>
              {/* 향후: 실제 값 표시 또는 버튼으로 교체 */}
              <span className="command-info__value">―</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
