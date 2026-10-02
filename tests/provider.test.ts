import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeQuotes, CoinMarketCapProvider, cmc } from '../server/provider';
const at = '2025-01-02T12:00:00.000Z';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('CoinMarketCap normalization', () => {
  it.each([0, '0'])('accepts successful error code %j at the HTTP boundary', async (code) => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    const body = { status: { error_code: code }, data: [{ id: 1 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    await expect(
      cmc('/v3/cryptocurrency/quotes/latest', { id: '1', test: typeof code }),
    ).resolves.toEqual(body);
  });
  it.each([1006, '1006'])('still rejects nonzero error code %j', async (code) => {
    vi.stubEnv('CMC_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: { error_code: code } }))),
    );
    await expect(
      cmc('/v3/cryptocurrency/quotes/latest', { id: '1', test: 'error-' + typeof code }),
    ).rejects.toThrow('rechazó');
  });
  it('parses latest v3 arrays and currency quote arrays', () => {
    const result = normalizeQuotes(
      [
        {
          id: 1,
          quote: [{ symbol: 'MXN', price: 123.456, last_updated: at, percent_change_24h: -3 }],
        },
      ],
      ['cmc:1'],
      'MXN',
    );
    expect(result.quotes['cmc:1']).toMatchObject({
      price: '123.456',
      currency: 'MXN',
      timestamp: at,
      change24h: -3,
    });
  });
  it('parses historical maps and selects only preceding observations', () => {
    const quotes = [
      { quote: { USD: { price: 10, last_updated: '2025-01-02T11:00:00.000Z' } } },
      { quote: { USD: { price: 20, last_updated: '2025-01-02T13:00:00.000Z' } } },
    ];
    expect(
      normalizeQuotes({ data: { 1: { quotes } } }, ['cmc:1'], 'USD', at).quotes['cmc:1'].price,
    ).toBe('10');
  });
  it('supports single-asset historical response shape', () => {
    const result = normalizeQuotes(
      { data: { id: 1, quotes: [{ timestamp: at, quote: { USD: { price: 4 } } }] } },
      ['cmc:1'],
      'USD',
      at,
    );
    expect(result.quotes['cmc:1'].price).toBe('4');
  });
  it('does not fabricate missing data or prices without timestamps', () => {
    const result = normalizeQuotes(
      [{ id: 1, quote: [{ symbol: 'USD', price: null }] }],
      ['cmc:1', 'cmc:1027'],
      'USD',
    );
    expect(result.quotes).toEqual({});
    expect(result.warnings).toHaveLength(2);
  });
  it('shows a configuration error without making an external request', async () => {
    vi.stubEnv('CMC_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const r = await new CoinMarketCapProvider().quotes(['cmc:1'], 'USD');
    expect(r.warnings[0]).toContain('no está configurado');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses identity for cash already in the valuation currency', async () => {
    vi.stubEnv('CMC_API_KEY', '');
    const r = await new CoinMarketCapProvider().quotes(['cash:MXN'], 'MXN', at);
    expect(r.quotes['cash:MXN'].price).toBe('1');
  });
  it('never routes equities through the crypto endpoint', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const r = await new CoinMarketCapProvider().quotes(['stock:AAPL'], 'USD');
    expect(r.warnings[0]).toContain('sin proveedor');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not silently substitute USD when MXN is absent', () => {
    const r = normalizeQuotes(
      [{ id: 1, quote: [{ symbol: 'USD', price: 5, last_updated: at }] }],
      ['cmc:1'],
      'MXN',
    );
    expect(r.quotes).toEqual({});
  });
});
