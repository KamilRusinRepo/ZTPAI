import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (!process.env.DATABASE_URL) {
  throw new Error('Set DATABASE_URL or copy .env.example to .env');
}

export default {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 10 },
  seeds: {
    directory: fileURLToPath(new URL('./src/db/seeds/', import.meta.url)),
    loadExtensions: ['.js'],
  },
  migrations: {
    directory: fileURLToPath(new URL('./src/db/migrations/', import.meta.url)),
    loadExtensions: ['.js'],
  },
};
