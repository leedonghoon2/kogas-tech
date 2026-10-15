import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { errMsg, supabase } from '../lib/supabase';
import { fmtDateTime } from '../lib/format';
import { useToast } from '../lib/toast';
import { ROLE_LABEL, type Profile, type Role } from '../lib/types';

export default function Users() {
  const { profile: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setLoading(false);
    if (error) return toast(errMsg(error), 'error');
    // 승인 대기자를 맨 위로
    const rows = (data as Profile[]) ?? [];
    setUsers([...rows.filter((u) => u.role === 'pending'), ...rows.filter((u) => u.role !== 'pending')]);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const setRole = async (u: Profile, role: Role) => {
    if (role === 'admin' && !confirm(`${u.full_name || u.email}님에게 관리자 권한을 줄까요?`)) return;
    const { error } = await supabase.rpc('set_user_role', { p_user_id: u.id, p_role: role });
    if (error) return toast(errMsg(error), 'error');
    toast(`${u.full_name || u.email}: ${ROLE_LABEL[role]}(으)로 변경되었습니다.`);
    load();
  };

  const pendingCount = users.filter((u) => u.role === 'pending').length;

  return (
    <div className="page">
      <div className="page-head">
        <h1>👥 사용자 관리</h1>
      </div>
      {pendingCount > 0 && <p className="alert alert-info">승인 대기 중인 사용자가 {pendingCount}명 있습니다.</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>이름</th>
              <th>이메일</th>
              <th>부서</th>
              <th>가입일</th>
              <th>권한</th>
              <th className="actions">변경</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="muted center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="strong">{u.full_name || '-'}</td>
                <td>{u.email}</td>
                <td>{u.department || '-'}</td>
                <td className="small">{fmtDateTime(u.created_at)}</td>
                <td>
                  <span className={`role role-${u.role}`}>{ROLE_LABEL[u.role]}</span>
                </td>
                <td className="actions">
                  {u.id === me?.id ? (
                    <span className="muted small">본인</span>
                  ) : u.role === 'pending' ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={() => setRole(u, 'staff')}>
                        승인
                      </button>
                    </>
                  ) : (
                    <select value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
                      <option value="staff">사용자</option>
                      <option value="admin">관리자</option>
                      <option value="pending">승인 취소(차단)</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card small muted">
        <p>
          <b>관리자</b>: 품목 등록·수정, 재고조정, 모든 입고/불출 취소, 사용자 승인
          <br />
          <b>사용자</b>: 재고 조회, 입고·불출 등록, 본인이 24시간 이내 등록한 건 취소
          <br />
          <b>승인 대기</b>: 로그인만 가능하며 데이터에 접근할 수 없음
        </p>
        <p>계정을 완전히 삭제하려면 Supabase 대시보드 → Authentication → Users 에서 삭제하세요.</p>
      </div>
    </div>
  );
}
