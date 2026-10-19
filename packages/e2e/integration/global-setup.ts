import { chromium } from '@playwright/test';
import { CUSTOMER_STATE } from './customer-session';
import { loginAs } from '../helpers/storefront-auth';
import { E2E_BROWSER_USER_AGENT } from '../helpers/user-agent';
import { clearCart } from '../storefront/orders/helpers';
import { select } from './contour-db';
import { loadContourEnv } from './contour-env';
import { restartContour } from './contour-control';
import { previousRunLeftContourBroken, startRun } from './run-state';

async function assertUp(url: string): Promise<void> {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok)
        throw new Error(`${url} is not reachable: start make dev-staging-integration first`);
}

export default async function globalSetup(): Promise<void> {
    const contour = loadContourEnv();
    // A run killed before its teardown leaves the contour on a broken schema registry.
    if (previousRunLeftContourBroken()) await restartContour();
    await assertUp(`${contour.serverUrl}/health`);
    await assertUp(contour.storefrontUrl);
    select('SELECT 1');
    startRun();

    const browser = await chromium.launch();
    const page = await browser.newPage({
        baseURL: contour.storefrontUrl,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    await loginAs(page, contour.customer.email, contour.customer.password);
    await clearCart(page);
    await page.context().storageState({ path: CUSTOMER_STATE });
    await browser.close();
}
