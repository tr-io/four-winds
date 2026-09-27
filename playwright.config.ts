import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run build && PORT=3101 DATA_FILE=test-results/browser-state.json npm start',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
