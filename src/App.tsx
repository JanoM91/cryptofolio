import { errorText } from '../shared/model';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  History as HistoryIcon,
  FlaskConical,
  Settings,
  ChevronDown,
  ArrowUpRight,
  Plus,
  Upload,
  Download,
  Trash2,
  ShieldCheck,
  Menu,
  Check,
  ExternalLink,
} from 'lucide-react';
import {
  emptyPortfolio,
  portfolioSchema,
  allAssets,
  type Currency,
  type Portfolio,
  type Position,
  type MarketResult,
} from '../shared/model';
import { DEMO_NOW, demoPortfolio } from '../shared/demo';
import { validateLedger } from '../shared/engine';
import { api, market, download } from './api';
import Dashboard from './components/Dashboard';
import History from './components/History';
import Scenarios from './components/Scenarios';
import { ImportForm, PositionForm, TransactionForm } from './components/Forms';
import {
  Badge,
  Empty,
  Field,
  Modal,
  isoDate,
  localDate,
  money,
  number,
  stamp,
} from './components/ui';
const storageKey = 'cryptofolio:portfolio:v1';
const labels: Record<string, string> = {
  dashboard: 'Vista general',
  positions: 'Posiciones',
  transactions: 'Movimientos',
  history: 'Historial',
  scenarios: 'Simulador',
  settings: 'Configuración',
};
function load() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return { portfolio: emptyPortfolio(), error: '' };
  try {
    return { portfolio: validateLedger(portfolioSchema.parse(JSON.parse(raw))), error: '' };
  } catch {
    return {
      portfolio: emptyPortfolio(),
      error:
        'No se pudieron validar los datos guardados. Se conservaron en el navegador. Expórtalos para recuperarlos antes de guardar cambios.',
    };
  }
}
export default function App() {
  const [initial] = useState(load);
  const [personal, setPersonal] = useState(initial.portfolio);
  const [sample, setSample] = useState(demoPortfolio);
  const [demo, setDemo] = useState(false);
  const p = demo ? sample : personal;
  const [currency, setCurrency] = useState<Currency>(p.baseCurrency);
  const [page, setPage] = useState('dashboard');
  const [mobile, setMobile] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState('');
  const [data, setData] = useState<MarketResult>({ quotes: {}, warnings: [] });
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(new Date().toISOString());
  const effectiveNow = demo ? DEMO_NOW : now;
  const [modal, setModal] = useState<'position' | 'transaction' | 'import' | null>(null);
  const [editing, setEditing] = useState<Position>();
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'position' | 'transaction' | 'portfolio';
    id?: string;
    name?: string;
  } | null>(null);
  const [error, setError] = useState(initial.error);
  const [toast, setToast] = useState('');
  useEffect(() => {
    api<{ configured: boolean }>('/api/status')
      .then((s) => {
        setConfigured(s.configured);
        setStatusError('');
      })
      .catch(() => {
        setConfigured(null);
        setStatusError('Servidor de precios no disponible. Inicia npm run dev.');
      });
  }, [tick]);
  const assetsKey = allAssets(p)
    .map((a) => a.id)
    .join(',');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setData({ quotes: {}, warnings: [] });
    market(assetsKey ? assetsKey.split(',') : [], currency, demo)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setData({ quotes: {}, warnings: [e.message] });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [assetsKey, currency, demo, tick]);
  useEffect(() => {
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  function save(next: Portfolio) {
    const parsed = validateLedger(portfolioSchema.parse(next));
    if (demo) setSample(parsed);
    else {
      if (initial.error && localStorage.getItem(storageKey))
        throw new Error('Exporta y elimina los datos no válidos antes de guardar.');
      try {
        localStorage.setItem(storageKey, JSON.stringify(parsed));
      } catch {
        throw new Error('No se pudo guardar: revisa el espacio y los permisos del navegador.');
      }
      setPersonal(parsed);
    }
    setToast('Cambios guardados');
  }
  const refresh = () => {
    setNow(new Date().toISOString());
    setTick((t) => t + 1);
  };
  const openPosition = () => {
    setEditing(undefined);
    setModal('position');
  };
  return (
    <div className="app-shell">
      <aside className={mobile ? 'sidebar visible' : 'sidebar'}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage('dashboard');
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          cryptofolio<span className="brand-dot">.</span>
        </a>
        <button className="portfolio-selector" onClick={() => setPage('settings')}>
          <span className="portfolio-avatar">P</span>
          <span>
            <strong>{demo ? 'Portafolio demo' : p.name}</strong>
            <small>Espacio personal</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {Object.entries(labels)
            .filter(([id]) => id !== 'settings')
            .map(([id, label]) => {
              const Icon = {
                dashboard: LayoutDashboard,
                positions: Wallet,
                transactions: ArrowLeftRight,
                history: HistoryIcon,
                scenarios: FlaskConical,
              }[id]!;
              return (
                <button
                  key={id}
                  className={page === id ? 'nav-item active' : 'nav-item'}
                  onClick={() => {
                    setPage(id);
                    setMobile(false);
                  }}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  {id === 'scenarios' && <span className="nav-badge">LAB</span>}
                </button>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <div className="insight-card">
            <span className="insight-icon">
              <FlaskConical size={20} />
            </span>
            <strong>El siguiente “¿y si…?”</strong>
            <p>Explora posibilidades con el simulador de escenarios.</p>
            <button onClick={() => setPage('scenarios')}>
              Crear un escenario <ArrowUpRight size={15} />
            </button>
          </div>
          <button
            className={page === 'settings' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setPage('settings');
              setMobile(false);
            }}
          >
            <Settings size={19} />
            Configuración
          </button>
          <div className="profile">
            <span className="avatar">YO</span>
            <div>
              <strong>Mi espacio</strong>
              <small>Almacenamiento local</small>
            </div>
            <ShieldCheck size={17} />
          </div>
        </div>
      </aside>
      {mobile && (
        <button aria-label="Cerrar menú" className="scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Mi portafolio</span>
            <span>/</span>
            <strong>{labels[page]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={14} />
              Privado y local
            </span>
            <select
              aria-label="Moneda de visualización"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              <option value="USD">USD · $</option>
              <option value="MXN">MXN · $</option>
            </select>
            <span className="avatar small">YO</span>
          </div>
        </header>
        <main>
          <div className={demo ? 'mode-banner demo' : 'mode-banner'}>
            <span>
              <span className="status-dot" />
              {demo ? (
                <>
                  <strong>Modo demostración</strong>
                  <span className="banner-detail">
                    {' '}
                    · Precios y saldos ficticios · referencia: 2 oct 2026
                  </span>
                </>
              ) : configured ? (
                <>
                  <strong>CoinMarketCap configurado</strong>
                  <span className="banner-detail"> · Precios sujetos a cobertura de tu plan</span>
                </>
              ) : (
                <>
                  <strong>{statusError || 'Tu portafolio, listo para comenzar'}</strong>
                  <span className="banner-detail"> · Configura la API o explora un ejemplo</span>
                </>
              )}
            </span>
            <button
              onClick={() => {
                setDemo(!demo);
                setCurrency(!demo ? sample.baseCurrency : personal.baseCurrency);
                setError('');
              }}
            >
              {demo ? 'Volver a mi portafolio' : 'Explorar demo'}
              <ArrowUpRight size={14} />
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
              <button onClick={() => setError('')}>Cerrar</button>
            </p>
          )}
          {(page === 'dashboard' || page === 'positions') && (
            <Dashboard
              p={p}
              demo={demo}
              now={effectiveNow}
              currency={currency}
              data={data}
              loading={loading}
              refresh={refresh}
              onAdd={openPosition}
              onEdit={(pos) => {
                setEditing(pos);
                setModal('position');
              }}
              onDelete={(pos) =>
                setDeleteTarget({ kind: 'position', id: pos.id, name: pos.asset.name })
              }
              positionsOnly={page === 'positions'}
            />
          )}
          {page === 'transactions' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CADA MOVIMIENTO CUENTA</span>
                  <h1>Movimientos</h1>
                  <p>Un registro claro de las entradas, salidas y operaciones de tu portafolio.</p>
                </div>
                <div className="actions">
                  <button onClick={() => setModal('import')}>
                    <Upload size={16} />
                    Importar CSV
                  </button>
                  <button className="primary" onClick={() => setModal('transaction')}>
                    <Plus size={16} />
                    Registrar movimiento
                  </button>
                </div>
              </div>
              <section className="card">
                {p.transactions.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Tipo</th>
                          <th>Activo</th>
                          <th>Cantidad</th>
                          <th>Precio</th>
                          <th>Comisión</th>
                          <th>Notas</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {[...p.transactions]
                          .sort((a, b) => b.date.localeCompare(a.date))
                          .map((t) => (
                            <tr key={t.id}>
                              <td>{stamp(t.date, p.timezone)}</td>
                              <td>
                                <span className="tag">
                                  {
                                    {
                                      buy: 'Compra',
                                      sell: 'Venta',
                                      deposit: 'Depósito',
                                      withdrawal: 'Retiro',
                                      transfer: `Transferencia ${t.direction === 'in' ? 'entrada' : 'salida'}`,
                                    }[t.type]
                                  }
                                </span>
                              </td>
                              <td>
                                <div className="asset-cell">
                                  <Badge asset={t.asset} />
                                  {t.asset.symbol}
                                </div>
                              </td>
                              <td>{number(t.quantity)}</td>
                              <td>{money(t.price, t.currency)}</td>
                              <td>{money(t.fee, t.currency)}</td>
                              <td>{t.notes || '—'}</td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label="Eliminar movimiento"
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'transaction',
                                      id: t.id,
                                      name: t.asset.symbol,
                                    })
                                  }
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Aquí comienza tu historial">
                    <p>Registra una compra, venta, depósito, retiro o transferencia.</p>
                    <button onClick={() => setModal('transaction')}>
                      <Plus size={16} />
                      Registrar movimiento
                    </button>
                  </Empty>
                )}
              </section>
              <p className="notice">
                Las operaciones posteriores al saldo inicial actualizan las cantidades
                automáticamente. Los movimientos en la misma fecha y hora o anteriores al saldo
                inicial se consideran incluidos en ese saldo.
              </p>
            </>
          )}
          {page === 'history' && (
            <History
              key={`${demo}-${currency}`}
              p={p}
              demo={demo}
              now={effectiveNow}
              currency={currency}
            />
          )}
          {page === 'scenarios' && (
            <Scenarios
              key={`${demo}-${currency}`}
              p={p}
              save={save}
              demo={demo}
              now={effectiveNow}
              currency={currency}
              data={data}
            />
          )}
          {page === 'settings' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">A TU MANERA</span>
                  <h1>Configuración</h1>
                  <p>Tu moneda, tus datos y las reglas de tu análisis.</p>
                </div>
              </div>
              <div className="settings-grid">
                <section className="card">
                  <h2>Preferencias del portafolio</h2>
                  <form
                    key={demo ? 'demo' : 'personal'}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      try {
                        save({
                          ...p,
                          name: String(f.get('name')),
                          baseCurrency: f.get('baseCurrency') as Currency,
                          timezone: String(f.get('timezone')),
                          historyFrom: f.get('complete')
                            ? isoDate(String(f.get('historyFrom')), String(f.get('timezone')))
                            : undefined,
                        });
                        setCurrency(f.get('baseCurrency') as Currency);
                        setError('');
                      } catch (e) {
                        setError(errorText(e));
                      }
                    }}
                  >
                    <Field label="Nombre">
                      <input name="name" defaultValue={p.name} required maxLength={100} />
                    </Field>
                    <div className="form-grid">
                      <Field label="Moneda base">
                        <select name="baseCurrency" defaultValue={p.baseCurrency}>
                          <option>MXN</option>
                          <option>USD</option>
                        </select>
                      </Field>
                      <Field label="Zona horaria">
                        <select name="timezone" defaultValue={p.timezone}>
                          {[
                            'America/Mexico_City',
                            'America/Cancun',
                            'America/Tijuana',
                            'America/New_York',
                            'America/Bogota',
                            'Europe/Madrid',
                            'UTC',
                          ].map((z) => (
                            <option key={z}>{z}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <h3>Integridad del historial</h3>
                    <p className="muted">
                      Confirma solo cuando hayas registrado todos los saldos de partida y
                      movimientos posteriores. Antes de esa fecha no se reconstruirán tenencias.
                    </p>
                    <Field
                      label="Historial completo desde"
                      hint="Los saldos iniciales deben ser anteriores o iguales a esta fecha."
                    >
                      <input
                        name="historyFrom"
                        type="datetime-local"
                        defaultValue={localDate(p.historyFrom ?? effectiveNow, p.timezone)}
                      />
                    </Field>
                    <label className="checkbox">
                      <input type="checkbox" name="complete" defaultChecked={!!p.historyFrom} />
                      Confirmo que los saldos y movimientos son completos desde esa fecha.
                    </label>
                    <button className="primary">Guardar preferencias</button>
                  </form>
                </section>
                <section className="card">
                  <h2>Datos de mercado</h2>
                  <div className="connection">
                    <span className="provider-logo">C</span>
                    <div>
                      <strong>CoinMarketCap</strong>
                      <small>
                        {configured
                          ? 'Clave configurada en el servidor'
                          : 'Pendiente de configuración'}
                      </small>
                    </div>
                    <span className="tag">API oficial</span>
                  </div>
                  <p>
                    Configura la variable <code>CMC_API_KEY</code> en el archivo <code>.env</code>{' '}
                    del servidor y reinícialo. La clave no se envía ni se guarda en este navegador.
                  </p>
                  <pre>
                    CMC_API_KEY=tu_clave
                    <br />
                    PORT=3001
                    <br />
                    HOST=127.0.0.1
                  </pre>
                  <p className="notice">
                    Cotizaciones históricas y tipos de cambio dependen del plan contratado y de la
                    cobertura del activo. La aplicación muestra “sin datos” cuando no hay una
                    referencia válida.
                  </p>
                  <a
                    href="https://coinmarketcap.com/api/documentation/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Documentación de CoinMarketCap <ExternalLink size={14} />
                  </a>
                  <h3>Método de costo</h3>
                  <p>
                    Promedio ponderado móvil, incluyendo comisiones de compra. Las ventas reducen el
                    costo proporcionalmente. Los depósitos y transferencias sin costo documentado
                    vuelven desconocido el costo de esa posición. Las ganancias solo se muestran
                    cuando el costo y el precio están en la misma moneda.
                  </p>
                </section>
                <section className="card">
                  <h2>Importar y exportar</h2>
                  <p>
                    Las posiciones, movimientos, preferencias y escenarios se guardan únicamente en
                    este navegador. No hay cuentas ni sincronización entre dispositivos.
                  </p>
                  <div className="actions wrap">
                    <button onClick={() => setModal('import')}>
                      <Upload size={16} />
                      Importar CSV
                    </button>
                    <button
                      onClick={() =>
                        download(
                          'cryptofolio' + (demo ? '-demo' : '') + '.json',
                          !demo && initial.error
                            ? localStorage.getItem(storageKey) || '{}'
                            : JSON.stringify(p, null, 2),
                        )
                      }
                    >
                      <Download size={16} />
                      Exportar portafolio
                    </button>
                  </div>
                  <Field label="Restaurar una copia JSON">
                    <input
                      type="file"
                      accept=".json"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          if (file.size > 5e6) throw new Error('Máximo 5 MB.');
                          const next = portfolioSchema.parse(JSON.parse(await file.text()));
                          if (
                            !window.confirm(
                              'Esta copia sustituirá el portafolio actual. ¿Continuar?',
                            )
                          )
                            return;
                          save(next);
                          setError('');
                        } catch (e) {
                          setError(errorText(e));
                        }
                        e.target.value = '';
                      }}
                    />
                  </Field>
                </section>
                <section className="card">
                  <h2>Privacidad y control</h2>
                  <p>
                    El servidor solo recibe IDs de activos, moneda y fechas para consultar precios.
                    Las cantidades y notas no se envían al proveedor. Cualquier persona con acceso a
                    este perfil del navegador puede ver los datos locales.
                  </p>
                  <p>
                    Aplicación de análisis sin ejecución de órdenes, conexión de wallets, cálculo de
                    impuestos ni recomendaciones de inversión.
                  </p>
                  <button className="danger" onClick={() => setDeleteTarget({ kind: 'portfolio' })}>
                    <Trash2 size={16} />
                    Eliminar portafolio {demo ? 'de demostración' : ''}
                  </button>
                </section>
              </div>
            </>
          )}
          <footer>
            <span>
              cryptofolio <span className="purple">·</span> Tu patrimonio, en perspectiva.
            </span>
            <span>
              {p.timezone} · {demo ? 'Demostración' : 'Espacio personal'}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          {toast}
        </div>
      )}
      {modal === 'position' && (
        <PositionForm
          position={editing}
          p={p}
          demo={demo}
          now={effectiveNow}
          onClose={() => setModal(null)}
          onSave={(pos) =>
            save({
              ...p,
              positions: editing
                ? p.positions.map((x) => (x.id === editing.id ? pos : x))
                : [...p.positions, pos],
            })
          }
        />
      )}
      {modal === 'transaction' && (
        <TransactionForm
          p={p}
          demo={demo}
          now={effectiveNow}
          onClose={() => setModal(null)}
          onSave={(t) => save({ ...p, transactions: [...p.transactions, t] })}
        />
      )}
      {modal === 'import' && <ImportForm p={p} onClose={() => setModal(null)} onSave={save} />}
      {deleteTarget && (
        <Modal
          title={deleteTarget.kind === 'portfolio' ? 'Eliminar portafolio' : 'Eliminar registro'}
          onClose={() => setDeleteTarget(null)}
        >
          <p>
            {deleteTarget.kind === 'portfolio'
              ? 'Se eliminarán posiciones, movimientos y escenarios de este espacio. Exporta una copia si quieres conservarlos.'
              : `Se eliminará el registro de ${deleteTarget.name}. Esta acción puede cambiar las valoraciones y la reconstrucción histórica.`}
          </p>
          <div className="modal-actions">
            <button onClick={() => setDeleteTarget(null)}>Cancelar</button>
            <button
              className="danger"
              onClick={() => {
                try {
                  if (deleteTarget.kind === 'portfolio') {
                    if (demo) setSample(emptyPortfolio());
                    else {
                      localStorage.removeItem(storageKey);
                      setPersonal(emptyPortfolio());
                      initial.error = '';
                    }
                  } else
                    save({
                      ...p,
                      [deleteTarget.kind === 'position' ? 'positions' : 'transactions']: p[
                        deleteTarget.kind === 'position' ? 'positions' : 'transactions'
                      ].filter((x) => x.id !== deleteTarget.id),
                      historyFrom: undefined,
                    });
                  setDeleteTarget(null);
                  setError('');
                } catch (e) {
                  setError(errorText(e));
                  setDeleteTarget(null);
                }
              }}
            >
              Confirmar eliminación
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
