import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { shopGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { deleteCustomerByEmail } from '../../helpers/customers';
import { tokenFromNewMail } from '../../helpers/mailbox';
import { SUPERADMIN } from '../../fixtures/accounts';

const VERIFY_SUBJECT = 'Please verify your email address';
const PASSWORD = 'Verify-Pass-4567!';

test.describe('Storefront account activation page (#137)', () => {
    test('a mailed activation link sets the password, redirects on its own and the password logs in', async ({
        page,
    }) => {
        test.setTimeout(90_000);
        const email = `e2e-verify-${randomUUID().slice(0, 8)}@test.example`;
        const superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        try {
            const token = await tokenFromNewMail(email, VERIFY_SUBJECT, 'verify', () =>
                shopGql(
                    `mutation($i: RegisterCustomerInput!) { registerCustomerAccount(input: $i) { __typename } }`,
                    { i: { emailAddress: email, firstName: 'E2E', lastName: 'Verify' } },
                ),
            );
            await page.goto(`/verify?token=${encodeURIComponent(token)}`);
            await expect(
                page.getByRole('heading', { name: 'Activate your account' }),
            ).toBeVisible();
            await page.locator('input[type="password"]').first().fill(PASSWORD);
            await page.locator('input[type="password"]').last().fill(PASSWORD);
            await page.getByRole('button', { name: 'Save password' }).click();
            await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();
            await expect(page).toHaveURL(/\/catalog$/);

            await page.context().clearCookies();
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(email);
            await page.locator('input[type="password"]').fill(PASSWORD);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));
        } finally {
            await deleteCustomerByEmail(email, superadmin);
        }
    });

    test('an unknown activation token shows the invalid-link state', async ({ page }) => {
        await page.goto('/verify?token=not-a-real-token');
        await page.locator('input[type="password"]').first().fill(PASSWORD);
        await page.locator('input[type="password"]').last().fill(PASSWORD);
        await page.getByRole('button', { name: 'Save password' }).click();
        await expect(
            page.getByRole('heading', { name: 'Link is invalid or expired' }),
        ).toBeVisible();
    });
});
