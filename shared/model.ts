import { z } from 'zod';
import Decimal from 'decimal.js';
z.config(z.locales.es());
Decimal.set({ precision: 40 });
export function errorText(error: unknown): string {
  if (error instanceof z.ZodError)
    return [...new Set(error.issues.map((issue) => issue.message))].join(' ');
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

export const amount = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'Usa un número positivo, con hasta 18 decimales.')
  .refine(
    (v) => /^\d+(\.\d+)?$/.test(v) && new Decimal(v).lte('1e24'),
    'Cantidad inválida o demasiado grande',
  );
const greaterThanZero = (v: string) => /^\d+(\.\d+)?$/.test(v) && new Decimal(v).gt(0);
export const positive = amount.refine(greaterThanZero, 'Debe ser mayor que cero');
export const currencySchema = z.enum(['USD', 'MXN']);
export type Currency = z.infer<typeof currencySchema>;
export const dateSchema = z.iso
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) <= Date.now(), 'La fecha no puede ser futura')
  .transform((v) => new Date(v).toISOString());
export const assetSchema = z
  .object({
    id: z.string().max(80),
    name: z.string().min(1).max(100),
    symbol: z.string().min(1).max(20),
    class: z.enum(['crypto', 'cash', 'stock', 'etf']),
    cmcId: z.number().int().positive().optional(),
  })
  .refine((a) => a.class !== 'crypto' || a.id === `cmc:${a.cmcId}`, 'ID CMC inválido')
  .refine(
    (a) => a.class !== 'cash' || (a.id === `cash:${a.symbol}` && ['USD', 'MXN'].includes(a.symbol)),
    'Moneda inválida',
  );
export type Asset = z.infer<typeof assetSchema>;
export const positionSchema = z.object({
  id: z.string(),
  asset: assetSchema,
  quantity: amount,
  date: dateSchema,
  unitCost: amount.optional(),
  costCurrency: currencySchema,
});
export type Position = z.infer<typeof positionSchema>;
export const transactionSchema = z
  .object({
    id: z.string(),
    date: dateSchema,
    type: z.enum(['buy', 'sell', 'deposit', 'withdrawal', 'transfer']),
    asset: assetSchema,
    quantity: positive,
    price: amount,
    currency: currencySchema,
    fee: amount,
    notes: z.string().max(1000),
    direction: z.enum(['in', 'out']).default('in'),
  })
  .refine(
    (t) => !['buy', 'sell'].includes(t.type) || greaterThanZero(t.price),
    'Compra y venta requieren precio positivo',
  )
  .refine(
    (t) => t.asset.class !== 'cash' || !['buy', 'sell'].includes(t.type),
    'El efectivo usa depósito, retiro o transferencia',
  );
export type Transaction = z.infer<typeof transactionSchema>;
export const scenarioSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).max(100),
    date: dateSchema,
    end: dateSchema,
    trades: z.array(transactionSchema).max(100),
  })
  .refine((s) => s.end >= s.date, 'La fecha final debe ser posterior a la inicial')
  .refine(
    (s) => s.trades.every((t) => t.date === s.date && ['buy', 'sell'].includes(t.type)),
    'Operaciones incompatibles',
  );
export type Scenario = z.infer<typeof scenarioSchema>;
export const portfolioSchema = z
  .object({
    version: z.literal(1),
    name: z.string().max(100),
    baseCurrency: currencySchema,
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat('es', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Zona horaria inválida'),
    positions: z.array(positionSchema).max(100),
    transactions: z.array(transactionSchema).max(5000),
    scenarios: z.array(scenarioSchema).max(100),
    historyFrom: dateSchema.optional(),
  })
  .refine(
    (p) => new Set(p.positions.map((x) => x.asset.id)).size === p.positions.length,
    'Solo un saldo inicial por activo',
  );
export type Portfolio = z.infer<typeof portfolioSchema>;
export type Quote = {
  assetId: string;
  price: string;
  currency: Currency;
  timestamp: string;
  provider: string;
  kind: 'intraday' | 'daily';
  change24h?: number;
  fxRate?: string;
  fxTimestamp?: string;
};
export type MarketResult = { quotes: Record<string, Quote>; warnings: string[] };
export const cash = (c: Currency): Asset => ({
  id: `cash:${c}`,
  name: c === 'USD' ? 'Dólar estadounidense' : 'Peso mexicano',
  symbol: c,
  class: 'cash',
});
export const emptyPortfolio = (): Portfolio => ({
  version: 1,
  name: 'Mi portafolio',
  baseCurrency: 'MXN',
  timezone: 'America/Mexico_City',
  positions: [],
  transactions: [],
  scenarios: [],
});
export const catalog: Asset[] = [
  { id: 'cmc:1', cmcId: 1, name: 'Bitcoin', symbol: 'BTC', class: 'crypto' },
  { id: 'cmc:1027', cmcId: 1027, name: 'Ethereum', symbol: 'ETH', class: 'crypto' },
  { id: 'cmc:5426', cmcId: 5426, name: 'Solana', symbol: 'SOL', class: 'crypto' },
  { id: 'cmc:1839', cmcId: 1839, name: 'BNB', symbol: 'BNB', class: 'crypto' },
  { id: 'cmc:3408', cmcId: 3408, name: 'USDC', symbol: 'USDC', class: 'crypto' },
  cash('USD'),
  cash('MXN'),
];
export const allAssets = (p: Portfolio): Asset[] =>
  Array.from(
    new Map(
      [
        ...p.positions.map((x) => x.asset),
        ...p.transactions.flatMap((x) => [x.asset, cash(x.currency)]),
      ].map((a) => [a.id, a]),
    ).values(),
  );
