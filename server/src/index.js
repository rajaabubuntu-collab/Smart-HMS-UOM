import { startReminderWorker } from './notifications/reminders.js';
import mongoose from 'mongoose';
import { loadConfig } from './config.js';
import { connectDatabase } from './models.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  const server = createApp(config).listen(config.port, config.host, () =>
    console.log(`Smart HMS API: http://localhost:${config.port}`),
  );
  server.on('error', (err) => {
    console.error(`Server could not start: ${err.code}`);
    process.exit(1);
  });
  const stopReminders = startReminderWorker();
  async function shutdown() {
    server.close(async () => {
      await stopReminders();
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
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
