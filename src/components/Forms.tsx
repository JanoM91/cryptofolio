import { errorText } from '../../shared/model';
import { useEffect, useState } from 'react';
import Papa from 'papaparse';
import Decimal from 'decimal.js';
import {
  catalog,
  cash,
  positionSchema,
  transactionSchema,
  type Asset,
  type Portfolio,
  type Position,
  type Transaction,
} from '../../shared/model';
import { api, download } from '../api';
import { Badge, Field, Modal, SearchBox, isoDate, localDate } from './ui';
export function AssetPicker({
  value,
  onChange,
  demo,
}: {
  value: Asset;
  onChange: (a: Asset) => void;
  demo: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Asset[]>(catalog);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setError('');
    if (!q || demo) {
      setResults(
        catalog.filter((a) =>
          `${a.name} ${a.symbol} ${a.cmcId ?? ''}`.toLowerCase().includes(q.toLowerCase()),
        ),
      );
      return;
    }
    const timer = setTimeout(
      () =>
        api<Asset[]>('/api/assets?q=' + encodeURIComponent(q))
          .then((r) => {
            if (active)
              setResults([
                ...r,
                ...catalog.filter((a) => a.class === 'cash' && a.symbol.includes(q.toUpperCase())),
              ]);
          })
          .catch((e) => {
            if (active) {
              setError(e.message + ' Se muestra el catálogo local de IDs conocidos.');
              setResults(
                catalog.filter((a) =>
                  `${a.name} ${a.symbol} ${a.cmcId ?? ''}`.toLowerCase().includes(q.toLowerCase()),
                ),
              );
            }
          }),
      350,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, demo]);
  return (
    <div className="asset-picker">
      <SearchBox value={q} onChange={setQ} placeholder="Nombre, símbolo o ID de CoinMarketCap" />
      {error && <p className="notice">{error}</p>}
      <div className="asset-results">
        {results.map((a) => (
          <button
            type="button"
            key={a.id}
            className={value.id === a.id ? 'asset-option selected' : 'asset-option'}
            onClick={() => onChange(a)}
          >
            <Badge asset={a} />
            <span>
              {a.name}
              <small>
                {a.symbol} {a.cmcId ? `· CMC #${a.cmcId}` : '· Efectivo'}
              </small>
            </span>
            {a.id === value.id && <span className="check">✓</span>}
          </button>
        ))}
      </div>
      <p className="muted">
        Seleccionado: {value.name} · {value.symbol} ·{' '}
        {value.cmcId ? `CMC #${value.cmcId}` : 'Efectivo'}
      </p>
    </div>
  );
}
export function PositionForm({
  position,
  p,
  demo,
  now,
  onSave,
  onClose,
}: {
  position?: Position;
  p: Portfolio;
  demo: boolean;
  now: string;
  onSave: (x: Position) => void | Promise<void>;
  onClose: () => void;
}) {
  const [asset, setAsset] = useState(position?.asset ?? catalog[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={position ? 'Editar saldo inicial' : 'Añadir posición'}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          try {
            const f = new FormData(e.currentTarget);
            await onSave(
              positionSchema.parse({
                id: position?.id ?? crypto.randomUUID(),
                asset,
                quantity: f.get('quantity'),
                date: isoDate(String(f.get('date')), p.timezone),
                unitCost: f.get('cost') || undefined,
                costCurrency: f.get('currency'),
              }),
            );
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <AssetPicker value={asset} onChange={setAsset} demo={demo} />
        <div className="form-grid">
          <Field label="Cantidad">
            <input
              name="quantity"
              required
              inputMode="decimal"
              defaultValue={position?.quantity}
              placeholder="0.00"
            />
          </Field>
          <Field label="Fecha y hora del saldo" hint={p.timezone}>
            <input
              name="date"
              type="datetime-local"
              required
              defaultValue={localDate(position?.date ?? now, p.timezone)}
            />
          </Field>
          <Field label="Costo por unidad (opcional)">
            <input
              name="cost"
              inputMode="decimal"
              defaultValue={position?.unitCost}
              placeholder="Desconocido"
            />
          </Field>
          <Field label="Moneda del costo">
            <select name="currency" defaultValue={position?.costCurrency ?? p.baseCurrency}>
              <option>USD</option>
              <option>MXN</option>
            </select>
          </Field>
        </div>
        <p className="notice">
          Este saldo es el punto de partida del activo. Solo se aplican los movimientos posteriores
          a esta fecha. Un costo desconocido no genera una ganancia estimada.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar posición'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TransactionForm({
  p,
  demo,
  now,
  onSave,
  onClose,
  hypothetical = false,
}: {
  p: Portfolio;
  demo: boolean;
  now: string;
  onSave: (x: Transaction) => void | Promise<void>;
  onClose: () => void;
  hypothetical?: boolean;
}) {
  const [asset, setAsset] = useState(catalog[0]);
  const [type, setType] = useState<Transaction['type']>('buy');
  const [mode, setMode] = useState('quantity');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={hypothetical ? 'Operación hipotética' : 'Registrar movimiento'}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          try {
            const f = new FormData(e.currentTarget);
            const price = String(f.get('price') || '0');
            const quantity =
              mode === 'amount'
                ? new Decimal(String(f.get('quantity'))).div(price).toFixed(18)
                : String(f.get('quantity'));
            await onSave(
              transactionSchema.parse({
                id: crypto.randomUUID(),
                asset,
                type,
                date: hypothetical ? now : isoDate(String(f.get('date')), p.timezone),
                quantity,
                price,
                currency: f.get('currency'),
                fee: f.get('fee'),
                notes: f.get('notes') || '',
                direction: f.get('direction') || 'in',
              }),
            );
            onClose();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value as Transaction['type'])}>
              <option value="buy">Compra</option>
              <option value="sell">Venta</option>
              {!hypothetical && (
                <>
                  <option value="deposit">Depósito</option>
                  <option value="withdrawal">Retiro</option>
                  <option value="transfer">Transferencia</option>
                </>
              )}
            </select>
          </Field>
          {!hypothetical && (
            <Field label="Fecha y hora" hint={p.timezone}>
              <input
                type="datetime-local"
                name="date"
                defaultValue={localDate(now, p.timezone)}
                required
              />
            </Field>
          )}
        </div>
        <AssetPicker value={asset} onChange={setAsset} demo={demo} />
        <div className="form-grid">
          <Field label="Introducir">
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="quantity">Cantidad del activo</option>
              {['buy', 'sell'].includes(type) && (
                <option value="amount">Monto (sin comisión)</option>
              )}
            </select>
          </Field>
          <Field label={mode === 'amount' ? 'Monto' : 'Cantidad'}>
            <input name="quantity" required inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Precio por unidad">
            <input name="price" required inputMode="decimal" defaultValue="0" />
          </Field>
          <Field label="Moneda de ejecución y comisión">
            <select name="currency" defaultValue={p.baseCurrency}>
              <option>USD</option>
              <option>MXN</option>
            </select>
          </Field>
          <Field label="Comisión fija">
            <input name="fee" defaultValue="0" required inputMode="decimal" />
          </Field>
          {type === 'transfer' && (
            <Field label="Dirección">
              <select name="direction">
                <option value="in">Entrada al portafolio</option>
                <option value="out">Salida del portafolio</option>
              </select>
            </Field>
          )}
        </div>
        <Field label="Notas opcionales">
          <textarea name="notes" maxLength={1000} />
        </Field>
        <p className="notice">
          Compras y ventas afectan al efectivo en la moneda elegida; registra primero el saldo
          disponible. La venta conserva el efectivo en esa moneda. Para reinvertir, añade después
          otra compra. Las transferencias son entradas o salidas del perímetro de este portafolio.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Guardando…' : hypothetical ? 'Añadir operación' : 'Guardar movimiento'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ImportForm({
  p,
  onSave,
  onClose,
}: {
  p: Portfolio;
  onSave: (p: Portfolio) => void | Promise<void>;
  onClose: () => void;
}) {
  const [kind, setKind] = useState('positions');
  const [preview, setPreview] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const parse = async (file: File) => {
    setErrors([]);
    setPreview([]);
    if (file.size > 2e6) {
      setErrors(['El archivo excede 2 MB.']);
      return;
    }
    setBusy(true);
    try {
      const parsed = Papa.parse<Record<string, string>>(await file.text(), {
        header: true,
        skipEmptyLines: true,
      });
      const problems = parsed.errors.map((e) => e.message);
      const rows: any[] = [];
      if (parsed.data.length > 1000) throw new Error('Máximo 1,000 filas por importación.');
      for (const [i, r] of parsed.data.entries()) {
        try {
          let asset: Asset | undefined;
          if (r.asset_class === 'cash') asset = cash(r.symbol as 'USD' | 'MXN');
          else {
            asset = catalog.find((a) => String(a.cmcId) === r.cmc_id);
            if (!asset) {
              const found = await api<Asset[]>('/api/assets?q=' + encodeURIComponent(r.symbol));
              asset = found.find((a) => String(a.cmcId) === r.cmc_id);
            }
          }
          if (!asset)
            throw new Error(
              'No se pudo verificar el ID CMC. Configura la API o usa un activo del catálogo.',
            );
          if (asset.symbol !== r.symbol) throw new Error('El símbolo no corresponde al ID CMC.');
          const common = { ...r, id: crypto.randomUUID(), asset };
          rows.push(
            kind === 'positions'
              ? positionSchema.parse({
                  ...common,
                  costCurrency: r.currency,
                  unitCost: r.unit_cost || undefined,
                })
              : transactionSchema.parse({
                  ...common,
                  notes: r.notes || '',
                  direction: r.direction || 'in',
                }),
          );
        } catch (e) {
          problems.push(`Fila ${i + 2}: ${errorText(e)}`);
        }
      }
      setPreview(rows);
      setErrors(problems);
    } catch (e) {
      setErrors([errorText(e)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Importar CSV" onClose={onClose}>
      <p className="muted">
        Verifica cada fila antes de confirmar. Las fechas deben incluir zona horaria (ISO 8601). No
        se acepta una importación parcialmente inválida.
      </p>
      <Field label="Contenido">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setPreview([]);
            setErrors([]);
          }}
        >
          <option value="positions">Saldos iniciales</option>
          <option value="transactions">Transacciones</option>
        </select>
      </Field>
      <button
        onClick={() =>
          download(
            'plantilla-' + kind + '.csv',
            kind === 'positions'
              ? 'asset_class,cmc_id,symbol,quantity,date,unit_cost,currency\ncrypto,1,BTC,0.1,2025-01-01T00:00:00.000Z,,USD'
              : 'asset_class,cmc_id,symbol,type,quantity,price,currency,fee,date,direction,notes\ncash,,USD,deposit,1000,1,USD,0,2025-01-02T00:00:00.000Z,in,',
            'text/csv',
          )
        }
      >
        Descargar plantilla
      </button>
      <Field label="Archivo CSV">
        <input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.[0]) void parse(e.target.files[0]);
          }}
        />
      </Field>
      {busy && <p>Cargando y verificando activos…</p>}
      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
      {preview.length > 0 && (
        <>
          <h3>{preview.length} filas para revisar</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Cantidad</th>
                  <th>Fecha</th>
                  <th>Tipo / costo unitario</th>
                  <th>Precio</th>
                  <th>Moneda</th>
                  <th>Comisión</th>
                  <th>Dirección / notas</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.asset.symbol} · {r.asset.id}
                    </td>
                    <td>{r.quantity}</td>
                    <td>{r.date}</td>
                    <td>{r.type ?? r.unitCost ?? 'Desconocido'}</td>
                    <td>{r.price ?? '—'}</td>
                    <td>{r.currency ?? r.costCurrency}</td>
                    <td>{r.fee ?? '—'}</td>
                    <td>
                      {r.direction ?? ''} {r.notes ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancelar</button>
        <button
          className="primary"
          disabled={busy || !!errors.length || !preview.length}
          onClick={async () => {
            setBusy(true);
            try {
              const next = {
                ...p,
                [kind]: [...p[kind as 'positions' | 'transactions'], ...preview],
              };
              await onSave(next);
              onClose();
            } catch (e) {
              setErrors([errorText(e)]);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirmar importación
        </button>
      </div>
    </Modal>
  );
}
