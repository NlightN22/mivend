import { defineConfig } from '@playwright/test';

// Runs only the data phase of global-setup, so the e2e stack can seed a template database without a browser.
export default defineConfig({
    testDir: '.',
    testMatch: 'seed-stack-no-specs',
    globalSetup: './seed-stack-data.ts',
    reporter: 'line',
});
