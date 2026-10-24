import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { shopGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { deleteCustomerByEmail } from '../../helpers/customers';
import { SUPERADMIN } from '../../fixtures/accounts';
import { tokenFromNewMail } from '../../helpers/mailbox';

const RESET_SUBJECT = 'Forgotten password reset';
const VERIFY_SUBJECT = 'Please verify your email address';
const OLD_PASSWORD = 'Old-Pass-1234!';
const NEW_PASSWORD = 'Reset-Pass-4567!';

function requestResetToken(email: string): Promise<string> {
    return tokenFromNewMail(email, RESET_SUBJECT, 'set-password', () =>
        shopGql(`mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`, {
            e: email,
        }),
    );
}

async function createActiveCustomer(email: string): Promise<void> {
    const token = await tokenFromNewMail(email, VERIFY_SUBJECT, 'verify', () =>
        shopGql(
            `mutation($i: RegisterCustomerInput!) { registerCustomerAccount(input: $i) { __typename } }`,
            { i: { emailAddress: email, firstName: 'E2E', lastName: 'Reset' } },
        ),
    );
    await shopGql(
        `mutation($t: String!, $p: String!) { verifyCustomerAccount(token: $t, password: $p) { __typename } }`,
        { t: token, p: OLD_PASSWORD },
    );
}

test.describe('Storefront set-password page (#137)', () => {
    test('a mailed reset link sets a new password, redirects on its own and the password logs in', async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const email = `e2e-reset-${randomUUID().slice(0, 8)}@test.example`;
        const superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        try {
            await createActiveCustomer(email);
            const token = await requestResetToken(email);
            await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
            await expect(page).not.toHaveURL(/token=/);
            await page.locator('input[type="password"]').first().fill(NEW_PASSWORD);
            await page.locator('input[type="password"]').last().fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Save password' }).click();
            await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
            await expect(page.getByRole('status')).toContainText('Redirecting to the catalogue');
            await expect(page).toHaveURL(/\/catalog$/);

            await page.context().clearCookies();
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(email);
            await page.locator('input[type="password"]').fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));
        } finally {
            await deleteCustomerByEmail(email, superadmin);
        }
    });

    test('a reload after the token was read shows the invalid-link state', async ({ page }) => {
        await page.goto('/set-password?token=not-a-real-token');
        await expect(page).not.toHaveURL(/token=/);
        await page.reload();
        await expect(
            page.getByRole('heading', { name: 'Link is invalid or expired' }),
        ).toBeVisible();
    });

    test('an unknown token shows the invalid-link state with a link to sign in', async ({
        page,
    }) => {
        await page.goto('/set-password?token=not-a-real-token');
        await page.locator('input[type="password"]').first().fill(NEW_PASSWORD);
        await page.locator('input[type="password"]').last().fill(NEW_PASSWORD);
        await page.getByRole('button', { name: 'Save password' }).click();
        await expect(
            page.getByRole('heading', { name: 'Link is invalid or expired' }),
        ).toBeVisible();
        await expect(page.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute(
            'href',
            '/login',
        );
    });

    test('a link without a token shows the invalid-link state at once', async ({ page }) => {
        await page.goto('/set-password');
        await expect(
            page.getByRole('heading', { name: 'Link is invalid or expired' }),
        ).toBeVisible();
    });
});
