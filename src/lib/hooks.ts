import { useCallback, useEffect, useState } from 'react';
import { errMsg, fetchAll, supabase } from './supabase';
import type { Item, TxView } from './types';

/** 품목 전체 목록 */
export function useItems(includeInactive = false) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAll<Item>((from, to) => {
        let q = supabase.from('items').select('*').order('name').order('id').range(from, to);
        if (!includeInactive) q = q.eq('is_active', true);
        return q;
      });
      setItems(rows);
      setError('');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, error, reload };
}

/** 최근 불출 기록에서 부서/사용자/목적/장소 입력 자동완성 후보를 만든다. */
export function useIssueSuggestions() {
  const [s, setS] = useState({ departments: [] as string[], receivers: [] as string[], places: [] as string[], purposes: [] as string[] });

  useEffect(() => {
    supabase
      .from('transactions')
      .select('department, receiver, use_place, purpose')
      .eq('tx_type', 'OUT')
      .order('id', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (!data) return;
        const uniq = (k: keyof Pick<TxView, 'department' | 'receiver' | 'use_place' | 'purpose'>) =>
          [...new Set(data.map((r) => (r as Record<string, string>)[k]).filter(Boolean))].slice(0, 50);
        setS({
          departments: uniq('department'),
          receivers: uniq('receiver'),
          places: uniq('use_place'),
          purposes: uniq('purpose'),
        });
      });
  }, []);

  return s;
}
