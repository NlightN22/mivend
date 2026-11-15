import { expect, test, type Page } from '@playwright/test';
import type { VisOrder } from '../../fixtures/visibility/ids';
import type { VisIds } from '../../fixtures/visibility/ids';
import {
    ERP_DOCS,
    ERP_DOC_KINDS,
    ERP_DOC_PATHS,
    ERP_DOC_PRODUCTS,
    ERP_DOC_TITLES,
    type ErpDocKind,
    type ErpDocPlan,
} from '../../fixtures/erp-documents/plan';
import {
    POA_PATH,
    POA_TITLE,
    POWERS_OF_ATTORNEY,
} from '../../fixtures/erp-documents/power-of-attorney';
import { clientName, type CustomerKey } from '../../fixtures/visibility/plan';
import { formatDocumentNumber } from '../../helpers/e2e-order';
import { openManagerAs, visData, type Session } from '../session';

const ROWS = '.mv-advanced-data-table__grid tbody tr';
const WAIT = { timeout: 15000 };

let s: Session;
let ids: VisIds;
let orders: Record<CustomerKey, VisOrder>;

test.beforeAll(async ({ browser }) => {
    ({ ids, orders } = await visData());
    s = await openManagerAs(browser, 'director');
});

test.afterAll(async () => {
    await s.context.close();
});

const shown = (kind: ErpDocKind): ErpDocPlan[] => ERP_DOCS[kind].filter(d => !d.deleted);
const doc = (kind: ErpDocKind, key: string): ErpDocPlan => ERP_DOCS[kind].find(d => d.key === key)!;
const rowOf = (page: Page, number: string): ReturnType<Page['locator']> =>
    page.locator(ROWS).filter({ hasText: number });

for (const kind of ERP_DOC_KINDS) {
    test.describe(`${ERP_DOC_TITLES[kind]} list`, () => {
        test('renders the seeded documents, number first, without the tombstone @read-only', async () => {
            await s.page.goto(ERP_DOC_PATHS[kind]);
            await expect(
                s.page.getByRole('heading', { name: ERP_DOC_TITLES[kind], exact: true }),
            ).toBeVisible(WAIT);
            await expect(s.page.getByRole('columnheader').first()).toContainText('Number');
            for (const d of shown(kind))
                await expect(rowOf(s.page, d.number), d.number).toHaveCount(1, WAIT);
            const tombstone = ERP_DOCS[kind].find(d => d.deleted)!;
            await expect(s.page.getByText(tombstone.number)).toHaveCount(0);
            const first = doc(kind, ERP_DOCS[kind][0].key);
            await expect(rowOf(s.page, first.number)).toContainText(ERP_DOC_PRODUCTS.oil.name);
        });

        test('shows the amount with an alphabetic currency, none for order corrections @read-only', async () => {
            await s.page.goto(ERP_DOC_PATHS[kind]);
            const row = rowOf(s.page, ERP_DOCS[kind][0].number);
            await expect(row).toBeVisible(WAIT);
            if (kind === 'orderCorrection') {
                await expect(row).toContainText('800.00');
                await expect(row).not.toContainText('RUB');
            } else await expect(row).toContainText(/\d[\d,\s]*\.00 RUB/);
            await expect(row).not.toContainText('643');
        });

        test('a document of an unknown customer shows a dash instead of a link @read-only', async () => {
            await s.page.goto(ERP_DOC_PATHS[kind]);
            const unknown = ERP_DOCS[kind].find(d => d.client === 'unknown')!;
            const row = rowOf(s.page, unknown.number);
            await expect(row).toBeVisible(WAIT);
            await expect(row.locator('a[href^="/customers/"]')).toHaveCount(0);
        });

        test('the number search finds exactly one row and lives in the URL @read-only', async () => {
            await s.page.goto(ERP_DOC_PATHS[kind]);
            const target = shown(kind)[1];
            await expect(rowOf(s.page, shown(kind)[0].number)).toBeVisible(WAIT);
            await s.page.getByPlaceholder('Number, order or customer…').fill(target.number);
            await expect(s.page).toHaveURL(new RegExp(`search=${target.number}`));
            await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
            await expect(s.page.locator(ROWS)).toContainText(target.number);
        });
    });
}

test.describe('cross-links keep the preset', () => {
    test('the order link of a document opens the order and the lists share the order preset @read-only', async () => {
        const order = orders['customer-a'];
        await s.page.goto(`${ERP_DOC_PATHS.customerClaim}?orderId=${order.id}`);
        await expect(s.page.getByText('Filtered to one order.')).toBeVisible(WAIT);
        const claim = doc('customerClaim', 'cc1');
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        const link = rowOf(s.page, claim.number).locator(`a[href="/orders/${order.code}"]`);
        await expect(link).toHaveText(formatDocumentNumber(order.code));
        await s.page
            .locator('.erp-documents-page__links')
            .getByRole('link', { name: ERP_DOC_TITLES.salesCorrection })
            .click();
        await expect(s.page).toHaveURL(
            new RegExp(`${ERP_DOC_PATHS.salesCorrection}\\?.*orderId=${order.id}`),
        );
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText(doc('salesCorrection', 'sc1').number);
        await s.page
            .locator('.erp-documents-page__links')
            .getByRole('link', { name: ERP_DOC_TITLES.orderCorrection })
            .click();
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText(doc('orderCorrection', 'oc1').number);
    });

    test('the customer name links to the customer page @read-only', async () => {
        await s.page.goto(ERP_DOC_PATHS.customerClaim);
        const row = rowOf(s.page, doc('customerClaim', 'cc1').number);
        await expect(row.locator(`a[href="/customers/${ids.clients['a-own']}"]`)).toHaveText(
            clientName('a-own'),
            WAIT,
        );
    });
});

