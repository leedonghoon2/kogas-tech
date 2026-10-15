import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { errMsg, supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { ROLE_LABEL } from '../lib/types';

export default function Profile() {
  const { profile, refreshProfile, recovery } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!profile) return null;

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), department: department.trim() })
      .eq('id', profile.id);
    setBusy(false);
    if (error) return toast(errMsg(error), 'error');
    await refreshProfile();
    toast('내 정보가 저장되었습니다.');
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.');
    if (password !== password2) return setError('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errMsg(error));
    setPassword('');
    setPassword2('');
    toast('비밀번호가 변경되었습니다.');
  };

  return (
    <div className="page narrow">
      <h1>내 정보</h1>

      {recovery && <p className="alert alert-info">새 비밀번호를 아래에서 설정하세요.</p>}

      <section className="card">
        <h2>기본 정보</h2>
        <form onSubmit={saveProfile} className="stack">
          <div className="kv">
            <span>이메일</span>
            <span>{profile.email}</span>
          </div>
          <div className="kv">
            <span>권한</span>
            <span className={`role role-${profile.role}`}>{ROLE_LABEL[profile.role]}</span>
          </div>
          <label>
            이름
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </label>
          <label>
            부서
            <input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </label>
          <p className="muted small">이름과 부서는 불출 등록 시 사용자·사용부서 기본값으로 입력됩니다.</p>
          <div>
            <button className="btn btn-primary" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>비밀번호 변경</h2>
        <form onSubmit={changePassword} className="stack">
          <label>
            새 비밀번호
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            새 비밀번호 확인
            <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="alert alert-error">{error}</p>}
          <div>
            <button className="btn btn-primary" disabled={busy}>
              비밀번호 변경
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
