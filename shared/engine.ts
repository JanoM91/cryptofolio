import Decimal from 'decimal.js';
import {
  allAssets,
  cash,
  type Asset,
  type Currency,
  type Portfolio,
  type Quote,
  type Transaction,
} from './model';
export type Holding = {
  asset: Asset;
  quantity: string;
  cost: string | null;
  costCurrency: Currency;
};
const D = (v: Decimal.Value) => new Decimal(v);
export function reconstruct(p: Portfolio, at: string, requireHistory = false): Holding[] {
  if (requireHistory && (!p.historyFrom || at < p.historyFrom))
    throw new Error(
      'Falta un saldo inicial completo o historial confirmado para esta fecha. Regístralo en Configuración.',
    );
  const assets = allAssets(p);
  const out: Record<string, Holding> = {};
  for (const a of assets) {
    const pos = p.positions.find((x) => x.asset.id === a.id);
    if (pos && pos.date > at)
      throw new Error(`Falta el saldo de ${a.symbol} anterior a la fecha consultada.`);
    out[a.id] = {
      asset: a,
      quantity: pos?.quantity ?? '0',
      cost:
        pos?.unitCost !== undefined
          ? D(pos.quantity).mul(pos.unitCost).toString()
          : pos && D(pos.quantity).gt(0)
            ? null
            : '0',
      costCurrency: pos?.costCurrency ?? p.baseCurrency,
    };
  }
  const txs = [...p.transactions]
    .filter((t) => t.date <= at)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of txs) {
    const apply = (id: string, delta: Decimal, acquisition?: Decimal) => {
      const initial = p.positions.find((x) => x.asset.id === id);
      if (initial && t.date <= initial.date) return;
      const h = out[id];
      const old = D(h.quantity),
        next = old.add(delta);
      if (next.lt(0))
        throw new Error(`Saldo insuficiente de ${h.asset.symbol} el ${t.date.slice(0, 10)}.`);
      if (delta.gt(0)) {
        h.cost =
          h.cost !== null &&
          acquisition !== undefined &&
          (old.eq(0) || h.costCurrency === t.currency)
            ? D(h.cost).add(acquisition).toString()
            : null;
        if (old.eq(0)) h.costCurrency = t.currency;
      } else if (old.gt(0) && h.cost !== null) h.cost = D(h.cost).mul(next).div(old).toString();
      h.quantity = next.toString();
      if (next.eq(0)) h.cost = '0';
    };
    const qty = D(t.quantity),
      fee = D(t.fee),
      trade = qty.mul(t.price),
      cashId = cash(t.currency).id;
    if (t.type === 'buy') {
      apply(t.asset.id, qty, trade.add(fee));
      apply(cashId, trade.add(fee).neg());
    } else if (t.type === 'sell') {
      if (fee.gt(trade)) throw new Error('La comisión supera el importe de venta.');
      apply(t.asset.id, qty.neg());
      apply(cashId, trade.sub(fee));
    } else {
      const incoming = t.type === 'deposit' || (t.type === 'transfer' && t.direction === 'in');
      apply(t.asset.id, incoming ? qty : qty.neg());
      if (fee.gt(0)) apply(cashId, fee.neg());
    }
  }
  return Object.values(out).filter((h) => D(h.quantity).gt(0));
}
export function validateLedger(p: Portfolio) {
  reconstruct(p, new Date().toISOString());
  if (p.historyFrom && p.positions.some((x) => x.date > p.historyFrom!))
    throw new Error(
      'Los saldos iniciales deben ser anteriores o iguales al inicio del historial completo.',
    );
  return p;
}
export function valueHoldings(holdings: Holding[], quotes: Record<string, Quote>) {
  let total = D(0);
  let cost = D(0);
  let known = true;
  const rows = holdings.map((h) => {
    const q = quotes[h.asset.id];
    const value = q ? D(h.quantity).mul(q.price) : null;
    if (value) total = total.add(value);
    const basis =
      h.asset.class === 'cash'
        ? value
        : h.cost !== null && q?.currency === h.costCurrency
          ? D(h.cost)
          : null;
    if (!basis) known = false;
    else cost = cost.add(basis);
    return {
      ...h,
      quote: q,
      value: value?.toString() ?? null,
      cost: basis?.toString() ?? null,
      pnl: value && basis ? value.sub(basis).toString() : null,
    };
  });
  const complete = rows.every((r) => r.value !== null);
  return {
    rows,
    total: total.toString(),
    complete,
    cost: known && complete ? cost.toString() : null,
    pnl: known && complete ? total.sub(cost).toString() : null,
  };
}
export function simulate(p: Portfolio, date: string, trades: Transaction[]) {
  const holdings = reconstruct(p, date, true);
  const synthetic: Portfolio = {
    ...p,
    positions: holdings.map((h) => ({
      id: h.asset.id,
      asset: h.asset,
      quantity: h.quantity,
      date: new Date(Date.parse(date) - 1).toISOString(),
      costCurrency: h.costCurrency,
      unitCost: h.cost === null ? undefined : D(h.cost).div(h.quantity).toString(),
    })),
    transactions: trades,
    historyFrom: undefined,
  };
  return reconstruct(synthetic, date);
}
export function difference(final: string, base: string) {
  const diff = D(final).sub(base);
  return {
    amount: diff.toString(),
    percent: D(base).eq(0) ? null : diff.div(base).mul(100).toString(),
  };
}
