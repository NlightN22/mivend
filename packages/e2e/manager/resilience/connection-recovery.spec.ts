import { test, expect } from '@playwright/test';
import { findServerPid, freezeServer, resumeServer } from '../../helpers/server-control';

// Recovery-after-transient-failure scenario (docs/testing-strategy.md's "E2E strategy") for
// stores/auth.ts's connection bar + relogin. Skipped by default — see the test.skip() below.
test.describe('Manager portal recovers from a backend outage', () => {
    test.skip(
        !process.env.E2E_RESILIENCE,
        'Requires SIGSTOP/SIGCONT on the local dev server process — run via `make e2e-resilience`, not part of the default suite/CI.',
    );

    // Real timers, not mocked — must exceed MvConnectionBar's 2-minute escalation threshold.
    test.setTimeout(3 * 60 * 1000);

    let serverPid: number;

    test.beforeEach(() => {
        serverPid = findServerPid();
    });

    test.afterEach(() => {
        // Always resume, even if an assertion above failed mid-test — a frozen dev server left
        // behind would silently break every other test/manual session on this host afterward.
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
