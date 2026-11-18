import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseConfig, runtimeEnvironment } from '../src/config/index.js';
import { createApp } from '../src/app.js';
import { createUsersRepository } from '../src/modules/auth/users.repository.memory.js';
import { createRoomsRepository } from '../src/modules/rooms/rooms.repository.memory.js';
import { createReservationsRepository } from '../src/modules/reservations/reservations.repository.memory.js';
import { createOpenapiDocument } from '../src/docs/openapi.js';

const secret = randomBytes(48).toString('base64');
const valid = { DATABASE_URL: 'postgres://demo:demo@localhost/room_booking', JWT_SECRET: secret };

test('configuration defaults, PostgreSQL URLs, strict booleans and positive token lifetime', () => {
  const config = parseConfig(valid);
  assert.ok(Object.isFrozen(config));
  assert.equal(config.port, 3000);
  assert.equal(config.repositoryDriver, 'knex');
  assert.equal(config.jwtExpiresIn, '15m');
  assert.equal(config.enableDebugRoutes, false);
  assert.equal(parseConfig({ ...valid, PORT: '8080', JWT_EXPIRES_IN: '10s', ENABLE_DEBUG_ROUTES: 'true' }).enableDebugRoutes, true);
  for (const [key, values] of Object.entries({
    JWT_SECRET: [undefined, '', 'short'], DATABASE_URL: [undefined, '', 'not-a-url', 'https://example.com/db', 'postgres://localhost'],
    PORT: ['', 'abc', '0', '65536', '1.5'], JWT_EXPIRES_IN: ['', '0s', '-1m', '15', 'abc', '999999999999999999999d'],
    REPOSITORY_DRIVER: ['other'], ENABLE_DEBUG_ROUTES: ['yes', '1'], SEED_STARTED_RESERVATION: ['no'],
    NODE_ENV: ['unknown'], BASE_URL: ['invalid', 'ftp://example.com'],
  })) {
    for (const value of values) assert.throws(() => parseConfig({ ...valid, [key]: value }), (error) => {
      assert.match(error.message, /Invalid environment configuration/);
      assert.ok(error.message.includes(key));
      assert.equal(error.message.includes(secret), false);
      return true;
    });
  }
});

test('server and knexfile fail before opening connections when configuration is invalid', () => {
  for (const [key, value] of [['JWT_SECRET', 'short'], ['DATABASE_URL', 'invalid-database-url']]) {
    for (const entry of ['src/server.js', 'knexfile.js']) {
      const result = spawnSync(process.execPath, [entry], { encoding: 'utf8', timeout: 10000,
        env: runtimeEnvironment({ [key]: value }) });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Invalid environment configuration/);
      assert.ok(result.stderr.includes(key));
      assert.equal(result.stdout.includes('Room Booking API ('), false);
    }
  }
});

test('only the configuration module accesses the environment in application and scripts', () => {
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) inspect(path);
      else if (path.endsWith('.js') && path !== 'src/config/index.js') {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /process\s*\.\s*env|process\s*\.\s*loadEnvFile/, path);
      }
    }
  }
  inspect('src'); inspect('scripts');
  assert.doesNotMatch(readFileSync('knexfile.js', 'utf8'), /process\s*\.\s*env|loadEnvFile/);
});

test('OpenAPI covers every business route, resolves references and reuses one error envelope', () => {
  const document = createOpenapiDocument();
  const methods = ['get', 'post', 'patch', 'delete'];
  for (const module of ['auth', 'rooms', 'buildings', 'reservations']) {
    const source = readFileSync(`src/modules/${module}/${module}.routes.js`, 'utf8');
    for (const [, method, route] of source.matchAll(/router\.(get|post|patch|delete)\('([^']+)'/g)) {
      const path = (`/api/${module}` + (route === '/' ? '' : route)).replace(/:id/g, '{id}');
      assert.ok(document.paths[path]?.[method], `${method} ${path}`);
    }
  }
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const target = value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], document);
      assert.ok(target, value.$ref);
    }
    Object.values(value).forEach(walk);
  }
  walk(document);
  for (const [path, item] of Object.entries(document.paths)) {
    if (path.startsWith('/api/docs')) continue;
    for (const method of methods.filter((method) => item[method])) {
      const operation = item[method];
      assert.ok(operation.responses[400]);
      assert.ok(operation.responses[413]);
      for (const [status, response] of Object.entries(operation.responses)) {
        if (Number(status) >= 400) assert.match(response.$ref, /^#\/components\/responses\//);
      }
    }
  }
  for (const response of Object.values(document.components.responses)) {
    assert.equal(response.content['application/json'].schema.$ref, '#/components/schemas/ApiError');
  }
  assert.equal(document.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.deepEqual(document.paths['/api/auth/login'].post.security, []);
  assert.equal(document.paths['/api/debug/error'], undefined);
  assert.ok(createOpenapiDocument({ enableDebugRoutes: true }).paths['/api/debug/error']);
});

test('public Swagger assets and JSON; login token authorizes a documented protected endpoint', async (t) => {
  const usersRepository = createUsersRepository();
  const roomsRepository = createRoomsRepository();
  const reservationsRepository = createReservationsRepository({ usersRepository, roomsRepository });
  const server = createApp({ jwtSecret: secret, usersRepository, roomsRepository, reservationsRepository }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const redirect = await fetch(baseUrl + '/api/docs', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  for (const path of ['/api/docs/', '/api/docs/swagger-ui.css', '/api/docs/swagger-ui-bundle.js', '/api/docs/swagger-ui-init.js', '/api/docs/openapi.json']) {
    const response = await fetch(baseUrl + path);
    assert.equal(response.status, 200, path);
  }
  const html = await (await fetch(baseUrl + '/api/docs/')).text();
  assert.match(html, /swagger-ui/);
  assert.equal((await fetch(baseUrl + '/api/rooms')).status, 401);
  const credentials = { email: 'swagger@example.com', password: 'swagger-password-123' };
  const post = (path) => fetch(baseUrl + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal((await post('/api/auth/register')).status, 201);
  const login = await post('/api/auth/login');
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  const response = await fetch(baseUrl + '/api/rooms', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(await response.json()));
});
