import { test, expect, type Page } from '@playwright/test';

const PAGES = [
    { path: '/settings/data-drift', title: 'Data drift reports' },
    { path: '/settings/erp-reconciliation', title: 'ERP reconciliation' },
    { path: '/settings/inbox-issues', title: 'Inbox issues' },
    { path: '/settings/integration-health', title: 'Integration health' },
    { path: '/settings/outbound-problems', title: 'Outbound problems' },
];

async function adminApi(page: Page, query: string): Promise<{ errors?: { message: string }[] }> {
    const res = await page.request.post('/admin-api', { data: { query } });
    return (await res.json()) as { errors?: { message: string }[] };
}

test('portal-admin sees the five exchange health entries after System health (positive) @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/settings/integration-health');
    const nav = page.getByRole('navigation', { name: 'Settings sections' });
    await expect(nav.getByRole('link', { name: 'Integration health' })).toBeVisible({
        timeout: 15000,
    });
    const labels = await nav.getByRole('link').allInnerTexts();
    expect(labels.slice(-5).map(l => l.trim())).toEqual(PAGES.map(p => p.title));
});

for (const { path, title } of PAGES) {
    test(`portal-admin opens ${title} read-only (positive) @on:manager-portal-admin`, async ({
        page,
    }) => {
        await page.goto(path);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading', { level: 1, name: title })).toBeVisible({
            timeout: 15000,
        });
        await expect(main.getByText('Not authorized')).toHaveCount(0);
        await expect(main.getByText('not currently authorized')).toHaveCount(0);
        await expect(main.getByText('Could not load')).toHaveCount(0);
        for (const action of ['Replay', 'Dismiss', 'Requeue', 'Rebuild', 'Run reconciliation']) {
            await expect(main.getByRole('button', { name: action, exact: true })).toHaveCount(0);
        }
    });
}

test('integration health shows the inbound stream table with data (positive) @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/settings/integration-health');
    const main = page.getByRole('main');
    await expect(main.getByRole('columnheader', { name: 'Kafka lag' })).toBeVisible({
        timeout: 20000,
    });
    await expect(main.getByRole('row').nth(1)).toBeVisible();
});

test('portal-admin may read the health queries but is refused every action (negative) @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/settings/inbox-issues');
    const read = await adminApi(
        page,
        '{ integrationInboxIssues(options: { take: 1 }) { totalItems } }',
    );
    expect(read.errors?.map(e => e.message).join(' ') ?? '').not.toMatch(
        /not currently authorized/i,
    );
    for (const action of [
        'mutation { runErpReconciliation { checked } }',
        'mutation { requeueFailedIntegrationOutbox(ids: ["1"]) }',
        'mutation { dismissFailedIntegrationInbox(id: "1", reason: "x") }',
    ]) {
        const result = await adminApi(page, action);
        expect(result.errors?.map(e => e.message).join(' ')).toMatch(/not currently authorized/i);
    }
});

test('a role without the right has no exchange health entries and is refused the queries (negative)', async ({
    page,
}) => {
    await page.goto('/settings/inbox-issues');
    await expect(page.getByRole('heading', { name: 'Not authorized' })).toBeVisible({
        timeout: 15000,
    });
    await expect(page.getByRole('link', { name: 'Inbox issues' })).toHaveCount(0);
    const result = await adminApi(
        page,
        '{ integrationInboxIssues(options: { take: 1 }) { totalItems } }',
    );
    expect(result.errors?.map(e => e.message).join(' ')).toMatch(/not currently authorized/i);
});
