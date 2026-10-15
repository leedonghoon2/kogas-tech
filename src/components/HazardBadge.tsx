import type { HazardClass } from '../lib/types';

const CLASS_KEY: Record<HazardClass, string> = {
  제1류: 'h1',
  제2류: 'h2',
  제3류: 'h3',
  제4류: 'h4',
  제5류: 'h5',
  제6류: 'h6',
  기타: 'h0',
};

export default function HazardBadge({ value, name }: { value: HazardClass; name?: string }) {
  return (
    <span className={`badge hz-${CLASS_KEY[value] ?? 'h0'}`} title={name || value}>
      {value}
      {name ? ` · ${name}` : ''}
    </span>
  );
}
