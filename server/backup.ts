import 'dotenv/config';
import { DatabaseSync, backup } from 'node:sqlite';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const source = path.resolve(process.env.DATABASE_PATH || 'data/cryptofolio.sqlite');
if (!existsSync(source)) throw new Error('No existe la base de datos de cuentas.');
const directory = path.resolve('data/backups');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const destination = path.join(
  directory,
  `cryptofolio-${new Date().toISOString().replaceAll(':', '-')}.sqlite`,
);
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, destination);
  chmodSync(destination, 0o600);
  console.log(`Respaldo creado: ${destination}`);
} finally {
  db.close();
}
