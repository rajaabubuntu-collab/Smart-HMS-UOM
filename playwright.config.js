import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
    },
  },
  webServer: [
    {
      command: 'node server/test/e2e-server.js',
      url: 'http://127.0.0.1:4100/api/health',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run dev -w client',
      url: 'http://localhost:5174',
      env: { WEB_PORT: '5174', API_PROXY_TARGET: 'http://127.0.0.1:4100' },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
