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

// No e2e Playwright project logs in as this user (only operator/manager/department-head/
// portal-admin do), so reassigning its role breaks no other spec's session or permissions.
// Not the general director: core hides that role and its holder from portal-admin.
const TARGET_NAME = 'Svetlana Security';
const TARGET_EMAIL = 'svetlana.security@mivend.dev';
const NEW_ROLE = 'operator';

function userRow(
    page: import('@playwright/test').Page,
    name: string,
): import('@playwright/test').Locator {
    return page.getByRole('row', { name: new RegExp(name) }).first();
}

// Built on ManageAdministratorLifecycle, not ManageAccessControl; table shape follows
// the manager-table-standard skill in AGENTS.md.
test('portal-admin can reach /settings/users and see the seeded administrators (positive) @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/settings/users');
    // The mobile More sheet also renders the signed-in user's name, so scope to the page body.
    const main = page.getByRole('main');
    await expect(main.getByText('Ivan Operator', { exact: true })).toBeVisible({ timeout: 15000 });
    await expect(main.getByText('Petr Manager', { exact: true })).toBeVisible();
    await expect(main.getByText('Olga DeptHead', { exact: true })).toBeVisible();
    await expect(main.getByText(TARGET_NAME, { exact: true })).toBeVisible();
    await expect(main.getByText('Anna PortalAdmin', { exact: true })).toBeVisible();
});

test('the portal admin menu offers System settings and no sales entries, and Settings opens on Users (positive) @on:manager-portal-admin', async ({
    page,
}) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Open Users' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('not currently authorized')).toHaveCount(0);
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Customers' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Approvals' })).toHaveCount(0);
    await nav.getByRole('link', { name: 'System settings' }).click();
    await expect(page).toHaveURL(/\/settings\/users$/);
    await expect(page.getByText(TARGET_NAME, { exact: true })).toBeVisible({ timeout: 15000 });
});

test("portal-admin can reassign a user's role and it persists (positive) @on:manager-portal-admin", async ({
    page,
}) => {
    const before = await adminApiViaPage<{
        portalUsers: { items: { id: string; emailAddress: string; roleCodes: string[] }[] };
        assignableAdministratorRoles: { id: string; code: string }[];
    }>(
        page,
        `query { portalUsers(options: { take: 100 }) { items { id emailAddress roleCodes } } assignableAdministratorRoles { id code } }`,
    );
    const target = before.portalUsers.items.find(a => a.emailAddress === TARGET_EMAIL);
    if (!target) throw new Error(`${TARGET_EMAIL} not found`);
    const roleId = (code: string): string => {
        const role = before.assignableAdministratorRoles.find(r => r.code === code);
        if (!role) throw new Error(`${code} role not found`);
        return role.id;
    };
    const originalRoleId = roleId(target.roleCodes[0] ?? '');
    const newRoleId = roleId(NEW_ROLE);

    try {
        await page.goto('/settings/users');
        await page.waitForLoadState('networkidle');
        await userRow(page, TARGET_NAME).locator('select').selectOption(newRoleId);

        await expect
            .poll(
                async () => {
                    const after = await adminApiViaPage<{
                        portalUsers: { items: { emailAddress: string; roleCodes: string[] }[] };
                    }>(
                        page,
                        `query { portalUsers(options: { take: 100 }) { items { emailAddress roleCodes } } }`,
                    );
                    return after.portalUsers.items.find(a => a.emailAddress === TARGET_EMAIL)
                        ?.roleCodes[0];
                },
                { timeout: 15000 },
            )
            .toBe(NEW_ROLE);
    } finally {
        await adminApiViaPage(
            page,
            `mutation($id: ID!, $roleIds: [ID!]!) { setAdministratorRoles(administratorId: $id, roleIds: $roleIds) { id } }`,
            { id: target.id, roleIds: [originalRoleId] },
        );
    }
});

