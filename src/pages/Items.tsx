import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import HazardBadge from '../components/HazardBadge';
import ItemFormModal from '../components/ItemFormModal';
import { useAuth } from '../lib/auth';
import { useItems } from '../lib/hooks';
import { downloadCSV } from '../lib/csv';
import { fmtMultiple, fmtQty, todayKST } from '../lib/format';
import { HAZARD_CLASSES, designatedMultiple, isLowStock } from '../lib/types';

export default function Items() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showInactive, setShowInactive] = useState(false);
  const { items, loading, error, reload } = useItems(showInactive);
  const [q, setQ] = useState('');
  const [hz, setHz] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((i) => {
      if (hz && i.hazard_class !== hz) return false;
      if (lowOnly && !isLowStock(i)) return false;
      if (!s) return true;
      return [i.name, i.code ?? '', i.cas_no, i.un_no, i.location, i.hazard_name, i.spec].some((f) =>
        f.toLowerCase().includes(s),
      );
    });
  }, [items, q, hz, lowOnly]);

  const exportCSV = () => {
    downloadCSV(`재고현황_${todayKST()}.csv`, [
      ['품목코드', '품명', '위험물류별', '위험물품명', 'CAS번호', 'UN번호', '규격', '보관위치', '현재재고', '단위', '안전재고', '지정수량', '지정수량배수', '상태'],
      ...filtered.map((i) => [
        i.code,
        i.name,
        i.hazard_class,
        i.hazard_name,
        i.cas_no,
        i.un_no,
        i.spec,
        i.location,
        i.current_stock,
        i.unit,
        i.safety_stock,
        i.designated_qty,
        designatedMultiple(i)?.toFixed(2) ?? '',
        i.is_active ? (isLowStock(i) ? '재고부족' : '정상') : '사용중지',
      ]),
    ]);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>📦 재고 현황</h1>
        <div className="row">
          <button className="btn" onClick={exportCSV}>
            엑셀(CSV) 다운로드
          </button>
          {isAdmin && (
            <>
              <Link to="/import" className="btn">
                일괄등록
              </Link>
              <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                + 품목 등록
              </button>
            </>
          )}
        </div>
      </div>

      <div className="filters card">
        <input type="search" placeholder="품명, 코드, CAS, 위치 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={hz} onChange={(e) => setHz(e.target.value)}>
          <option value="">전체 류별</option>
          {HAZARD_CLASSES.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> 재고 부족만
        </label>
        <label className="check">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> 사용중지 포함
        </label>
        <span className="muted small push-right">{filtered.length}개 품목</span>
      </div>

      {error && <p className="alert alert-error">{error}</p>}

      <div className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>품명</th>
              <th>류별</th>
              <th>규격</th>
              <th>보관위치</th>
              <th className="num">현재재고</th>
              <th className="num">안전재고</th>
              <th className="num">지정수량 배수</th>
              <th className="actions">작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="muted center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="muted center">
                  {items.length === 0 ? '등록된 품목이 없습니다.' : '조건에 맞는 품목이 없습니다.'}
                </td>
              </tr>
            )}
            {filtered.map((i) => {
              const low = isLowStock(i);
              return (
                <tr key={i.id} className={`clickable ${!i.is_active ? 'inactive' : ''}`} onClick={() => navigate(`/items/${i.id}`)}>
                  <td>
                    <strong>{i.name}</strong>
                    {i.code && <div className="muted small">{i.code}</div>}
                  </td>
                  <td>
                    <HazardBadge value={i.hazard_class} />
                  </td>
                  <td>{i.spec || '-'}</td>
                  <td>{i.location || '-'}</td>
                  <td className={`num ${low ? 'text-danger strong' : ''}`}>
                    {fmtQty(i.current_stock)} {i.unit}
                    {low && <div className="small">부족</div>}
                  </td>
                  <td className="num muted">{Number(i.safety_stock) > 0 ? fmtQty(i.safety_stock) : '-'}</td>
                  <td className="num">{fmtMultiple(designatedMultiple(i))}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    {i.is_active ? (
                      <>
                        <Link to={`/issue?item=${i.id}`} className="btn btn-sm btn-danger-soft">
                          불출
                        </Link>
                        <Link to={`/receive?item=${i.id}`} className="btn btn-sm btn-success-soft">
                          입고
                        </Link>
                      </>
                    ) : (
                      <span className="badge badge-muted">사용중지</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ItemFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
