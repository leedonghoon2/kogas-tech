import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import ItemPicker from '../components/ItemPicker';
import { useAuth } from '../lib/auth';
import { useIssueSuggestions, useItems } from '../lib/hooks';
import { errMsg, supabase } from '../lib/supabase';
import { fmtQty, parseQty, round3, todayKST } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Item, Tx, TxView } from '../lib/types';

export default function Issue() {
  const { profile } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const { items, loading, reload } = useItems();
  const suggestions = useIssueSuggestions();

  const [item, setItem] = useState<Item | null>(null);
  const [txDate, setTxDate] = useState(todayKST());
  const [qty, setQty] = useState('');
  const [department, setDepartment] = useState(profile?.department ?? '');
  const [receiver, setReceiver] = useState(profile?.full_name ?? '');
  const [purpose, setPurpose] = useState('');
  const [usePlace, setUsePlace] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [todayList, setTodayList] = useState<TxView[]>([]);

  // ?item=ID 로 들어오면 해당 품목 선택
  useEffect(() => {
    const id = Number(params.get('item'));
    if (id && items.length) setItem((cur) => cur ?? items.find((i) => i.id === id) ?? null);
  }, [params, items]);

  const loadToday = useCallback(async () => {
    const { data } = await supabase
      .from('transactions_view')
      .select('*')
      .eq('tx_type', 'OUT')
      .eq('tx_date', todayKST())
      .order('id', { ascending: false })
      .limit(30);
    setTodayList((data as TxView[]) ?? []);
  }, []);

  useEffect(() => {
    loadToday();
  }, [loadToday]);

  const n = parseQty(qty);
  const remaining = item && Number.isFinite(n) ? round3(Number(item.current_stock) - n) : null;
  const insufficient = remaining !== null && remaining < 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!item) return setError('불출할 품목을 선택하세요.');
    if (!Number.isFinite(n) || n <= 0) return setError('불출 수량을 올바르게 입력하세요.');
    if (insufficient) return setError('재고가 부족합니다.');
    if (!department.trim()) return setError('사용부서를 입력하세요.');
    if (!receiver.trim()) return setError('사용자(수령자)를 입력하세요.');

    setBusy(true);
    const { data, error } = await supabase.rpc('issue_item', {
      p_item_id: item.id,
      p_quantity: n,
      p_tx_date: txDate,
      p_department: department,
      p_receiver: receiver,
      p_purpose: purpose,
      p_use_place: usePlace,
      p_note: note,
    });
    setBusy(false);
    if (error) {
      setError(errMsg(error));
      reload(); // 다른 사람이 먼저 불출했을 수 있으니 최신 재고로 갱신
      return;
    }
    const tx = data as Tx;
    toast(`불출 완료: ${item.name} ${fmtQty(tx.quantity)} ${item.unit} (잔여 ${fmtQty(tx.balance_after)} ${item.unit})`);
    setItem(null);
    setQty('');
    setPurpose('');
    setNote('');
    reload();
    loadToday();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>📤 불출 등록</h1>
        <Link to="/ledger" className="btn">
          불출대장 보기
        </Link>
      </div>

      <div className="two-col">
        <section className="card">
          <form onSubmit={submit} className="form-grid">
            <div className="span-2">
              <span className="label">불출 품목 *</span>
              {loading ? <p className="muted">품목을 불러오는 중…</p> : <ItemPicker items={items} value={item} onChange={setItem} autoFocus />}
            </div>
            <label>
              불출일자 *
              <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} max={todayKST()} required />
            </label>
            <label>
              불출 수량 {item ? `(${item.unit})` : ''} *
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" placeholder="0" required />
            </label>
            {item && remaining !== null && (
              <div className={`span-2 preview ${insufficient ? 'preview-danger' : ''}`}>
                현재 {fmtQty(item.current_stock)} {item.unit} → 불출 후{' '}
                <strong>
                  {fmtQty(remaining)} {item.unit}
                </strong>
                {insufficient && ' (재고 부족)'}
                {!insufficient && Number(item.safety_stock) > 0 && remaining <= Number(item.safety_stock) && (
                  <span> · 안전재고({fmtQty(item.safety_stock)}) 이하가 됩니다</span>
                )}
              </div>
            )}
            <label>
              사용부서 *
              <input value={department} onChange={(e) => setDepartment(e.target.value)} list="dept-list" required />
            </label>
            <label>
              사용자(수령자) *
              <input value={receiver} onChange={(e) => setReceiver(e.target.value)} list="receiver-list" required />
            </label>
            <label>
              사용목적 · 작업내용
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} list="purpose-list" placeholder="예: 배관 도장 작업" />
            </label>
            <label>
              사용장소
              <input value={usePlace} onChange={(e) => setUsePlace(e.target.value)} list="place-list" placeholder="예: 2공장 기화기동" />
            </label>
            <label className="span-2">
              비고
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && <p className="span-2 alert alert-error">{error}</p>}
            <div className="span-2">
              <button className="btn btn-primary btn-lg btn-block" disabled={busy || insufficient}>
                {busy ? '처리 중…' : '불출 등록 (재고 차감)'}
              </button>
            </div>
          </form>
          <Datalist id="dept-list" values={suggestions.departments} />
          <Datalist id="receiver-list" values={suggestions.receivers} />
          <Datalist id="purpose-list" values={suggestions.purposes} />
          <Datalist id="place-list" values={suggestions.places} />
        </section>

        <section className="card">
          <h2>오늘 불출 내역 ({todayKST()})</h2>
          {todayList.length === 0 ? (
            <p className="muted">오늘 등록된 불출이 없습니다.</p>
          ) : (
            <ul className="tx-list">
              {todayList.map((t) => (
                <li key={t.id} className={t.canceled ? 'canceled' : ''}>
                  <div>
                    <strong>{t.item_name}</strong>{' '}
                    <span className="text-danger">
                      −{fmtQty(t.quantity)} {t.item_unit}
                    </span>
                    {t.canceled && <span className="badge badge-muted">취소됨</span>}
                  </div>
                  <div className="muted small">
                    {t.department} · {t.receiver}
                    {t.purpose && ` · ${t.purpose}`} · 잔여 {fmtQty(t.balance_after)} {t.item_unit}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Datalist({ id, values }: { id: string; values: string[] }) {
  return (
    <datalist id={id}>
      {values.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}
