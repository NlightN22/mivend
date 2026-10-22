import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { SUPERADMIN } from '../fixtures/accounts';
import { readVisIds, readVisOrders, type VisIds, type VisOrder } from '../fixtures/visibility/ids';
import {
    VIS_PASSWORD,
    actorEmail,
    customerEmail,
    type ActorKey,
    type CustomerKey,
} from '../fixtures/visibility/plan';
import { adminTokenFor } from '../helpers/api-tokens';
import { loginAsManager } from '../helpers/manager-auth';
import { loginAs } from '../helpers/storefront-auth';
import { E2E_BROWSER_USER_AGENT } from '../helpers/user-agent';

export interface Session {
    context: BrowserContext;
    page: Page;
    bodies: string[];
}

export const superadminToken = (): Promise<string> =>
    adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);

export async function visData(): Promise<{
    ids: VisIds;
    orders: Record<CustomerKey, VisOrder>;
}> {
    const token = await superadminToken();
    const ids = await readVisIds(token);
    return { ids, orders: await readVisOrders(token, ids) };
}

async function open(browser: Browser, baseURL: string): Promise<Session> {
    const context = await browser.newContext({
        baseURL,
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();
    const bodies: string[] = [];
    page.on('response', response => {
        if (!/\/(admin|shop)-api/.test(response.url())) return;
        void response.text().then(
            text => bodies.push(text),
            () => undefined,
        );
    });
    return { context, page, bodies };
}

export async function openManagerAs(browser: Browser, actor: ActorKey): Promise<Session> {
    const session = await open(browser, process.env.MANAGER_URL ?? 'http://localhost:5174');
    await loginAsManager(session.page, actorEmail(actor), VIS_PASSWORD);
    return session;
}

export async function openStorefrontAs(browser: Browser, customer: CustomerKey): Promise<Session> {
    const session = await open(browser, process.env.STOREFRONT_URL ?? 'http://localhost:5173');
    await loginAs(session.page, customerEmail(customer), VIS_PASSWORD);
    return session;
}

// Hidden data must not reach the browser at all, not only stay off the screen.
export async function expectNotReceived(session: Session, values: string[]): Promise<void> {
    const text = [await session.page.locator('body').innerText(), ...session.bodies].join('\n');
    for (const value of values)
        expect(text.includes(value), `${value} reached the page`).toBe(false);
}

export async function shot(page: Page, name: string): Promise<void> {
    await page.screenshot({ path: test.info().outputPath(`e2e-${name}.png`), fullPage: true });
}
