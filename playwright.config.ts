import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__',
  timeout: 30000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 414, height: 896 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
