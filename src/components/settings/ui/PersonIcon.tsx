/**
 * 사람 아이콘 — 구조대상자 표시 전용.
 *
 * ui/icons.tsx 의 16px 스트로크 아이콘과 달리 **채움(fill)** 이다.
 * 개수로 인원을 세는 용도라 여러 개가 붙어 늘어설 때 실루엣이 또렷해야 하고,
 * 선 아이콘은 작게 여러 개 놓으면 서로 뭉개진다.
 */
export function PersonIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="4" r="2.6" />
      <path d="M8 7.6c-2.5 0-4.2 1.5-4.2 3.6v2.4a.8.8 0 0 0 .8.8h6.8a.8.8 0 0 0 .8-.8v-2.4c0-2.1-1.7-3.6-4.2-3.6Z" />
    </svg>
  );
}
