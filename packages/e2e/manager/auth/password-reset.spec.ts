import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { adminGql, shopGql } from '../../helpers/api';
import { linkFromNewMail } from '../../helpers/mailbox';
import { adminTokenFor } from '../../helpers/api-tokens';
import { E2E_CUSTOMER } from '../../fixtures/seed';
import { SUPERADMIN } from '../../fixtures/accounts';

const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5183';
const RESET_SUBJECT = 'Forgotten password reset';
const NEW_PASSWORD = 'Reset-Pass-4567!';

const resetLinkAfter = (email: string, trigger: () => Promise<unknown>): Promise<URL> =>
    linkFromNewMail(email, RESET_SUBJECT, 'set-password', trigger);

test.describe('Password reset mail link depends on the recipient (#137)', () => {
    test('a staff reset mail opens the manager set-password page and the new password logs in', async ({
        page,
    }) => {
        const superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        const email = `e2e-reset-${randomUUID().slice(0, 8)}@test.example`;
        const { data } = await adminGql<{ createAdministrator: { id: string } }>(
            `mutation($input: CreateAdministratorInput!) { createAdministrator(input: $input) { id } }`,
            {
                input: {
                    firstName: 'E2E',
                    lastName: 'Reset',
                    emailAddress: email,
                    password: 'Initial-Pass-1234!',
                    roleIds: [],
                },
            },
            superadmin,
        );
        const adminId = data.createAdministrator.id;
        try {
            const link = await resetLinkAfter(email, () =>
                adminGql(
                    `mutation($id: ID!) { resendAdministratorPasswordReset(administratorId: $id) }`,
                    { id: adminId },
                    superadmin,
                ),
            );
            expect(link.origin).toBe(MANAGER_URL);
            expect(link.pathname).toBe('/set-password');
            expect(link.searchParams.get('token')).toBeTruthy();

            await page.goto(link.toString());
            await page.getByRole('textbox').first().fill(NEW_PASSWORD);
            await page.getByRole('textbox').last().fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Save password' }).click();
            await expect(page.getByText('Password saved')).toBeVisible();

            await page.goto('/login');
            await page.locator('input').first().fill(email);
            await page.locator('input[type="password"]').fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));
        } finally {
            await adminGql(
                `mutation($id: ID!) { deleteAdministrator(id: $id) { result } }`,
                { id: adminId },
                superadmin,
            );
        }
    });

    test('a customer reset mail links to the storefront, not the manager portal', async () => {
        const link = await resetLinkAfter(E2E_CUSTOMER.email, () =>
            shopGql(
                `mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`,
                { e: E2E_CUSTOMER.email },
            ),
        );
        expect(link.origin).toBe(STOREFRONT_URL);
        expect(link.pathname).toBe('/set-password');
        expect(link.origin).not.toBe(MANAGER_URL);
    });
});
