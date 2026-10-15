import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import HazardBadge from '../components/HazardBadge';
import { useItems } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { fmtDateTime, fmtMultiple, fmtQty, monthStartKST, todayKST } from '../lib/format';
import { HAZARD_CLASSES, TX_LABEL, designatedMultiple, isLowStock, type TxView } from '../lib/types';

export default function Dashboard() {
  const { items, loading } = useItems();
  const [recent, setRecent] = useState<TxView[]>([]);
  const [todayOut, setTodayOut] = useState<number | null>(null);
  const [monthOut, setMonthOut] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('transactions_view')
      .select('*')
      .order('id', { ascending: false })
      .limit(10)
      .then(({ data }) => setRecent((data as TxView[]) ?? []));
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tx_type', 'OUT')
      .eq('canceled', false)
      .eq('tx_date', todayKST())
      .then(({ count }) => setTodayOut(count ?? 0));
    supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('tx_type', 'OUT')
      .eq('canceled', false)
      .gte('tx_date', monthStartKST())
      .then(({ count }) => setMonthOut(count ?? 0));
  }, []);

  const low = useMemo(() => items.filter(isLowStock), [items]);
  const empty = useMemo(() => items.filter((i) => Number(i.current_stock) <= 0), [items]);

  const byClass = useMemo(
    () =>
      HAZARD_CLASSES.map((h) => {
        const list = items.filter((i) => i.hazard_class === h.value);
        const mult = list.reduce((s, i) => s + (designatedMultiple(i) ?? 0), 0);
        return { ...h, count: list.length, mult };
      }).filter((r) => r.count > 0),
    [items],
  );
  const totalMultiple = byClass.filter((r) => r.value !== '기타').reduce((s, r) => s + r.mult, 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1>📊 대시보드</h1>
        <div className="row">
          <Link to="/issue" className="btn btn-danger btn-lg">
            📤 불출 등록
          </Link>
          <Link to="/receive" className="btn btn-success btn-lg">
            📥 입고 등록
          </Link>
        </div>
      </div>

      <div className="stats">
        <Link to="/items" className="stat">
          <span>등록 품목</span>
          <strong>{loading ? '…' : items.length}</strong>
        </Link>
        <Link to="/items" className={`stat ${low.length ? 'stat-danger' : ''}`}>
          <span>안전재고 이하</span>
          <strong>{loading ? '…' : low.length}</strong>
        </Link>
        <div className={`stat ${empty.length ? 'stat-warn' : ''}`}>
          <span>재고 없음</span>
          <strong>{loading ? '…' : empty.length}</strong>
        </div>
        <Link to="/ledger" className="stat">
          <span>오늘 불출 / 이번 달</span>
          <strong>
            {todayOut ?? '…'} <small>/ {monthOut ?? '…'}건</small>
          </strong>
        </Link>
        <div className="stat" title="위험물(제1~6류) 품목별 '현재 재고 ÷ 지정수량'의 합계">
          <span>지정수량 배수 합계</span>
          <strong>{loading ? '…' : fmtMultiple(totalMultiple)}</strong>
        </div>
      </div>

      <div className="two-col">
        <section className="card table-wrap">
          <div className="card-head">
            <h2>⚠️ 재고 부족 품목</h2>
            <Link to="/items" className="small">
              전체 보기 →
            </Link>
          </div>
          {low.length === 0 ? (
            <p className="muted">안전재고 이하인 품목이 없습니다.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>품명</th>
                  <th>위치</th>
                  <th className="num">현재</th>
                  <th className="num">안전</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {low.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={`/items/${i.id}`}>{i.name}</Link>
                    </td>
                    <td>{i.location || '-'}</td>
                    <td className="num text-danger strong">
                      {fmtQty(i.current_stock)} {i.unit}
                    </td>
                    <td className="num muted">{fmtQty(i.safety_stock)}</td>
                    <td>
                      <Link to={`/receive?item=${i.id}`} className="btn btn-sm btn-success-soft">
                        입고
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card table-wrap">
          <h2>류별 현황</h2>
          {byClass.length === 0 ? (
            <p className="muted">등록된 품목이 없습니다.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>류별</th>
                  <th className="num">품목 수</th>
                  <th className="num">지정수량 배수</th>
                </tr>
              </thead>
              <tbody>
                {byClass.map((r) => (
                  <tr key={r.value}>
                    <td>
                      <HazardBadge value={r.value} /> <span className="muted small">{r.label.split(' ')[1]}</span>
                    </td>
                    <td className="num">{r.count}</td>
                    <td className="num">{r.value === '기타' ? '-' : fmtMultiple(r.mult)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted small">지정수량이 입력된 품목만 배수에 합산됩니다.</p>
        </section>
      </div>

      <section className="card table-wrap">
        <div className="card-head">
          <h2>최근 입출고</h2>
          <Link to="/ledger?tab=ALL" className="small">
            수불부 →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">기록이 없습니다.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr>
                <th>등록시각</th>
                <th>구분</th>
                <th>품명</th>
                <th className="num">수량</th>
                <th className="num">잔여</th>
                <th>부서 / 사용자</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => (
                <tr key={t.id} className={t.canceled ? 'canceled' : ''}>
                  <td className="small">{fmtDateTime(t.created_at)}</td>
                  <td>
                    <span className={`badge tx-${t.tx_type}`}>{TX_LABEL[t.tx_type]}</span>
                  </td>
                  <td>
                    <Link to={`/items/${t.item_id}`}>{t.item_name}</Link>
                  </td>
                  <td className={`num ${Number(t.delta) < 0 ? 'text-danger' : 'text-success'}`}>
                    {Number(t.delta) > 0 ? '+' : '−'}
                    {fmtQty(Math.abs(Number(t.delta)))} {t.item_unit}
                  </td>
                  <td className="num">{fmtQty(t.balance_after)}</td>
                  <td>{t.tx_type === 'IN' ? t.supplier : [t.department, t.receiver].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
