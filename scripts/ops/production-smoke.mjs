import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { chromium } from '@playwright/test';
import { connectDatabase } from '../../server/src/models.js';
import { seedTestAccounts, testPassword } from '../../server/test/helpers.js';
import { root, localUri, newDatabase } from './backup-lib.mjs';
const exec = promisify(execFile),
  source = newDatabase('rehearsal'),
  name = `hms-smoke-${randomBytes(6).toString('hex')}`;
let folder,
  proxy,
  browser,
  container = false;
const checks = [];
try {
  await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
  folder = await mkdtemp(join(root, '.local/production-test-'));
  const uri = new URL(localUri);
  uri.pathname = `/${source}`;
  await connectDatabase(uri.toString());
  await seedTestAccounts();
  await mongoose.disconnect();
  await exec('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout',
    join(folder, 'key.pem'),
    '-out',
    join(folder, 'cert.pem'),
  ]);
  const reservation = http.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  proxy = https.createServer(
    {
      key: await readFile(join(folder, 'key.pem')),
      cert: await readFile(join(folder, 'cert.pem')),
    },
    (req, res) => {
      const headers = {
        ...req.headers,
        'x-forwarded-for': req.socket.remoteAddress,
        'x-forwarded-proto': 'https',
        'x-forwarded-host': req.headers.host,
      };
      const upstream = http.request(
        { host: '127.0.0.1', port, path: req.url, method: req.method, headers },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const origin = `https://localhost:${proxy.address().port}`;
  const envPath = join(folder, 'runtime.env');
  await writeFile(
    envPath,
    `NODE_ENV=production\nBIND_HOST=127.0.0.1\nPORT=${port}\nAPP_ORIGIN=${origin}\nMONGODB_URI=${uri}\nJWT_SECRET=${randomBytes(48).toString('hex')}\nTRUST_PROXY=true\n`,
    { mode: 0o600 },
  );
  await exec('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--init',
    '--network',
    'host',
    '--read-only',
    '--tmpfs',
    '/tmp:size=16m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--no-healthcheck',
    '--env-file',
    envPath,
    'smart-hms:0.10.0',
  ]);
  container = true;
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Readiness may not be available while the container starts. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'production container readiness');
  checks.push('container startup and database readiness');
  const inspection = await exec('docker', [
    'exec',
    name,
    'node',
    '-e',
    "const fs=require('node:fs');console.log(JSON.stringify({uid:process.getuid(),env:fs.existsSync('/app/.env'),local:fs.existsSync('/app/.local'),vite:fs.existsSync('/app/node_modules/vite')}))",
  ]);
  const info = JSON.parse(inspection.stdout);
  assert.notEqual(info.uid, 0);
  assert.equal(info.env, false);
  assert.equal(info.local, false);
  assert.equal(info.vite, false);
  checks.push('non-root runtime excludes environment files, local data and Vite');
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true }); // Only the generated loopback test certificate.
  const page = await context.newPage();
  let health = await context.request.get(`${origin}/api/health`);
  assert.equal(health.status(), 200);
  assert.ok(health.headers()['strict-transport-security']);
  checks.push('HTTPS proxy and HSTS header');
  const missing = await context.request.post(`${origin}/api/auth/login`, {
    data: { email: 'admin@test.local', password: testPassword },
  });
  assert.equal(missing.status(), 403);
  checks.push('unsafe requests without trusted Origin rejected');
  await page.goto(`${origin}/admin/reports`);
  await page.getByLabel('Email address').fill('admin@test.local');
  await page.getByLabel(/^Password/).fill(testPassword);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await page.getByRole('heading', { name: 'Welcome, Test.' }).waitFor();
  const cookie = (await context.cookies()).find((c) => c.name === 'hms_session');
  assert.ok(cookie?.secure);
  assert.ok(cookie.httpOnly);
  assert.equal(cookie.sameSite, 'Strict');
  checks.push('production login with Secure HttpOnly SameSite Strict cookie');
  await page.goto(`${origin}/admin/reports`);
  await page.getByRole('heading', { name: 'Reports & analytics', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Daily appointments', exact: true }).waitFor();
  checks.push('built React assets and direct SPA route');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL('**/login');
  const replay = await context.request.get(`${origin}/api/auth/me`, {
    headers: { Cookie: `hms_session=${cookie.value}` },
  });
  assert.equal(replay.status(), 401);
  checks.push('logout revokes session replay');
  await browser.close();
  browser = null;
  await exec('docker', ['stop', '--time', '15', name]);
  const state = JSON.parse(
    (await exec('docker', ['inspect', '--format', '{{json .State}}', name])).stdout,
  );
  assert.equal(state.ExitCode, 0);
  checks.push('graceful container shutdown');
  await writeFile(
    join(root, '.local/production-smoke.json'),
    JSON.stringify(
      { at: new Date().toISOString(), image: 'smart-hms:0.10.0', passed: checks },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.log(
    `Production smoke passed: ${checks.length} checks. Evidence: .local/production-smoke.json`,
  );
} finally {
  await browser?.close();
  if (proxy) await new Promise((resolve) => proxy.close(resolve));
  if (container) await exec('docker', ['rm', '-f', name]).catch(() => {});
  await mongoose.disconnect();
  const client = new mongoose.mongo.MongoClient(localUri);
  try {
    await client.connect();
    await client.db(source).dropDatabase();
  } finally {
    await client.close();
  }
  if (folder) await rm(folder, { recursive: true, force: true });
}
