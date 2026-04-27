import { useState } from 'react';
import type { VictimGender, VictimCondition, VictimCreationMode } from '../../types/victim';
import { VICTIM_GENDERS, VICTIM_CONDITIONS } from '../../types/victim';
import { useVictims } from '../../context/VictimContext';
import './VictimCreator.css';

// ─────────────────────────────────────────────
// 공통: 세부위치 입력 힌트
// ─────────────────────────────────────────────
const SUB_PLACEHOLDER = '212호, 복도… (보드에 올리면 층·방면 자동 표시)';

// ─────────────────────────────────────────────
// 랜덤 생성 폼
// ─────────────────────────────────────────────

function RandomForm() {
  const { createRandom } = useVictims();
  const [subLocation, setSubLocation] = useState('');

  function handleCreate() {
    createRandom(subLocation);
    setSubLocation('');
  }

  return (
    <div className="vc-form">
      <div className="vc-row">
        <label className="vc-label">세부위치</label>
        <input
          className="vc-input"
          placeholder={SUB_PLACEHOLDER}
          value={subLocation}
          onChange={e => setSubLocation(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          maxLength={20}
        />
      </div>
      <div className="vc-row vc-row--right">
        <button className="vc-btn vc-btn--create" onClick={handleCreate}>
          랜덤 생성
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 직접 선택 폼
// ─────────────────────────────────────────────

function ManualForm() {
  const { createVictim } = useVictims();
  const [gender,      setGender]      = useState<VictimGender>(VICTIM_GENDERS[0]);
  const [age,         setAge]         = useState(35);
  const [condition,   setCondition]   = useState<VictimCondition>(VICTIM_CONDITIONS[0]);
  const [subLocation, setSubLocation] = useState('');

  function handleCreate() {
    createVictim({ kind: 'person', gender, age, condition, subLocation });
    setSubLocation('');
  }

  return (
    <div className="vc-form">
      {/* 성별 */}
      <div className="vc-row">
        <label className="vc-label">성별</label>
        <div className="vc-toggle-group">
          {VICTIM_GENDERS.map(g => (
            <button
              key={g}
              className={`vc-toggle ${gender === g ? 'vc-toggle--active' : ''}`}
              onClick={() => setGender(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* 나이 */}
      <div className="vc-row">
        <label className="vc-label">나이</label>
        <input
          className="vc-input vc-input--narrow"
          type="number"
          min={1}
          max={99}
          value={age}
          onChange={e => setAge(Math.min(99, Math.max(1, Number(e.target.value) || 1)))}
        />
      </div>

      {/* 상태 */}
      <div className="vc-row">
        <label className="vc-label">상태</label>
        <select
          className="vc-select"
          value={condition}
          onChange={e => setCondition(e.target.value as VictimCondition)}
        >
          {VICTIM_CONDITIONS.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* 세부위치 */}
      <div className="vc-row">
        <label className="vc-label">세부위치</label>
        <input
          className="vc-input"
          placeholder={SUB_PLACEHOLDER}
          value={subLocation}
          onChange={e => setSubLocation(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          maxLength={20}
        />
      </div>

      <div className="vc-row vc-row--right">
        <button className="vc-btn vc-btn--create" onClick={handleCreate}>
          생성
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 기타 폼
// ─────────────────────────────────────────────

function CustomForm() {
  const { createVictim } = useVictims();
  const [label,       setLabel]       = useState('');
  const [subLocation, setSubLocation] = useState('');

  function handleCreate() {
    createVictim({ kind: 'custom', customLabel: label, subLocation });
    setLabel('');
    setSubLocation('');
  }

  return (
    <div className="vc-form">
      <div className="vc-row">
        <label className="vc-label">라벨</label>
        <input
          className="vc-input"
          placeholder="반려견, 결혼반지… (공백 시 기타)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          maxLength={20}
        />
      </div>
      <div className="vc-row">
        <label className="vc-label">세부위치</label>
        <input
          className="vc-input"
          placeholder={SUB_PLACEHOLDER}
          value={subLocation}
          onChange={e => setSubLocation(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          maxLength={20}
        />
      </div>
      <div className="vc-row vc-row--right">
        <button className="vc-btn vc-btn--create" onClick={handleCreate}>
          생성
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 다수 구조대상자 폼 (최소 2명, 최대 6명)
// ─────────────────────────────────────────────

function GroupForm() {
  const { createVictim } = useVictims();
  const [count,       setCount]       = useState(3);
  const [subLocation, setSubLocation] = useState('');

  function handleCreate() {
    createVictim({ kind: 'group', groupCount: count, condition: '경상', subLocation });
    setSubLocation('');
  }

  return (
    <div className="vc-form">
      <div className="vc-row">
        <label className="vc-label">인원</label>
        <div className="vc-toggle-group">
          {([2, 3, 4, 5, 6, 7, 8, 9] as const).map(n => (
            <button
              key={n}
              className={`vc-toggle ${count === n ? 'vc-toggle--active' : ''}`}
              onClick={() => setCount(n)}
            >
              {n}명
            </button>
          ))}
        </div>
      </div>
      <div className="vc-row">
        <label className="vc-label">세부위치</label>
        <input
          className="vc-input"
          placeholder={SUB_PLACEHOLDER}
          value={subLocation}
          onChange={e => setSubLocation(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          maxLength={20}
        />
      </div>
      <div className="vc-row vc-row--right">
        <button className="vc-btn vc-btn--create" onClick={handleCreate}>
          생성
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// VictimCreator — 메인 패널
// ─────────────────────────────────────────────

const MODE_LABELS: Record<VictimCreationMode, string> = {
  random: '랜덤',
  manual: '직접선택',
  custom: '기타',
  group:  '다수',
};

export function VictimCreator() {
  const [mode, setMode] = useState<VictimCreationMode>('random');

  return (
    <div className="panel victim-creator">
      <div className="panel__header">구조대상자 생성</div>
      <div className="victim-creator__body">
        <div className="vc-mode-tabs">
          {(Object.keys(MODE_LABELS) as VictimCreationMode[]).map(m => (
            <button
              key={m}
              className={`vc-mode-tab ${mode === m ? 'vc-mode-tab--active' : ''}`}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {mode === 'random' && <RandomForm />}
        {mode === 'manual' && <ManualForm />}
        {mode === 'custom' && <CustomForm />}
        {mode === 'group'  && <GroupForm />}
      </div>
    </div>
  );
}
