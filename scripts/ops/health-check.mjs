const target = process.env.HMS_HEALTH_URL || 'http://127.0.0.1:4000/api/health';
try {
  const url = new URL(target);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))
  )
    throw new Error('Health URL must use HTTPS or local loopback HTTP.');
  const start = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const data = await response.json();
  if (!response.ok || data.status !== 'ok' || data.database !== 'connected')
    throw new Error('Application or database unavailable');
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      status: 'ok',
      responseMs: Date.now() - start,
    }),
  );
} catch {
  console.error(JSON.stringify({ checkedAt: new Date().toISOString(), status: 'unavailable' }));
  process.exitCode = 1;
}
