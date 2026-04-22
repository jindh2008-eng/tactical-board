/**
 * 층 번호 관련 유틸리티
 * 양수 = 지상층, 음수 = 지하층, 'RF' = 옥상
 */

/** 층 번호를 표시 문자열로 변환 (숫자 전용) */
export function floorLabel(f: number): string {
  return f > 0 ? `${f}층` : `B${-f}층`;
}

/**
 * buildPlaceableFloors() 반환값 → 표시 문자열
 * 'RF' → "옥상", 숫자 → floorLabel()
 */
export function placeableFloorLabel(f: number | 'RF'): string {
  return f === 'RF' ? '옥상' : floorLabel(f);
}

/**
 * 층 목록 생성 (지상 높→낮, 지하 B1→BN 순)
 * @returns 층 번호 배열 (양수: 지상, 음수: 지하)
 */
export function buildFloorList(aboveGroundFloors: number, basementFloors: number): number[] {
  const floors: number[] = [];
  for (let f = aboveGroundFloors; f >= 1; f--) floors.push(f);
  for (let f = 1; f <= basementFloors; f++)    floors.push(-f);
  return floors;
}
