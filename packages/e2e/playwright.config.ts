import { defineConfig, devices, type PlaywrightTestOptions, type Project } from '@playwright/test';
import { E2E_USER_AGENT_MARK } from './helpers/user-agent';

function markSessions(
    projects: Project<PlaywrightTestOptions>[],
): Project<PlaywrightTestOptions>[] {
    return projects.map(p => ({
        ...p,
        use: { ...p.use, userAgent: `${p.use?.userAgent ?? ''} ${E2E_USER_AGENT_MARK}` },
    }));
}

export default defineConfig({
    testDir: '.',
    globalSetup: './global-setup.ts',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: [['html', { open: 'never' }], ['line']],
    use: {
        locale: 'en-GB',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
    },
    projects: markSessions([
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
            testIgnore: ['**/auth/**', '**/cart-totals/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
                storageState: '.auth/storefront-user.json',
            },
        },
        {
            name: 'storefront-cart-totals',
            testDir: './storefront/cart-totals',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
                storageState: '.auth/storefront-user.json',
            },
        },
        {
            name: 'visibility-storefront',
            testDir: './visibility/storefront',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.STOREFRONT_URL ?? 'http://localhost:5173',
            },
        },
        {
            name: 'visibility-manager',
            testDir: './visibility/manager',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
            },
        },
        {
            name: 'manager-noauth',
            testDir: './manager/auth',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
            },
        },
        {
            name: 'manager-operator',
            testDir: './manager',
            testMatch: ['**/*.spec.ts'],
            testIgnore: ['**/auth/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
                storageState: '.auth/manager-operator.json',
            },
        },
        {
            name: 'manager-manager',
            testDir: './manager',
            testMatch: ['**/*.spec.ts'],
            testIgnore: ['**/auth/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
                storageState: '.auth/manager-manager.json',
            },
        },
        {
            name: 'manager-department-head',
            testDir: './manager',
            testMatch: ['**/*.spec.ts'],
            testIgnore: ['**/auth/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
                storageState: '.auth/manager-departmentHead.json',
            },
        },
        {
            name: 'manager-portal-admin',
            testDir: './manager',
            testMatch: ['**/*.spec.ts'],
            testIgnore: ['**/auth/**'],
            use: {
                ...devices['Desktop Chrome'],
                baseURL: process.env.MANAGER_URL ?? 'http://localhost:5174',
                storageState: '.auth/manager-portalAdmin.json',
            },
        },
    ]),
});
