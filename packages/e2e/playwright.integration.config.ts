import { defineConfig, devices } from '@playwright/test';
import { loadContourEnv } from './integration/contour-env';
import { E2E_BROWSER_USER_AGENT } from './helpers/user-agent';

// Manual staging-integration suite (#255); never part of make e2e-dev or CI.
const contour = loadContourEnv();
process.env.SERVER_URL = contour.serverUrl;
process.env.STOREFRONT_URL = contour.storefrontUrl;
process.env.MANAGER_URL = contour.managerUrl;
process.env.SUPERADMIN_USERNAME = contour.superadmin.username;
process.env.SUPERADMIN_PASSWORD = contour.superadmin.password;

export default defineConfig({
    testDir: './integration',
    globalSetup: './integration/global-setup.ts',
    globalTeardown: './integration/global-teardown.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: [['list'], ['./integration/summary-reporter.ts']],
    outputDir: './test-results/integration',
    use: {
        ...devices['Desktop Chrome'],
        userAgent: E2E_BROWSER_USER_AGENT,
        baseURL: contour.storefrontUrl,
        storageState: '.auth/integration-customer.json',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
});
