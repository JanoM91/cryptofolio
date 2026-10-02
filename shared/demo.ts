import { catalog, type Currency, type Portfolio, type MarketResult } from './model';
import Decimal from 'decimal.js';
export const DEMO_NOW = '2026-10-02T16:00:00.000Z';
export function demoPortfolio(): Portfolio {
  return {
    version: 1,
    name: 'Portafolio de demostración',
    baseCurrency: 'USD',
    timezone: 'America/Mexico_City',
    historyFrom: '2025-01-01T00:00:00.000Z',
    transactions: [],
    scenarios: [],
    positions: catalog.slice(0, 6).map((asset, i) => ({
      id: `demo-${i}`,
      asset,
      quantity: ['0.42', '4.8', '65', '3.5', '1200', '2500'][i],
      date: '2025-01-01T00:00:00.000Z',
      costCurrency: 'USD',
      unitCost: ['62000', '2200', '110', '480', '1', '1'][i],
    })),
  };
}
// Fictional, deterministic fixtures. Never used by the real market provider.
export function demoMarket(ids: string[], currency: Currency, at = DEMO_NOW): MarketResult {
  const days = (Date.parse(at) - Date.parse('2025-01-01T00:00:00Z')) / 86400000;
  const prices = [68420, 2840, 148.5, 592, 1, 1, 1 / 18.5];
  const quotes: MarketResult['quotes'] = {};
  ids.forEach((id) => {
    const i = catalog.findIndex((a) => a.id === id);
    if (i < 0) return;
    const factor = i < 4 ? 0.76 + (0.24 * days) / 639 + 0.035 * Math.sin(days / 17 + i) : 1;
    const previousFactor =
      i < 4 ? 0.76 + (0.24 * (days - 1)) / 639 + 0.035 * Math.sin((days - 1) / 17 + i) : 1;
    quotes[id] = {
      assetId: id,
      price: new Decimal(prices[i])
        .mul(factor)
        .mul(currency === 'MXN' ? 18.5 : 1)
        .toString(),
      currency,
      timestamp: at,
      provider: 'Demostración · precios ficticios',
      kind: 'intraday',
      change24h: (factor / previousFactor - 1) * 100,
      fxRate:
        id === 'cash:MXN'
          ? currency === 'MXN'
            ? '1'
            : String(1 / 18.5)
          : currency === 'MXN'
            ? '18.5'
            : '1',
      fxTimestamp: at,
    };
  });
  return {
    quotes,
    warnings: ['Datos ficticios de demostración. No representan cotizaciones reales.'],
  };
}
