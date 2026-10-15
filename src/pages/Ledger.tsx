import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import CancelTxModal from '../components/CancelTxModal';
import { useAuth } from '../lib/auth';
import { downloadCSV } from '../lib/csv';
import { errMsg, fetchAll, supabase } from '../lib/supabase';
import { fmtDateTime, fmtQty, monthStartKST, todayKST } from '../lib/format';
import { useToast } from '../lib/toast';
import { TX_LABEL, canCancel, type TxView } from '../lib/types';

type Tab = 'OUT' | 'IN' | 'ALL';

const TABS: { key: Tab; label: string; title: string }[] = [
  { key: 'OUT', label: '불출대장', title: '위험물 불출대장' },
  { key: 'IN', label: '입고대장', title: '위험물 입고대장' },
  { key: 'ALL', label: '전체 수불부', title: '위험물 수불부' },
];

const PAGE_SIZE = 50;

interface Filters {
  from: string;
  to: string;
  item: string;
  person: string; // 불출: 부서/사용자, 입고: 입고처
  hideCanceled: boolean;
}

export default function Ledger() {
  const { isAdmin, session } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (['OUT', 'IN', 'ALL'].includes(params.get('tab') ?? '') ? params.get('tab') : 'OUT') as Tab;

  const [filters, setFilters] = useState<Filters>({
    from: monthStartKST(),
    to: todayKST(),
    item: '',
    person: '',
    hideCanceled: false,
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<TxView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printRows, setPrintRows] = useState<TxView[] | null>(null);
  const [cancelTx, setCancelTx] = useState<TxView | null>(null);

  const buildQuery = useCallback(
    (withCount: boolean) => {
      let q = supabase.from('transactions_view').select('*', withCount ? { count: 'exact' } : undefined);
      if (tab !== 'ALL') q = q.eq('tx_type', tab);
      if (applied.from) q = q.gte('tx_date', applied.from);
      if (applied.to) q = q.lte('tx_date', applied.to);
      if (applied.item.trim()) q = q.ilike('item_name', `%${applied.item.trim()}%`);
      const person = applied.person.trim();
      if (person) {
        if (tab === 'IN') {
          q = q.ilike('supplier', `%${person}%`);
        } else {
          // or() 구문의 구분 문자( , ( ) " \ )는 한 글자 와일드카드(_)로 바꿔 '(주)OO' 같은 이름도 검색되게 한다
          const p = person.replace(/[,()"\\]/g, '_');
          q = q.or(`department.ilike.%${p}%,receiver.ilike.%${p}%,supplier.ilike.%${p}%`);
        }
      }
      // 취소된 원거래와 그것을 되돌린 취소 기록을 함께 숨긴다
      if (applied.hideCanceled) q = q.eq('canceled', false).neq('tx_type', 'CANCEL');
      return q;
    },
    [tab, applied],
  );

  const reqId = useRef(0);
  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    // 등록 순서(id)로 정렬해야 날짜를 거슬러 입력한 기록이 있어도 잔여재고 열이 일관된다
    const { data, count, error } = await buildQuery(true)
      .order('id', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (id !== reqId.current) return; // 더 최근 조회가 있으면 무시
    setLoading(false);
    if (error) return toast(errMsg(error), 'error');
    setRows((data as TxView[]) ?? []);
    setTotal(count ?? 0);
  }, [buildQuery, page, toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => setPage(0), [tab, applied]);

  // 인쇄용 데이터가 준비되면 인쇄 창을 띄운다
  useEffect(() => {
    if (!printRows) return;
    const done = () => setPrintRows(null);
    window.addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      window.removeEventListener('afterprint', done);
    };
  }, [printRows]);

  const loadAllInOrder = async () =>
    fetchAll<TxView>((from, to) => buildQuery(false).order('id', { ascending: true }).range(from, to));

  const meta = TABS.find((t) => t.key === tab)!;
  const periodText = `${applied.from || '처음'} ~ ${applied.to || '현재'}`;

  const exportCSV = async () => {
    setBusy(true);
    try {
      const all = await loadAllInOrder();
      downloadCSV(`${meta.label}_${applied.from}_${applied.to}.csv`, [
        columns(tab).map((c) => c.label),
        ...all.map((r, idx) => columns(tab).map((c) => c.csv(r, idx))),
      ]);
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    setBusy(true);
    try {
      setPrintRows(await loadAllInOrder());
    } catch (e) {
      toast(errMsg(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const cols = columns(tab);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="page">
      <div className="page-head no-print">
        <h1>📒 {meta.label}</h1>
        <div className="row">
          <button className="btn" onClick={exportCSV} disabled={busy}>
            엑셀(CSV) 다운로드
          </button>
          <button className="btn" onClick={print} disabled={busy}>
            🖨 인쇄
          </button>
        </div>
      </div>

      <div className="tabs no-print">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      <form
        className="filters card no-print"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filters);
        }}
      >
        <label className="inline">
          기간
          <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />~
          <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <input
          type="search"
          placeholder="품명"
          value={filters.item}
          onChange={(e) => setFilters({ ...filters, item: e.target.value })}
        />
        <input
          type="search"
          placeholder={tab === 'IN' ? '입고처' : '부서 / 사용자'}
          value={filters.person}
          onChange={(e) => setFilters({ ...filters, person: e.target.value })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={filters.hideCanceled}
            onChange={(e) => setFilters({ ...filters, hideCanceled: e.target.checked })}
          />
          취소건 제외
        </label>
        <button className="btn btn-primary">조회</button>
        <span className="muted small push-right">총 {total.toLocaleString()}건</span>
      </form>

      <div className="card table-wrap no-print">
        <table className="table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label} className={c.num ? 'num' : ''}>
                  {c.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={cols.length + 1} className="muted center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="muted center">
                  조회된 기록이 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r, idx) => (
                <tr key={r.id} className={r.canceled ? 'canceled' : ''}>
                  {cols.map((c) => (
                    <td key={c.label} className={c.num ? 'num' : ''}>
                      {c.cell(r, total - page * PAGE_SIZE - idx - 1)}
                    </td>
                  ))}
                  <td>
                    {canCancel(r, isAdmin, session?.user.id) && (
                      <button className="btn btn-sm btn-ghost" onClick={() => setCancelTx(r)}>
                        취소
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {pages > 1 && (
          <div className="pager">
            <button className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              ‹ 이전
            </button>
            <span>
              {page + 1} / {pages}
            </span>
            <button className="btn btn-sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
              다음 ›
            </button>
          </div>
        )}
      </div>

      {/* 인쇄 양식 */}
      <div className="print-only">
        <div className="print-head">
          <div>
            <h1>{meta.title}</h1>
            <p>
              기간: {periodText} · 출력: {fmtDateTime(new Date().toISOString())}
            </p>
          </div>
          <table className="approval">
            <tbody>
              <tr>
                <th rowSpan={2}>결재</th>
                <th>담당</th>
                <th>검토</th>
                <th>승인</th>
              </tr>
              <tr>
                <td />
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {!printRows && total > rows.length && (
          <p className="print-warning">
            ※ 화면에 표시된 {rows.length}건만 출력되었습니다 (전체 {total}건). 전체를 출력하려면 화면의 「인쇄」 버튼을
            사용하세요.
          </p>
        )}
        <table className="table print-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(printRows ?? [...rows].reverse()).map((r, idx) => (
              <tr key={r.id} className={r.canceled ? 'canceled' : ''}>
                {cols.map((c) => (
                  <td key={c.label} className={c.num ? 'num' : ''}>
                    {c.csv(r, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cancelTx && (
        <CancelTxModal
          tx={cancelTx}
          itemName={cancelTx.item_name}
          unit={cancelTx.item_unit}
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

interface Column {
  label: string;
  num?: boolean;
  cell: (r: TxView, seq: number) => ReactNode;
  csv: (r: TxView, idx: number) => string | number;
}

const itemCell = (r: TxView) => (
  <>
    <Link to={`/items/${r.item_id}`}>{r.item_name}</Link>
    {r.canceled && <span className="badge badge-muted">취소됨</span>}
  </>
);
const itemCsv = (r: TxView) => r.item_name + (r.canceled ? ' (취소됨)' : '');
const text = (k: keyof TxView): Pick<Column, 'cell' | 'csv'> => ({
  cell: (r) => String(r[k] ?? ''),
  csv: (r) => String(r[k] ?? ''),
});

function columns(tab: Tab): Column[] {
  const seq: Column = { label: '번호', cell: (_r, s) => s + 1, csv: (_r, i) => i + 1 };
  const date: Column = { label: tab === 'OUT' ? '불출일자' : tab === 'IN' ? '입고일자' : '일자', ...text('tx_date') };
  const item: Column = { label: '품명', cell: itemCell, csv: itemCsv };
  const spec: Column = { label: '규격', ...text('item_spec') };
  const unit: Column = { label: '단위', ...text('item_unit') };
  const balance: Column = {
    label: '잔여재고',
    num: true,
    cell: (r) => fmtQty(r.balance_after),
    csv: (r) => Number(r.balance_after),
  };
  const recorder: Column = { label: '기록자', ...text('created_by_name') };
  const note: Column = { label: '비고', ...text('note') };

  if (tab === 'OUT') {
    return [
      seq,
      date,
      item,
      spec,
      { label: '불출량', num: true, cell: (r) => <strong>{fmtQty(r.quantity)}</strong>, csv: (r) => Number(r.quantity) },
      unit,
      balance,
      { label: '사용부서', ...text('department') },
      { label: '사용자', ...text('receiver') },
      { label: '사용목적', ...text('purpose') },
      { label: '사용장소', ...text('use_place') },
      recorder,
      note,
    ];
  }
  if (tab === 'IN') {
    return [
      seq,
      date,
      item,
      spec,
      { label: '입고량', num: true, cell: (r) => <strong>{fmtQty(r.quantity)}</strong>, csv: (r) => Number(r.quantity) },
      unit,
      balance,
      { label: '입고처', ...text('supplier') },
      { label: '로트번호', ...text('lot_no') },
      recorder,
      note,
    ];
  }
  return [
    date,
    {
      label: '구분',
      cell: (r) => <span className={`badge tx-${r.tx_type}`}>{TX_LABEL[r.tx_type]}</span>,
      csv: (r) => TX_LABEL[r.tx_type],
    },
    item,
    {
      label: '입고',
      num: true,
      cell: (r) => (Number(r.delta) > 0 ? <span className="text-success">{fmtQty(r.delta)}</span> : ''),
      csv: (r) => (Number(r.delta) > 0 ? Number(r.delta) : ''),
    },
    {
      label: '불출',
      num: true,
      cell: (r) => (Number(r.delta) < 0 ? <span className="text-danger">{fmtQty(-r.delta)}</span> : ''),
      csv: (r) => (Number(r.delta) < 0 ? -Number(r.delta) : ''),
    },
    unit,
    balance,
    {
      label: '부서 / 입고처',
      cell: (r) => (r.tx_type === 'IN' ? r.supplier : r.department),
      csv: (r) => (r.tx_type === 'IN' ? r.supplier : r.department),
    },
    { label: '사용자', ...text('receiver') },
    {
      label: '목적 · 사유',
      cell: (r) => [r.purpose, r.note].filter(Boolean).join(' · '),
      csv: (r) => [r.purpose, r.note].filter(Boolean).join(' · '),
    },
    recorder,
  ];
}
