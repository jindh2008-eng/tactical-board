/**
 * 설정모드 공용 컴포넌트 6종 (SETTINGS_MODE_UI_PLAN.md §6).
 *
 * 패널마다 `__btn`·`__del-btn`·`__input` 을 새로 정의하던 것이 F-1 의 직접
 * 원인이었다. 새 패널을 쓸 때는 여기 있는 것을 쓰고, 없으면 여기에 추가한다.
 *
 * 스타일은 ui.css 하나에 모여 있고 값은 전부 `.settings-page` 의 --set-* 토큰이다.
 */
import { useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { IconMore, IconCheck } from './icons';
import './ui.css';

/* ── SetButton ───────────────────────────────────────────── */

export type SetButtonVariant = 'primary' | 'default' | 'ghost' | 'danger' | 'ok';

interface SetButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary 는 **화면당 하나**다. 둘이 보이면 위계가 없는 것이다(§1.4) */
  variant?: SetButtonVariant;
  size?: 'md' | 'sm';
  icon?: ReactNode;
}

export function SetButton({
  variant = 'default', size = 'md', icon, children, className = '', type = 'button', ...rest
}: SetButtonProps) {
  return (
    <button
      type={type}
      className={`set-btn set-btn--${variant} set-btn--${size} ${className}`.trim()}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ── SetIconButton ───────────────────────────────────────── */

interface SetIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children' | 'title'> {
  /**
   * 접근성 이름. **선택 항목이 아니다** — 타입이 이걸 강제하는 것이
   * "아이콘 전용 버튼에 이름이 없다"(§1.6)를 구조적으로 막는 방법이다.
   */
  label: string;
  icon: ReactNode;
  variant?: 'default' | 'danger';
  size?: 'md' | 'sm';
}

export function SetIconButton({
  label, icon, variant = 'default', size = 'md', className = '', type = 'button', ...rest
}: SetIconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`set-icon-btn set-icon-btn--${variant} set-icon-btn--${size} ${className}`.trim()}
      {...rest}
    >
      {icon}
    </button>
  );
}

/* ── SetCard ─────────────────────────────────────────────── */

interface SetCardProps {
  title?: ReactNode;
  /** 제목 줄 오른쪽 보조 표기 — 건수·단위 같은 것 */
  meta?: ReactNode;
  /** 제목 왼쪽 분류 표시. 색은 호출부가 인라인으로 준다 */
  marker?: ReactNode;
  /**
   * 여백과 제목을 한 단계 줄인다. 카드를 가로로 여러 개 늘어놓아
   * 폭이 빠듯한 곳에서 쓴다 — 출동대 생성칸이 그렇다.
   */
  dense?: boolean;
  children: ReactNode;
  className?: string;
}

export function SetCard({ title, meta, marker, dense, children, className = '' }: SetCardProps) {
  return (
    <section className={`set-card ${dense ? 'set-card--dense' : ''} ${className}`.trim()}>
      {(title || meta) && (
        <header className="set-card__head">
          {marker}
          {title && <h4 className="set-card__title">{title}</h4>}
          {meta && <span className="set-card__meta">{meta}</span>}
        </header>
      )}
      <div className="set-card__body">{children}</div>
    </section>
  );
}

/* ── SetField ────────────────────────────────────────────── */

interface SetFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  /** 입력 뒤에 붙는 단위 표기 — "초", "층" 같은 것 */
  suffix?: ReactNode;
  hint?: ReactNode;
  /** 값이 있으면 필드가 invalid 로 그려지고 오류 문구가 입력 아래에 붙는다 */
  error?: string;
  required?: boolean;
  fieldClassName?: string;
}

export function SetField({
  label, suffix, hint, error, required, fieldClassName = '', className = '', ...rest
}: SetFieldProps) {
  // label ↔ input 연결이 마운트 내내 유지돼야 한다. 직접 카운터를 굴리면
  // 렌더 중 ref 를 만지게 되므로 React 가 주는 useId 를 쓴다.
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;

  return (
    <div className={`set-field ${error ? 'set-field--invalid' : ''} ${fieldClassName}`.trim()}>
      <label className="set-field__label" htmlFor={id}>
        {label}
        {required && <span className="set-field__req" aria-hidden="true">*</span>}
      </label>
      <div className="set-field__control">
        <input
          id={id}
          className={`set-field__input ${className}`.trim()}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          required={required}
          {...rest}
        />
        {suffix && <span className="set-field__suffix">{suffix}</span>}
      </div>
      {hint && <p className="set-field__hint" id={hintId}>{hint}</p>}
      {error && <p className="set-field__error" id={errId}>{error}</p>}
    </div>
  );
}

