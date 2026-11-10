import { test, expect, type Page } from '@playwright/test';

const LIST_PAGES = [
    '/orders',
    '/proforma-invoices',
    '/payments',
    '/settlements',
    '/discounts',
    '/approvals',
    '/team',
];

async function nestedVerticalScrollers(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('main *, .layout__content *'))
            .filter(el => {
                const overflowY = getComputedStyle(el).overflowY;
                return (
                    (overflowY === 'auto' || overflowY === 'scroll') &&
                    el.scrollHeight > el.clientHeight + 1
                );
            })
            .map(el => `${el.tagName.toLowerCase()}.${el.className}`),
    );
}

test.use({ viewport: { width: 1360, height: 900 } });

for (const path of LIST_PAGES) {
    test(`${path} has no nested vertical scrollbar @read-only`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('.mv-advanced-data-table__grid').first()).toBeVisible({
            timeout: 15000,
        });
        await page.waitForLoadState('networkidle');
        expect(await nestedVerticalScrollers(page)).toEqual([]);
    });
}

test('/bulk-operations/history has no nested vertical scrollbar @read-only @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/bulk-operations/history');
    await expect(page.locator('.mv-advanced-data-table__grid').first()).toBeVisible({
        timeout: 15000,
    });
    await page.waitForLoadState('networkidle');
    expect(await nestedVerticalScrollers(page)).toEqual([]);
});

test('a customer card orders tab has no nested vertical scrollbar @read-only', async ({ page }) => {
    await page.goto('/customers?search=E2E%20Co');
    const row = page.locator('.el-table-v2__row', { hasText: 'E2E Co' });
    await row.waitFor({ timeout: 15000 });
    await row.click({ position: { x: 20, y: 10 } });
    await expect(page).toHaveURL(/\/customers\/.+/);
    const ordersTab = page.getByRole('button', { name: /^Orders/ });
    await ordersTab.click();
    await expect(ordersTab).toHaveClass(/active/);
    await page.waitForLoadState('networkidle');
    expect(await nestedVerticalScrollers(page)).toEqual([]);
});
