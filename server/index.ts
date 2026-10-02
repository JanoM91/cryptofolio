import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CoinMarketCapProvider, MarketError } from './provider';
import { currencySchema, dateSchema } from '../shared/model';
const app = express();
const provider = new CoinMarketCapProvider();
app.use(
  helmet({ contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false }),
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60000,
    limit: 90,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Demasiadas solicitudes. Espera un minuto.' },
  }),
);
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    origin !== `${req.protocol}://${req.get('host')}` &&
    !/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin)
  )
    return res.status(403).json({ error: 'Origen no permitido' });
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/status', (_req, res) =>
  res.json({
    configured: Boolean(process.env.CMC_API_KEY),
    provider: 'CoinMarketCap',
    storage: 'browser-local',
  }),
);
app.get('/api/assets', async (req, res) => {
  const query = z.string().trim().min(1).max(80).parse(req.query.q);
  res.json(await provider.search(query));
});
app.get('/api/quotes', async (req, res) => {
  const ids = z
    .string()
    .regex(
      /^(cmc:\d+|cash:(USD|MXN)|(?:stock|etf):[A-Za-z0-9.-]+)(,(cmc:\d+|cash:(USD|MXN)|(?:stock|etf):[A-Za-z0-9.-]+))*$/,
    )
    .transform((s) => [...new Set(s.split(','))])
    .refine((ids) => ids.length <= 100)
    .parse(req.query.ids);
  const currency = currencySchema.parse(req.query.currency);
  const at = dateSchema.optional().parse(req.query.at);
  res.json(await provider.quotes(ids, currency, at));
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
app.use(express.static(root));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err instanceof z.ZodError ? 400 : err instanceof MarketError ? err.status : 500).json({
    error:
      err instanceof z.ZodError
        ? 'Parámetros inválidos'
        : err instanceof MarketError
          ? err.message
          : 'Error interno. Intenta nuevamente.',
  });
});
app.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () =>
  console.log('Cryptofolio API lista en el puerto ' + (process.env.PORT || 3001)),
);
