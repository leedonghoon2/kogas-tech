import { useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { downloadCSV, parseCSV, readTextFile } from '../lib/csv';
import { errMsg, fetchAll, supabase } from '../lib/supabase';
import { fmtQty, parseQty } from '../lib/format';
import { useToast } from '../lib/toast';
import type { HazardClass } from '../lib/types';

/** 양식 열 이름 → 필드. 비슷한 이름도 인식 */
const FIELDS = [
  { key: 'code', label: '품목코드', aliases: ['코드', '품번', '자재코드'] },
  { key: 'name', label: '품명', aliases: ['품목명', '물질명', '제품명', '자재명'], required: true },
  { key: 'hazard_class', label: '위험물류별', aliases: ['류별', '유별', '위험물유별', '구분'] },
  { key: 'hazard_name', label: '위험물품명', aliases: ['위험물 품명', '세부품명'] },
  { key: 'cas_no', label: 'CAS번호', aliases: ['CAS', 'CAS No', 'CASNO'] },
  { key: 'un_no', label: 'UN번호', aliases: ['UN', 'UN No', 'UNNO'] },
  { key: 'spec', label: '규격', aliases: ['용기', '규격/용기', '용량'] },
  { key: 'unit', label: '단위', aliases: [], required: true },
  { key: 'designated_qty', label: '지정수량', aliases: [] },
  { key: 'location', label: '보관위치', aliases: ['위치', '보관장소', '저장위치'] },
  { key: 'safety_stock', label: '안전재고', aliases: ['최소재고', '적정재고'] },
  { key: 'current_stock', label: '현재재고', aliases: ['재고', '재고량', '수량', '현재고'] },
  { key: 'note', label: '비고', aliases: ['메모'] },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

interface Row {
  line: number;
  data: {
    code: string | null;
    name: string;
    hazard_class: HazardClass;
    hazard_name: string;
    cas_no: string;
    un_no: string;
    spec: string;
    unit: string;
    designated_qty: number | null;
    location: string;
    safety_stock: number;
    current_stock: number;
    note: string;
  };
  status: 'ok' | 'skip' | 'error';
  message: string;
}

const norm = (s: string) => s.replace(/[\s_()*.\-/]/g, '').toLowerCase();

function normalizeHazard(v: string): HazardClass | null {
  const t = v.replace(/\s/g, '');
  if (!t || t === '-' || /기타|비위험|일반|해당없음/.test(t)) return '기타';
  const m = t.match(/^제?([1-6])(류|유)?/);
  return m ? (`제${m[1]}류` as HazardClass) : null;
}

function parseTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  if (firstLine.includes('\t')) {
    // 엑셀에서 복사/붙여넣기 (탭 구분)
    return text
      .split(/\r?\n/)
      .map((l) => l.split('\t'))
      .filter((r) => r.some((c) => c.trim() !== ''));
  }
  return parseCSV(text);
}

export default function Import() {
  const toast = useToast();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parseError, setParseError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  const downloadTemplate = () =>
    downloadCSV('재고일괄등록_양식.csv', [
      FIELDS.map((f) => f.label),
      ['H-001', '톨루엔', '제4류', '제1석유류(비수용성)', '108-88-3', 'UN1294', '18L 캔', 'L', 200, '위험물창고 A-1', 36, 90, ''],
      ['H-002', '이소프로필알코올', '4류', '알코올류', '67-63-0', 'UN1219', '4L 병', 'L', 400, '위험물창고 A-2', 8, 20, ''],
      ['', '질산', '6류', '질산', '7697-37-2', 'UN2031', '500mL 병', 'kg', 300, '위험물창고 C-1', 0, 2.5, ''],
    ]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await readTextFile(file));
    setRows(null);
    e.target.value = '';
  };

  const analyze = async () => {
    setParseError('');
    setResult('');
    const table = parseTable(text);
    if (table.length < 2) return setParseError('머리글(열 이름) 행과 1개 이상의 데이터 행이 필요합니다.');

    const header = table[0].map(norm);
    const colIndex = {} as Record<FieldKey, number>;
    for (const f of FIELDS) {
      const names = [f.label, ...f.aliases].map(norm);
      colIndex[f.key] = header.findIndex((h) => names.includes(h));
    }
    const missing = FIELDS.filter((f) => 'required' in f && f.required && colIndex[f.key] < 0).map((f) => f.label);
    if (missing.length) return setParseError(`필수 열이 없습니다: ${missing.join(', ')} (양식을 내려받아 확인하세요)`);

    let existing: { code: string | null; name: string }[] = [];
    try {
      existing = await fetchAll((from, to) => supabase.from('items').select('code, name').range(from, to));
    } catch (e) {
      return setParseError(errMsg(e));
    }
    const existingCodes = new Set(existing.map((i) => i.code).filter(Boolean));
    const existingNames = new Set(existing.map((i) => i.name.trim()));
    const seenCodes = new Set<string>();

    const parsed: Row[] = table.slice(1).map((cells, idx) => {
      const get = (k: FieldKey) => (colIndex[k] >= 0 ? (cells[colIndex[k]] ?? '').trim() : '');
      const errors: string[] = [];
      const num = (k: FieldKey, label: string, allowNull: boolean): number | null => {
        const raw = get(k);
        if (raw === '') return allowNull ? null : 0;
        const n = parseQty(raw);
        if (!Number.isFinite(n) || n < 0) {
          errors.push(`${label} 값 오류(${raw})`);
          return 0;
        }
        return n;
      };

      const hz = normalizeHazard(get('hazard_class'));
      if (!hz) errors.push(`류별 값 오류(${get('hazard_class')})`);
      const designated = num('designated_qty', '지정수량', true);
      const data: Row['data'] = {
        code: get('code') || null,
        name: get('name'),
        hazard_class: hz ?? '기타',
        hazard_name: get('hazard_name'),
        cas_no: get('cas_no'),
        un_no: get('un_no'),
        spec: get('spec'),
        unit: get('unit'),
        designated_qty: designated === 0 ? null : designated,
        location: get('location'),
        safety_stock: num('safety_stock', '안전재고', false) ?? 0,
        current_stock: num('current_stock', '현재재고', false) ?? 0,
        note: get('note'),
      };
      if (!data.name) errors.push('품명 없음');
      if (!data.unit) errors.push('단위 없음');

      let status: Row['status'] = errors.length ? 'error' : 'ok';
      let message = errors.join(', ');
      if (status === 'ok' && data.code) {
        if (existingCodes.has(data.code)) {
          status = 'skip';
          message = '이미 등록된 품목코드 (건너뜀)';
        } else if (seenCodes.has(data.code)) {
          status = 'error';
          message = '파일 안에서 품목코드 중복';
        }
        seenCodes.add(data.code);
      }
      if (status === 'ok' && !data.code && existingNames.has(data.name)) {
        message = '같은 품명이 이미 있습니다 (규격이 다르면 그대로 등록)';
      }
      return { line: idx + 2, data, status, message };
    });
    setRows(parsed);
  };

  const counts = useMemo(
    () => ({
      ok: rows?.filter((r) => r.status === 'ok').length ?? 0,
      skip: rows?.filter((r) => r.status === 'skip').length ?? 0,
      error: rows?.filter((r) => r.status === 'error').length ?? 0,
    }),
    [rows],
  );

  const runImport = async () => {
    if (!rows) return;
    const targets = rows.filter((r) => r.status === 'ok').map((r) => r.data);
    if (!targets.length) return;
    if (!confirm(`${targets.length}개 품목을 등록할까요?\n현재재고는 기초재고로 기록됩니다.`)) return;
    setBusy(true);
    let done = 0;
    try {
      for (let i = 0; i < targets.length; i += 200) {
        const batch = targets.slice(i, i + 200);
        const { error } = await supabase.from('items').insert(batch);
        if (error) throw error;
        done += batch.length;
      }
      toast(`${done}개 품목이 등록되었습니다.`);
      setResult(`✅ ${done}개 품목 등록 완료${counts.skip ? `, ${counts.skip}개 건너뜀` : ''}${counts.error ? `, ${counts.error}개 오류 제외` : ''}`);
      setRows(null);
      setText('');
    } catch (e) {
      setResult(`⚠️ ${done}개 등록 후 오류가 발생했습니다: ${errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>🗂️ 재고 일괄등록</h1>
        <button className="btn" onClick={downloadTemplate}>
          양식 내려받기 (CSV)
        </button>
      </div>

      <section className="card stack">
        <p>
          기존 위험물 창고의 품목과 현재 재고를 한 번에 등록합니다. 엑셀에서 <b>머리글 행을 포함한 표를 복사해 아래에
          붙여넣거나</b>, CSV 파일을 선택하세요.
        </p>
        <ul className="small muted">
          <li>
            필수 열: <b>품명, 단위</b> / 선택 열: 품목코드, 위험물류별(예: 제4류, 4류), 위험물품명, CAS번호, UN번호, 규격,
            지정수량, 보관위치, 안전재고, 현재재고, 비고
          </li>
          <li>이미 등록된 품목코드는 건너뜁니다. 현재재고는 「기초재고」로 수불부에 기록됩니다.</li>
        </ul>
        <div className="row">
          <label className="btn">
            CSV 파일 선택
            <input type="file" accept=".csv,.txt,.tsv" onChange={onFile} hidden />
          </label>
          <button className="btn btn-primary" onClick={analyze} disabled={!text.trim()}>
            미리보기 · 검증
          </button>
        </div>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRows(null);
          }}
          placeholder={'품목코드\t품명\t위험물류별\t단위\t지정수량\t보관위치\t현재재고\nH-001\t톨루엔\t제4류\tL\t200\tA-1\t90'}
          className="mono"
        />
        {parseError && <p className="alert alert-error">{parseError}</p>}
        {result && <p className="alert alert-info">{result}</p>}
      </section>

      {rows && (
        <section className="card table-wrap">
          <div className="card-head">
            <h2>
              미리보기 — 등록 {counts.ok} · 건너뜀 {counts.skip} · 오류 {counts.error}
            </h2>
            <button className="btn btn-primary" onClick={runImport} disabled={busy || counts.ok === 0}>
              {busy ? '등록 중…' : `${counts.ok}개 품목 등록`}
            </button>
          </div>
          <table className="table compact">
            <thead>
              <tr>
                <th>행</th>
                <th>상태</th>
                <th>품목코드</th>
                <th>품명</th>
                <th>류별</th>
                <th>규격</th>
                <th>보관위치</th>
                <th className="num">현재재고</th>
                <th className="num">지정수량</th>
                <th>메시지</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.line} className={`import-${r.status}`}>
                  <td>{r.line}</td>
                  <td>{r.status === 'ok' ? '✅ 등록' : r.status === 'skip' ? '⏭ 건너뜀' : '❌ 오류'}</td>
                  <td>{r.data.code ?? '-'}</td>
                  <td>{r.data.name}</td>
                  <td>{r.data.hazard_class}</td>
                  <td>{r.data.spec}</td>
                  <td>{r.data.location}</td>
                  <td className="num">
                    {fmtQty(r.data.current_stock)} {r.data.unit}
                  </td>
                  <td className="num">{r.data.designated_qty ? fmtQty(r.data.designated_qty) : '-'}</td>
                  <td className="small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="muted small">
        등록 후 <Link to="/items">재고 현황</Link>에서 확인하세요.
      </p>
    </div>
  );
}
