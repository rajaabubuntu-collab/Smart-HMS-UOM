import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) {
  console.log('.env already exists; preserved your settings.');
} else {
  const template = readFileSync('.env.example', 'utf8');
  writeFileSync(
    '.env',
    template.replace(
      'replace-with-a-random-secret-of-at-least-32-characters',
      randomBytes(48).toString('hex'),
    ),
    { mode: 0o600 },
  );
  console.log('Created .env with a random session signing secret.');
}
