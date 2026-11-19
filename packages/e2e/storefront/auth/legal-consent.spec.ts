import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SUPERADMIN } from '../../fixtures/accounts';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { deleteCustomerByEmail } from '../../helpers/customers';

const PASSWORD = 'Legal-Pass-4567!';
const email = `e2e-legal-${randomUUID().slice(0, 8)}@test.example`;
const KINDS = ['policy', 'agreement', 'personal-data-consent', 'marketing-consent'];

function psql(sql: string): string {
    return execFileSync(
        'docker',
        [
            'exec',
            'docker-postgres-central-1',
            'psql',
            '-U',
            'postgres',
            '-d',
            process.env.E2E_DB_NAME ?? 'mivend_central',
            '-tA',
            '-c',
            sql,
        ],
        { encoding: 'utf8' },
    ).trim();
}

function publish(kind: string, version: number): void {
    psql(
        `INSERT INTO legal_document_version (uuid, kind, version, locale, title, template, body, "effectiveDate", "requiresReacceptance")
         VALUES (gen_random_uuid(), '${kind}', ${version}, 'ru', 'E2E ${kind}', 'e2e', 'E2E text of ${kind} v${version}', now(), true)`,
    );
}

async function signIn(page: import('@playwright/test').Page): Promise<void> {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
}

// The documents are global, so the whole file runs in order and removes everything it published.
test.describe.serial('Legal documents acceptance (#272)', () => {
    let customerId = '';

    test.beforeAll(async () => {
        const token = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        const created = await adminGql<{ createCustomer: { id: string } }>(
            `mutation($e: String!, $p: String!) { createCustomer(input: { emailAddress: $e, firstName: "E2E", lastName: "Legal" }, password: $p) { ... on Customer { id } } }`,
            { e: email, p: PASSWORD },
            token,
        );
        customerId = created.data.createCustomer.id;
        for (const kind of KINDS) publish(kind, 1);
    });

    test.afterAll(async () => {
        psql(`DELETE FROM legal_acceptance WHERE "customerId" = ${customerId || 0}`);
        psql(`DELETE FROM legal_document_version WHERE title LIKE 'E2E %'`);
        const token = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
        await deleteCustomerByEmail(email, token);
    });

    test('the policy is public and linked from the login screen', async ({ page }) => {
        await page.goto('/login');
        await page.getByTestId('login-policy-link').click();
        await expect(page).toHaveURL(/\/legal\/policy$/);
        await expect(page.getByText('E2E text of policy v1')).toBeVisible();
    });

    test('a first sign-in asks for the documents, the required ones gate the button', async ({
        page,
    }) => {
        await signIn(page);
        await expect(page).toHaveURL(/\/legal-consent/);
        const submit = page.getByTestId('legal-consent-submit');
        await expect(submit).toBeDisabled();
        await page.getByTestId('legal-check-agreement').check();
        await expect(submit).toBeDisabled();
        await page.getByTestId('legal-check-personal-data-consent').check();
        await expect(submit).toBeEnabled();
        await submit.click();
        await page.waitForURL(url => !url.pathname.includes('/legal-consent'));
        expect(
            psql(`SELECT count(*) FROM legal_acceptance WHERE "customerId" = ${customerId}`),
        ).toBe('3');
    });

    test('a second sign-in is a plain form', async ({ page }) => {
        await signIn(page);
        await page.waitForURL(url => !url.pathname.includes('/login'));
        expect(page.url()).not.toContain('/legal-consent');
        expect(
            psql(`SELECT count(*) FROM legal_acceptance WHERE "customerId" = ${customerId}`),
        ).toBe('3');
    });

    test('a new version that requires re-acceptance asks again, for that document only', async ({
        page,
    }) => {
        publish('agreement', 2);
        await signIn(page);
        await expect(page).toHaveURL(/\/legal-consent/);
        await expect(page.getByTestId('legal-check-agreement')).toBeVisible();
        await expect(page.getByTestId('legal-check-personal-data-consent')).toHaveCount(0);
        await page.getByTestId('legal-check-agreement').check();
        await page.getByTestId('legal-consent-submit').click();
        await page.waitForURL(url => !url.pathname.includes('/legal-consent'));
        expect(
            psql(
                `SELECT count(*) FROM legal_acceptance WHERE "customerId" = ${customerId} AND kind = 'agreement' AND version = 2`,
            ),
        ).toBe('1');
    });
});
