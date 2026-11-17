import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';

let fileEnvironment = {};
try {
  fileEnvironment = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
} catch (error) { if (error.code !== 'ENOENT') throw error; }

const testUrl = process.env.TEST_DATABASE_URL
  ?? fileEnvironment.TEST_DATABASE_URL
  ?? 'postgres://room_booking:example_password@127.0.0.1:55432/room_booking_test';
let target;
try { target = new URL(testUrl); } catch { throw new Error('Invalid TEST_DATABASE_URL'); }
const databaseName = decodeURIComponent(target.pathname.slice(1));
if (!['postgres:', 'postgresql:'].includes(target.protocol)
  || !/^room_booking_test(?:_[a-z0-9_]+)?$/.test(databaseName)) {
  throw new Error('TEST_DATABASE_URL must point to a dedicated room_booking_test or room_booking_test_* database');
}

// Sprawdzamy też, czy ta sama baza nie jest skonfigurowana jako deweloperska.
const developmentUrls = [process.env.DATABASE_URL, fileEnvironment.DATABASE_URL];
function identity(url) {
  const host = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'loopback' : url.hostname;
  return `${host}:${url.port || '5432'}/${decodeURIComponent(url.pathname.slice(1))}`;
}
for (const value of developmentUrls.filter(Boolean)) {
  let development;
  try { development = new URL(value); } catch { continue; }
  if (identity(development) === identity(target)) {
    throw new Error('Refusing to run integration tests against the development database');
  }
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testUrl;
process.env.REPOSITORY_DRIVER = 'knex';
process.env.JWT_SECRET = randomBytes(48).toString('base64');
process.env.JWT_EXPIRES_IN = '15m';
process.env.ENABLE_DEBUG_ROUTES = 'false';
process.env.SEED_STARTED_RESERVATION = 'false';
