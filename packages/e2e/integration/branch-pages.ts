import type { Browser, BrowserContext, Page } from '@playwright/test';
import { loginAsManager } from '../helpers/manager-auth';
import { E2E_BROWSER_USER_AGENT } from '../helpers/user-agent';
import { actorCredentials, type ActorKey } from './branch-actors';
import { loadContourEnv } from './contour-env';
import { recordGraphql, type GraphqlLog } from './price-type-access';

export async function openManagerAs(
    browser: Browser,
    key: ActorKey,
): Promise<{ context: BrowserContext; page: Page; log: GraphqlLog }> {
    const credentials = actorCredentials(key);
    if (!credentials) throw new Error(`STAGING_TEST_${key.toUpperCase()}_* is missing`);
    const context = await browser.newContext({
        baseURL: loadContourEnv().managerUrl,
        storageState: undefined,
        userAgent: E2E_BROWSER_USER_AGENT,
    });
    const page = await context.newPage();
    const log = recordGraphql(page);
    await loginAsManager(page, credentials.username, credentials.password);
    return { context, page, log };
}

export async function searchClients(page: Page, text: string): Promise<void> {
    const box = page.getByPlaceholder('Company name or INN...');
    await box.fill(text);
    await page.waitForResponse(
        r =>
            r.url().includes('/admin-api') &&
            r.request().postData()?.includes('counterparties') === true,
    );
    await page.waitForTimeout(400);
}

export async function pageCount(page: Page): Promise<number> {
    const text = await page
        .getByText(/\d+–\d+ of \d+|0 of 0|No results/)
        .first()
        .innerText();
    const match = /of (\d+)/.exec(text);
    return match ? Number(match[1]) : 0;
}

export async function kpiActiveClients(page: Page): Promise<number> {
    const text = await page.locator('main').innerText();
    const match = /Active clients\s+(\d[\d\s,]*)/.exec(text);
    if (!match) throw new Error('Active clients KPI not found on the page');
    return Number(match[1].replace(/\D/g, ''));
}
