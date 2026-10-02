import { errorText } from '../../shared/model';
import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import Decimal from 'decimal.js';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Pie,
  PieChart,
  Cell,
} from 'recharts';
import {
  ArrowUpRight,
  ArrowDownUp,
  Plus,
  RefreshCw,
  Wallet,
  Layers,
  Info,
  Pencil,
  Trash2,
} from 'lucide-react';
import { reconstruct, valueHoldings, difference } from '../../shared/engine';
import {
  allAssets,
  type Currency,
  type MarketResult,
  type Portfolio,
  type Position,
} from '../../shared/model';
import { market } from '../api';
import { Badge, Delta, Empty, SearchBox, money, number, stamp } from './ui';
const colors = ['#7954e9', '#ad95f4', '#42b5a7', '#e7b65c', '#85a1d0', '#c8d1df', '#64748b'];
export default function Dashboard({
  p,
  demo,
  now,
  currency,
  data,
  loading,
  refresh,
  onAdd,
  onEdit,
  onDelete,
  positionsOnly = false,
}: {
  p: Portfolio;
  demo: boolean;
  now: string;
  currency: Currency;
  data: MarketResult;
  loading: boolean;
  refresh: () => void;
  onAdd: () => void;
  onEdit: (p: Position) => void;
  onDelete: (p: Position) => void;
  positionsOnly?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('value');
  const [period, setPeriod] = useState('30');
  const [start, setStart] = useState(DateTime.fromISO(now).minus({ days: 30 }).toISODate()!);
  const [end, setEnd] = useState(DateTime.fromISO(now).toISODate()!);
  const [series, setSeries] = useState<{ time: number; value: number | null }[]>([]);
  const [chartError, setChartError] = useState('');
  const [chartLoading, setChartLoading] = useState(false);
  const [dayChange, setDayChange] = useState<ReturnType<typeof difference> | null>(null);
  const [comparison, setComparison] = useState<{
    diff: string;
    percent: string | null;
    prices: string;
    movements: string;
  } | null>(null);
  const [distribution, setDistribution] = useState('asset');
  let ledgerError = '';
  let holdings: ReturnType<typeof reconstruct> = [];
  try {
    holdings = reconstruct(p, now);
  } catch (e) {
    ledgerError = errorText(e);
  }
  const valuation = valueHoldings(holdings, data.quotes);
  const assets = allAssets(p);
  const assetKey = assets.map((a) => a.id).join(',');
  useEffect(() => {
    let active = true;
    setDayChange(null);
    async function loadDay() {
      try {
        if (loading || !valuation.complete || !assets.length) return;
        const at = new Date(Date.parse(now) - 86400000).toISOString();
        const before = reconstruct(p, at, true);
        const quotes = await market(
          before.map((h) => h.asset.id),
          currency,
          demo,
          at,
        );
        const valued = valueHoldings(before, quotes.quotes);
        if (active && valued.complete) setDayChange(difference(valuation.total, valued.total));
      } catch {
        /* Missing historical balances or prices leave the metric unavailable. */
      }
    }
    void loadDay();
    return () => {
      active = false;
    };
  }, [p, now, currency, demo, data, loading]);
  useEffect(() => {
    let active = true;
    setSeries([]);
    setComparison(null);
    setChartError('');
    if (!assets.length || loading) {
      setChartLoading(false);
      return;
    }
    async function load() {
      setChartLoading(true);
      try {
        const to =
          period === 'custom'
            ? DateTime.fromISO(end, { zone: p.timezone }).endOf('day').toMillis()
            : Date.parse(now);
        const from =
          period === 'custom'
            ? DateTime.fromISO(start, { zone: p.timezone }).startOf('day').toMillis()
            : to - Number(period) * 86400000;
        const finish = Math.min(to, Date.parse(now));
        if (!Number.isFinite(from) || from >= finish)
          throw new Error('El rango debe comenzar antes de la fecha final.');
        if (!p.historyFrom || from < Date.parse(p.historyFrom))
          throw new Error(
            'Añade y confirma el historial completo para ver la evolución real de tu portafolio.',
          );
        const points = [];
        let first: ReturnType<typeof valueHoldings> | null = null;
        let firstHoldings: ReturnType<typeof reconstruct> = [];
        let last: ReturnType<typeof valueHoldings> | null = null;
        let lastQuotes: MarketResult['quotes'] = {};
        const warnings = new Set<string>();
        const count = demo ? 24 : 7;
        for (let i = 0; i <= count; i++) {
          if (!active) return;
          const at = new Date(from + ((finish - from) * i) / count).toISOString();
          let value: number | null = null;
          try {
            const h = reconstruct(p, at, true);
            const m =
              i === count && finish === Date.parse(now)
                ? data
                : await market(
                    [...new Set([...h, ...firstHoldings].map((x) => x.asset.id))],
                    currency,
                    demo,
                    at,
                  );
            m.warnings.forEach((w) => warnings.add(w));
            const v = valueHoldings(h, m.quotes);
            value = v.complete ? Number(v.total) : null;
            if (i === 0) {
              first = v;
              firstHoldings = h;
            }
            if (i === count) {
              last = v;
              lastQuotes = m.quotes;
            }
          } catch (e) {
            warnings.add(errorText(e));
          }
          points.push({ time: Date.parse(at), value });
        }
        if (active) {
          setSeries(points);
          if (warnings.size && !demo) setChartError([...warnings].join(' '));
          if (first?.complete && last?.complete) {
            const constant = valueHoldings(firstHoldings, lastQuotes);
            if (constant.complete) {
              const d = difference(last.total, first.total);
              setComparison({
                diff: d.amount,
                percent: d.percent,
                prices: new Decimal(constant.total).sub(first.total).toString(),
                movements: new Decimal(last.total).sub(constant.total).toString(),
              });
            }
          }
        }
      } catch (e) {
        if (active) setChartError(errorText(e));
      } finally {
        if (active) setChartLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [p, period, start, end, currency, demo, assetKey, data, loading, now]);
  const rows = valuation.rows
    .filter((r) => `${r.asset.name} ${r.asset.symbol}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === 'name'
        ? a.asset.name.localeCompare(b.asset.name)
        : sort === 'quantity'
          ? Number(b.quantity) - Number(a.quantity)
          : Number(b.value ?? -1) - Number(a.value ?? -1),
    );
  const allocation =
    distribution === 'asset'
      ? valuation.rows
          .filter((r) => r.value !== null)
          .map((r) => ({ name: r.asset.name, value: Number(r.value) }))
      : Object.entries(
          valuation.rows.reduce<Record<string, number>>((a, r) => {
            const c = { crypto: 'Criptoactivos', cash: 'Efectivo', stock: 'Acciones', etf: 'ETF' }[
              r.asset.class
            ];
            a[c] = (a[c] ?? 0) + Number(r.value ?? 0);
            return a;
          }, {}),
        ).map(([name, value]) => ({ name, value }));
  let previous24 = new Decimal(0);
  let complete24 = valuation.complete && holdings.length > 0;
  for (const r of valuation.rows) {
    if (r.quote?.change24h == null) {
      if (r.asset.class === 'cash' && r.asset.symbol === currency)
        previous24 = previous24.add(r.value ?? 0);
      else complete24 = false;
    } else {
      const denominator = new Decimal(1).add(new Decimal(r.quote.change24h).div(100));
      if (denominator.lte(0)) complete24 = false;
      else previous24 = previous24.add(new Decimal(r.value ?? 0).div(denominator));
    }
  }
  const change24 = complete24 ? difference(valuation.total, previous24.toString()) : null;
  const timestamps = Object.values(data.quotes)
    .filter((q) => q.provider !== 'Identidad monetaria')
    .map((q) => q.timestamp)
    .sort();
  const stale = !demo && timestamps.some((t) => Date.now() - Date.parse(t) > 15 * 60000);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU PATRIMONIO, EN PERSPECTIVA</span>
          <h1>
            {positionsOnly ? 'Tus posiciones' : 'Vista general'}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {positionsOnly
              ? 'Cada activo, su saldo y su punto de partida.'
              : 'Una mirada clara a tu portafolio y a lo que viene.'}
          </p>
        </div>
        <div className="actions">
          <button onClick={refresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
            <span>Actualizar</span>
          </button>
          <button className="primary" onClick={onAdd}>
            <Plus size={17} />
            Añadir posición
          </button>
        </div>
      </div>
      {ledgerError && <p className="error">{ledgerError}</p>}
      {stale && (
        <p className="notice">
          Datos desactualizados: alguna cotización tiene más de 15 minutos. Consulta su fecha en la
          tabla.
        </p>
      )}
      {!positionsOnly && (
        <>
          <div className="stats-grid">
            <section className="stat total">
              <div className="stat-label">
                <span>Valor del portafolio</span>
                <Wallet size={18} />
              </div>
              <h2>
                {loading
                  ? 'Consultando…'
                  : !holdings.length
                    ? money(0, currency)
                    : valuation.complete
                      ? money(valuation.total, currency)
                      : 'Sin datos completos'}
                <small>{currency}</small>
              </h2>
              <div className="stat-bottom">
                <span className="live-dot" />
                {demo
                  ? 'Precios de demostración'
                  : timestamps.length
                    ? stamp(timestamps[0], p.timezone)
                    : 'Esperando cotizaciones'}
              </div>
            </section>
            <section className="stat">
              <div className="stat-label">
                <span>Cambio del portafolio · 24 h</span>
                <ArrowDownUp size={18} />
              </div>
              <h2>{money(dayChange?.amount, currency)}</h2>
              <div className="stat-bottom">
                <Delta value={dayChange?.percent} />
                <span>{dayChange ? 'incluye movimientos' : 'historial incompleto'}</span>
              </div>
              <p
                className="tiny"
                title="Efecto del precio con cantidades actuales constantes, sin depósitos ni retiros."
              >
                Solo precios: {money(change24?.amount, currency)}
              </p>
            </section>
            <section className="stat">
              <div className="stat-label">
                <span>Ganancia no realizada</span>
                <ArrowUpRight size={18} />
              </div>
              <h2 className={Number(valuation.pnl) >= 0 ? 'green-text' : ''}>
                {holdings.length ? money(valuation.pnl, currency) : '—'}
              </h2>
              <div className="stat-bottom">
                <span>
                  {valuation.pnl === null
                    ? 'Costo de adquisición incompleto'
                    : 'Costo promedio ponderado móvil'}
                </span>
              </div>
            </section>
            <section className="stat">
              <div className="stat-label">
                <span>Activos en tu portafolio</span>
                <Layers size={18} />
              </div>
              <h2>
                {holdings.length}
                <small>activos</small>
              </h2>
              <div className="stat-bottom">
                <span>
                  {holdings.filter((h) => h.asset.class === 'crypto').length} cripto ·{' '}
                  {holdings.filter((h) => h.asset.class === 'cash').length} efectivo
                </span>
              </div>
            </section>
          </div>
          <div className="analytics-grid">
            <section className="card chart-card">
              <div className="card-heading">
                <div>
                  <h2>Evolución del portafolio</h2>
                  <p>Valor reconstruido a lo largo del tiempo</p>
                </div>
                <div className="periods">
                  {[
                    ['1', '24 h'],
                    ['7', '7 d'],
                    ['30', '30 d'],
                    ['365', '1 a'],
                    ['custom', 'Rango'],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={period === v ? 'active' : ''}
                      onClick={() => setPeriod(v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {period === 'custom' && (
                <div className="date-range">
                  <input
                    aria-label="Fecha inicial"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                  <span>→</span>
                  <input
                    aria-label="Fecha final"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              )}
              <div className="chart-summary">
                <strong>{comparison ? money(comparison.diff, currency) : '—'}</strong>
                <Delta value={comparison?.percent} />
                <span>en el período</span>
              </div>
              {chartLoading ? (
                <div className="chart-placeholder">
                  <RefreshCw className="spin" /> Consultando referencias históricas…
                </div>
              ) : series.some((x) => x.value !== null) ? (
                <div className="chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 15, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.005} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="time"
                        tickFormatter={(t) =>
                          DateTime.fromMillis(t)
                            .setZone(p.timezone)
                            .setLocale('es')
                            .toFormat(period === '1' ? 'HH:mm' : 'dd LLL')
                        }
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                        tick={{ fill: '#9299aa', fontSize: 11 }}
                      />
                      <YAxis
                        tickFormatter={(v) => `${Number((v / 1000).toFixed(1))}k`}
                        axisLine={false}
                        tickLine={false}
                        width={42}
                        tick={{ fill: '#9299aa', fontSize: 11 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        labelFormatter={(t) => stamp(new Date(Number(t)).toISOString(), p.timezone)}
                        formatter={(v) => [money(Number(v), currency), 'Valor']}
                        contentStyle={{ borderRadius: 12, borderColor: '#eee' }}
                      />
                      <Area
                        dataKey="value"
                        type="linear"
                        stroke="#8253e8"
                        strokeWidth={2.5}
                        fill="url(#fill)"
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <Empty title="Tu historia empieza con un saldo inicial">
                  {chartError || 'Añade posiciones para empezar a explorar.'}
                </Empty>
              )}
              <div className="chart-foot">
                <span>
                  <i className="legend-dot" />
                  Valor del portafolio · {currency}
                </span>
                <span>
                  {demo ? 'Serie ficticia' : `${series.length} referencias · sin interpolación`}
                </span>
              </div>
              {comparison && (
                <p className="tiny">
                  Efecto precios: {money(comparison.prices, currency)} · efecto cambios de
                  cantidades: {money(comparison.movements, currency)}. Descomposición a precios
                  finales, no rentabilidad ajustada por flujos.
                </p>
              )}
              {chartError && series.length > 0 && <p className="notice">{chartError}</p>}
            </section>
            <section className="card allocation-card">
              <div className="card-heading">
                <div>
                  <h2>Distribución</h2>
                  <p>El equilibrio de tu portafolio</p>
                </div>
                <select
                  aria-label="Distribución por"
                  value={distribution}
                  onChange={(e) => setDistribution(e.target.value)}
                >
                  <option value="asset">Activo</option>
                  <option value="class">Clase</option>
                </select>
              </div>
              {valuation.complete && holdings.length > 0 ? (
                <>
                  <div className="donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={allocation}
                          dataKey="value"
                          innerRadius={74}
                          outerRadius={94}
                          paddingAngle={3}
                          stroke="none"
                          isAnimationActive={false}
                        >
                          {allocation.map((_, i) => (
                            <Cell key={i} fill={colors[i % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => money(Number(v), currency)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-label">
                      <small>Total de activos</small>
                      <strong>{holdings.length}</strong>
                      <span>100%</span>
                    </div>
                  </div>
                  <div className="allocation-legend">
                    {allocation.map((a, i) => (
                      <div key={a.name}>
                        <span>
                          <i style={{ background: colors[i % colors.length] }} />
                          {a.name}
                        </span>
                        <strong>
                          {new Decimal(valuation.total).gt(0)
                            ? ((a.value / Number(valuation.total)) * 100).toFixed(1)
                            : '0'}
                          %
                        </strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty title="Distribución pendiente">
                  Se necesitan precios para todas las posiciones.
                </Empty>
              )}
            </section>
          </div>
        </>
      )}
      <section className="card positions-card">
        <div className="card-heading">
          <div>
            <h2>
              Tus activos <span className="count">{holdings.length}</span>
            </h2>
            <p>Todo tu portafolio, en un solo lugar</p>
          </div>
          <SearchBox value={search} onChange={setSearch} />
        </div>
        {holdings.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <button className="sort" onClick={() => setSort('name')}>
                      Activo ↕
                    </button>
                  </th>
                  <th>Precio / actualización</th>
                  <th>24 h</th>
                  <th>
                    <button className="sort" onClick={() => setSort('quantity')}>
                      Cantidad ↕
                    </button>
                  </th>
                  <th>
                    <button className="sort" onClick={() => setSort('value')}>
                      Valor ↕
                    </button>
                  </th>
                  <th>Peso</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const initial = p.positions.find((x) => x.asset.id === r.asset.id);
                  const weight =
                    valuation.complete && Number(valuation.total) > 0
                      ? (Number(r.value) / Number(valuation.total)) * 100
                      : null;
                  return (
                    <tr key={r.asset.id}>
                      <td>
                        <div className="asset-cell">
                          <Badge asset={r.asset} />
                          <div>
                            <strong>{r.asset.name}</strong>
                            <small>
                              {r.asset.symbol}
                              {r.asset.cmcId ? ` · #${r.asset.cmcId}` : ' · Efectivo'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{money(r.quote?.price, currency)}</strong>
                        <small
                          title={`${r.quote?.provider ?? 'Sin proveedor'} · ${r.quote?.kind === 'daily' ? 'Referencia diaria' : 'Intradía'}`}
                        >
                          {stamp(r.quote?.timestamp, p.timezone)}
                        </small>
                        {r.quote?.fxRate && (
                          <small>
                            FX {r.quote.fxRate} · {r.quote.provider}
                          </small>
                        )}
                      </td>
                      <td>
                        <Delta value={r.quote?.change24h} />
                      </td>
                      <td>
                        <strong>{number(r.quantity)}</strong>
                        <small>{r.asset.symbol}</small>
                      </td>
                      <td>
                        <strong>{money(r.value, currency)}</strong>
                        <small>
                          {r.pnl !== null
                            ? `G/P ${money(r.pnl, currency)}`
                            : 'Costo desconocido / otra moneda'}
                        </small>
                      </td>
                      <td>
                        {weight !== null ? (
                          <>
                            <strong>{weight.toFixed(1)}%</strong>
                            <div className="weight-track">
                              <i
                                style={{
                                  width: `${weight}%`,
                                  background: colors[i % colors.length],
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {initial && (
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              aria-label={`Editar ${r.asset.name}`}
                              onClick={() => onEdit(initial)}
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={`Eliminar ${r.asset.name}`}
                              onClick={() => onDelete(initial)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <Empty title="Sin coincidencias" />}
          </div>
        ) : (
          <Empty title="Dale un punto de partida a tu portafolio">
            <p>Registra tus cantidades o importa un archivo CSV.</p>
            <button className="primary" onClick={onAdd}>
              <Plus size={16} />
              Añadir primera posición
            </button>
          </Empty>
        )}
        <div className="table-footer">
          <span>
            <Info size={14} />{' '}
            {demo
              ? 'Demostración · todos los precios son ficticios'
              : 'CoinMarketCap · moneda de cotización ' + currency}
          </span>
          <span>{rows.length} activos</span>
        </div>
      </section>
      {positionsOnly && p.positions.length > 0 && (
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Saldos de partida</h2>
              <p>
                Incluye posiciones en cero o cerradas. Editar estos datos modifica la reconstrucción
                histórica.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Saldo inicial</th>
                  <th>Fecha del saldo</th>
                  <th>Costo por unidad</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {p.positions.map((pos) => (
                  <tr key={pos.id}>
                    <td>
                      {pos.asset.name} · {pos.asset.symbol}
                    </td>
                    <td>{number(pos.quantity)}</td>
                    <td>{stamp(pos.date, p.timezone)}</td>
                    <td>{money(pos.unitCost, pos.costCurrency)}</td>
                    <td>
                      <div className="row-actions">
                        <button onClick={() => onEdit(pos)}>Editar saldo</button>
                        <button
                          className="icon-button"
                          aria-label={`Eliminar saldo inicial ${pos.asset.name}`}
                          onClick={() => onDelete(pos)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data.warnings
        .filter((w) => !demo)
        .map((w, i) => (
          <p className="notice" key={i}>
            {w}
          </p>
        ))}
      {!positionsOnly && (
        <div className="bottom-note">
          <span className="note-icon">
            <Info size={18} />
          </span>
          <div>
            <strong>Más contexto. Mejores preguntas.</strong>
            <p>
              Explora precios históricos y escenarios hipotéticos. Tu portafolio real siempre
              permanece en tus manos.
            </p>
          </div>
          <span className="tag">Solo análisis</span>
        </div>
      )}
    </>
  );
}
