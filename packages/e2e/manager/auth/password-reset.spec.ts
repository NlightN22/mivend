import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { adminGql, shopGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { E2E_CUSTOMER } from '../../fixtures/seed';
import { SUPERADMIN } from '../../fixtures/accounts';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const MANAGER_URL = process.env.MANAGER_URL ?? 'http://localhost:5174';
const STOREFRONT_URL = process.env.STOREFRONT_URL ?? 'http://localhost:5183';
const RESET_SUBJECT = 'Forgotten password reset';
const NEW_PASSWORD = 'Reset-Pass-4567!';

interface MailboxListItem {
    fileName: string;
    recipient: string;
    subject: string;
}

// The mail goes out through the job queue, and the mailbox directory outlives runs: poll for the
// newest reset mail by its timestamped file name.
async function resetLinkFor(email: string): Promise<URL> {
    let fileName: string | undefined;
    await expect(async () => {
        const list = (await (
            await fetch(`${SERVER_URL}/mailbox/list`)
        ).json()) as MailboxListItem[];
        fileName = list
            .filter(i => i.recipient === email && i.subject === RESET_SUBJECT)
            .map(i => i.fileName)
            .sort()
            .pop();
        expect(fileName, `no reset mail for ${email} in /mailbox`).toBeTruthy();
    }).toPass({ timeout: 30_000 });
    const item = (await (
        await fetch(`${SERVER_URL}/mailbox/item/${encodeURIComponent(fileName!)}`)
    ).json()) as { body: string };
    const href = /href="([^"]*set-password\?token=[^"]*)"/.exec(item.body)?.[1];
    expect(href, 'reset link in the mail').toBeTruthy();
    return new URL(href!.replace(/&amp;/g, '&'));
}

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
            await adminGql(
                `mutation($id: ID!) { resendAdministratorPasswordReset(administratorId: $id) }`,
                { id: adminId },
                superadmin,
            );
            const link = await resetLinkFor(email);
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
        await shopGql(
            `mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`,
            { e: E2E_CUSTOMER.email },
        );
        const link = await resetLinkFor(E2E_CUSTOMER.email);
        expect(link.origin).toBe(STOREFRONT_URL);
        expect(link.pathname).toBe('/set-password');
        expect(link.origin).not.toBe(MANAGER_URL);
    });
});
