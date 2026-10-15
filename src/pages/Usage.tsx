import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import HazardBadge from '../components/HazardBadge';
import { downloadCSV } from '../lib/csv';
import { errMsg, supabase } from '../lib/supabase';
import { fmtQty, monthEndKST, monthStartKST, todayKST, yearStartKST } from '../lib/format';
import { useToast } from '../lib/toast';
import type { UsageByDepartment, UsageByItem } from '../lib/types';

const PRESETS = [
  { label: '이번 달', from: () => monthStartKST(), to: () => todayKST() },
  { label: '지난 달', from: () => monthStartKST(1), to: () => monthEndKST(1) },
  { label: '최근 3개월', from: () => monthStartKST(2), to: () => todayKST() },
  { label: '올해', from: () => yearStartKST(), to: () => todayKST() },
];

export default function Usage() {
  const toast = useToast();
  const [from, setFrom] = useState(monthStartKST());
  const [to, setTo] = useState(todayKST());
  const [byItem, setByItem] = useState<UsageByItem[]>([]);
  const [byDept, setByDept] = useState<UsageByDepartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'item' | 'dept'>('item');

  const load = useCallback(
    async (f: string, t: string) => {
      setLoading(true);
      const [a, b] = await Promise.all([
        supabase.rpc('usage_by_item', { p_from: f, p_to: t }),
        supabase.rpc('usage_by_department', { p_from: f, p_to: t }),
      ]);
      setLoading(false);
      if (a.error || b.error) return toast(errMsg(a.error ?? b.error), 'error');
      setByItem((a.data as UsageByItem[]) ?? []);
      setByDept((b.data as UsageByDepartment[]) ?? []);
    },
    [toast],
  );

  useEffect(() => {
    load(monthStartKST(), todayKST());
  }, [load]);

  const deptGroups = useMemo(() => {
    const m = new Map<string, UsageByDepartment[]>();
    byDept.forEach((r) => m.set(r.department, [...(m.get(r.department) ?? []), r]));
    return [...m.entries()];
  }, [byDept]);

  const totalOutCount = byItem.reduce((s, r) => s + Number(r.out_count), 0);
  const usedItems = byItem.filter((r) => Number(r.out_qty) > 0).length;

  const exportCSV = () => {
    if (view === 'item') {
      downloadCSV(`품목별사용량_${from}_${to}.csv`, [
        ['품목코드', '품명', '류별', '규격', '단위', '불출량', '불출건수', '입고량', '입고건수'],
        ...byItem.map((r) => [r.code, r.name, r.hazard_class, r.spec, r.unit, r.out_qty, r.out_count, r.in_qty, r.in_count]),
      ]);
    } else {
      downloadCSV(`부서별사용량_${from}_${to}.csv`, [
        ['사용부서', '품명', '단위', '불출량', '불출건수'],
        ...byDept.map((r) => [r.department, r.name, r.unit, r.out_qty, r.out_count]),
      ]);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>📈 사용량 통계</h1>
        <button className="btn" onClick={exportCSV}>
          엑셀(CSV) 다운로드
        </button>
      </div>

      <form
        className="filters card"
        onSubmit={(e) => {
          e.preventDefault();
          load(from, to);
        }}
      >
        <label className="inline">
          기간
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />~
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button className="btn btn-primary">조회</button>
        <div className="row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                const f = p.from();
                const t = p.to();
                setFrom(f);
                setTo(t);
                load(f, t);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </form>

      <div className="stats">
        <div className="stat">
          <span>불출 건수</span>
          <strong>{totalOutCount.toLocaleString()}</strong>
        </div>
        <div className="stat">
          <span>사용 품목 수</span>
          <strong>{usedItems}</strong>
        </div>
        <div className="stat">
          <span>사용 부서 수</span>
          <strong>{deptGroups.length}</strong>
        </div>
      </div>

      <div className="tabs">
        <button className={view === 'item' ? 'active' : ''} onClick={() => setView('item')}>
          품목별
        </button>
        <button className={view === 'dept' ? 'active' : ''} onClick={() => setView('dept')}>
          부서별
        </button>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <p className="muted center">불러오는 중…</p>
        ) : view === 'item' ? (
          <table className="table">
            <thead>
              <tr>
                <th>품명</th>
                <th>류별</th>
                <th>규격</th>
                <th className="num">불출량</th>
                <th className="num">불출 건수</th>
                <th className="num">입고량</th>
                <th className="num">입고 건수</th>
              </tr>
            </thead>
            <tbody>
              {byItem.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted center">
                    해당 기간에 입고·불출 기록이 없습니다.
                  </td>
                </tr>
              )}
              {byItem.map((r) => (
                <tr key={r.item_id}>
                  <td>
                    <Link to={`/items/${r.item_id}`}>{r.name}</Link>
                    {r.code && <div className="muted small">{r.code}</div>}
                  </td>
                  <td>
                    <HazardBadge value={r.hazard_class} />
                  </td>
                  <td>{r.spec || '-'}</td>
                  <td className="num strong text-danger">
                    {Number(r.out_qty) > 0 ? `${fmtQty(r.out_qty)} ${r.unit}` : '-'}
                  </td>
                  <td className="num">{r.out_count}</td>
                  <td className="num text-success">{Number(r.in_qty) > 0 ? `${fmtQty(r.in_qty)} ${r.unit}` : '-'}</td>
                  <td className="num">{r.in_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>사용부서</th>
                <th>품명</th>
                <th className="num">불출량</th>
                <th className="num">건수</th>
              </tr>
            </thead>
            <tbody>
              {deptGroups.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted center">
                    해당 기간에 불출 기록이 없습니다.
                  </td>
                </tr>
              )}
              {deptGroups.map(([dept, list]) =>
                list.map((r, idx) => (
                  <tr key={`${dept}-${r.item_id}`} className={idx === 0 ? 'group-start' : ''}>
                    {idx === 0 && (
                      <td rowSpan={list.length} className="strong">
                        {dept}
                      </td>
                    )}
                    <td>
                      <Link to={`/items/${r.item_id}`}>{r.name}</Link>
                    </td>
                    <td className="num strong">
                      {fmtQty(r.out_qty)} {r.unit}
                    </td>
                    <td className="num">{r.out_count}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted small">취소된 기록은 통계에서 제외됩니다.</p>
    </div>
  );
}
