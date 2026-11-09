import { test, expect, type APIRequestContext } from '@playwright/test';

// Runs unauthenticated (manager-noauth project) against the local mock OpenID Connect provider.
const MOCK_URL = process.env.MOCK_OIDC_URL ?? 'http://localhost:3995';
const OPERATOR_EMAIL = 'ivan.operator@mivend.dev';

async function actAs(request: APIRequestContext, sub: string, email: string | null): Promise<void> {
    const res = await request.post(`${MOCK_URL}/_control`, { data: { sub, email } });
    expect(res.ok()).toBe(true);
}

test.describe.configure({ mode: 'serial' });

test.describe('Manager sign-in through the corporate account', () => {
    test('an unknown e-mail is refused with the generic error and no session', async ({
        page,
        request,
    }) => {
        await actAs(request, 'sub-nobody', 'nobody@example.com');
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await expect(page.locator('.mv-notice--error')).toBeVisible();
        expect(page.url()).toContain('/oidc/callback');
        await page.goto('/orders');
        await page.waitForURL(url => url.pathname.includes('/login'));
    });

    test('a missing e-mail claim is refused on first sign-in', async ({ page, request }) => {
        await actAs(request, 'sub-no-email', null);
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await expect(page.locator('.mv-notice--error')).toBeVisible();
    });

    test('the first sign-in links by e-mail and opens the portal', async ({ page, request }) => {
        await actAs(request, 'sub-operator', OPERATOR_EMAIL);
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await page.waitForURL(
            url => !url.pathname.includes('/login') && !url.pathname.includes('/oidc'),
        );
        await expect(page.getByText('Welcome back,')).toBeVisible();
        expect(page.url()).not.toContain('code=');
    });

    test('later sign-ins match by sub even when the e-mail differs', async ({ page, request }) => {
        await actAs(request, 'sub-operator', 'renamed@example.com');
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await page.waitForURL(
            url => !url.pathname.includes('/login') && !url.pathname.includes('/oidc'),
        );
        await expect(page.getByText('Welcome back,')).toBeVisible();
    });

    test('another subject cannot take over a linked account by e-mail', async ({
        page,
        request,
    }) => {
        await actAs(request, 'sub-impostor', OPERATOR_EMAIL);
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await expect(page.locator('.mv-notice--error')).toBeVisible();
    });

    test('a replayed callback URL is refused', async ({ page, request }) => {
        await actAs(request, 'sub-operator', OPERATOR_EMAIL);
        await page.goto('/login');
        let callback = '';
        page.on('request', r => {
            if (r.url().includes('/oidc/callback?')) callback = r.url();
        });
        await page.getByTestId('oidc-sign-in').click();
        await page.waitForURL(
            url => !url.pathname.includes('/login') && !url.pathname.includes('/oidc'),
        );
        await page.context().clearCookies();
        await page.goto(callback);
        await expect(page.locator('.mv-notice--error')).toBeVisible();
    });
});
