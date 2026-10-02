import { errorText } from '../../shared/model';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { History as HistoryIcon } from 'lucide-react';
import { market } from '../api';
import { reconstruct, valueHoldings } from '../../shared/engine';
import type { Currency, Portfolio } from '../../shared/model';
import { Field, Empty, isoDate, localDate, money, stamp, number } from './ui';
export default function History({
  p,
  demo,
  now,
  currency,
}: {
  p: Portfolio;
  demo: boolean;
  now: string;
  currency: Currency;
}) {
  const [mode, setMode] = useState('current');
  const [date, setDate] = useState(
    localDate(DateTime.fromISO(now).minus({ years: 1 }).toISO()!, p.timezone),
  );
  const [result, setResult] = useState<ReturnType<typeof valueHoldings> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState('');
  async function run() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const at = isoDate(date, p.timezone);
      if (at > now) throw new Error('Elige una fecha anterior o igual a la fecha actual.');
      const holdings = reconstruct(p, mode === 'current' ? now : at, mode === 'actual');
      const data = await market(
        holdings.map((h) => h.asset.id),
        currency,
        demo,
        at,
      );
      setWarnings(data.warnings);
      setResult(valueHoldings(holdings, data.quotes));
      setLabel(
        mode === 'current'
          ? 'Posiciones actuales a precios históricos'
          : 'Portafolio reconstruido a la fecha',
      );
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
          <span className="eyebrow">EL TIEMPO, EN PERSPECTIVA</span>
          <h1>Explora tu historial</h1>
          <p>Dos preguntas distintas. Dos formas transparentes de valorar.</p>
        </div>
        <HistoryIcon size={34} className="purple" />
      </div>
      <section className="card">
        <div className="choice-grid">
          <button
            className={mode === 'current' ? 'choice selected' : 'choice'}
            onClick={() => {
              setMode('current');
              setResult(null);
            }}
          >
            <strong>Mis cantidades de hoy, precios de antes</strong>
            <span>¿Cuánto valdrían mis posiciones actuales con los precios de otra fecha?</span>
          </button>
          <button
            className={mode === 'actual' ? 'choice selected' : 'choice'}
            onClick={() => {
              setMode('actual');
              setResult(null);
            }}
          >
            <strong>Mi portafolio real en el pasado</strong>
            <span>Reconstruye saldos y movimientos hasta la fecha seleccionada.</span>
          </button>
        </div>
        <div className="inline-form">
          <Field label="Fecha y hora de valoración" hint={p.timezone}>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setResult(null);
              }}
            />
          </Field>
          <button className="primary" disabled={loading} onClick={run}>
            {loading ? 'Consultando…' : 'Consultar valoración'}
          </button>
        </div>
        <p className="notice">
          {mode === 'current'
            ? 'Esta estimación no representa el valor real que tenía el portafolio en esa fecha.'
            : 'Se requiere un saldo inicial completo y todos los movimientos posteriores. No se infieren tenencias pasadas.'}{' '}
          Se utiliza el último precio anterior disponible dentro de las 24 horas previas; no se
          interpola.
        </p>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result ? (
        <section className="card">
          <span className="eyebrow">{label}</span>
          <h2 className="large-number">
            {result.complete ? money(result.total, currency) : 'Valoración incompleta'}
          </h2>
          {!result.complete && (
            <p>Subtotal con datos: {money(result.total, currency)}. No representa el total.</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Cantidad</th>
                  <th>Precio / fuente</th>
                  <th>Fecha real del precio</th>
                  <th>Antigüedad respecto a consulta</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.asset.id}>
                    <td>{r.asset.name}</td>
                    <td>{number(r.quantity)}</td>
                    <td>
                      {money(r.quote?.price, currency)}
                      <small>
                        {r.quote?.provider} ·{' '}
                        {r.quote?.kind === 'daily' ? 'Referencia diaria' : 'Intradía'}
                      </small>
                      {r.quote?.fxRate && <small>FX {r.quote.fxRate}</small>}
                    </td>
                    <td>{stamp(r.quote?.timestamp, p.timezone)}</td>
                    <td>
                      {r.quote
                        ? `${Math.max(0, Math.round((Date.parse(isoDate(date, p.timezone)) - Date.parse(r.quote.timestamp)) / 60000))} min`
                        : 'Sin datos'}
                    </td>
                    <td>{money(r.value, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {warnings.map((w, i) => (
            <p className="notice" key={i}>
              {w}
            </p>
          ))}
        </section>
      ) : (
        <section className="card">
          <Empty title="Cada fecha cuenta una historia">
            Selecciona el tipo de consulta y una fecha para explorar tu portafolio.
          </Empty>
        </section>
      )}
    </>
  );
}
