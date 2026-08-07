import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearRuntimeSession } from '../../utils/runtimeSession';
import './ErrorBoundary.css';

// ─────────────────────────────────────────────
// 전역 오류 경계
//
// 렌더링 중 발생한 예외를 잡아 흰 화면 대신 복구 UI를 보여준다.
// 훈련 중 위젯 하나의 오류가 화면 전체를 날리는 것을 막는 것이 목적.
//
// 배치: App.tsx의 <Routes>만 감싼다 — 상단 메뉴바(nav)는 경계 밖에 남겨
// 오류 발생 후에도 설정/훈련 화면으로 이동할 수 있는 경로를 유지한다.
// ─────────────────────────────────────────────

interface Props {
  children: ReactNode;
  /**
   * 이 값이 바뀌면 오류 상태를 자동 해제한다.
   * (App에서 라우트 경로를 넘겨 — 오류 발생 후 메뉴로 다른 화면에 이동하면
   *  오류 화면이 남지 않고 정상 렌더를 다시 시도하도록 함)
   */
  resetKey?: string;
}

interface State {
  error:          Error | null;
  componentStack: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: '' });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // React가 자체적으로도 콘솔에 출력하지만, 스택을 state에 담아
    // 화면에서 바로 복사할 수 있도록 보관한다.
    this.setState({ componentStack: info.componentStack ?? '' });
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null, componentStack: '' });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleResetSession = () => {
    const ok = window.confirm(
      '진행 중인 훈련 상태(배치된 출동대·구조대상자·화재 상황 등)를 모두 지우고 새로 시작합니다.\n' +
      '설정 데이터는 삭제되지 않습니다.\n\n계속하시겠습니까?'
    );
    if (!ok) return;
    clearRuntimeSession();
    window.location.reload();
  };

  handleCopy = async () => {
    const { error, componentStack } = this.state;
    const text = [
      `[오류] ${error?.name}: ${error?.message}`,
      `시각: ${new Date().toISOString()}`,
      `주소: ${window.location.href}`,
      '',
      '--- stack ---',
      error?.stack ?? '(없음)',
      '',
      '--- component stack ---',
      componentStack || '(없음)',
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* 클립보드 권한 없음 — 아래 상세 영역에서 직접 선택 복사 가능 */
    }
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary__box">
          <div className="error-boundary__title">화면을 표시하는 중 오류가 발생했습니다</div>

          <p className="error-boundary__desc">
            훈련 진행 상황은 브라우저 세션에 저장되어 있어, <b>새로고침</b>하면 대부분 그대로 복구됩니다.
            <br />
            먼저 <b>다시 시도</b> → 안 되면 <b>새로고침</b> 순서로 진행해 주세요.
          </p>

          <div className="error-boundary__actions">
            <button className="error-boundary__btn error-boundary__btn--primary" onClick={this.handleRetry}>
              다시 시도
            </button>
            <button className="error-boundary__btn" onClick={this.handleReload}>
              새로고침
            </button>
            <button className="error-boundary__btn" onClick={this.handleCopy}>
              오류 내용 복사
            </button>
          </div>

          <details className="error-boundary__details">
            <summary>오류 상세 정보</summary>
            <div className="error-boundary__msg">
              {error.name}: {error.message}
            </div>
            {error.stack && <pre className="error-boundary__stack">{error.stack}</pre>}
            {componentStack && <pre className="error-boundary__stack">{componentStack}</pre>}
          </details>

          <div className="error-boundary__last-resort">
            위 방법으로도 계속 같은 오류가 반복될 때만 사용하세요.
            <button className="error-boundary__btn error-boundary__btn--danger" onClick={this.handleResetSession}>
              훈련 세션 초기화 후 새로고침
            </button>
          </div>
        </div>
      </div>
    );
  }
}
