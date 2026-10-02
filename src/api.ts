import { demoMarket } from '../shared/demo';
import type { Currency, MarketResult } from '../shared/model';
export async function api<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la consulta.');
  return data;
}
export async function market(
  ids: string[],
  currency: Currency,
  demo: boolean,
  at?: string,
): Promise<MarketResult> {
  if (!ids.length) return { quotes: {}, warnings: [] };
  if (demo) return demoMarket(ids, currency, at);
  return api(
    `/api/quotes?${new URLSearchParams({ ids: ids.join(','), currency, ...(at ? { at } : {}) })}`,
  );
}
export function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
