import { useState, type FormEvent } from 'react';
import { errMsg, supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'reset';

export default function Login() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');
        if (!fullName.trim()) throw new Error('이름을 입력하세요.');
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim(), department: department.trim() },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setInfo('가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인하세요.');
          setMode('login');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/profile`,
        });
        if (error) throw error;
        setInfo('비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 설정하세요.');
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark big">⚠</span>
          <h1>위험물 창고 재고관리</h1>
          <p className="muted">입고 · 불출 · 불출대장 · 사용량 관리</p>
        </div>

        {mode !== 'reset' && (
          <div className="tabs">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
              로그인
            </button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>
              회원가입
            </button>
          </div>
        )}

        <form onSubmit={submit} className="stack">
          <label>
            이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
          {mode !== 'reset' && (
            <label>
              비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'signup' ? '8자 이상' : ''}
              />
            </label>
          )}
          {mode === 'signup' && (
            <>
              <label>
                이름
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </label>
              <label>
                부서
                <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="예: 설비팀" />
              </label>
              <p className="muted small">가입 후 관리자의 승인을 받아야 사용할 수 있습니다.</p>
            </>
          )}
          {error && <p className="alert alert-error">{error}</p>}
          {info && <p className="alert alert-info">{info}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : mode === 'signup' ? '가입하기' : '재설정 메일 보내기'}
          </button>
        </form>

        <div className="auth-foot">
          {mode === 'reset' ? (
            <button className="link" onClick={() => switchMode('login')}>
              ← 로그인으로 돌아가기
            </button>
          ) : (
            <button className="link" onClick={() => switchMode('reset')}>
              비밀번호를 잊으셨나요?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
