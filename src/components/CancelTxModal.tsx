import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { errMsg, supabase } from '../lib/supabase';
import { TX_LABEL, type Tx, type TxView } from '../lib/types';
import { fmtQty } from '../lib/format';
import { useToast } from '../lib/toast';

interface Props {
  tx: Tx | TxView;
  itemName: string;
  unit: string;
  onClose: () => void;
  onDone: () => void;
}

/** 입고/불출 기록 취소 (재고를 되돌리고 취소 기록을 남김) */
export default function CancelTxModal({ tx, itemName, unit, onClose, onDone }: Props) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return setError('취소 사유를 입력하세요.');
    setBusy(true);
    const { error } = await supabase.rpc('cancel_transaction', { p_tx_id: tx.id, p_reason: reason.trim() });
    setBusy(false);
    if (error) return setError(errMsg(error));
    toast(`${TX_LABEL[tx.tx_type]} 기록이 취소되었습니다.`);
    onDone();
  };

  return (
    <Modal
      title={`${TX_LABEL[tx.tx_type]} 기록 취소`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
          <button type="submit" form="cancel-form" className="btn btn-danger" disabled={busy}>
            {busy ? '처리 중…' : '취소 처리'}
          </button>
        </>
      }
    >
      <form id="cancel-form" onSubmit={submit} className="stack">
        <p>
          <strong>{itemName}</strong> {TX_LABEL[tx.tx_type]} {fmtQty(tx.quantity)} {unit} ({tx.tx_date})
          <br />
          <span className="muted small">
            취소하면 재고가 {tx.tx_type === 'OUT' ? '다시 늘어나고' : '다시 줄어들고'}, 취소 내역이 수불부에
            기록됩니다.
          </span>
        </p>
        <label>
          취소 사유 *
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder="예: 수량 오기입" />
        </label>
        {error && <p className="alert alert-error">{error}</p>}
      </form>
    </Modal>
  );
}
