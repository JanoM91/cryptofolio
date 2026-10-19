import 'dotenv/config';
import path from 'node:path';
import { createApp } from './app';
const production = process.env.NODE_ENV === 'production';
const enabled = process.env.ACCOUNTS_ENABLED === 'true';
const host = process.env.HOST || '127.0.0.1';
const origin = process.env.APP_ORIGIN;
if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !production)
  throw new Error('Para escuchar fuera de loopback usa NODE_ENV=production y configura HTTPS.');
if ((production || !['127.0.0.1', 'localhost', '::1'].includes(host)) && !enabled)
  throw new Error('Activa ACCOUNTS_ENABLED antes de exponer el servidor.');
if (production && (!origin || new URL(origin).protocol !== 'https:'))
  throw new Error('En producción configura APP_ORIGIN con el origen HTTPS público.');
if (origin && new URL(origin).origin !== origin)
  throw new Error('APP_ORIGIN debe ser un origen sin ruta ni barra final.');
const registrationCode = process.env.REGISTRATION_CODE || '';
if (enabled && registrationCode && registrationCode.length < 24)
  throw new Error(
    'REGISTRATION_CODE debe tener al menos 24 caracteres, o estar vacío para cerrar el registro.',
  );
const { app, store } = createApp({
  production,
  origin,
  accounts: enabled
    ? {
        filename: path.resolve(process.env.DATABASE_PATH || 'data/cryptofolio.sqlite'),
        registrationCode,
        secure: production || origin?.startsWith('https:') === true,
      }
    : undefined,
});
const server = app.listen(Number(process.env.PORT || 3001), host, () =>
  console.log('Cryptofolio API lista en el puerto ' + (process.env.PORT || 3001)),
);
function close() {
  server.close(() => {
    store?.close();
    process.exit(0);
  });
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
