import { demoMarket } from '../shared/demo';
import type { Currency, MarketResult } from '../shared/model';
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      ...init,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error(
      'No se recibió respuesta del servidor. Comprueba la conexión. Si estabas guardando, descarga el borrador y recarga para revisar si el cambio llegó a guardarse.',
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('El servidor devolvió una respuesta no válida. Intenta de nuevo.');
  }
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
