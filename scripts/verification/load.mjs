import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import { connectDatabase, User, Patient } from '../../server/src/models.js';
import { createSession } from '../../server/src/auth.js';
import { isolatedUri, seedTestAccounts, testConfig } from '../../server/test/helpers.js';

const output = '.local/load-result.json';
let server;
try {
  await connectDatabase(isolatedUri('load'));
  const fixture = await seedTestAccounts();
  const hash = (await User.findById(fixture.users.patient._id).select('+passwordHash'))
    .passwordHash;
  const users = await User.insertMany(
    Array.from({ length: 100 }, (_, i) => ({
      name: `Synthetic Load ${i}`,
      email: `load-${i}@test.local`,
      passwordHash: hash,
      role: 'patient',
    })),
  );
  await Patient.insertMany(
    users.map((user) => ({ user: user._id, dateOfBirth: '2000-01-01', gender: 'other' })),
  );
  const sessions = await Promise.all(users.map((user) => createSession(user, testConfig)));
  // One loopback load generator represents many users. The production limiter is tested separately.
  server = createServer(createApp(testConfig, { rateLimitEnabled: false }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function batch(name, path, concurrency, options = {}) {
    let cursor = 0;
    const times = [],
      statuses = {};
    const began = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (cursor < 100) {
          const index = cursor++,
            start = performance.now();
          const response = await fetch(base + path, {
            ...options,
            signal: AbortSignal.timeout(30000),
            headers: {
              Origin: testConfig.origin,
              Cookie: `hms_session=${sessions[index].token}`,
              ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            },
          });
          await response.arrayBuffer();
          times.push(performance.now() - start);
          statuses[response.status] = (statuses[response.status] || 0) + 1;
        }
      }),
    );
    times.sort((a, b) => a - b);
    return {
      name,
      concurrency,
      requests: times.length,
      statuses,
      durationMs: Math.round(performance.now() - began),
      p50Ms: Math.round(times[49]),
      p95Ms: Math.round(times[94]),
      maxMs: Math.round(times.at(-1)),
    };
  }
  const results = [
    await batch('role-scoped dashboard API', '/dashboard/analytics', 50),
    await batch('100 valid sessions reading appointments', '/appointments?limit=10', 100),
    await batch('transactional profile writes', '/patients/me', 50, {
      method: 'PATCH',
      body: JSON.stringify({
        phone: '0771234567',
        address: 'Synthetic load only',
        emergencyContact: { name: '', phone: '', relationship: '' },
      }),
    }),
  ];
  const evidence = {
    generatedAt: new Date().toISOString(),
    database: 'Disposable synthetic database; dropped after measurement',
    scope:
      'Loopback HTTP API benchmark; no broadband, browser rendering, clinical use or production uptime claim. 100 pre-established JWT sessions; authentication setup excluded. Rate limiter disabled for shared generator IP.',
    results,
  };
  await mkdir('.local', { recursive: true, mode: 0o700 });
  await writeFile(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  if (results.some((r) => r.statuses[200] !== 100)) process.exitCode = 1;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
