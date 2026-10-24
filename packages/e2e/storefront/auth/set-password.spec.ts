import { test, expect } from '@playwright/test';
import { shopGql } from '../../helpers/api';
import { E2E_CUSTOMER } from '../../fixtures/seed';

const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const RESET_SUBJECT = 'Forgotten password reset';
const NEW_PASSWORD = 'Reset-Pass-4567!';

interface MailboxListItem {
    fileName: string;
    recipient: string;
    subject: string;
}

async function resetMails(email: string): Promise<string[]> {
    const list = (await (await fetch(`${SERVER_URL}/mailbox/list`)).json()) as MailboxListItem[];
    return list
        .filter(i => i.recipient === email && i.subject === RESET_SUBJECT)
        .map(i => i.fileName)
        .sort();
}

async function requestResetToken(email: string): Promise<string> {
    const before = new Set(await resetMails(email));
    await shopGql(
        `mutation($e: String!) { requestPasswordReset(emailAddress: $e) { __typename } }`,
        { e: email },
    );
    let fileName: string | undefined;
    await expect(async () => {
        fileName = (await resetMails(email)).filter(f => !before.has(f)).pop();
        expect(fileName, `no new reset mail for ${email} in /mailbox`).toBeTruthy();
    }).toPass({ timeout: 30_000 });
    const item = (await (
        await fetch(`${SERVER_URL}/mailbox/item/${encodeURIComponent(fileName!)}`)
    ).json()) as { body: string };
    const href = /href="([^"]*set-password\?token=[^"]*)"/.exec(item.body)?.[1];
    expect(href, 'reset link in the mail').toBeTruthy();
    return new URL(href!.replace(/&amp;/g, '&')).searchParams.get('token')!;
}

test.describe('Storefront set-password page (#137)', () => {
    test('a mailed reset link sets a new password that logs in', async ({ page }) => {
        test.setTimeout(90_000);
        const token = await requestResetToken(E2E_CUSTOMER.email);
        try {
            await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
            await page.locator('input[type="password"]').first().fill(NEW_PASSWORD);
            await page.locator('input[type="password"]').last().fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Save password' }).click();
            await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();

            await page.context().clearCookies();
            await page.goto('/login');
            await page.locator('input[type="email"]').fill(E2E_CUSTOMER.email);
            await page.locator('input[type="password"]').fill(NEW_PASSWORD);
            await page.getByRole('button', { name: 'Sign in' }).click();
            await page.waitForURL(url => !url.pathname.includes('/login'));
        } finally {
            const restoreToken = await requestResetToken(E2E_CUSTOMER.email);
            const restored = await shopGql<{ resetPassword: { __typename: string } }>(
                `mutation($t: String!, $p: String!) { resetPassword(token: $t, password: $p) { __typename } }`,
                { t: restoreToken, p: E2E_CUSTOMER.password },
            );
            expect(restored.resetPassword.__typename).toBe('CurrentUser');
        }
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
