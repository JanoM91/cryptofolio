import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, ArrowDownRight, Search, Inbox } from 'lucide-react';
import { DateTime } from 'luxon';
import type { Asset, Currency } from '../../shared/model';
export const money = (v: string | number | null | undefined, c: Currency = 'USD') =>
  v == null
    ? 'Sin datos'
    : new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: c,
        maximumFractionDigits: 2,
      }).format(Number(v));
export const number = (v: string | number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: 8 }).format(Number(v));
export const stamp = (v: string | undefined, zone: string) =>
  v
    ? DateTime.fromISO(v).setZone(zone).setLocale('es').toFormat('dd LLL yyyy · HH:mm')
    : 'Sin datos';
export const localDate = (iso: string, zone: string) =>
  DateTime.fromISO(iso).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm");
export const isoDate = (local: string, zone: string) => {
  const d = DateTime.fromISO(local, { zone });
  if (!d.isValid) throw new Error('Fecha o zona horaria inválida.');
  if (d.toFormat("yyyy-MM-dd'T'HH:mm") !== local.slice(0, 16))
    throw new Error('Esta hora local no existe debido al cambio de horario. Elige otra hora.');
  if (d.getPossibleOffsets().length > 1)
    throw new Error(
      'Esta hora local es ambigua por el cambio de horario. Elige otra hora o importa una fecha con desplazamiento UTC explícito.',
    );
  return d.toUTC().toISO()!;
};
export function Badge({ asset }: { asset: Asset }) {
  return (
    <span className={`coin coin-${asset.symbol.toLowerCase()}`}>
      {(
        { BTC: '₿', ETH: 'Ξ', SOL: '≋', BNB: '◇', USDC: '$', USD: '$', MXN: '$' } as Record<
          string,
          string
        >
      )[asset.symbol] || asset.symbol.slice(0, 1)}
    </span>
  );
}
export function Delta({
  value,
  suffix = '%',
}: {
  value: string | number | null | undefined;
  suffix?: string;
}) {
  if (value == null) return <span className="muted">Sin datos</span>;
  return (
    <span className={Number(value) >= 0 ? 'positive' : 'negative'}>
      {Number(value) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{' '}
      {Math.abs(Number(value)).toLocaleString('es-MX', { maximumFractionDigits: 2 })}
      {suffix}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose}>
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={30} />
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = 'Buscar activo…',
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
