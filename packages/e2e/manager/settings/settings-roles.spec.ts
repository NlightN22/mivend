import { test, expect } from '@playwright/test';

// page.request shares the browser context's session cookie (manager portal's admin API client
// uses credentials:'include', not a bearer token) — same helper pattern as
// manager/customers/customers.spec.ts's adminApiViaPage.
async function adminApiViaPage<T>(
    page: import('@playwright/test').Page,
    query: string,
    variables?: Record<string, unknown>,
): Promise<T> {
    const res = await page.request.post('/admin-api', { data: { query, variables } });
    const json = (await res.json()) as { data: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));
    return json.data;
}

// security-officer has no e2e login account of its own — safe to mutate without affecting any
// other spec's seeded login identity (matches the rationale customers.spec.ts's Counterparty
// history tests use for picking a mutation target).
const TARGET_ROLE = 'security-officer';

function fieldSelect(
    page: import('@playwright/test').Page,
    label: string,
): import('@playwright/test').Locator {
    return page.locator('.mv-field', { hasText: label }).locator('select');
}

function fieldInput(
    page: import('@playwright/test').Page,
    label: string,
): import('@playwright/test').Locator {
    return page.locator('.mv-field', { hasText: label }).locator('input');
}

test('portal-admin can reach /settings and see the roles list (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-portal-admin', 'Needs ManageAccessControl');

    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings\/roles$/);
    await expect(page.getByText('operator', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('manager', { exact: true })).toBeVisible();
    await expect(page.getByText('department-head', { exact: true })).toBeVisible();
    await expect(page.getByText('general-director', { exact: true })).toBeVisible();
    await expect(page.getByText('security-officer', { exact: true })).toBeVisible();
    await expect(page.getByText('portal-admin', { exact: true })).toBeVisible();
});

test('portal-admin can edit a role permissions and it persists (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-portal-admin', 'Needs ManageAccessControl');

    const before = await adminApiViaPage<{
        roles: { items: { id: string; permissions: string[] }[] };
    }>(
        page,
        `query { roles(options: { filter: { code: { eq: "${TARGET_ROLE}" } } }) { items { id permissions } } }`,
    );
    const role = before.roles.items[0];
    if (!role) throw new Error(`${TARGET_ROLE} role not found`);
    // CreateOrder is never seeded for security-officer — a safe, currently-unset toggle target.
    expect(role.permissions).not.toContain('CreateOrder');

    try {
        await page.goto(`/settings/roles/${TARGET_ROLE}`);
        await page.waitForLoadState('networkidle');
        await page.getByText('CreateOrder', { exact: true }).click();
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Permissions saved.')).toBeVisible({ timeout: 15000 });

        const after = await adminApiViaPage<{
            roles: { items: { permissions: string[] }[] };
        }>(
            page,
            `query { roles(options: { filter: { code: { eq: "${TARGET_ROLE}" } } }) { items { permissions } } }`,
        );
        expect(after.roles.items[0]?.permissions).toContain('CreateOrder');
    } finally {
        await adminApiViaPage(
            page,
            `mutation($id: ID!, $p: [Permission!]!) { updateRole(input: { id: $id, permissions: $p }) { id } }`,
            { id: role.id, p: role.permissions.filter(p => p !== 'Authenticated') },
        );
    }
});

test('portal-admin can edit a role access scope and it persists (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-portal-admin', 'Needs ManageAccessControl');

    const before = await adminApiViaPage<{ roleAccessScopeConfig: string | null }>(
        page,
        `query { roleAccessScopeConfig(roleCode: "${TARGET_ROLE}") }`,
    );
    const originalConfig = before.roleAccessScopeConfig
        ? (JSON.parse(before.roleAccessScopeConfig) as Record<string, string>)
        : { counterparty: 'all', order: 'all' };
    const newCounterpartyScope = originalConfig.counterparty === 'own' ? 'department' : 'own';

    try {
        await page.goto(`/settings/roles/${TARGET_ROLE}`);
        await page.waitForLoadState('networkidle');
        await fieldSelect(page, 'Counterparty visibility').selectOption(newCounterpartyScope);
        await page.getByRole('button', { name: 'Save changes' }).click();
        await expect(page.getByText('Access scope saved.')).toBeVisible({ timeout: 15000 });

        const after = await adminApiViaPage<{ roleAccessScopeConfig: string | null }>(
            page,
            `query { roleAccessScopeConfig(roleCode: "${TARGET_ROLE}") }`,
        );
        const afterConfig = JSON.parse(after.roleAccessScopeConfig ?? '{}') as Record<
            string,
            string
        >;
        expect(afterConfig.counterparty).toBe(newCounterpartyScope);
    } finally {
        await adminApiViaPage(
            page,
            `mutation($code: String!, $config: String!) { setRoleAccessScopeConfig(roleCode: $code, accessScopeConfig: $config) }`,
            { code: TARGET_ROLE, config: JSON.stringify(originalConfig) },
        );
    }
});

test('portal-admin can edit a role credit term limit and it persists (positive)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'manager-portal-admin', 'Needs ManageAccessControl');

    const newMaxExtraDays = 17;

    await page.goto(`/settings/roles/${TARGET_ROLE}`);
    await page.waitForLoadState('networkidle');
    await fieldInput(page, 'Max extra days').fill(String(newMaxExtraDays));
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Credit term limit saved.')).toBeVisible({ timeout: 15000 });

    const after = await adminApiViaPage<{
        creditTermLimit: { maxExtraDays: number } | null;
    }>(page, `query { creditTermLimit(roleCode: "${TARGET_ROLE}") { maxExtraDays } }`);
    expect(after.creditTermLimit?.maxExtraDays).toBe(newMaxExtraDays);
});

test('non-portal-admin roles cannot reach Settings (negative)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'manager-portal-admin', 'Covered by the positive cases');

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Settings' })).toHaveCount(0);

    await page.goto(`/settings/roles/${TARGET_ROLE}`);
    await expect(page.getByText('Not authorized')).toBeVisible({ timeout: 15000 });
});
