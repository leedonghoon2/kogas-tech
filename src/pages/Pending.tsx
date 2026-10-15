import { useState } from 'react';
import { useAuth } from '../lib/auth';

export default function Pending() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [checking, setChecking] = useState(false);

  return (
    <div className="auth-page">
      <div className="auth-card center">
        <span className="brand-mark big">⏳</span>
        <h1>관리자 승인 대기 중</h1>
        <p>
          <strong>{profile?.full_name || profile?.email}</strong>님의 가입 신청이 접수되었습니다.
          <br />
          관리자가 승인하면 재고 조회와 입고·불출을 할 수 있습니다.
        </p>
        <div className="row center">
          <button
            className="btn btn-primary"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              await refreshProfile();
              setChecking(false);
            }}
          >
            {checking ? '확인 중…' : '승인 여부 다시 확인'}
          </button>
          <button className="btn" onClick={signOut}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}
