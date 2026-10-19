import mongoose from 'mongoose';
import { mkdir, appendFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { connectDatabase } from '../src/models.js';
import { seedDemoDirectory } from '../src/demo/directory.js';

const config = loadConfig();
if (config.env !== 'development') throw new Error('Demo seed is disabled outside development.');
const directory = fileURLToPath(new URL('../../.local/', import.meta.url));
await mkdir(directory, { recursive: true, mode: 0o700 });
const output = `${directory}ai-demo-credentials.txt`;
try {
  await connectDatabase(config.mongoUri);
  const stats = await seedDemoDirectory({
    environment: config.env,
    onCredential: async ({ name, email, password }) => {
      await appendFile(output, `${name}\nEmail: ${email}\nPassword: ${password}\n\n`, {
        mode: 0o600,
      });
      await chmod(output, 0o600);
    },
  });
  console.log(JSON.stringify(stats, null, 2));
  console.log(
    'Fictional demo profiles only. Public visibility and email/SMS are disabled for new accounts.',
  );
  console.log('New doctor credentials: .local/ai-demo-credentials.txt (private, gitignored).');
} finally {
  await mongoose.disconnect();
}
