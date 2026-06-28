import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    globalSetup: './global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [['html', { open: 'never' }], ['line']],
    use: {
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
    projects: [
        {
            name: 'storefront-noauth',
            testDir: './storefront/auth',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
            },
        },
        {
            name: 'storefront',
            testDir: './storefront',
            testIgnore: ['**/auth/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
                storageState: '.auth/storefront-user.json',
            },
        },
    ],
});
