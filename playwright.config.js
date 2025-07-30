import { devices } from '@playwright/test';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  timeout: 60 * 1000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8080',
    actionTimeout: 10 * 1000,
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'Desktop Firefox',
      use: {
        browserName: 'firefox',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'Desktop Safari',
      use: {
        browserName: 'webkit',
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: 'Pixel 5',
      use: {
        ...devices['Pixel 5'],
      },
    },
    {
      name: 'iPhone 13',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],
};

export default config; 