test('portal-admin is refused the native administrator update and the superadmin role (negative) @on:manager-portal-admin', async ({
    page,
}) => {
    const admins = await adminApiViaPage<{
        portalUsers: { items: { id: string; emailAddress: string }[] };
    }>(page, `query { portalUsers(options: { take: 100 }) { items { id emailAddress } } }`);
    const target = admins.portalUsers.items.find(a => a.emailAddress === TARGET_EMAIL);
    if (!target) throw new Error(`${TARGET_EMAIL} not found`);
    await expect(
        adminApiViaPage(
            page,
            `mutation($id: ID!) { updateAdministrator(input: { id: $id, password: "Changed-by-1-Test" }) { id } }`,
            { id: target.id },
        ),
    ).rejects.toThrow(/not currently authorized/i);
    const offered = await adminApiViaPage<{ assignableAdministratorRoles: { code: string }[] }>(
        page,
        `query { assignableAdministratorRoles { code } }`,
    );
    const codes = offered.assignableAdministratorRoles.map(r => r.code);
    expect(codes).toContain('manager');
    expect(codes).not.toContain('__super_admin_role__');
});

test('non-portal-admin roles cannot reach /settings/users (negative) @on:manager-operator @on:manager-manager @on:manager-department-head', async ({
    page,
}) => {
    await page.goto('/settings/users');
    await expect(page.getByText('Not authorized')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(TARGET_NAME, { exact: true })).toHaveCount(0);
});

async function accountStatus(
    page: import('@playwright/test').Page,
): Promise<{ id: string; isActive: boolean }> {
    const data = await adminApiViaPage<{
        portalUsers: { items: { id: string; emailAddress: string; isActive: boolean }[] };
    }>(
        page,
        `query { portalUsers(options: { take: 100, filter: { emailAddress: { eq: "${TARGET_EMAIL}" } } }) { items { id emailAddress isActive } } }`,
    );
    const row = data.portalUsers.items.find(a => a.emailAddress === TARGET_EMAIL);
    if (!row) throw new Error(`${TARGET_EMAIL} not found`);
    return row;
}

test('portal-admin deactivates and reactivates a user from the Users page (positive) @on:manager-portal-admin', async ({
    page,
}) => {
    // The Active switch column is dropped by the table at narrower widths.
    await page.setViewportSize({ width: 1800, height: 900 });
    await page.goto('/settings/users');
    await page.waitForLoadState('networkidle');
    const row = userRow(page, TARGET_NAME);
    await expect(row.getByText('Active', { exact: true })).toBeVisible({ timeout: 15000 });
    try {
        await row.locator('.mv-switch__track').click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
        await expect(row.getByText('Inactive', { exact: true })).toBeVisible({ timeout: 15000 });
        expect((await accountStatus(page)).isActive).toBe(false);

        await row.locator('.mv-switch__track').click();
        await expect(row.getByText('Active', { exact: true })).toBeVisible({ timeout: 15000 });
        expect((await accountStatus(page)).isActive).toBe(true);
    } finally {
        const { id } = await accountStatus(page);
        await adminApiViaPage(
            page,
            `mutation($id: ID!) { setAdministratorActive(administratorId: $id, isActive: true) }`,
            { id },
        );
    }
});

test('portal-admin cannot deactivate the superadmin or its own account (negative) @on:manager-portal-admin', async ({
    page,
}) => {
    const admins = await adminApiViaPage<{
        portalUsers: { items: { id: string; user: { identifier: string } }[] };
    }>(page, `query { portalUsers(options: { take: 100 }) { items { id user { identifier } } } }`);
    for (const email of ['superadmin', 'anna.portaladmin@mivend.dev']) {
        const target = admins.portalUsers.items.find(a => a.user.identifier === email);
        if (!target) throw new Error(`${email} not found`);
        await adminApiViaPage(
            page,
            `mutation($id: ID!) { setAdministratorActive(administratorId: $id, isActive: false) }`,
            { id: target.id },
        ).then(
            async () => {
                await adminApiViaPage(
                    page,
                    `mutation($id: ID!) { setAdministratorActive(administratorId: $id, isActive: true) }`,
                    { id: target.id },
                ).catch(() => undefined);
                throw new Error(`${email} was deactivated`);
            },
            () => undefined,
        );
    }
});
