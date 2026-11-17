import { test, expect, type Page } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { INN_TWIN_A, INN_UNIQUE } from '../../fixtures/seed-inn';

const STATE_LABEL: Record<string, string> = {
    none: 'Not activated',
    invited: 'Invited',
    verified: 'Verified, not signed in',
    active: 'Active',
};

// Twin A is seeded with a portal login, Unique without one (fixtures/seed-inn.ts); its state is read from the API.
async function seededStates(): Promise<{ withLogin: string; without: string }> {
    const token = await adminTokenFor(
        process.env.SUPERADMIN_USERNAME ?? 'superadmin',
        process.env.SUPERADMIN_PASSWORD ?? 'superadmin',
    );
    const { data } = await adminGql<{
        counterparties: { items: Array<{ shortName: string; portalState: string }> };
    }>(
        `query($o: CounterpartyListOptions) { counterparties(options: $o) { items { shortName portalState } } }`,
        { o: { search: 'E2E INN', take: 20 } },
        token,
    );
    const state = (name: string): string => {
        const found = data.counterparties.items.find(i => i.shortName === name);
        if (!found) throw new Error(`seeded counterparty ${name} is missing`);
        return found.portalState;
    };
    return { withLogin: state(INN_TWIN_A.shortName), without: state(INN_UNIQUE.shortName) };
}

function row(page: Page, shortName: string): ReturnType<Page['locator']> {
    return page.locator('tr', { hasText: shortName });
}

test.describe('customers list portal state (#375) @on:manager-portal-admin @read-only', () => {
    test('the list shows Portal and Status in ERP headers and no Portal access header', async ({
        page,
    }) => {
        await page.goto('/customers?search=E2E%20INN');
        const headers = page.getByRole('columnheader');
        await expect(headers.filter({ hasText: /^Portal$/ })).toHaveCount(1);
        await expect(headers.filter({ hasText: 'Status in ERP' })).toHaveCount(1);
        await expect(headers.filter({ hasText: 'Portal access' })).toHaveCount(0);
        await expect(row(page, INN_UNIQUE.shortName)).toBeVisible({ timeout: 15000 });
    });

    test('rows show the account state of the linked login', async ({ page }) => {
        const states = await seededStates();
        expect(states.without).toBe('none');
        await page.goto('/customers?search=E2E%20INN');
        await expect(row(page, INN_UNIQUE.shortName)).toContainText('Not activated', {
            timeout: 15000,
        });
        await expect(row(page, INN_TWIN_A.shortName)).toContainText(STATE_LABEL[states.withLogin]);
    });

    test('the Portal filter narrows the list to the chosen state', async ({ page }) => {
        const states = await seededStates();
        await page.goto('/customers?search=E2E%20INN');
        await expect(row(page, INN_UNIQUE.shortName)).toBeVisible({ timeout: 15000 });

        await page.getByTestId('filter-trigger').click();
        await page.getByTestId('filter-column-portalState').click();
        await page.getByTestId('filter-operator').selectOption('eq');
        await page
            .getByTestId('filter-value')
            .selectOption({ label: STATE_LABEL[states.withLogin] });
        await page.getByRole('button', { name: 'Apply filter' }).click();

        await expect(page.getByTestId('filter-chip')).toHaveCount(1);
        await expect(row(page, INN_TWIN_A.shortName)).toBeVisible({ timeout: 15000 });
        await expect(row(page, INN_UNIQUE.shortName)).toHaveCount(0);
    });

    test('the Not activated view chip keeps only rows without a login', async ({ page }) => {
        await page.goto('/customers?search=E2E%20INN');
        await expect(row(page, INN_TWIN_A.shortName)).toBeVisible({ timeout: 15000 });

        await page.getByRole('button', { name: /^Not activated/ }).click();
        await expect(row(page, INN_UNIQUE.shortName)).toBeVisible({ timeout: 15000 });
        await expect(row(page, INN_TWIN_A.shortName)).toHaveCount(0);
        for (const cell of await page.locator('tbody tr').allInnerTexts()) {
            expect(cell).toContain('Not activated');
        }
    });
});
