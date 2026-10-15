import { useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from '../lib/types';
import { fmtQty } from '../lib/format';

interface Props {
  items: Item[];
  value: Item | null;
  onChange: (item: Item | null) => void;
  autoFocus?: boolean;
}

/** 품명·코드·CAS·보관위치로 검색해서 품목을 고르는 입력창 */
export default function ItemPicker({ items, value, onChange, autoFocus }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) =>
          [i.name, i.code ?? '', i.cas_no, i.location, i.hazard_name].some((f) => f.toLowerCase().includes(q)),
        )
      : items;
    return list.slice(0, 50);
  }, [items, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const select = (item: Item) => {
    onChange(item);
    setQuery('');
    setOpen(false);
  };

  if (value) {
    return (
      <div className="picker-selected">
        <div>
          <strong>{value.name}</strong>
          {value.code && <span className="muted"> [{value.code}]</span>}
          {value.spec && <span className="muted"> · {value.spec}</span>}
          <div className="muted small">
            보관위치 {value.location || '-'} · 현재 재고{' '}
            <strong>
              {fmtQty(value.current_stock)} {value.unit}
            </strong>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)}>
          변경
        </button>
      </div>
    );
  }

  return (
    <div className="picker" ref={wrapRef}>
      <input
        type="search"
        placeholder="품명, 품목코드, CAS번호, 보관위치로 검색"
        value={query}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(c + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === 'Enter' && open && matches[cursor]) {
            e.preventDefault();
            select(matches[cursor]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && (
        <ul className="picker-list" role="listbox">
          {matches.length === 0 && <li className="picker-empty">검색 결과가 없습니다.</li>}
          {matches.map((i, idx) => (
            <li
              key={i.id}
              role="option"
              aria-selected={idx === cursor}
              className={idx === cursor ? 'active' : ''}
              onMouseEnter={() => setCursor(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(i);
              }}
            >
              <span>
                <strong>{i.name}</strong>
                {i.code && <span className="muted"> [{i.code}]</span>}
                {i.spec && <span className="muted"> · {i.spec}</span>}
                <span className="muted small"> · {i.location || '위치 미지정'}</span>
              </span>
              <span className={Number(i.current_stock) <= 0 ? 'text-danger' : ''}>
                {fmtQty(i.current_stock)} {i.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
