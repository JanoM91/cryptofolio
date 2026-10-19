import { errorText } from '../../shared/model';
import { useEffect, useState } from 'react';
import Decimal from 'decimal.js';
import { FlaskConical, Plus, Trash2, ArrowRight } from 'lucide-react';
import { difference, reconstruct, simulate, valueHoldings } from '../../shared/engine';
import {
  scenarioSchema,
  type Currency,
  type MarketResult,
  type Portfolio,
  type Scenario,
  type Transaction,
} from '../../shared/model';
import { market } from '../api';
import { TransactionForm } from './Forms';
import { Delta, Empty, Field, isoDate, localDate, money, number, stamp } from './ui';
type Comparison = {
  s: Scenario;
  base: ReturnType<typeof valueHoldings>;
  result: ReturnType<typeof valueHoldings>;
  warnings: string[];
  diff: ReturnType<typeof difference> | null;
};
export default function Scenarios({
  p,
  save,
  demo,
  now,
  currency,
  data,
}: {
  p: Portfolio;
  save: (p: Portfolio) => Promise<void>;
  demo: boolean;
  now: string;
  currency: Currency;
  data: MarketResult;
}) {
  const [date, setDate] = useState(localDate(now, p.timezone));
  const [end, setEnd] = useState(localDate(now, p.timezone));
  const [name, setName] = useState('Mi escenario');
  const [trades, setTrades] = useState<Transaction[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Comparison[]>([]);
  const [loading, setLoading] = useState(false);
  const [assetId, setAssetId] = useState(p.positions[0]?.asset.id ?? '');
  const [quickMode, setQuickMode] = useState('percent');
  const [price, setPrice] = useState('10');
  let holdings: ReturnType<typeof reconstruct> = [];
  try {
    holdings = reconstruct(p, now);
  } catch {
    /* Existing ledger errors appear in dashboard. */
  }
  const base = valueHoldings(holdings, data.quotes);
  let quick: ReturnType<typeof valueHoldings> | null = null;
  try {
    if (assetId && data.quotes[assetId] && price) {
      const q = data.quotes[assetId];
      const newPrice =
        quickMode === 'percent'
          ? new Decimal(q.price).mul(new Decimal(price).div(100).add(1))
          : new Decimal(price);
      if (newPrice.isFinite() && newPrice.gte(0))
        quick = valueHoldings(holdings, {
          ...data.quotes,
          [assetId]: { ...q, price: newPrice.toString() },
        });
    }
  } catch {
    /* Invalid input produces no result. */
  }
  useEffect(() => {
    setResults([]);
  }, [p, currency]);
  async function compare() {
    setLoading(true);
    setError('');
    setResults([]);
    try {
      if (!p.scenarios.length) throw new Error('Guarda al menos un escenario.');
      const output = [];
      for (const s of p.scenarios) {
        const initial = reconstruct(p, s.date, true);
        const hypothetical = simulate(p, s.date, s.trades);
        const ids = [...new Set([...initial, ...hypothetical].map((h) => h.asset.id))];
        const quotes = await market(ids, currency, demo, s.end);
        // Retain closed assets in the comparison, explicitly showing zero final units.
        const finalHoldings = [
          ...hypothetical,
          ...initial
            .filter((h) => !hypothetical.some((x) => x.asset.id === h.asset.id))
            .map((h) => ({ ...h, quantity: '0', cost: '0' })),
        ];
        const b = valueHoldings(initial, quotes.quotes),
          r = valueHoldings(finalHoldings, quotes.quotes);
        output.push({
          s,
          base: b,
          result: r,
          warnings: quotes.warnings,
          diff: b.complete && r.complete ? difference(r.total, b.total) : null,
        });
      }
      setResults(output);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXPLORA LO POSIBLE</span>
          <h1>Laboratorio de escenarios</h1>
          <p>Prueba tus ideas y compara resultados sin cambiar tu portafolio.</p>
        </div>
        <FlaskConical size={34} className="purple" />
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>¿Y si cambia el precio?</h2>
            <p>Escenario rápido · las demás cantidades y precios permanecen constantes</p>
          </div>
          <span className="tag">Hipotético</span>
        </div>
        <div className="quick-grid">
          <Field label="Activo">
            <select value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Seleccionar activo</option>
              {holdings
                .filter((h) => h.asset.class !== 'cash')
                .map((h) => (
                  <option value={h.asset.id} key={h.asset.id}>
                    {h.asset.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Tipo de cambio">
            <select value={quickMode} onChange={(e) => setQuickMode(e.target.value)}>
              <option value="percent">Variación porcentual</option>
              <option value="absolute">Precio absoluto</option>
            </select>
          </Field>
          <Field label={quickMode === 'percent' ? 'Cambio (%)' : `Nuevo precio (${currency})`}>
            <input value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <div className="quick-result">
            <small>Valor estimado del portafolio</small>
            <strong>
              {quick?.complete && base.complete
                ? money(quick.total, currency)
                : 'Sin datos completos'}
            </strong>
            {quick?.complete && base.complete && (
              <Delta value={difference(quick.total, base.total).percent} />
            )}
          </div>
        </div>
        {quick?.complete && base.complete && (
          <p className="muted">
            Base {money(base.total, currency)} → diferencia{' '}
            {money(difference(quick.total, base.total).amount, currency)}. Comisión: 0; sin
            operaciones ni cambios en efectivo.
          </p>
        )}
      </section>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Construye una alternativa</h2>
            <p>Compras, ventas y reinversión con saldo disponible.</p>
          </div>
          <span className="tag">Estimación</span>
        </div>
        <div className="form-grid three">
          <Field label="Nombre">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </Field>
          <Field label="Fecha de simulación" hint={p.timezone}>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTrades([]);
              }}
            />
          </Field>
          <Field
            label="Fecha final de valoración"
            hint="Para fechas futuras usa el escenario rápido de precio."
          >
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <p className="notice">
          El caso base conserva las posiciones disponibles al inicio hasta la fecha final. No se
          aplican movimientos reales posteriores. Las ventas conservan efectivo en su moneda de
          ejecución; añade compras en esa moneda para reinvertirlo. No se hace conversión de
          efectivo automática.
        </p>
        {trades.map((t, i) => (
          <div className="trade-row" key={t.id}>
            <span>
              {i + 1}. {t.type === 'buy' ? 'Comprar' : 'Vender'}{' '}
              <b>
                {number(t.quantity)} {t.asset.symbol}
              </b>{' '}
              a {money(t.price, t.currency)} · comisión {money(t.fee, t.currency)}
            </span>
            <button
              className="icon-button"
              aria-label="Eliminar operación hipotética"
              onClick={() => setTrades(trades.filter((x) => x.id !== t.id))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            onClick={() => {
              try {
                reconstruct(p, isoDate(date, p.timezone), true);
                setOpen(true);
                setError('');
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            <Plus size={16} /> Añadir operación
          </button>
          <button
            className="primary"
            onClick={async () => {
              try {
                const s = scenarioSchema.parse({
                  id: crypto.randomUUID(),
                  name,
                  date: isoDate(date, p.timezone),
                  end: isoDate(end, p.timezone),
                  trades,
                });
                simulate(p, s.date, s.trades);
                await save({ ...p, scenarios: [...p.scenarios, s] });
                setTrades([]);
                setError('');
              } catch (e) {
                setError(errorText(e));
              }
            }}
          >
            Guardar escenario
          </button>
        </div>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Escenarios guardados</h2>
            <p>Compara alternativas; usa las mismas fechas para una comparación homogénea.</p>
          </div>
          <button disabled={loading} onClick={compare}>
            {loading ? 'Valorando…' : 'Comparar escenarios'}
            <ArrowRight size={16} />
          </button>
        </div>
        {!p.scenarios.length ? (
          <Empty title="Tu próxima idea comienza aquí">
            Guarda una alternativa para compararla con el caso base.
          </Empty>
        ) : (
          p.scenarios.map((s) => (
            <div className="saved-scenario" key={s.id}>
              <input
                aria-label="Nombre del escenario"
                defaultValue={s.name}
                onBlur={async (e) => {
                  try {
                    await save({
                      ...p,
                      scenarios: p.scenarios.map((x) =>
                        x.id === s.id ? { ...x, name: e.target.value } : x,
                      ),
                    });
                  } catch (err) {
                    setError(errorText(err));
                  }
                }}
              />
              <small>
                {s.date.slice(0, 10)} → {s.end.slice(0, 10)} · {s.trades.length} operaciones
              </small>
              <button
                className="icon-button"
                aria-label="Eliminar escenario"
                onClick={async () => {
                  try {
                    await save({ ...p, scenarios: p.scenarios.filter((x) => x.id !== s.id) });
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
        {results.map(({ s, base: b, result: r, diff, warnings }) => (
          <div className="scenario-result" key={s.id}>
            <h3>{s.name}</h3>
            <p className="muted">
              Inicio: {stamp(s.date, p.timezone)} · Final: {stamp(s.end, p.timezone)} · Valoración
              en {currency}. Efectivo conservado en la moneda de ejecución.
            </p>
            <div className="notice">
              {s.trades.map((t: Transaction) => (
                <div key={t.id}>
                  {t.type === 'buy' ? 'Compra' : 'Venta'} de {number(t.quantity)} {t.asset.symbol} ·
                  precio {money(t.price, t.currency)} · comisión {money(t.fee, t.currency)}
                </div>
              ))}
              {!s.trades.length && 'Sin operaciones hipotéticas.'}
            </div>
            <div className="quick-grid">
              <div>
                <small>Caso base</small>
                <h2>{b.complete ? money(b.total, currency) : 'Sin datos'}</h2>
              </div>
              <div>
                <small>Escenario hipotético</small>
                <h2>{r.complete ? money(r.total, currency) : 'Sin datos'}</h2>
              </div>
              <div>
                <small>Diferencia</small>
                <h2>{money(diff?.amount, currency)}</h2>
                <Delta value={diff?.percent} />
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Activo</th>
                    <th>Saldo inicial</th>
                    <th>Cantidad final</th>
                    <th>Valor final</th>
                    <th>Precio utilizado</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((h) => (
                    <tr key={h.asset.id}>
                      <td>{h.asset.symbol}</td>
                      <td>
                        {number(b.rows.find((x) => x.asset.id === h.asset.id)?.quantity ?? '0')}
                      </td>
                      <td>{number(h.quantity)}</td>
                      <td>{money(h.value, currency)}</td>
                      <td>
                        {h.quote
                          ? `${money(h.quote.price, currency)} · ${stamp(h.quote.timestamp, p.timezone)} · ${h.quote.kind === 'daily' ? 'Referencia diaria' : 'Intradía'}`
                          : 'Sin datos'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {warnings.map((w: string, i: number) => (
              <p className="notice" key={i}>
                {w}
              </p>
            ))}
          </div>
        ))}
      </section>
      {open && (
        <TransactionForm
          p={p}
          demo={demo}
          now={isoDate(date, p.timezone)}
          hypothetical
          onClose={() => setOpen(false)}
          onSave={(t) => {
            simulate(p, isoDate(date, p.timezone), [...trades, t]);
            setTrades([...trades, t]);
          }}
        />
      )}
    </>
  );
}
