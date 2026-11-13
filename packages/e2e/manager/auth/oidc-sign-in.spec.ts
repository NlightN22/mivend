import { test, expect, type APIRequestContext } from '@playwright/test';

// Runs unauthenticated (manager-noauth project) against the local mock OpenID Connect provider.
const MOCK_URL = process.env.MOCK_OIDC_URL ?? 'http://localhost:3995';
const OPERATOR_EMAIL = 'ivan.operator@mivend.dev';

async function actAs(
    request: APIRequestContext,
    sub: string,
    email: string | null,
    emailVerified?: boolean,
): Promise<void> {
    const res = await request.post(`${MOCK_URL}/_control`, { data: { sub, email, emailVerified } });
    expect(res.ok()).toBe(true);
}

interface ProviderState {
    providerSession: boolean;
    endedSessions: Array<{ idTokenHint: string | null; clientId: string | null }>;
}

test.describe.configure({ mode: 'serial' });

test.describe('Manager sign-in through the corporate account', () => {
    test('the login page offers the provider host as an outlined button under the form', async ({
        page,
    }) => {
        await page.goto('/login');
        const button = page.getByRole('button', { name: 'Sign in with localhost', exact: true });
        await expect(button).toBeVisible();
        await expect(page.getByRole('separator')).toHaveText('or');
        await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    });

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

    test('an unverified provider e-mail is refused with its own message and no session', async ({
        page,
        request,
    }) => {
        await actAs(request, 'sub-unverified', OPERATOR_EMAIL, false);
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await expect(page.locator('.mv-notice--error')).toContainText(
            'Your corporate account e-mail is not confirmed',
        );
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

    test('a callback opened without this browser starting the flow is refused', async ({
        page,
        request,
    }) => {
        await actAs(request, 'sub-operator', OPERATOR_EMAIL);
        const started = await page.request.post('/admin-api', {
            data: { query: 'mutation { startOidcSignIn { authorizationUrl } }' },
        });
        const url = (await started.json()).data.startOidcSignIn.authorizationUrl as string;
        const callback = await page.request.get(url, { maxRedirects: 0 });
        await page.goto(callback.headers().location);
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

    test('signing out ends the provider session and returns to the login page', async ({
        page,
        request,
    }) => {
        await actAs(request, 'sub-operator', OPERATOR_EMAIL);
        await page.goto('/login');
        await page.getByTestId('oidc-sign-in').click();
        await page.waitForURL(
            url => !url.pathname.includes('/login') && !url.pathname.includes('/oidc'),
        );
        await expect(page.getByText('Welcome back,')).toBeVisible();
        const before = (await (await request.get(`${MOCK_URL}/_state`)).json()) as ProviderState;
        expect(before.providerSession).toBe(true);

        await page.locator('.mv-app-topbar__user').click();
        await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
        await page.waitForURL(url => url.pathname === '/login');

        const after = (await (await request.get(`${MOCK_URL}/_state`)).json()) as ProviderState;
        expect(after.providerSession).toBe(false);
        const ended = after.endedSessions.at(-1);
        expect(ended?.clientId).toBe('mivend-local');
        expect(ended?.idTokenHint?.split('.')).toHaveLength(3);
        await page.goto('/orders');
        await page.waitForURL(url => url.pathname.includes('/login'));
    });
});
