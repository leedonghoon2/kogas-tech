import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? 'http://localhost', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Supabase/PostgREST 오류에서 사용자에게 보여줄 메시지를 꺼낸다. */
export function errMsg(e: unknown): string {
  if (!e) return '알 수 없는 오류가 발생했습니다.';
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    const m = e.message;
    if (m.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (m.includes('Email not confirmed')) return '이메일 인증이 완료되지 않았습니다. 메일함을 확인하세요.';
    if (m.includes('User already registered')) return '이미 가입된 이메일입니다.';
    if (m.includes('duplicate key') && m.includes('items_code_key')) return '이미 사용 중인 품목코드입니다.';
    if (m.includes('permission denied') || m.includes('row-level security'))
      return '권한이 없습니다. 관리자에게 문의하세요.';
    if (m.includes('Failed to fetch')) return '서버에 연결할 수 없습니다. 네트워크를 확인하세요.';
    return m;
  }
  return String(e);
}

/** PostgREST 기본 최대 1000행 제한을 넘는 조회를 나눠서 모두 가져온다. */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  limit = 20000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < limit; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
  throw new Error(`조회 결과가 ${limit.toLocaleString()}건을 넘습니다. 기간을 나눠서 조회하세요.`);
}
