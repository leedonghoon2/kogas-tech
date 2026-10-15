import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  /** 비밀번호 재설정 메일 링크로 들어온 경우 */
  recovery: boolean;
  /** 만료되었거나 이미 사용한 메일 링크로 들어온 경우의 안내 문구 */
  authError: string;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** 메일 링크(가입 확인·비밀번호 재설정)가 만료됐거나 이미 사용된 경우 Supabase가 주소에 붙이는 오류를 읽고 주소를 정리한다 */
function readAuthRedirectError(): string {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search.slice(1));
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return '';
  window.history.replaceState(null, '', window.location.pathname);
  if (code === 'otp_expired') return '메일의 링크가 만료되었거나 이미 사용되었습니다. 다시 요청하세요.';
  return '메일 링크로 로그인하지 못했습니다. 다시 시도하세요.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // 어떤 사용자의 프로필을 불러왔는지 기록 (로그인 직후 이전 상태가 잠깐 보이는 것을 방지)
  const [profileFor, setProfileFor] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [authError, setAuthError] = useState(readAuthRedirectError);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      else if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') setRecovery(false);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setAuthError('');
      setSession(s);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileFor(null);
      return;
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile((data as Profile | null) ?? null);
    setProfileFor(userId);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRecovery(false);
  }, []);

  const value: AuthState = {
    session,
    profile,
    loading: !sessionReady || (Boolean(userId) && profileFor !== userId),
    isAdmin: profile?.role === 'admin',
    recovery,
    authError,
    refreshProfile: loadProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
