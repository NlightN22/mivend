import type { Browser } from '@playwright/test';
import { E2E_BROWSER_USER_AGENT } from './user-agent';

export const portalInstances = (list: string | undefined, fallback: string): string[] =>
    list ? list.split(',') : [fallback];

// Each Vite instance transforms and pre-bundles on its first requests; doing it here keeps it out of the specs.
export async function warmInstances(
    browser: Browser,
    urls: string[],
    routes: string[],
    ready: string,
    storageState?: string,
): Promise<void> {
    await Promise.all(
        urls.map(async url => {
            const context = await browser.newContext({
                baseURL: url,
                userAgent: E2E_BROWSER_USER_AGENT,
                storageState,
            });
            const page = await context.newPage();
            for (const route of routes) {
                await page.goto(route);
                await page.waitForLoadState('networkidle');
                await page.locator(ready).first().waitFor({ timeout: 90_000 });
            }
            await context.close();
        }),
    );
}
