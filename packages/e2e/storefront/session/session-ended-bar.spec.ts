import { test, expect } from '@playwright/test';

test.describe('Session ended connection bar', () => {
    test('is on top of the sticky header after the session cookie is cleared', async ({
        page,
        context,
    }) => {
        await page.clock.install();
        await page.goto('/orders');
        await expect(page.getByRole('heading', { name: 'My Orders' })).toBeVisible({
            timeout: 20000,
        });

        await context.clearCookies();
        await page.clock.runFor(61_000);

        const relogin = page.locator('.mv-connection-bar__relogin');
        await expect(relogin).toBeVisible({ timeout: 10000 });

        // toBeVisible ignores overlap, so check the bar is the topmost element at its own centre.
        const onTop = await relogin.evaluate(el => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return hit !== null && el.contains(hit);
        });
        expect(onTop).toBe(true);
    });
});
