import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { postBatch, waitForRun } from './helpers/api';
import { loginAs } from './helpers/storefront-auth';
import { seedRecords, E2E_CUSTOMER } from './fixtures/seed';

const AUTH_DIR = path.join(__dirname, '.auth');
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5173';

export default async function globalSetup(): Promise<void> {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const exchangeId = `e2e-seed-${Date.now()}`;
    const run = await postBatch(exchangeId, seedRecords);
    await waitForRun(run.runId);

    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL: STOREFRONT_URL });
    const page = await context.newPage();

    await loginAs(page, E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await context.storageState({ path: path.join(AUTH_DIR, 'storefront-user.json') });

    await browser.close();
}
