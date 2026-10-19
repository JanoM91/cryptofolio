import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import App, { loadLocal } from './App';
import { api, download } from './api';
import { emptyPortfolio, errorText, type Portfolio } from '../shared/model';
import { Field, Modal, number, stamp } from './components/ui';

type Session = { user: { id: string; username: string } | null; csrf: string };
type Saved = { portfolio: Portfolio | null; revision: number; updatedAt: string | null };
export type RemoteWorkspace = {
  username: string;
  portfolio: Portfolio;
  save: (p: Portfolio) => Promise<void>;
  remove: () => Promise<void>;
};
export default function Accounts() {
  const [status, setStatus] = useState<{ accounts: boolean; registration: boolean }>();
  const [session, setSession] = useState<Session>({ user: null, csrf: '' });
  const [saved, setSaved] = useState<Saved>();
  const revision = useRef(0);
  const writing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [register, setRegister] = useState(false);
  const [migration, setMigration] = useState<Portfolio>();
  const [confirmed, setConfirmed] = useState(false);
  const [generation, setGeneration] = useState(0);
  function accept(next: Saved) {
    revision.current = next.revision;
    setSaved(next);
  }
  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const config = await api<{ accounts: boolean; registration: boolean }>('/api/status');
        if (!active) return;
        setStatus(config);
        if (config.accounts) {
          const me = await api<Session>('/api/account/session');
          const data = me.user ? await api<Saved>('/api/account/portfolio') : undefined;
          if (!active) return;
          if (data) accept(data);
          setSession(me);
        }
      } catch {
        if (active)
          setError(
            'No se pudo comprobar la cuenta. Puedes revisar tu copia local; vuelve a cargar cuando el servidor esté disponible.',
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);
  async function write(portfolio?: Portfolio, importing = false) {
    if (writing.current) throw new Error('Espera a que termine el guardado anterior.');
    writing.current = true;
    setBusy(true);
    try {
      const result = await api<Saved>(`/api/account/portfolio${importing ? '/import' : ''}`, {
        method: importing ? 'POST' : portfolio ? 'PUT' : 'DELETE',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf },
        body: JSON.stringify({ revision: revision.current, ...(portfolio ? { portfolio } : {}) }),
      });
      accept(result);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  const remote =
    session.user && saved
      ? {
          username: session.user.username,
          portfolio: saved.portfolio || emptyPortfolio(),
          save: (p: Portfolio) => write(p),
          remove: () => write(),
        }
      : undefined;
  if (loading)
    return (
      <div className="account-loading" role="status">
        Abriendo tu espacio…
      </div>
    );
  const accountPanel = (
    <section className="card account-card">
      <h2>
        <ShieldCheck size={20} /> Cuenta y almacenamiento
      </h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {remote ? (
        <>
          <p>
            <strong>{remote.username}</strong> · Cuenta privada en este servidor.
          </p>
          <p>
            Se guardan posiciones, movimientos, escenarios y preferencias. La copia del navegador
            permanece separada.
          </p>
          <p className="muted">
            {saved?.updatedAt
              ? `Último guardado: ${stamp(saved.updatedAt, remote.portfolio.timezone)}`
              : 'Cuenta nueva: todavía no has guardado un portafolio.'}
          </p>
          <div className="actions wrap">
            {saved?.revision === 0 && (
              <button
                data-leaves-workspace
                disabled={busy}
                onClick={() => {
                  try {
                    const local = loadLocal();
                    if (local.error) throw new Error(local.error);
                    if (
                      !local.portfolio.positions.length &&
                      !local.portfolio.transactions.length &&
                      !local.portfolio.scenarios.length
                    )
                      throw new Error(
                        'No hay registros locales para copiar. Puedes comenzar con una posición nueva.',
                      );
                    setMigration(local.portfolio);
                    setConfirmed(false);
                    setError('');
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Revisar copia del navegador
              </button>
            )}
            <button
              data-leaves-workspace
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api('/api/account/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrf },
                    body: '{}',
                  });
                  setSession({ user: null, csrf: '' });
                  setSaved(undefined);
                  setMigration(undefined);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <LogOut size={16} /> Cerrar sesión
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Tu portafolio actual está en este navegador. Una cuenta permite guardarlo en el servidor
            y consultarlo desde dispositivos con acceso a ese servidor.
          </p>
          {status?.accounts ? (
            <button
              data-leaves-workspace
              className="primary"
              onClick={() => {
                setOpen(true);
                setError('');
              }}
            >
              <LogIn size={16} /> Acceder a mi cuenta
            </button>
          ) : (
            <p className="notice">
              Las cuentas aún no están activadas en este servidor. Consulta la guía de cuentas del
              proyecto para habilitarlas. Tus datos locales siguen disponibles.
            </p>
          )}
        </>
      )}
      {status?.accounts && !remote && (
        <p className="muted">
          El acceso a precios requiere iniciar sesión. La demostración sigue disponible.
        </p>
      )}
    </section>
  );
  return (
    <>
      <App
        key={`${session.user?.id || 'local'}-${generation}`}
        remote={remote}
        accountPanel={accountPanel}
      />
      {open && (
        <Modal
          title={register ? 'Crear cuenta por invitación' : 'Acceder a mi cuenta'}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            Al entrar se abrirá el portafolio de esa cuenta. Tu copia local no se copiará ni se
            eliminará automáticamente.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              try {
                const me = await api<Session>(`/api/account/${register ? 'register' : 'login'}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(Object.fromEntries(f)),
                });
                const data = await api<Saved>('/api/account/portfolio');
                accept(data);
                setSession(me);
                setOpen(false);
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Usuario"
              hint="3–40 caracteres: letras sin acentos, números, punto, guion o guion bajo."
            >
              <input
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={40}
                pattern="[a-zA-Z0-9_.\-]{3,40}"
              />
            </Field>
            <Field label="Contraseña" hint="Entre 12 y 128 caracteres.">
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            {register && (
              <Field label="Código de invitación">
                <input
                  name="invitation"
                  type="password"
                  autoComplete="off"
                  required
                  maxLength={256}
                />
              </Field>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              {status?.registration && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setRegister(!register);
                    setError('');
                  }}
                >
                  {register ? 'Ya tengo cuenta' : 'Tengo una invitación'}
                </button>
              )}
              <button className="primary" disabled={busy}>
                {busy ? 'Comprobando…' : register ? 'Crear cuenta' : 'Entrar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {migration && (
        <Modal
          title="Revisar antes de copiar"
          onClose={() => {
            if (!busy) setMigration(undefined);
          }}
        >
          <p>
            Origen: este navegador. Destino: <strong>{session.user?.username}</strong> en este
            servidor. Se copiará <strong>{migration.name}</strong> con moneda base{' '}
            {migration.baseCurrency} y zona horaria {migration.timezone}.
          </p>
          <p>
            {migration.positions.length} posiciones · {migration.transactions.length} movimientos ·{' '}
            {migration.scenarios.length} escenarios.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th>Cantidad</th>
                  <th>Fecha del saldo</th>
                </tr>
              </thead>
              <tbody>
                {migration.positions.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.asset.name} · {p.asset.id}
                    </td>
                    <td>{number(p.quantity)}</td>
                    <td>{stamp(p.date, migration.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Ver todos los datos que se copiarán</summary>
            <pre className="migration-json">{JSON.stringify(migration, null, 2)}</pre>
          </details>
          <p className="notice">
            Se conservará la copia local. No se combina con otros registros ni se sustituye un
            portafolio existente.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{' '}
            Revisé los datos y la cuenta de destino.
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              onClick={() =>
                download('cryptofolio-respaldo-local.json', JSON.stringify(migration, null, 2))
              }
            >
              Descargar respaldo
            </button>
            <button
              disabled={busy || !confirmed}
              className="primary"
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await write(migration, true);
                  setMigration(undefined);
                  setGeneration((x) => x + 1);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Copiando…' : 'Confirmar copia a mi cuenta'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
