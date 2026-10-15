import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdjustStockModal from '../components/AdjustStockModal';
import CancelTxModal from '../components/CancelTxModal';
import HazardBadge from '../components/HazardBadge';
import ItemFormModal from '../components/ItemFormModal';
import { useAuth } from '../lib/auth';
import { errMsg, supabase } from '../lib/supabase';
import { fmtDateTime, fmtMultiple, fmtQty } from '../lib/format';
import { useToast } from '../lib/toast';
import { TX_LABEL, canCancel, designatedMultiple, isLowStock, type Item, type Tx } from '../lib/types';

const PAGE = 100;

export default function ItemDetail() {
  const { id } = useParams();
  const { isAdmin, session } = useAuth();
  const toast = useToast();
  const [item, setItem] = useState<Item | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'edit' | 'adjust' | null>(null);
  const [cancelTx, setCancelTx] = useState<Tx | null>(null);

  const load = useCallback(async () => {
    const itemId = Number(id);
    const [itemRes, txRes] = await Promise.all([
      supabase.from('items').select('*').eq('id', itemId).maybeSingle(),
      supabase.from('transactions').select('*').eq('item_id', itemId).order('id', { ascending: false }).limit(PAGE),
    ]);
    if (itemRes.error || txRes.error) return setError(errMsg(itemRes.error ?? txRes.error));
    if (!itemRes.data) return setError('품목을 찾을 수 없습니다.');
    setItem(itemRes.data as Item);
    setTxs((txRes.data as Tx[]) ?? []);
    setHasMore((txRes.data?.length ?? 0) === PAGE);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    const last = txs[txs.length - 1];
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('item_id', Number(id))
      .lt('id', last.id)
      .order('id', { ascending: false })
      .limit(PAGE);
    setTxs((cur) => [...cur, ...((data as Tx[]) ?? [])]);
    setHasMore((data?.length ?? 0) === PAGE);
  };

  const toggleActive = async () => {
    if (!item) return;
    const next = !item.is_active;
    if (!next && !confirm(`'${item.name}' 품목을 사용중지할까요?\n사용중지된 품목은 입고·불출할 수 없습니다.`)) return;
    const { error } = await supabase.from('items').update({ is_active: next }).eq('id', item.id);
    if (error) return toast(errMsg(error), 'error');
    toast(next ? '품목을 다시 사용합니다.' : '품목을 사용중지했습니다.');
    load();
  };

  if (error) return <div className="page"><p className="alert alert-error">{error}</p></div>;
  if (!item) return <div className="page"><p className="muted">불러오는 중…</p></div>;

  const low = isLowStock(item);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/items" className="small">
            ← 재고 현황
          </Link>
          <h1>
            {item.name} {!item.is_active && <span className="badge badge-muted">사용중지</span>}
          </h1>
        </div>
        <div className="row">
          {item.is_active && (
            <>
              <Link to={`/issue?item=${item.id}`} className="btn btn-danger-soft">
                불출
              </Link>
              <Link to={`/receive?item=${item.id}`} className="btn btn-success-soft">
                입고
              </Link>
            </>
          )}
          {isAdmin && (
            <>
              <button className="btn" onClick={() => setModal('edit')}>
                정보 수정
              </button>
              <button className="btn" onClick={() => setModal('adjust')}>
                재고조정
              </button>
              <button className="btn btn-ghost" onClick={toggleActive}>
                {item.is_active ? '사용중지' : '다시 사용'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="stats">
        <div className={`stat ${low ? 'stat-danger' : ''}`}>
          <span>현재 재고</span>
          <strong>
            {fmtQty(item.current_stock)} <small>{item.unit}</small>
          </strong>
          {low && <em>안전재고 이하</em>}
        </div>
        <div className="stat">
          <span>안전재고</span>
          <strong>
            {fmtQty(item.safety_stock)} <small>{item.unit}</small>
          </strong>
        </div>
        <div className="stat">
          <span>지정수량</span>
          <strong>
            {item.designated_qty ? fmtQty(item.designated_qty) : '-'} <small>{item.designated_qty ? item.unit : ''}</small>
          </strong>
        </div>
        <div className="stat">
          <span>지정수량 배수</span>
          <strong>{fmtMultiple(designatedMultiple(item))}</strong>
        </div>
      </div>

      <section className="card">
        <dl className="info-grid">
          <dt>품목코드</dt>
          <dd>{item.code || '-'}</dd>
          <dt>위험물 류별</dt>
          <dd>
            <HazardBadge value={item.hazard_class} name={item.hazard_name} />
          </dd>
          <dt>CAS 번호</dt>
          <dd>{item.cas_no || '-'}</dd>
          <dt>UN 번호</dt>
          <dd>{item.un_no || '-'}</dd>
          <dt>규격/용기</dt>
          <dd>{item.spec || '-'}</dd>
          <dt>보관위치</dt>
          <dd>{item.location || '-'}</dd>
          <dt>비고</dt>
          <dd className="pre">{item.note || '-'}</dd>
          <dt>최종 수정</dt>
          <dd>{fmtDateTime(item.updated_at)}</dd>
        </dl>
      </section>

      <section className="card table-wrap">
        <h2>수불 이력</h2>
        <table className="table">
          <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th className="num">입고</th>
              <th className="num">불출</th>
              <th className="num">재고</th>
              <th>부서 / 입고처</th>
              <th>사용자</th>
              <th>목적 · 사유 · 비고</th>
              <th>기록자</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 && (
              <tr>
                <td colSpan={10} className="muted center">
                  기록이 없습니다.
                </td>
              </tr>
            )}
            {txs.map((t) => (
              <tr key={t.id} className={t.canceled ? 'canceled' : ''}>
                <td title={`등록: ${fmtDateTime(t.created_at)}`}>{t.tx_date}</td>
                <td>
                  <span className={`badge tx-${t.tx_type}`}>{TX_LABEL[t.tx_type]}</span>
                  {t.canceled && <span className="badge badge-muted">취소됨</span>}
                </td>
                <td className="num text-success">{Number(t.delta) > 0 ? fmtQty(t.delta) : ''}</td>
                <td className="num text-danger">{Number(t.delta) < 0 ? fmtQty(-t.delta) : ''}</td>
                <td className="num strong">{fmtQty(t.balance_after)}</td>
                <td>{t.tx_type === 'IN' ? t.supplier : t.department}</td>
                <td>{t.receiver}</td>
                <td>
                  {[t.purpose, t.use_place, t.lot_no && `LOT ${t.lot_no}`, t.note].filter(Boolean).join(' · ')}
                </td>
                <td className="muted small">{t.created_by_name}</td>
                <td>
                  {canCancel(t, isAdmin, session?.user.id) && (
                    <button className="btn btn-sm btn-ghost" onClick={() => setCancelTx(t)}>
                      취소
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasMore && (
          <div className="center">
            <button className="btn" onClick={loadMore}>
              더 보기
            </button>
          </div>
        )}
      </section>

      {modal === 'edit' && (
        <ItemFormModal
          item={item}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {modal === 'adjust' && (
        <AdjustStockModal
          item={item}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            load();
          }}
        />
      )}
      {cancelTx && (
        <CancelTxModal
          tx={cancelTx}
          itemName={item.name}
          unit={item.unit}
          onClose={() => setCancelTx(null)}
          onDone={() => {
            setCancelTx(null);
            load();
          }}
        />
      )}
    </div>
  );
}
