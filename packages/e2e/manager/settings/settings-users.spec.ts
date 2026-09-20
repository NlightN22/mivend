import { test, expect } from '@playwright/test';

// Same pattern as settings-roles.spec.ts's adminApiViaPage — shares the browser context's
// session cookie, hits the real admin-api as the currently-logged-in user.
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

// nikolai.director (general-director) has no e2e Playwright project logging in as this
// identity (only operator/manager/department-head/portal-admin do) — safe to reassign its
// role without breaking any other spec's login session or permission assumptions.
const TARGET_NAME = 'Nikolai Director';
const TARGET_EMAIL = 'nikolai.director@mivend.dev';

function userRow(
    page: import('@playwright/test').Page,
    name: string,
): import('@playwright/test').Locator {
    return page.getByRole('row', { name: new RegExp(name) }).first();
}

// Issue #119 Phase 2: /settings/team (li-based TeamPage.vue) was replaced by /settings/users
// (UsersDataTable.vue, on ManageAdministratorLifecycle rather than ManageAccessControl — see
// AGENTS.md's manager-table-standard skill for the table shape this now follows).
test('portal-admin can reach /settings/users and see the seeded administrators (positive)', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-portal-admin',
        'Needs ManageAdministratorLifecycle',
    );

    await page.goto('/settings/users');
    await expect(page.getByText('Ivan Operator', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Petr Manager', { exact: true })).toBeVisible();
    await expect(page.getByText('Olga DeptHead', { exact: true })).toBeVisible();
    await expect(page.getByText(TARGET_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText('Anna PortalAdmin', { exact: true })).toBeVisible();
});

test('the Settings sub-nav links Roles & access and Users correctly (positive)', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-portal-admin',
        'Needs ManageAdministratorLifecycle',
    );

    await page.goto('/settings/roles');
    // The sidebar also has an unrelated top-level "Team" link (/team, a ComingSoon placeholder)
    // — scope to the in-page sub-nav specifically.
    const mainContent = page.getByRole('main');
    await mainContent.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/settings\/users$/);
    await expect(page.getByText(TARGET_NAME, { exact: true })).toBeVisible({ timeout: 15000 });

    await mainContent.getByRole('link', { name: 'Roles & access' }).click();
    await expect(page).toHaveURL(/\/settings\/roles$/);
    await expect(page.getByText('operator', { exact: true })).toBeVisible({ timeout: 15000 });
});

test("portal-admin can reassign a user's role and it persists (positive)", async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'manager-portal-admin',
        'Needs ManageAdministratorLifecycle',
    );

    const before = await adminApiViaPage<{
        administrators: {
            items: {
                id: string;
                emailAddress: string;
                user: { roles: { id: string; code: string }[] };
            }[];
        };
    }>(
        page,
        `query { administrators(options: { take: 200 }) { items { id emailAddress user { roles { id code } } } } }`,
    );
    const target = before.administrators.items.find(a => a.emailAddress === TARGET_EMAIL);
    if (!target) throw new Error(`${TARGET_EMAIL} not found`);
    const originalRoleId = target.user.roles[0]?.id;
    if (!originalRoleId) throw new Error(`${TARGET_EMAIL} has no role`);

    const rolesResult = await adminApiViaPage<{ roles: { items: { id: string; code: string }[] } }>(
        page,
        `query { roles(options: { filter: { code: { eq: "security-officer" } } }) { items { id code } } }`,
    );
    const securityOfficerRoleId = rolesResult.roles.items[0]?.id;
    if (!securityOfficerRoleId) throw new Error('security-officer role not found');

    try {
        await page.goto('/settings/users');
        await page.waitForLoadState('networkidle');
        await userRow(page, TARGET_NAME).locator('select').selectOption(securityOfficerRoleId);

        await expect
            .poll(
                async () => {
                    const after = await adminApiViaPage<{
                        administrators: {
                            items: { emailAddress: string; user: { roles: { code: string }[] } }[];
                        };
                    }>(
                        page,
                        `query { administrators(options: { take: 200 }) { items { emailAddress user { roles { code } } } } }`,
                    );
                    return after.administrators.items.find(a => a.emailAddress === TARGET_EMAIL)
                        ?.user.roles[0]?.code;
                },
                { timeout: 15000 },
            )
            .toBe('security-officer');
    } finally {
        await adminApiViaPage(
            page,
            `mutation($id: ID!, $roleIds: [ID!]!) { updateAdministrator(input: { id: $id, roleIds: $roleIds }) { id } }`,
            { id: target.id, roleIds: [originalRoleId] },
        );
    }
});

test('non-portal-admin roles cannot reach /settings/users (negative)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name === 'manager-portal-admin', 'Covered by the positive cases');

    await page.goto('/settings/users');
    await expect(page.getByText('Not authorized')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TARGET_NAME, { exact: true })).toHaveCount(0);
});
