// ─────────────────────────────────────────────
// 구조대상자 남녀 픽토그램 — 훈련모드 공용
//
// VictimCard 안에 있던 것을 꺼냈다. 구조 현황판(RescueBoard)이 같은 형상을
// 써야 하는데, 카드 파일에 두면 그 파일을 통째로 끌어와야 한다.
//
// 설정모드의 `settings/ui/PersonIcon` 과는 별개다 — 그쪽은 `--set-*` 토큰
// 스코프(.settings-page) 안에서만 색이 살아서, 훈련모드에서 쓰면 색이 죽는다.
//
// 색은 `currentColor` 를 따른다. 부모가 정하고 아이콘은 형상만 책임진다.
// ─────────────────────────────────────────────

export function MaleIcon({ className }: { className?: string }) {
  /* 픽토그램 — 머리 + 팔(직선) + 몸통 + 두 다리 */
  return (
    <svg
      className={className ?? 'victim-gender-icon victim-gender-icon--male'}
      viewBox="0 0 14 26"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="7" cy="3" r="2.8"/>
      {/* 왼팔 */}
      <rect x="2.6" y="7" width="1.9" height="7.5" rx="0.6"/>
      {/* 오른팔 */}
      <rect x="9.5" y="7" width="1.9" height="7.5" rx="0.6"/>
      {/* 몸통 */}
      <rect x="5" y="7" width="4" height="8.5" rx="0.4"/>
      {/* 왼다리 */}
      <rect x="5" y="15.5" width="1.8" height="10.5" rx="0.6"/>
      {/* 오른다리 */}
      <rect x="7.2" y="15.5" width="1.8" height="10.5" rx="0.6"/>
    </svg>
  );
}

export function FemaleIcon({ className }: { className?: string }) {
  /* 픽토그램 — 머리 + 팔(바깥 사선) + 상체 + A라인 치마 + 두 다리 */
  return (
    <svg
      className={className ?? 'victim-gender-icon victim-gender-icon--female'}
      viewBox="0 0 14 26"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="7" cy="3" r="2.8"/>
      {/* 왼팔 (바깥 사선) */}
      <polygon points="5.2,7 6.4,7 4,14 2.8,14"/>
      {/* 오른팔 (바깥 사선) */}
      <polygon points="7.6,7 8.8,7 11.2,14 10,14"/>
      {/* 상체 */}
      <rect x="5.2" y="7" width="3.6" height="5.5" rx="0.4"/>
      {/* A라인 치마 */}
      <polygon points="4.8,12.5 0.5,22.5 13.5,22.5 9.2,12.5"/>
      {/* 왼다리 */}
      <rect x="3.8" y="22.5" width="2.2" height="3.5" rx="0.6"/>
      {/* 오른다리 */}
      <rect x="8" y="22.5" width="2.2" height="3.5" rx="0.6"/>
    </svg>
  );
}
