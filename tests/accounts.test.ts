import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { AccountStore } from '../server/accounts';
import { emptyPortfolio } from '../shared/model';

const invitation = 'test-only-invitation-at-least-24-characters';
const password = 'test-only-password-1234';
const origin = 'http://127.0.0.1:3001';
type Auth = { cookie: string; csrf: string; id: string };
describe('private account HTTP boundary', () => {
  const { app, store } = createApp({
    accounts: { filename: ':memory:', registrationCode: invitation, secure: true },
  });
  let server: Server, base: string, alice: Auth, bob: Auth;
  async function request(
    route: string,
    method = 'GET',
    body?: unknown,
    auth?: Auth,
    overrides: Record<string, string> = {},
  ) {
    const res = await fetch(base + route, {
      method,
      headers: {
        Origin: origin,
        ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
        ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.csrf } : {}),
        ...overrides,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, headers: res.headers, data: await res.json() };
  }
  async function register(username: string) {
    const result = await request('/api/account/register', 'POST', {
      username,
      password,
      invitation,
    });
    expect(result.status).toBe(200);
    const cookie = result.headers.get('set-cookie')!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('__Host-cryptofolio=');
    return { cookie: cookie.split(';')[0], csrf: result.data.csrf, id: result.data.user.id };
  }
  beforeAll(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    alice = await register('alice');
    bob = await register('bob');
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store!.close();
  });
  it('rejects anonymous portfolio and market access', async () => {
    for (const route of [
      '/api/account/portfolio',
      '/api/quotes?ids=cmc:1&currency=USD',
      '/api/assets?q=BTC',
    ])
      expect((await request(route)).status).toBe(401);
  });
  it('restricts registration and validates credential lengths', async () => {
    expect(
      (
        await request('/api/account/register', 'POST', {
          username: 'eve',
          password,
          invitation: 'bad',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/api/account/register', 'POST', {
          username: 'eve',
          password: 'short',
          invitation,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request('/api/account/login', 'POST', {
          username: 'alice',
          password: 'wrong-password',
        })
      ).status,
    ).toBe(401);
  });
  it('stores salted password hashes and hashed session tokens', () => {
    const users = store!.db.prepare('SELECT password_hash FROM users').all();
    expect(users[0].password_hash).not.toBe(users[1].password_hash);
    expect(JSON.stringify(users)).not.toContain(password);
    expect(JSON.stringify(store!.db.prepare('SELECT * FROM sessions').all())).not.toContain(
      alice.cookie.split('=')[1],
    );
  });
  it('rejects cross-origin writes, absent origins, and invalid CSRF', async () => {
    const body = { revision: 0, portfolio: emptyPortfolio() };
    for (const headers of [
      { Origin: 'https://attacker.example' },
      { Origin: '' },
      { 'X-CSRF-Token': 'wrong' },
    ] as Record<string, string>[])
      expect((await request('/api/account/portfolio', 'PUT', body, alice, headers)).status).toBe(
        403,
      );
    expect(
      (
        await request('/api/account/portfolio', 'PUT', body, alice, {
          'Content-Type': 'text/plain',
        })
      ).status,
    ).toBe(415);
  });
  it('copies only into an untouched account and isolates users even with forged owner fields', async () => {
    const portfolio = { ...emptyPortfolio(), name: 'Alice private' };
    const result = await request(
      '/api/account/portfolio/import',
      'POST',
      { revision: 0, portfolio, userId: bob.id },
      alice,
    );
    expect(result.status).toBe(200);
    expect(result.data.revision).toBe(1);
    expect(
      (await request('/api/account/portfolio', 'GET', undefined, bob)).data.portfolio,
    ).toBeNull();
    expect(
      (await request('/api/account/portfolio', 'GET', undefined, alice)).data.portfolio.name,
    ).toBe('Alice private');
    expect(
      (await request('/api/account/portfolio/import', 'POST', { revision: 0, portfolio }, alice))
        .status,
    ).toBe(409);
    expect(
      (await request('/api/account/portfolio/import', 'POST', { revision: 1, portfolio }, alice))
        .status,
    ).toBe(409);
  });
  it('rejects invalid domain data without replacing saved content', async () => {
    const portfolio = { ...emptyPortfolio(), positions: [{ id: 'broken', quantity: '-1' }] };
    expect(
      (await request('/api/account/portfolio', 'PUT', { revision: 1, portfolio }, alice)).status,
    ).toBe(400);
    expect((await request('/api/account/portfolio', 'GET', undefined, alice)).data.revision).toBe(
      1,
    );
  });
  it('accepts only one concurrent edit and preserves the winner', async () => {
    const writes = await Promise.all(
      ['first', 'second'].map((name) =>
        request(
          '/api/account/portfolio',
          'PUT',
          { revision: 1, portfolio: { ...emptyPortfolio(), name } },
          alice,
        ),
      ),
    );
    expect(writes.map((r) => r.status).sort()).toEqual([200, 409]);
    const winner = writes.find((r) => r.status === 200)!;
    expect((await request('/api/account/portfolio', 'GET', undefined, alice)).data).toEqual(
      winner.data,
    );
  });
  it('deletes portfolio data without allowing an old revision to recreate it', async () => {
    expect((await request('/api/account/portfolio', 'DELETE', { revision: 2 }, alice)).status).toBe(
      200,
    );
    expect((await request('/api/account/portfolio', 'GET', undefined, alice)).data).toMatchObject({
      revision: 3,
      portfolio: null,
    });
    expect(
      (
        await request(
          '/api/account/portfolio',
          'PUT',
          { revision: 2, portfolio: emptyPortfolio() },
          alice,
        )
      ).status,
    ).toBe(409);
  });
  it('expires sessions and invalidates logout', async () => {
    store!.db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(bob.id);
    expect((await request('/api/account/portfolio', 'GET', undefined, bob)).status).toBe(401);
    expect((await request('/api/account/logout', 'POST', {}, alice)).status).toBe(200);
    expect((await request('/api/account/portfolio', 'GET', undefined, alice)).status).toBe(401);
  });
});
it('persists decimal strings across database restarts with private file permissions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'cryptofolio-db-test-'));
  const filename = path.join(dir, 'portfolio.sqlite');
  let store = new AccountStore(filename);
  try {
    store.db.prepare('INSERT INTO users VALUES (?,?,?)').run('id', 'user', 'test-hash');
    store.db.prepare('INSERT INTO portfolios(user_id) VALUES (?)').run('id');
    const data = {
      ...emptyPortfolio(),
      positions: [
        {
          id: 'p',
          asset: { id: 'cmc:1', cmcId: 1, name: 'Bitcoin', symbol: 'BTC', class: 'crypto' },
          quantity: '0.123456789012345678',
          date: '2026-01-01T00:00:00.000Z',
          costCurrency: 'USD',
        },
      ],
    };
    store.write('id', 0, data);
    store.close();
    store = new AccountStore(filename);
    expect(store.read('id').portfolio).toEqual(data);
    expect(statSync(filename).mode & 0o777).toBe(0o600);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
