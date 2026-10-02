import type { Asset, Currency, MarketResult, Quote } from '../shared/model';
export interface MarketProvider {
  search(query: string): Promise<Asset[]>;
  quotes(ids: string[], currency: Currency, at?: string): Promise<MarketResult>;
}
export class MarketError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
const cache = new Map<string, { until: number; data: unknown }>();
const pending = new Map<string, Promise<any>>();
let requests: number[] = [];
export async function cmc(path: string, params: Record<string, string>, ttl = 60000): Promise<any> {
  if (!process.env.CMC_API_KEY)
    throw new MarketError(
      'CoinMarketCap no está configurado. Añade CMC_API_KEY en el servidor o abre la demostración.',
      503,
    );
  const key = path + '?' + new URLSearchParams(params);
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.data;
  if (pending.has(key)) return pending.get(key);
  const work = (async () => {
    requests = requests.filter((t) => t > Date.now() - 60000);
    if (requests.length >= Number(process.env.CMC_REQUESTS_PER_MINUTE || 25))
      throw new MarketError('Límite local de consultas alcanzado. Espera un minuto.', 429);
    requests.push(Date.now());
    let res: Response;
    try {
      res = await fetch('https://pro-api.coinmarketcap.com' + key, {
        headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API_KEY! },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new MarketError('No se pudo conectar con CoinMarketCap. Intenta nuevamente.');
    }
    if (!res.ok)
      throw new MarketError(
        (
          {
            401: 'Clave de CoinMarketCap inválida.',
            403: 'Tu plan de CoinMarketCap no permite esta consulta o cobertura histórica.',
            429: 'CoinMarketCap alcanzó el límite de solicitudes. Intenta más tarde.',
            400: 'CoinMarketCap no admite esta consulta, moneda o fecha.',
          } as Record<number, string>
        )[res.status] || 'CoinMarketCap no está disponible.',
        res.status,
      );
    const body = (await res.json()) as any;
    // CMC v3 can serialize a successful error_code as "0" rather than 0.
    if (body.status?.error_code != null && Number(body.status.error_code) !== 0)
      throw new MarketError(
        'CoinMarketCap rechazó la consulta. Revisa plan, créditos y cobertura.',
      );
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, { until: Date.now() + ttl, data: body });
    return body;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}
function quoteCurrency(quote: any, currency: Currency) {
  return Array.isArray(quote) ? quote.find((q: any) => q.symbol === currency) : quote?.[currency];
}
export function normalizeQuotes(
  body: any,
  ids: string[],
  currency: Currency,
  at?: string,
): MarketResult {
  const data = body.data ?? body;
  const quotes: Record<string, Quote> = {};
  const warnings: string[] = [];
  for (const id of ids) {
    const numeric = id.replace('cmc:', '');
    const entry = Array.isArray(data)
      ? data.find((x: any) => String(x.id) === numeric)
      : (data[numeric] ?? (String(data.id) === numeric ? data : undefined));
    const candidates = at ? (entry?.quotes ?? []) : entry ? [entry] : [];
    const valid = candidates
      .map((item: any) => {
        const q = quoteCurrency(item.quote, currency);
        return {
          q,
          timestamp: q?.timestamp ?? q?.last_updated ?? item.timestamp ?? item.last_updated,
        };
      })
      .filter(
        (x: any) =>
          x.q?.price != null &&
          Number.isFinite(Number(x.q.price)) &&
          Number(x.q.price) >= 0 &&
          Number.isFinite(Date.parse(x.timestamp)) &&
          (!at || Date.parse(x.timestamp) <= Date.parse(at)),
      )
      .sort((a: any, b: any) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const item = valid[0];
    if (item)
      quotes[id] = {
        assetId: id,
        price: String(item.q.price),
        currency,
        timestamp: item.timestamp,
        provider: 'CoinMarketCap',
        kind: 'intraday',
        change24h: item.q.percent_change_24h ?? undefined,
      };
    else warnings.push(`${id}: sin datos anteriores o iguales a la fecha solicitada.`);
  }
  return { quotes, warnings };
}
export class CoinMarketCapProvider implements MarketProvider {
  async search(query: string) {
    if (/^\d+$/.test(query)) {
      const body = await cmc('/v2/cryptocurrency/info', { id: query }, 3600000);
      return Object.values(body.data ?? {}).map((a: any) => ({
        id: `cmc:${a.id}`,
        cmcId: a.id,
        name: a.name,
        symbol: a.symbol,
        class: 'crypto' as const,
      }));
    }
    const exact = /^[A-Z0-9$@-]{1,20}$/.test(query);
    const body = await cmc(
      '/v1/cryptocurrency/map',
      exact ? { symbol: query } : { limit: '5000', sort: 'cmc_rank' },
      3600000,
    );
    return (body.data ?? [])
      .filter((a: any) =>
        `${a.name} ${a.symbol} ${a.id}`.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(0, 30)
      .map((a: any) => ({
        id: `cmc:${a.id}`,
        cmcId: a.id,
        name: a.name,
        symbol: a.symbol,
        class: 'crypto' as const,
      }));
  }
  async quotes(ids: string[], currency: Currency, at?: string) {
    const crypto = ids.filter((id) => id.startsWith('cmc:'));
    const result: MarketResult = { quotes: {}, warnings: [] };
    if (crypto.length) {
      try {
        const params: Record<string, string> = {
          id: crypto.map((id) => id.slice(4)).join(','),
          convert: currency,
        };
        if (at) {
          params.time_start = new Date(Date.parse(at) - 86400000).toISOString();
          params.time_end = at;
          params.interval = Date.now() - Date.parse(at) > 28 * 86400000 ? 'daily' : 'hourly';
        }
        const body = await cmc(
          at ? '/v3/cryptocurrency/quotes/historical' : '/v3/cryptocurrency/quotes/latest',
          params,
          at ? 3600000 : 60000,
        );
        Object.assign(result, normalizeQuotes(body, crypto, currency, at));
        if (params.interval === 'daily')
          Object.values(result.quotes).forEach((q) => (q.kind = 'daily'));
      } catch (e) {
        result.warnings.push((e as Error).message);
      }
    }
    for (const id of ids.filter((x) => x.startsWith('cash:'))) {
      const from = id.slice(5);
      if (from === currency) {
        result.quotes[id] = {
          assetId: id,
          price: '1',
          currency,
          timestamp: at ?? new Date().toISOString(),
          provider: 'Identidad monetaria',
          kind: 'intraday',
          fxRate: '1',
        };
        continue;
      }
      try {
        const fiat = await cmc('/v1/fiat/map', {}, 86400000);
        const fiatId = fiat.data?.find((f: any) => f.symbol === from)?.id;
        if (!fiatId) throw new Error('Moneda no disponible en el mapa fiat del proveedor.');
        const params: Record<string, string> = {
          amount: '1',
          id: String(fiatId),
          convert: currency,
        };
        if (at) params.time = at;
        const body = await cmc('/v2/tools/price-conversion', params, at ? 3600000 : 60000);
        const data = Array.isArray(body.data) ? body.data[0] : body.data;
        const q = quoteCurrency(data?.quote, currency);
        const timestamp = q?.last_updated ?? data?.last_updated;
        if (
          q?.price == null ||
          !Number.isFinite(Number(q.price)) ||
          Number(q.price) <= 0 ||
          !Number.isFinite(Date.parse(timestamp)) ||
          (at &&
            (Date.parse(timestamp) > Date.parse(at) ||
              (data?.last_updated && Date.parse(data.last_updated) > Date.parse(at))))
        )
          throw new Error('Tipo de cambio sin datos anteriores a la fecha solicitada.');
        result.quotes[id] = {
          assetId: id,
          price: String(q.price),
          currency,
          timestamp,
          fxRate: String(q.price),
          fxTimestamp: timestamp,
          provider: 'CoinMarketCap · conversión fiat',
          kind: 'intraday',
        };
      } catch (e) {
        result.warnings.push(`${from}/${currency}: ${(e as Error).message}`);
      }
    }
    for (const id of ids.filter((x) => !x.startsWith('cmc:') && !x.startsWith('cash:')))
      result.warnings.push(`${id}: clase de activo sin proveedor configurado.`);
    return result;
  }
}