test.describe('related documents links', () => {
    test('the order card counts the related documents and opens the first list prefiltered @read-only', async () => {
        const order = orders['customer-a'];
        await s.page.goto(`/orders/${order.code}`);
        const link = s.page.getByTestId('erp-documents-link');
        await expect(link).toHaveText('Related documents (3)', WAIT);
        await link.click();
        await expect(s.page).toHaveURL(
            new RegExp(`${ERP_DOC_PATHS.customerClaim}\\?orderId=${order.id}`),
        );
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText(doc('customerClaim', 'cc1').number);
    });

    test('the link skips a list without rows for the order @read-only', async () => {
        const order = orders['customer-b'];
        await s.page.goto(`/orders/${order.code}`);
        const link = s.page.getByTestId('erp-documents-link');
        await expect(link).toHaveText('Related documents (2)', WAIT);
        await link.click();
        await expect(s.page).toHaveURL(
            new RegExp(`${ERP_DOC_PATHS.salesCorrection}\\?orderId=${order.id}`),
        );
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText(doc('salesCorrection', 'sc2').number);
    });

    test('the customer page counts the customer documents and opens the first list prefiltered @read-only', async () => {
        const counterpartyId = ids.clients['a-own'];
        await s.page.goto(`/customers/${counterpartyId}`);
        const link = s.page.getByTestId('erp-documents-link');
        await expect(link).toHaveText('Related documents (7)', WAIT);
        await link.click();
        await expect(s.page).toHaveURL(
            new RegExp(`${ERP_DOC_PATHS.customerClaim}\\?counterpartyId=${counterpartyId}`),
        );
        await expect(s.page.getByText('Filtered to one customer.')).toBeVisible(WAIT);
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText(doc('customerClaim', 'cc1').number);
    });
});

test('the Documents menu offers the four lists @read-only', async () => {
    await s.page.goto(ERP_DOC_PATHS.customerClaim);
    for (const kind of ERP_DOC_KINDS)
        await expect(
            s.page.locator('.mv-app-sidebar').getByRole('link', { name: ERP_DOC_TITLES[kind] }),
        ).toBeVisible(WAIT);
    await expect(
        s.page.locator('.mv-app-sidebar').getByRole('link', { name: POA_TITLE }),
    ).toBeVisible(WAIT);
});

test('on a phone each document is a card with a styled customer link @read-only', async () => {
    await s.page.setViewportSize({ width: 390, height: 844 });
    try {
        await s.page.goto(ERP_DOC_PATHS.customerClaim);
        await expect(s.page.getByRole('columnheader').first()).toBeHidden(WAIT);
        await expect(s.page.getByText(doc('customerClaim', 'cc1').number).first()).toBeVisible(
            WAIT,
        );
        expect(
            await s.page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(390);
        const link = s.page.locator(`a[href="/customers/${ids.clients['a-own']}"]`).first();
        await expect(link).toBeVisible();
        expect(await link.evaluate(el => getComputedStyle(el).color)).not.toBe('rgb(0, 0, 238)');
    } finally {
        await s.page.setViewportSize({ width: 1280, height: 720 });
    }
});

test.describe('Powers of attorney list', () => {
    test('shows status, scan indicator and the deleted-contract marker to a leadership role @read-only', async () => {
        await s.page.goto(POA_PATH);
        await expect(s.page.getByRole('heading', { name: POA_TITLE, exact: true })).toBeVisible(
            WAIT,
        );
        await expect(s.page.getByRole('columnheader').first()).toContainText('Number');
        for (const p of POWERS_OF_ATTORNEY)
            await expect(rowOf(s.page, p.number), p.number).toHaveCount(1, WAIT);
        await expect(rowOf(s.page, 'E2E-POA-0001')).toContainText('Active');
        await expect(rowOf(s.page, 'E2E-POA-0001')).toContainText('Scan present');
        await expect(rowOf(s.page, 'E2E-POA-0002')).toContainText('Expired');
        await expect(rowOf(s.page, 'E2E-POA-0002')).toContainText('No scan');
        await expect(rowOf(s.page, 'E2E-POA-0003')).toContainText('Contract deleted');
        await expect(rowOf(s.page, 'E2E-POA-0001')).not.toContainText('Contract deleted');
    });

    test('the holder search finds one row and the customer preset narrows the list @read-only', async () => {
        await s.page.goto(POA_PATH);
        await expect(rowOf(s.page, 'E2E-POA-0001')).toBeVisible(WAIT);
        await s.page.getByPlaceholder('Number, holder or customer…').fill('Holder B');
        await expect(s.page.locator(ROWS)).toHaveCount(1, WAIT);
        await expect(s.page.locator(ROWS)).toContainText('E2E-POA-0004');
        await s.page.goto(`${POA_PATH}?counterpartyId=${ids.clients['b-own']}`);
        await expect(s.page.getByText('Filtered to one customer.')).toBeVisible(WAIT);
        await expect(rowOf(s.page, 'E2E-POA-0004')).toHaveCount(1, WAIT);
        await expect(s.page.getByText('E2E-POA-0001')).toHaveCount(0);
    });
});
