import { chromium, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loginAs } from './helpers/storefront-auth';
import { loginAsManager } from './helpers/manager-auth';
import { MANAGER_ACCOUNTS } from './fixtures/accounts';
import { E2E_CUSTOMER } from './fixtures/seed';
import { seedStackData } from './stack-data';
import { E2E_BROWSER_USER_AGENT } from './helpers/user-agent';

const AUTH_DIR = path.join(__dirname, '.auth');
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';

// Cold Vite transforms and first widget queries otherwise leave the home widgets on "Loading" past a spec's timeout.
async function warmStorefront(page: Page): Promise<void> {
    for (const route of ['/', '/catalog']) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page
            .locator('.mv-product-card, .mv-product-row')
            .first()
            .waitFor({ timeout: 60_000 });
    }
}

let markedAt = Date.now();
function mark(label: string): void {
    console.log(`e2e setup: ${label} ${((Date.now() - markedAt) / 1000).toFixed(1)}s`);
    markedAt = Date.now();
}

export default async function globalSetup(): Promise<void> {
    markedAt = Date.now();
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    // A second Playwright pass or group on the same stack reuses the seed and sessions of the first one.
    const doneMarker = path.join(AUTH_DIR, 'setup-done');
    const stackName = process.env.E2E_DB_NAME;
    if (stackName && fs.existsSync(doneMarker) && fs.readFileSync(doneMarker, 'utf8') === stackName)
        return;
    // Cached admin tokens belong to the previous run's database.
    fs.rmSync(path.join(AUTH_DIR, 'admin-tokens.json'), { force: true });

    const seededOrder = process.env.E2E_SEEDED_ORDER;
    if (seededOrder) fs.writeFileSync(path.join(AUTH_DIR, 'e2e-order.json'), seededOrder);
    else
        fs.writeFileSync(
            path.join(AUTH_DIR, 'e2e-order.json'),
            JSON.stringify(await seedStackData()),
        );

    const browser = await chromium.launch();
    const saveSession = async (
        baseURL: string,
        file: string,
        signIn: (page: Page) => Promise<void>,
    ): Promise<void> => {
        const context = await browser.newContext({ baseURL, userAgent: E2E_BROWSER_USER_AGENT });
        await signIn(await context.newPage());
        await context.storageState({ path: path.join(AUTH_DIR, file) });
        await context.close();
    };
    // The portals are independent, so the five sign-ins wait on their cold Vite transforms side by side.
    await Promise.all([
        saveSession(STOREFRONT_URL, 'storefront-user.json', async page => {
            await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
            await page
                .context()
                .storageState({ path: path.join(AUTH_DIR, 'storefront-user.json') });
            await warmStorefront(page);
        }),
        ...Object.entries(MANAGER_ACCOUNTS).map(([key, account]) =>
            saveSession(MANAGER_URL, `manager-${key}.json`, page =>
                loginAsManager(page, account.username, account.password),
            ),
        ),
    ]);
    await browser.close();
    mark('sign-ins');
    if (stackName) fs.writeFileSync(doneMarker, stackName);
    const leakBaseline = process.env.E2E_LEAK_SNAPSHOT;
    if (leakBaseline)
        execFileSync('bash', [
            path.join(__dirname, '../../infrastructure/scripts/e2e-leak.sh'),
            'snapshot',
            leakBaseline,
        ]);
}
