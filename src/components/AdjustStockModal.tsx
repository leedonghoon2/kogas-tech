import { useState, type FormEvent } from 'react';
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
  const [value, setValue] = useState(String(item.current_stock));
  const [reason, setReason] = useState('재고 실사');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const n = parseQty(value);
  const diff = Number.isFinite(n) ? round3(n - Number(item.current_stock)) : NaN;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(n) || n < 0) return setError('0 이상의 숫자를 입력하세요.');
    if (!reason.trim()) return setError('조정 사유를 입력하세요.');
    setBusy(true);
    const { error } = await supabase.rpc('adjust_stock', {
      p_item_id: item.id,
      p_new_stock: n,
      p_reason: reason.trim(),
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
          <button type="submit" form="adjust-form" className="btn btn-primary" disabled={busy}>
            {busy ? '처리 중…' : '조정'}
          </button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={submit} className="stack">
        <p>
          <strong>{item.name}</strong> · 현재 전산 재고{' '}
          <strong>
            {fmtQty(item.current_stock)} {item.unit}
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
