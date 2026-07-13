import { test, expect } from '@playwright/test';

// One spec file runs against three Playwright projects (manager-operator, manager-manager,
// manager-department-head — see playwright.config.ts), each pre-authenticated as a different
// seeded role (.tests/accounts.md / infrastructure/scripts/seed-access-roles.mjs). Cards shown
// per role must match packages/manager/src/api/dashboard-config.ts.
const CARDS_BY_ROLE: Record<string, { visible: string[]; hidden: string[] }> = {
    'manager-operator': {
        visible: ['Department orders', 'Department clients'],
        hidden: ['My pending approval requests', 'Awaiting my decision', 'My clients'],
    },
    'manager-manager': {
        visible: ['Active orders', 'My pending approval requests', 'My clients'],
        hidden: ['Awaiting my decision', 'Department orders', 'Department clients'],
    },
    'manager-department-head': {
        visible: ['Awaiting my decision', 'Department orders', 'Department clients'],
        hidden: ['My pending approval requests', 'My clients'],
    },
};

test('dashboard shows the KPI cards for the current role', async ({ page }, testInfo) => {
    const expected = CARDS_BY_ROLE[testInfo.project.name];
    test.skip(!expected, `No KPI expectations defined for project "${testInfo.project.name}"`);

    await page.goto('/');
    await expect(page.getByText('Welcome back,')).toBeVisible();

    for (const label of expected.visible) {
        await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    for (const label of expected.hidden) {
        await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
});

test('dashboard shows recent orders and my approval requests panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recent orders')).toBeVisible();
    await expect(page.getByText('My approval requests status')).toBeVisible();
});
