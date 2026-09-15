import { useEffect, useState } from 'react';
import { SAVE_FAILED_EVENT, type SaveFailureDetail } from '../../utils/saveFailure';
import './SaveFailureBanner.css';

// ─────────────────────────────────────────────
// 훈련 상태 저장 실패 경고 — 훈련창 아래쪽 가운데
//
// 저장이 실패하면(utils/runtimeSession setSession → utils/saveFailure) 여기서 받아 띄운다.
// 닫을 때까지 남는다. 닫은 뒤 또 실패하면 다시 뜬다 — 실패가 이어지는 동안은 계속 알린다.
// ─────────────────────────────────────────────

export function SaveFailureBanner() {
  const [failure, setFailure] = useState<SaveFailureDetail | null>(null);

  useEffect(() => {
    function onFail(e: Event) {
      setFailure((e as CustomEvent<SaveFailureDetail>).detail);
    }
    window.addEventListener(SAVE_FAILED_EVENT, onFail);
    return () => window.removeEventListener(SAVE_FAILED_EVENT, onFail);
  }, []);

  if (!failure) return null;

  return (
    <div className="save-failure-banner" role="alert">
      <span className="save-failure-banner__title">⚠ 훈련 기록이 저장되지 않고 있습니다</span>
      <span className="save-failure-banner__msg">
        {failure.quota ? '브라우저 저장 공간이 부족합니다.' : '브라우저가 저장을 막고 있습니다(사생활 보호 모드 등).'}
        {' '}지금 새로고침하면 마지막 저장 이후의 로그·배치가 사라집니다 — 로그를 CSV·PDF 로 먼저 내보내세요.
      </span>
      <button type="button" className="save-failure-banner__close" onClick={() => setFailure(null)}>
        닫기
      </button>
    </div>
  );
}
