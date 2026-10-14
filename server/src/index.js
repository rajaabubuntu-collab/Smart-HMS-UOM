import { startRecoveryWorker } from './security/recovery.js';
import { startReminderWorker } from './notifications/reminders.js';
import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { connectDatabase } from './models.js';
import { createApp } from './app.js';
import { createServer } from 'node:http';
import { startRealtime } from './realtime.js';
import { startDeliveryWorker } from './notifications/delivery-worker.js';

try {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  const server = createServer(createApp(config));
  const realtime = await startRealtime(server, config);
  server.listen(config.port, config.host, () =>
    console.log(`Smart HMS API: http://localhost:${config.port}`),
  );
  server.on('error', (err) => {
    console.error(`Server could not start: ${err.code}`);
    process.exit(1);
  });
  const stopReminders = startReminderWorker();
  const stopDelivery = startDeliveryWorker(config);
  const stopRecovery = startRecoveryWorker(config);
  async function shutdown() {
    setTimeout(() => process.exit(1), 10000).unref();
    await stopReminders();
    await stopDelivery();
    await stopRecovery();
    await realtime.stop();
    await mongoose.disconnect();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (err) {
  console.error(
    'Startup failed:',
    err.name === 'MongooseServerSelectionError'
      ? 'MongoDB is unavailable. Run npm run db:up and check MONGODB_URI.'
      : err.message,
  );
  await mongoose.disconnect();
  process.exit(1);
}
