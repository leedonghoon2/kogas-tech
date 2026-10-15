import { useEffect, useState, type FormEvent } from 'react';
import Modal from './Modal';
import { errMsg, supabase } from '../lib/supabase';
import type { Item } from '../lib/types';
import { fmtQty, parseQty, round3 } from '../lib/format';
import { useToast } from '../lib/toast';

interface Props {
  item: Item;
  onClose: () => void;
  onDone: () => void;
}

/** 재고 실사 결과를 반영하는 재고조정 (관리자) */
export default function AdjustStockModal({ item, onClose, onDone }: Props) {
  const toast = useToast();
  // 화면의 품목 정보가 오래됐을 수 있으므로 조정 창을 열 때 최신 재고를 다시 읽는다
  const [stock, setStock] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('재고 실사');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('items')
      .select('current_stock')
      .eq('id', item.id)
      .single()
      .then(({ data, error }) => {
        if (error) return setError(errMsg(error));
        const current = Number(data.current_stock);
        setStock(current);
        setValue((v) => (v === '' ? String(current) : v));
      });
  }, [item.id]);

  const n = parseQty(value);
  const diff = stock !== null && Number.isFinite(n) ? round3(n - stock) : NaN;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (stock === null) return;
    if (!Number.isFinite(n) || n < 0) return setError('0 이상의 숫자를 입력하세요.');
    if (!reason.trim()) return setError('조정 사유를 입력하세요.');
    setBusy(true);
    const { error } = await supabase.rpc('adjust_stock', {
      p_item_id: item.id,
      p_new_stock: n,
      p_reason: reason.trim(),
      p_expected_stock: stock,
    });
    setBusy(false);
    if (error) return setError(errMsg(error));
    toast(`재고가 ${fmtQty(n)} ${item.unit}(으)로 조정되었습니다.`);
    onDone();
  };

  return (
    <Modal
      title="재고조정"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
          <button type="submit" form="adjust-form" className="btn btn-primary" disabled={busy || stock === null}>
            {busy ? '처리 중…' : '조정'}
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="stack">
        <p>
          <strong>{item.name}</strong> · 현재 전산 재고{' '}
          <strong>
            {stock === null ? '확인 중…' : `${fmtQty(stock)} ${item.unit}`}
          </strong>
        </p>
        <label>
          실사 재고 ({item.unit}) *
          <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" autoFocus />
        </label>
        {Number.isFinite(diff) && diff !== 0 && (
          <p className={diff < 0 ? 'text-danger' : 'text-success'}>
            차이: {diff > 0 ? '+' : ''}
            {fmtQty(diff)} {item.unit}
          </p>
        )}
        <label>
          조정 사유 *
          <input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="alert alert-error">{error}</p>}
      </form>
    </Modal>
  );
}
