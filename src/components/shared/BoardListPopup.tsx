import ReactDOM from 'react-dom';
import type { TokenColor } from '../../types';
import { stagePortalTarget } from '../../utils/stagePortal';
import './BoardListPopup.css';

// ─────────────────────────────────────────────
// 판 위 목록 팝업 — 「묶인 배지」를 펴는 창
//
// 배지 하나가 여럿을 묶어 나타낼 때(송수 「진압 ④」·소속 「대 3」) 누르면
// 이 창이 그 속을 편다. 줄마다 이름과 단추 하나다.
//
// 「송수 해제」 팝업(WaterDisconnectPopup)의 여러 줄짜리다 — 색·테두리·그림자를
// 맞춰 두 창이 한 가족으로 읽히게 했다. 다른 점은 **줄에 마우스를 올리면
// 알려 준다**는 것뿐이다(`onHover`): 어느 대를 말하는지 판 위에서 밝혀야
// 목록을 읽는 뜻이 산다.
//
// 왜 배지마다 팝업을 따로 만들지 않는가 — 묶는 배지가 둘(송수·소속)이고
// 둘의 조작 문법이 같아야 하기 때문이다. 하나를 배우면 다른 하나도 안다.
// ─────────────────────────────────────────────

export interface BoardListItem {
  /** 줄을 구분하는 키이자 `onPick`·`onHover` 에 넘어가는 값 */
  id:     string;
  label:  string;
  /** 왼쪽 점 색 — 어느 종류인지 한눈에. 없으면 점을 그리지 않는다 */
  color?: TokenColor;
}

interface Props {
  /** 누른 지점 (clientX / clientY) */
  x: number;
  y: number;
  /** 목록 위 작은 머리말 — "송수 중" · "소속대" */
  title:       string;
  items:       BoardListItem[];
  /** 줄 오른쪽 단추 글자 — "해제" */
  actionLabel: string;
  onPick:      (id: string) => void;
  onHover?:    (id: string | null) => void;
  /**
   * 목록 **아래**에 놓는 단추 — 「단위지휘관 해제」.
   *
   * 줄의 단추가 「이 한 대를 뗀다」라면 이쪽은 「이 자리를 물린다」다. 대상이
   * 달라 자리를 갈랐다 — 줄에 섞어 두면 무엇이 무엇을 지우는지 흐려진다.
   */
  footerLabel?: string;
  onFooter?:    () => void;
  onClose:     () => void;
}

export function BoardListPopup({
  x, y, title, items, actionLabel, onPick, onHover, footerLabel, onFooter, onClose,
}: Props) {
  return ReactDOM.createPortal(
    <>
      <div className="blp-backdrop" onMouseDown={onClose} />
      <div className="blp" style={{ left: x, top: y }}>
        <div className="blp__title">{title}</div>
        {items.map(item => (
          <div
            key={item.id}
            className="blp__row"
            onMouseEnter={() => onHover?.(item.id)}
            onMouseLeave={() => onHover?.(null)}
          >
            {item.color && <span className="blp__dot" data-color={item.color} aria-hidden="true" />}
            <span className="blp__label">{item.label}</span>
            <button
              className="blp__btn"
              onMouseDown={e => { e.stopPropagation(); onPick(item.id); }}
            >{actionLabel}</button>
          </div>
        ))}
        {footerLabel && onFooter && (
          <button
            className="blp__footer"
            onMouseDown={e => { e.stopPropagation(); onFooter(); }}
          >{footerLabel}</button>
        )}
      </div>
    </>,
    stagePortalTarget(),
  );
}