/* ── SetTable ────────────────────────────────────────────── */

interface SetTableProps {
  /** 머리글. 문자열 대신 노드를 받아 정렬 버튼 같은 것도 넣을 수 있게 둔다 */
  head: ReactNode[];
  children: ReactNode;
  className?: string;
}

export function SetTable({ head, children, className = '' }: SetTableProps) {
  return (
    <table className={`set-table ${className}`.trim()}>
      <thead>
        <tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/* ── SetEmpty ────────────────────────────────────────────── */

interface SetEmptyProps {
  /** 설명은 한 줄이다. 두 줄이 필요하면 화면 설계가 잘못된 것이다 */
  text: ReactNode;
  /** 즉시 실행 버튼 하나. 빈 상태에서 할 일이 없으면 생략한다 */
  action?: ReactNode;
}

export function SetEmpty({ text, action }: SetEmptyProps) {
  return (
    <div className="set-empty">
      <p className="set-empty__text">{text}</p>
      {action}
    </div>
  );
}

/* ── SetStatusChip ───────────────────────────────────────── */
//
// 저장·반영 상태를 한눈에 보여준다(§7.1 F-3). "isDirty" 를 최우선으로 본다 —
// 저장 안 된 변경이 있으면 그게 이미 반영됐는지는 부차적인 정보다.

export type SaveStatus = 'dirty' | 'saved' | 'applied';

export function resolveSaveStatus(isDirty: boolean, isApplied: boolean): SaveStatus {
  if (isDirty) return 'dirty';
  if (isApplied) return 'applied';
  return 'saved';
}

interface SetStatusChipProps {
  status: SaveStatus;
  /** 'applied' 일 때만 쓰인다 — 반영 시각 HH:MM */
  appliedAtLabel?: string;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  dirty: '미저장 변경',
  saved: '저장됨 · 훈련 미반영',
  applied: '훈련에 반영됨',
};

export function SetStatusChip({ status, appliedAtLabel }: SetStatusChipProps) {
  return (
    <span className={`set-status-chip set-status-chip--${status}`}>
      {status === 'applied'
        ? <IconCheck size={13} />
        : <span className="set-status-chip__dot" aria-hidden="true" />}
      {STATUS_TEXT[status]}
      {status === 'applied' && appliedAtLabel ? ` ${appliedAtLabel}` : ''}
    </span>
  );
}

/* ── SetMenu ─────────────────────────────────────────────── */

interface SetMenuProps {
  label: string;
  children: (close: () => void) => ReactNode;
}

/**
 * ⋯ 오버플로 메뉴. 자주 쓰지 않는 동작과 파괴적 동작을 여기 넣어
 * 상단 바의 오조작 경로를 줄인다(§7.4 · Q-3).
 */
export function SetMenu({ label, children }: SetMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="set-menu" ref={rootRef}>
      <SetIconButton
        label={label}
        icon={<IconMore />}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(o => !o)}
      />
      {open && (
        <div className="set-menu__pop" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

interface SetMenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  danger?: boolean;
}

export function SetMenuItem({ icon, danger, children, className = '', type = 'button', ...rest }: SetMenuItemProps) {
  return (
    <button
      type={type}
      role="menuitem"
      className={`set-menu__item ${danger ? 'set-menu__item--danger' : ''} ${className}`.trim()}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export function SetMenuSeparator() {
  return <div className="set-menu__sep" role="separator" />;
}

/* ── SetToast ────────────────────────────────────────────── */
//
// 삭제 되돌리기 전용(§7.4 F-4). role="status" 로 스크린리더가 조용히 읽게 하고,
// 포커스는 뺏지 않는다 — 삭제 흐름이 계속 이어질 수 있어야 한다.

interface SetToastProps {
  text: string;
  actionLabel: string;
  onAction: () => void;
}

export function SetToast({ text, actionLabel, onAction }: SetToastProps) {
  return (
    <div className="set-toast" role="status">
      <span className="set-toast__text">{text}</span>
      <button type="button" className="set-toast__action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

/* 아이콘 재수출 — `export *` 는 react-refresh 가 검증하지 못해 명시한다 */
export {
  IconSave,
  IconList,
  IconChevronDown,
  IconChevronUp,
  IconMore,
  IconExport,
  IconImport,
  IconPlus,
  IconMinus,
  IconClose,
  IconTrash,
  IconEdit,
  IconCheck,
  IconReset,
  IconWarn,
} from './icons';
