import mongoose from 'mongoose';
import { loadConfig } from '../src/config.js';
import { connectDatabase } from '../src/models.js';
import { bootstrapAdmin } from '../src/bootstrap.js';
try {
  if (process.stdin.isTTY)
    throw new Error('Provide a private JSON file on stdin with name, email and password.');
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text) > 4096) throw new Error('Input is too large.');
  }
  const values = JSON.parse(text);
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  await bootstrapAdmin(values);
  console.log(
    'Initial administrator created. Remove the private input file and sign in through HTTPS.',
  );
} catch {
  console.error(
    'Administrator bootstrap failed. Check input and connection; the database must have no user accounts. No credentials are printed.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
