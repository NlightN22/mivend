import { test, expect } from '@playwright/test';
import { findServerPid, freezeServer, resumeServer } from '../../helpers/server-control';

// Connection bar + relogin after an outage. Only `make e2e-resilience` runs it: playwright.config
// ignores manager/resilience unless E2E_RESILIENCE is set, since it freezes the stack server.
test.describe('Manager portal recovers from a backend outage', () => {
    // Real timers, not mocked — must exceed MvConnectionBar's 2-minute escalation threshold.
    test.setTimeout(3 * 60 * 1000);

    let serverPid: number;

    test.beforeEach(() => {
        serverPid = findServerPid();
    });

    test.afterEach(() => {
        // Resume even after a failed assertion, or the remaining tests hit a frozen server.
        resumeServer(serverPid);
    });

    test('shows a persistent connection bar during an outage, then clears on recovery', async ({
        page,
    }) => {
        await page.goto('/');
        await expect(page.getByText('Welcome back,')).toBeVisible();

        freezeServer(serverPid);
        await page.reload();

        const bar = page.locator('.mv-connection-bar');
        await expect(bar).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('.mv-connection-bar__relogin')).not.toBeVisible();

        resumeServer(serverPid);
        await expect(bar).toBeHidden({ timeout: 30_000 });
        // Session survived the outage — no forced re-login, dashboard data is back.
        await expect(page.getByText('Welcome back,')).toBeVisible();
    });

    test('escalates to a "Log in again" action after a prolonged outage, which navigates to /login', async ({
        page,
    }) => {
        await page.goto('/');
        await expect(page.getByText('Welcome back,')).toBeVisible();

        freezeServer(serverPid);
        await page.reload();

        const reloginButton = page.locator('.mv-connection-bar__relogin');
        // Waits out the real 2-minute escalation threshold rather than mocking it.
        await expect(reloginButton).toBeVisible({ timeout: 150_000 });
        await expect(page.locator('.mv-connection-bar__pill')).toContainText('Server unavailable');

        await reloginButton.click();
        await page.waitForURL(url => url.pathname.includes('/login'), { timeout: 5_000 });
        expect(page.url()).toContain('/login');
    });
});
