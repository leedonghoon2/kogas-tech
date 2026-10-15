import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ItemPicker from '../components/ItemPicker';
import ItemFormModal from '../components/ItemFormModal';
import { useAuth } from '../lib/auth';
import { useItems } from '../lib/hooks';
import { errMsg, supabase } from '../lib/supabase';
import { fmtQty, parseQty, round3, todayKST } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Item, Tx, TxView } from '../lib/types';

export default function Receive() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const preselected = useRef(false);
  const { items, loading, reload } = useItems();

  const [item, setItem] = useState<Item | null>(null);
  // null 이면 '오늘' — 서버가 등록 시점의 한국 날짜를 쓴다 (PC 시계가 틀려도 안전)
  const [txDate, setTxDate] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [recent, setRecent] = useState<TxView[]>([]);

  useEffect(() => {
    const id = Number(params.get('item'));
    if (preselected.current || !id || !items.length) return;
    preselected.current = true; // 처음 한 번만 (사용자가 '변경'으로 지운 뒤 다시 채우지 않도록)
    setItem((cur) => cur ?? items.find((i) => i.id === id) ?? null);
  }, [params, items]);

  // 목록이 새로고침되면(다른 사람의 입출고 반영) 선택한 품목도 최신 재고로 바꾼다
  useEffect(() => {
    setItem((cur) => (cur ? (items.find((i) => i.id === cur.id) ?? cur) : cur));
  }, [items]);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('transactions_view')
      .select('*')
      .eq('tx_type', 'IN')
      .order('id', { ascending: false })
      .limit(15);
    setRecent((data as TxView[]) ?? []);
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const n = parseQty(qty);
  const after = item && Number.isFinite(n) ? round3(Number(item.current_stock) + n) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!item) return setError('입고할 품목을 선택하세요.');
    if (!Number.isFinite(n) || n <= 0) return setError('입고 수량을 올바르게 입력하세요.');

    setBusy(true);
    const { data, error } = await supabase.rpc('receive_item', {
      p_item_id: item.id,
      p_quantity: n,
      p_tx_date: txDate,
      p_supplier: supplier,
      p_lot_no: lotNo,
      p_note: note,
    });
    setBusy(false);
    if (error) return setError(errMsg(error));
    const tx = data as Tx;
    toast(`입고 완료: ${item.name} ${fmtQty(tx.quantity)} ${item.unit} (재고 ${fmtQty(tx.balance_after)} ${item.unit})`);
    setItem(null);
    setQty('');
    setLotNo('');
    setNote('');
    reload();
    loadRecent();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>📥 입고 등록</h1>
        {isAdmin && (
          <button className="btn" onClick={() => setShowNew(true)}>
            + 신규 품목 등록
          </button>
        )}
      </div>

      <div className="two-col">
        <section className="card">
          <form onSubmit={submit} className="form-grid">
            <div className="span-2">
              <span className="label">입고 품목 *</span>
              {loading && items.length === 0 ? <p className="muted">품목을 불러오는 중…</p> : <ItemPicker items={items} value={item} onChange={setItem} autoFocus />}
              {!isAdmin && <p className="muted small">목록에 없는 품목은 관리자에게 품목 등록을 요청하세요.</p>}
            </div>
            <label>
              입고일자 *
              <input
                type="date"
                value={txDate ?? todayKST()}
                onChange={(e) => setTxDate(e.target.value || null)}
                min={todayKST(-30)}
                max={todayKST()}
                required
              />
            </label>
            <label>
              입고 수량 {item ? `(${item.unit})` : ''} *
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" required />
            </label>
            {item && after !== null && (
              <div className="span-2 preview">
                현재 {fmtQty(item.current_stock)} {item.unit} → 입고 후{' '}
                <strong>
                  {fmtQty(after)} {item.unit}
                </strong>
                {item.designated_qty ? (
                  <span> · 지정수량 {fmtQty(after / Number(item.designated_qty))}배</span>
                ) : null}
              </div>
            )}
            <label>
              입고처(공급업체)
              <input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </label>
            <label>
              로트번호
              <input value={lotNo} onChange={(e) => setLotNo(e.target.value)} />
            </label>
            <label className="span-2">
              비고
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 구매요청번호, 유효기한" />
            </label>
            {error && <p className="span-2 alert alert-error">{error}</p>}
            {txDate && txDate !== todayKST() && (
              <p className="span-2 alert alert-warn">오늘이 아닌 날짜({txDate})로 등록됩니다.</p>
            )}
            <div className="span-2">
              <button className="btn btn-success btn-lg btn-block" disabled={busy}>
                {busy ? '처리 중…' : '입고 등록 (재고 증가)'}
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>최근 입고 내역</h2>
            <Link to="/ledger?tab=IN" className="small">
              입고대장 →
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="muted">입고 기록이 없습니다.</p>
          ) : (
            <ul className="tx-list">
              {recent.map((t) => (
                <li key={t.id} className={t.canceled ? 'canceled' : ''}>
                  <div>
                    <strong>{t.item_name}</strong>{' '}
                    <span className="text-success">
                      +{fmtQty(t.quantity)} {t.item_unit}
                    </span>
                    {t.canceled && <span className="badge badge-muted">취소됨</span>}
                  </div>
                  <div className="muted small">
                    {t.tx_date}
                    {t.supplier && ` · ${t.supplier}`}
                    {t.lot_no && ` · LOT ${t.lot_no}`} · {t.created_by_name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {showNew && (
        <ItemFormModal
          onClose={() => setShowNew(false)}
          onSaved={(created) => {
            setShowNew(false);
            reload();
            setItem(created);
          }}
        />
      )}
    </div>
  );
}
