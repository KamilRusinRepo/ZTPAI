import { fileURLToPath } from 'node:url';
import config from './src/config/index.js';

export default {
  client: 'pg',
  connection: config.databaseUrl,
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
