import { useState, type FormEvent } from 'react';
import Modal from './Modal';
import { errMsg, supabase } from '../lib/supabase';
import { HAZARD_CLASSES, UNITS, type HazardClass, type Item } from '../lib/types';
import { parseQty } from '../lib/format';
import { useToast } from '../lib/toast';

interface Props {
  item?: Item | null; // 없으면 신규 등록
  onClose: () => void;
  onSaved: (item: Item) => void;
}

export default function ItemFormModal({ item, onClose, onSaved }: Props) {
  const toast = useToast();
  const isNew = !item;
  const [f, setF] = useState({
    code: item?.code ?? '',
    name: item?.name ?? '',
    hazard_class: (item?.hazard_class ?? '제4류') as HazardClass,
    hazard_name: item?.hazard_name ?? '',
    cas_no: item?.cas_no ?? '',
    un_no: item?.un_no ?? '',
    spec: item?.spec ?? '',
    unit: item?.unit ?? 'L',
    designated_qty: item?.designated_qty != null ? String(item.designated_qty) : '',
    location: item?.location ?? '',
    safety_stock: item ? String(item.safety_stock) : '0',
    current_stock: '0',
    note: item?.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const designated = f.designated_qty.trim() === '' ? null : parseQty(f.designated_qty);
    const safety = f.safety_stock.trim() === '' ? 0 : parseQty(f.safety_stock);
    const initial = f.current_stock.trim() === '' ? 0 : parseQty(f.current_stock);
    if (!f.name.trim()) return setError('품명을 입력하세요.');
    if (!f.unit.trim()) return setError('단위를 입력하세요.');
    if (designated !== null && (!Number.isFinite(designated) || designated <= 0))
      return setError('지정수량은 0보다 큰 숫자여야 합니다.');
    if (!Number.isFinite(safety) || safety < 0) return setError('안전재고는 0 이상의 숫자여야 합니다.');
    if (isNew && (!Number.isFinite(initial) || initial < 0)) return setError('현재 재고는 0 이상의 숫자여야 합니다.');

    const payload = {
      code: f.code.trim() || null,
      name: f.name.trim(),
      hazard_class: f.hazard_class,
      hazard_name: f.hazard_name.trim(),
      cas_no: f.cas_no.trim(),
      un_no: f.un_no.trim(),
      spec: f.spec.trim(),
      unit: f.unit.trim(),
      designated_qty: designated,
      location: f.location.trim(),
      safety_stock: safety,
      note: f.note.trim(),
    };

    setSaving(true);
    const res = isNew
      ? await supabase
          .from('items')
          .insert({ ...payload, current_stock: initial })
          .select()
          .single()
      : await supabase.from('items').update(payload).eq('id', item.id).select().single();
    setSaving(false);

    if (res.error) return setError(errMsg(res.error));
    toast(isNew ? `품목이 등록되었습니다: ${payload.name}` : '품목 정보가 수정되었습니다.');
    onSaved(res.data as Item);
  };

  return (
    <Modal
      title={isNew ? '품목 등록' : '품목 정보 수정'}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </>
      }
    >
      <form id="item-form" className="form-grid" onSubmit={submit}>
        <label className="span-2">
          품명 *
          <input value={f.name} onChange={set('name')} required autoFocus placeholder="예: 톨루엔" />
        </label>
        <label>
          품목코드
          <input value={f.code} onChange={set('code')} placeholder="예: H-001 (선택)" />
        </label>
        <label>
          규격/용기
          <input value={f.spec} onChange={set('spec')} placeholder="예: 18L 캔, 200L 드럼" />
        </label>
        <label>
          위험물 류별 *
          <select value={f.hazard_class} onChange={set('hazard_class')}>
            {HAZARD_CLASSES.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          위험물 품명
          <input value={f.hazard_name} onChange={set('hazard_name')} placeholder="예: 제1석유류(비수용성)" />
        </label>
        <label>
          CAS 번호
          <input value={f.cas_no} onChange={set('cas_no')} placeholder="예: 108-88-3" />
        </label>
        <label>
          UN 번호
          <input value={f.un_no} onChange={set('un_no')} placeholder="예: UN1294" />
        </label>
        <label>
          단위 *
          <input value={f.unit} onChange={set('unit')} list="unit-list" required />
          <datalist id="unit-list">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label>
          지정수량 ({f.unit || '단위'})
          <input
            value={f.designated_qty}
            onChange={set('designated_qty')}
            inputMode="decimal"
            placeholder="예: 200 (위험물인 경우)"
          />
        </label>
        <label>
          보관위치
          <input value={f.location} onChange={set('location')} placeholder="예: 위험물창고 A-1" />
        </label>
        <label>
          안전재고 ({f.unit || '단위'})
          <input value={f.safety_stock} onChange={set('safety_stock')} inputMode="decimal" />
        </label>
        {isNew && (
          <label className="span-2 highlight-field">
            현재 재고 ({f.unit || '단위'}) — 기초재고로 기록됩니다
            <input value={f.current_stock} onChange={set('current_stock')} inputMode="decimal" />
          </label>
        )}
        <label className="span-2">
          비고
          <textarea value={f.note} onChange={set('note')} rows={2} />
        </label>
        {!isNew && (
          <p className="span-2 muted small">
            재고 수량은 여기서 수정할 수 없습니다. 입고·불출 또는 품목 상세의 「재고조정」을 이용하세요.
          </p>
        )}
        {error && <p className="span-2 alert alert-error">{error}</p>}
      </form>
    </Modal>
  );
}
