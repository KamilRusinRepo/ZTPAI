import assert from 'node:assert/strict';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import config, { runtimeEnvironment } from '../src/config/index.js';

mkdirSync('docs', { recursive: true });
const invalid = [];
for (const [key, value] of [['JWT_SECRET', 'short'], ['DATABASE_URL', 'invalid-database-url']]) {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    encoding: 'utf8', timeout: 10000, env: runtimeEnvironment({ [key]: value }),
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes(key));
  assert.equal(result.stdout.includes('Room Booking API ('), false);
  const message = result.stderr.split(/\r?\n/)
    .filter((line) => /^Error: Invalid environment configuration|^\s+(JWT_SECRET|DATABASE_URL):/.test(line)).join('\n');
  invalid.push(`node src/server.js; invalid ${key}\nexit code: ${result.status}\n${message}`);
}
writeFileSync('docs/config-invalid-start.txt', invalid.join('\n\n') + '\n');

// Run the required history scan without printing matched values.
const history = execFileSync('git', ['log', '-p', '--all'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const audit = [];
let commit = '';
let path = '';
let possibleJwt = false;
for (const line of history.split('\n')) {
  if (line.startsWith('commit ')) commit = line.slice(7, 19);
  if (line.startsWith('+++ b/')) path = line.slice(6);
  if (/JWT_SECRET=|password=/i.test(line)) {
    const candidate = /^[+-]?JWT_SECRET=(.*)$/.exec(line)?.[1]?.trim();
    const placeholder = candidate && /^(replace|example|placeholder|test|dummy|<)/i.test(candidate);
    if (candidate && candidate.length >= 32 && !placeholder) possibleJwt = true;
    audit.push({ commit, path, kind: /JWT_SECRET=/i.test(line) ? 'JWT_SECRET assignment' : 'password assignment',
      classification: placeholder ? 'example placeholder' : 'review required; value redacted' });
  }
}
const currentInHistory = history.includes(config.jwtSecret) && !/^(replace|example|placeholder|test|dummy|<)/i.test(config.jwtSecret);
const rotate = possibleJwt || currentInHistory;
if (rotate) {
  let env = readFileSync('.env', 'utf8');
  const replacement = 'JWT_SECRET=' + randomBytes(48).toString('base64');
  env = /^JWT_SECRET=.*$/m.test(env) ? env.replace(/^JWT_SECRET=.*$/m, replacement) : env + '\n' + replacement + '\n';
  writeFileSync('.env', env);
}
const envCommits = execFileSync('git', ['log', '--all', '--format=%h', '--', '.env'], { encoding: 'utf8' }).trim();
assert.equal(spawnSync('git', ['check-ignore', '-q', '.env']).status, 0);
const auditResult = { scan: 'git log -p --all | grep -iE "JWT_SECRET=|password=" (equivalent scan in Node.js; values redacted)',
  matches: audit, currentJwtInHistory: currentInHistory, jwtRotated: rotate, envEverTracked: !!envCommits };
writeFileSync('docs/secrets-audit.json', JSON.stringify(auditResult, null, 2) + '\n');

const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const secret = randomBytes(48).toString('base64');
const child = spawn(process.execPath, ['src/server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: runtimeEnvironment({ PORT: String(port), REPOSITORY_DRIVER: 'memory', JWT_SECRET: secret,
    JWT_EXPIRES_IN: '15m', ENABLE_DEBUG_ROUTES: 'false', SEED_STARTED_RESERVATION: 'false' }),
});
let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
try {
  await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error(stderr); }),
    new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000); timer.unref(); })]);
  const baseUrl = `http://127.0.0.1:${port}`;
  const checks = [];
  const redirect = await fetch(baseUrl + '/api/docs', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  checks.push('GET /api/docs without a token -> 301 redirect to /api/docs/');
  for (const route of ['/api/docs/', '/api/docs/swagger-ui.css', '/api/docs/swagger-ui-bundle.js', '/api/docs/swagger-ui-init.js']) {
    const response = await fetch(baseUrl + route);
    assert.equal(response.status, 200);
    checks.push(`GET ${route} without a token -> 200`);
  }
  const specResponse = await fetch(baseUrl + '/api/docs/openapi.json');
  assert.equal(specResponse.status, 200);
  const spec = await specResponse.json();
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  const init = await (await fetch(baseUrl + '/api/docs/swagger-ui-init.js')).text();
  assert.match(init, /bearerAuth/);
  checks.push(`GET /api/docs/openapi.json -> 200; ${Object.values(spec.paths).reduce((count, item) => count + Object.keys(item).length, 0)} documented operations; bearer scheme configured.`);
  assert.equal((await fetch(baseUrl + '/api/rooms')).status, 401);
  checks.push('GET /api/rooms without a token -> 401');
  const credentials = { email: 'documentation-test@example.com', password: 'documentation-password-123' };
  const post = (route) => fetch(baseUrl + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  assert.equal((await post('/api/auth/register')).status, 201);
  const login = await post('/api/auth/login');
  assert.equal(login.status, 200);
  const { accessToken } = await login.json();
  const protectedResponse = await fetch(baseUrl + '/api/rooms', { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(protectedResponse.status, 200);
  checks.push('Register -> 201; login -> 200; GET /api/rooms with Bearer accessToken -> 200');
  checks.push('HTTP/configuration checks passed. Browser UI interaction and screenshots require manual verification.');
  writeFileSync('docs/config-swagger-checks.txt', checks.join('\n') + '\n');
  console.log(invalid.join('\n\n'));
  console.log(checks.join('\n'));
  console.log(`History: ${audit.length} redacted matches; JWT rotated: ${rotate}; .env ever tracked: ${!!envCommits}`);
} finally {
  child.kill();
  await once(child, 'exit');
}
