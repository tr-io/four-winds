import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testDir: './tests/mobile',
  projects: [
    { name: 'Android Chrome', use: { ...devices['Pixel 7'] } },
    { name: 'iPhone WebKit', use: { ...devices['iPhone 13'] } },
  ],
});
