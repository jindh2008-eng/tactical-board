import './MedicalPost.css';

/** 임시의료소 패널 */
export function MedicalPost() {
  return (
    <div className="panel medical-post">
      <div className="panel__header">임시의료소</div>
      <div className="medical-post__body">
        {/* 향후: 환자 집계, 환자 토큰 배치 영역 */}
        <span className="medical-post__placeholder">― 대기 중 ―</span>
      </div>
    </div>
  );
}
