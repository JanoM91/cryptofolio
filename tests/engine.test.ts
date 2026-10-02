import { describe, it, expect } from 'vitest';
import { reconstruct, simulate, valueHoldings, difference, validateLedger } from '../shared/engine';
import {
  catalog,
  cash,
  emptyPortfolio,
  portfolioSchema,
  positionSchema,
  transactionSchema,
  scenarioSchema,
  type Portfolio,
  type Transaction,
  type Quote,
} from '../shared/model';
const btc = catalog[0],
  usd = cash('USD');
const start = '2025-01-01T00:00:00.000Z',
  day = '2025-01-02T00:00:00.000Z',
  end = '2025-01-03T00:00:00.000Z';
function portfolio(): Portfolio {
  return {
    ...emptyPortfolio(),
    baseCurrency: 'USD',
    historyFrom: start,
    positions: [
      { id: 'btc', asset: btc, quantity: '2', date: start, unitCost: '100', costCurrency: 'USD' },
      { id: 'usd', asset: usd, quantity: '1000', date: start, costCurrency: 'USD' },
    ],
  };
}
function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't',
    date: day,
    type: 'buy',
    asset: btc,
    quantity: '1',
    price: '200',
    currency: 'USD',
    fee: '10',
    notes: '',
    direction: 'in',
    ...overrides,
  };
}
const q: Record<string, Quote> = {
  'cmc:1': {
    assetId: 'cmc:1',
    price: '300',
    currency: 'USD',
    timestamp: end,
    provider: 'test',
    kind: 'intraday',
  },
  'cash:USD': {
    assetId: 'cash:USD',
    price: '1',
    currency: 'USD',
    timestamp: end,
    provider: 'identity',
    kind: 'intraday',
  },
};
describe('ledger and costs', () => {
  it('applies buy quantity, cash and capitalized fees', () => {
    const p = portfolio();
    p.transactions = [tx()];
    const h = reconstruct(p, end);
    expect(h.find((h) => h.asset.id === btc.id)).toMatchObject({ quantity: '3', cost: '410' });
    expect(h.find((h) => h.asset.id === usd.id)?.quantity).toBe('790');
  });
  it('reduces weighted cost proportionally on a sale', () => {
    const p = portfolio();
    p.transactions = [tx({ type: 'sell', quantity: '0.5', price: '300', fee: '5' })];
    const h = reconstruct(p, end);
    expect(h.find((h) => h.asset.id === btc.id)).toMatchObject({ quantity: '1.5', cost: '150' });
    expect(h.find((h) => h.asset.id === usd.id)?.quantity).toBe('1145');
  });
  it('preserves decimal arithmetic', () => {
    const p = portfolio();
    p.positions[0].quantity = '0.1';
    p.transactions = [tx({ quantity: '0.2', price: '0.1', fee: '0' })];
    expect(reconstruct(p, end)[0].quantity).toBe('0.3');
  });
  it('rejects overselling and negative cash', () => {
    const p = portfolio();
    p.transactions = [tx({ type: 'sell', quantity: '3' })];
    expect(() => reconstruct(p, end)).toThrow('Saldo insuficiente');
    p.transactions = [tx({ price: '1100' })];
    expect(() => reconstruct(p, end)).toThrow('Saldo insuficiente');
  });
  it('rejects fees higher than sale proceeds', () => {
    const p = portfolio();
    p.transactions = [tx({ type: 'sell', fee: '201' })];
    expect(() => reconstruct(p, end)).toThrow('comisión');
  });
  it('marks imported holdings without cost as unknown', () => {
    const p = portfolio();
    delete p.positions[0].unitCost;
    expect(valueHoldings(reconstruct(p, end), q).pnl).toBeNull();
  });
  it('does not treat an in-kind deposit as zero cost', () => {
    const p = portfolio();
    p.transactions = [tx({ type: 'deposit', fee: '0' })];
    expect(reconstruct(p, end)[0].cost).toBeNull();
  });
  it('does not compare costs in different currencies', () => {
    const p = portfolio();
    p.positions[0].costCurrency = 'MXN';
    expect(valueHoldings(reconstruct(p, end), q).pnl).toBeNull();
  });
  it('removes unknown cost after fully closing a position', () => {
    const p = portfolio();
    delete p.positions[0].unitCost;
    p.transactions = [
      tx({ type: 'sell', quantity: '2', fee: '0' }),
      tx({ id: 't2', date: end, price: '100', quantity: '1', fee: '0' }),
    ];
    expect(reconstruct(p, end)[0].cost).toBe('100');
  });
  it('never presents an incomplete subtotal as a complete valuation', () => {
    const v = valueHoldings(reconstruct(portfolio(), end), { 'cmc:1': q['cmc:1'] });
    expect(v.complete).toBe(false);
    expect(v.total).toBe('600');
    expect(v.pnl).toBeNull();
  });
  it('computes known cost and unrealized gain', () => {
    expect(valueHoldings(reconstruct(portfolio(), end), q)).toMatchObject({
      total: '1600',
      cost: '1200',
      pnl: '400',
      complete: true,
    });
  });
  it('applies transfer directions and cash commissions', () => {
    const p = portfolio();
    p.transactions = [tx({ type: 'transfer', direction: 'out', quantity: '0.5', fee: '2' })];
    const h = reconstruct(p, end);
    expect(h[0].quantity).toBe('1.5');
    expect(h[1].quantity).toBe('998');
  });
  it('does not double count transactions covered by an opening balance', () => {
    const p = portfolio();
    p.transactions = [tx({ date: start })];
    expect(reconstruct(p, end)[0].quantity).toBe('2');
  });
});
describe('historical reconstruction and scenarios', () => {
  it('rejects dates before known balances', () => {
    expect(() => reconstruct(portfolio(), '2024-01-01T00:00:00.000Z', true)).toThrow('Falta');
  });
  it('requires explicitly confirmed historical coverage', () => {
    const p = portfolio();
    delete p.historyFrom;
    expect(() => simulate(p, day, [])).toThrow('historial');
  });
  it('requires opening balances before the coverage date', () => {
    const p = portfolio();
    p.positions[0].date = day;
    expect(() => validateLedger(p)).toThrow('saldos iniciales');
  });
  it('excludes future transactions from a historical query', () => {
    const p = portfolio();
    p.transactions = [tx()];
    expect(reconstruct(p, start, true)[0].quantity).toBe('2');
  });
  it('keeps scenarios isolated and supports sell then reinvest', () => {
    const p = portfolio();
    const original = JSON.stringify(p);
    const h = simulate(p, day, [
      tx({ type: 'sell', quantity: '1', price: '300', fee: '5' }),
      tx({ id: 't2', asset: catalog[1], quantity: '2', price: '100', fee: '2' }),
    ]);
    expect(h.find((h) => h.asset.id === 'cash:USD')?.quantity).toBe('1093');
    expect(h.find((h) => h.asset.id === 'cmc:1027')?.quantity).toBe('2');
    expect(JSON.stringify(p)).toBe(original);
  });
  it('does not silently convert cash for a different execution currency', () => {
    expect(() => simulate(portfolio(), day, [tx({ currency: 'MXN' })])).toThrow(
      'Saldo insuficiente',
    );
  });
  it('avoids infinite percentages at a zero base', () =>
    expect(difference('10', '0')).toEqual({ amount: '10', percent: null }));
});
describe('validation', () => {
  it('rejects negative and nonfinite quantities', () => {
    for (const quantity of ['-1', 'NaN', 'Infinity', '1e40'])
      expect(positionSchema.safeParse({ ...portfolio().positions[0], quantity }).success).toBe(
        false,
      );
  });
  it('rejects duplicate holdings and mismatched stable IDs', () => {
    const p = portfolio();
    p.positions.push(p.positions[0]);
    expect(portfolioSchema.safeParse(p).success).toBe(false);
    expect(
      positionSchema.safeParse({ ...p.positions[0], asset: { ...btc, cmcId: 2 } }).success,
    ).toBe(false);
  });
  it('rejects invalid dates, future dates and zero-priced trades', () => {
    expect(transactionSchema.safeParse(tx({ date: '2035-01-01T00:00:00.000Z' })).success).toBe(
      false,
    );
    expect(transactionSchema.safeParse(tx({ price: '0' })).success).toBe(false);
  });
  it('rejects scenario end before start', () =>
    expect(
      scenarioSchema.safeParse({ id: 's', name: 'test', date: day, end: start, trades: [] })
        .success,
    ).toBe(false));
});

describe('malformed input and time normalization', () => {
  it('rejects arbitrary text without throwing outside validation', () => {
    expect(
      positionSchema.safeParse({ ...portfolio().positions[0], quantity: 'hello' }).success,
    ).toBe(false);
    expect(transactionSchema.safeParse(tx({ price: 'hello' })).success).toBe(false);
  });
  it('normalizes explicit offsets and fractional second forms before sorting', () => {
    const parsed = transactionSchema.parse(tx({ date: '2025-01-02T06:00:00-06:00' }));
    expect(parsed.date).toBe('2025-01-02T12:00:00.000Z');
  });
});
