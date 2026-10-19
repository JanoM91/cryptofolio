import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { portfolioSchema } from '../shared/model';
import { validateLedger } from '../shared/engine';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) =>
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_.-]{3,40}$/),
  password: z.string().min(12).max(128),
});
export async function passwordHash(password: string, salt = randomBytes(32).toString('hex')) {
  const key = await new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
  return `${salt}:${key.toString('hex')}`;
}
export type AccountConfig = { filename: string; registrationCode: string; secure: boolean };
type User = { id: string; username: string; password_hash: string };
type Session = { id: string; username: string; token_hash: string; expires: number };

export class AccountStore {
  db: DatabaseSync;
  constructor(filename: string) {
    if (filename !== ':memory:') {
      mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(filename);
    if (filename !== ':memory:') chmodSync(filename, 0o600);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS portfolios (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision INTEGER NOT NULL DEFAULT 0, document TEXT, updated_at TEXT);
      PRAGMA secure_delete=ON;`);
  }
  read(id: string) {
    const row = this.db
      .prepare('SELECT revision, document, updated_at FROM portfolios WHERE user_id=?')
      .get(id)!;
    return {
      portfolio: row.document ? JSON.parse(row.document as string) : null,
      revision: row.revision as number,
      updatedAt: row.updated_at as string | null,
    };
  }
  write(id: string, revision: number, portfolio: unknown) {
    const result = this.db
      .prepare(
        'UPDATE portfolios SET document=?, revision=revision+1, updated_at=? WHERE user_id=? AND revision=?',
      )
      .run(
        portfolio === null ? null : JSON.stringify(portfolio),
        new Date().toISOString(),
        id,
        revision,
      );
    return result.changes ? this.read(id) : null;
  }
  close() {
    this.db.close();
  }
}

export function accountRoutes(store: AccountStore, config: AccountConfig) {
  const router = express.Router();
  const cookieName = config.secure ? '__Host-cryptofolio' : 'cryptofolio_session';
  const cookieOptions = {
    httpOnly: true,
    secure: config.secure,
    sameSite: 'strict' as const,
    path: '/',
  };
  const tokenFor = (req: express.Request) => {
    const value = req.headers.cookie
      ?.split(';')
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : '';
  };
  const sessionFor = (req: express.Request) =>
    store.db
      .prepare(
        'SELECT users.id, username, token_hash, expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires>?',
      )
      .get(digest(tokenFor(req)), Date.now()) as Session | undefined;
  const requireAccount: express.RequestHandler = (req, res, next) => {
    const session = sessionFor(req);
    if (!session) {
      res.status(401).json({ error: 'Inicia sesión para acceder a tu cuenta y a los precios.' });
      return;
    }
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      !equal(req.get('X-CSRF-Token') || '', digest(`${tokenFor(req)}:csrf`))
    ) {
      res
        .status(403)
        .json({ error: 'La sesión no pudo validar la solicitud. Vuelve a iniciar sesión.' });
      return;
    }
    res.locals.account = session;
    next();
  };
  const sessionResponse = (user: { id: string; username: string }, token: string) => ({
    user: { id: user.id, username: user.username },
    csrf: digest(`${token}:csrf`),
  });
  function startSession(user: User, res: express.Response) {
    const token = randomBytes(32).toString('hex');
    const age = 7 * 24 * 60 * 60 * 1000;
    store.db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    store.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(digest(token), user.id, Date.now() + age);
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: age });
    res.json(sessionResponse(user, token));
  }
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  });
  router.get('/session', (req, res) => {
    const session = sessionFor(req);
    res.json(session ? sessionResponse(session, tokenFor(req)) : { user: null, csrf: '' });
  });
  router.post('/register', authLimit, async (req, res) => {
    const input = credentials.extend({ invitation: z.string().max(256) }).parse(req.body);
    if (!config.registrationCode || !equal(input.invitation, config.registrationCode)) {
      res.status(403).json({
        error: 'Registro restringido. Comprueba la invitación con quien administra el servidor.',
      });
      return;
    }
    const hash = await passwordHash(input.password);
    const user = { id: randomUUID(), username: input.username, password_hash: hash };
    store.db.exec('BEGIN IMMEDIATE');
    try {
      if (store.db.prepare('SELECT id FROM users WHERE username=?').get(input.username)) {
        store.db.exec('ROLLBACK');
        res
          .status(409)
          .json({ error: 'No se puede crear esa cuenta. Prueba otro nombre de usuario.' });
        return;
      }
      store.db.prepare('INSERT INTO users VALUES (?,?,?)').run(user.id, user.username, hash);
      store.db.prepare('INSERT INTO portfolios (user_id) VALUES (?)').run(user.id);
      store.db.exec('COMMIT');
    } catch (e) {
      store.db.exec('ROLLBACK');
      throw e;
    }
    startSession(user, res);
  });
  router.post('/login', authLimit, async (req, res) => {
    const input = credentials.parse(req.body);
    const user = store.db.prepare('SELECT * FROM users WHERE username=?').get(input.username) as
      User | undefined;
    const candidate = await passwordHash(
      input.password,
      user?.password_hash.split(':')[0] || '0'.repeat(64),
    );
    if (!user || !equal(candidate, user.password_hash)) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }
    const old = tokenFor(req);
    if (old) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));
    startSession(user, res);
  });
  router.post('/logout', requireAccount, (_req, res) => {
    store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(res.locals.account.token_hash);
    res.clearCookie(cookieName, cookieOptions).json({ ok: true });
  });
  router.get('/portfolio', requireAccount, (_req, res) =>
    res.json(store.read(res.locals.account.id)),
  );
  const write =
    (remove: boolean, importing: boolean): express.RequestHandler =>
    (req, res) => {
      const input = z
        .object({
          revision: z.number().int().nonnegative(),
          portfolio: remove ? z.undefined().optional() : portfolioSchema,
        })
        .parse(req.body);
      // Only a pristine account can receive a migration. Ordinary restoration uses PUT + revision.
      if (importing && input.revision !== 0) {
        res
          .status(409)
          .json({ error: 'La cuenta ya tiene un historial. La copia local no se ha modificado.' });
        return;
      }
      let validated = null;
      try {
        validated = remove ? null : validateLedger(input.portfolio!);
      } catch {
        res.status(400).json({ error: 'El portafolio tiene saldos o movimientos incoherentes.' });
        return;
      }
      const result = store.write(res.locals.account.id, input.revision, validated);
      if (!result) {
        res.status(409).json({
          error:
            'Hay cambios de otra sesión. Descarga tu borrador y recarga para revisar la versión guardada antes de volver a intentarlo.',
        });
        return;
      }
      res.json(result);
    };
  router.put('/portfolio', requireAccount, write(false, false));
  router.post('/portfolio/import', requireAccount, write(false, true));
  router.delete('/portfolio', requireAccount, write(true, false));
  return { router, requireAccount };
}
