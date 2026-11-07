import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import knex from 'knex';
import jwt from 'jsonwebtoken';
import config from '../knexfile.js';
import { createApp } from '../src/app.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.knex.js';
import { up, down } from '../src/db/migrations/20261106000100_create_users.js';
import { seed } from '../src/db/seeds/00_users.js';

const schema = 'verify_login_' + randomUUID().replaceAll('-', '');
const jwtSecret = randomBytes(48).toString('base64');
const adminDb = knex(config);
const log = [];
function record(label, value) {
  const line = label + (value === undefined ? '' : '\n' + JSON.stringify(value, null, 2));
  log.push(line);
  console.log(line);
}
let db;
let server;
let usersCreated = false;
try {
  await adminDb.schema.createSchema(schema);
  db = knex({ ...config, searchPath: [schema, 'public'] });
  await up(db);
  usersCreated = true;
  await seed(db);
  server = createApp({ usersRepository: createUsersRepository(db), jwtSecret }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  async function request(path, body, token) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const credentials = { email: 'Jan.Kowalski@example.com', password: 'bardzo-dlugie-haslo' };
  const registered = await request('/register', credentials);
  assert.equal(registered.status, 201);
  record('Registration', registered);
  const login = await request('/login', { ...credentials, email: credentials.email.toUpperCase() });
  assert.equal(login.status, 200);
  assert.equal(login.body.tokenType, 'Bearer');
  assert.equal(login.body.expiresIn, '15m');
  record('Login (accessToken omitted from saved log)', { status: login.status, tokenType: login.body.tokenType, expiresIn: login.body.expiresIn });
  const decoded = jwt.verify(login.body.accessToken, jwtSecret, { algorithms: ['HS256'], complete: true });
  assert.equal(decoded.header.alg, 'HS256');
  assert.deepEqual(Object.keys(decoded.payload).sort(), ['exp', 'iat', 'role', 'sub']);
  assert.equal(decoded.payload.sub, String(registered.body.id));
  assert.equal(decoded.payload.role, 'USER');
  assert.equal(decoded.payload.exp - decoded.payload.iat, 900);
  record('Verified JWT header and decoded payload', { header: decoded.header, payload: decoded.payload });
  const me = await request('/me', undefined, login.body.accessToken);
  assert.equal(me.status, 200);
  assert.deepEqual(me.body, registered.body);
  assert.doesNotMatch(JSON.stringify(me.body), /password|\$2[aby]\$/);
  record('GET /api/auth/me', me);
  const badEmail = await request('/login', { ...credentials, email: 'missing@example.com' });
  const badPassword = await request('/login', { ...credentials, password: 'wrong-password' });
  record('Unknown email', badEmail);
  record('Wrong password', badPassword);
  for (const result of [badEmail, badPassword]) {
    assert.equal(result.status, 401);
    assert.equal(result.body.error.code, 'UNAUTHORIZED');
    assert.equal(result.body.error.message, 'Invalid email or password');
  }
  record('Comparison: status, error.code and error.message are identical; requestId identifies each request.');
  const adminLogin = await request('/login', { email: 'admin@example.com', password: 'admin-password-123' });
  assert.equal(adminLogin.status, 200);
  const adminPayload = jwt.verify(adminLogin.body.accessToken, jwtSecret, { algorithms: ['HS256'] });
  assert.equal(adminPayload.role, 'ADMIN');
  const adminMe = await request('/me', undefined, adminLogin.body.accessToken);
  assert.equal(adminMe.status, 200);
  assert.equal(adminMe.body.role, 'ADMIN');
  record('Seeded ADMIN: login and me', adminMe);
  const anonymous = await request('/me');
  assert.equal(anonymous.status, 401);
  record('GET /api/auth/me without token', anonymous);
  record('All PostgreSQL login checks passed.');
  if (process.argv.includes('--save')) {
    mkdirSync('docs', { recursive: true });
    writeFileSync('docs/auth-login-results.txt', log.join('\n\n') + '\n');
  }
} finally {
  if (server) await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
  if (db) {
    if (usersCreated) await down(db);
    await db.destroy();
  }
  await adminDb.schema.dropSchemaIfExists(schema);
  await adminDb.destroy();
}
